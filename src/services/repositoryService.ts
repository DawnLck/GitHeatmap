import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface HeatmapCell {
  date: string; // ISO date YYYY-MM-DD
  commits: number;
}

export interface HeatmapDataset {
  cells: HeatmapCell[];
  summary: {
    repositories: number;
    totalCommits: number;
    rangeStart: string;
    rangeEnd: string;
    metric: string;
    colorScheme: string;
  };
}

export interface HeatmapOptions {
  rangeStart: Date;
  rangeEnd: Date;
  metric: "commits" | "linesChanged" | "added" | "deleted";
  colorScheme: string;
  includeMerges: boolean;
  dateSource: "committer" | "author";
}

/**
 * RepositoryService encapsulates repository discovery and git data collection.
 * The MVP implementation will incrementally replace the placeholder data below.
 */
export class RepositoryService {
  private cache: Map<string, { data: HeatmapDataset; timestamp: number }> =
    new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly workspace: typeof vscode.workspace = vscode.workspace,
    private readonly context?: vscode.ExtensionContext
  ) {}

  public async discoverRepositories(): Promise<string[]> {
    const repositories: string[] = [];

    if (!this.workspace.workspaceFolders) {
      return repositories;
    }

    // Check if Git is available
    if (!(await this.isGitAvailable())) {
      throw new Error(
        "Git is not installed or not available in PATH. Please install Git to use Git Heatmap."
      );
    }

    for (const folder of this.workspace.workspaceFolders) {
      const folderPath = folder.uri.fsPath;

      // Check if this folder is a git repository
      if (await this.isGitRepository(folderPath)) {
        repositories.push(folderPath);
      }

      // Also check for nested git repositories
      const nestedRepos = await this.findNestedGitRepositories(folderPath);
      repositories.push(...nestedRepos);
    }

    return repositories;
  }

  private async isGitAvailable(): Promise<boolean> {
    try {
      await execAsync("git --version");
      return true;
    } catch {
      return false;
    }
  }

  private async isGitRepository(path: string): Promise<boolean> {
    try {
      await execAsync("git rev-parse --git-dir", { cwd: path });
      return true;
    } catch {
      return false;
    }
  }

  private async findNestedGitRepositories(rootPath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('find . -name ".git" -type d -prune', {
        cwd: rootPath,
      });

      return stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((gitDir) => {
          const repoPath = gitDir.replace("/.git", "");
          return require("path").join(rootPath, repoPath);
        });
    } catch {
      return [];
    }
  }

  public getDefaultOptions(): HeatmapOptions {
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setFullYear(rangeEnd.getFullYear() - 1);

    const config = vscode.workspace.getConfiguration("gitHeatmap");

    return {
      rangeStart,
      rangeEnd,
      metric: config.get<"commits" | "linesChanged" | "added" | "deleted">(
        "metric",
        "commits"
      ),
      colorScheme: config.get<string>("colorScheme", "github"),
      includeMerges: config.get<boolean>("includeMerges", false),
      dateSource: config.get<"committer" | "author">("dateSource", "committer"),
    };
  }

  public async getHeatmapData(
    options: HeatmapOptions,
    forceRefresh = false
  ): Promise<HeatmapDataset> {
    const cacheKey = this.generateCacheKey(options);

    // Check cache first
    if (!forceRefresh) {
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const repositories = await this.discoverRepositories();

    if (repositories.length === 0) {
      const emptyDataset = this.createEmptyDataset(options);
      this.setCachedData(cacheKey, emptyDataset);
      return emptyDataset;
    }

    // Get git user info for author filtering
    const gitUser = await this.getGitUserInfo();

    // Collect data from all repositories
    const allCommits = new Map<string, number>();
    let errorCount = 0;

    for (const repoPath of repositories) {
      try {
        const repoCommits = await this.getCommitsForRepository(
          repoPath,
          options,
          gitUser
        );

        // Aggregate commits by date
        for (const [date, count] of repoCommits) {
          const currentCount = allCommits.get(date) || 0;
          allCommits.set(date, currentCount + count);
        }
      } catch (error) {
        errorCount++;
        console.warn(
          `Failed to collect data from repository ${repoPath}:`,
          error
        );
      }
    }

    // Convert to HeatmapCell array
    const cells: HeatmapCell[] = [];
    const currentDate = new Date(options.rangeStart);
    const endDate = new Date(options.rangeEnd);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const commits = allCommits.get(dateStr) || 0;
      cells.push({ date: dateStr, commits });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const dataset = {
      cells,
      summary: {
        repositories: repositories.length,
        totalCommits: cells.reduce((acc, cell) => acc + cell.commits, 0),
        rangeStart: options.rangeStart.toISOString().split("T")[0],
        rangeEnd: options.rangeEnd.toISOString().split("T")[0],
        metric: options.metric,
        colorScheme: options.colorScheme,
      },
    };

    // Cache the result
    this.setCachedData(cacheKey, dataset);

    // Show warning if some repositories failed
    if (errorCount > 0) {
      void vscode.window.showWarningMessage(
        `Git Heatmap: Failed to collect data from ${errorCount} repository(ies). Partial data shown.`
      );
    }

    return dataset;
  }

  private createEmptyDataset(options: HeatmapOptions): HeatmapDataset {
    return {
      cells: [],
      summary: {
        repositories: 0,
        totalCommits: 0,
        rangeStart: options.rangeStart.toISOString().split("T")[0],
        rangeEnd: options.rangeEnd.toISOString().split("T")[0],
        metric: options.metric,
        colorScheme: options.colorScheme,
      },
    };
  }

  private async getGitUserInfo(): Promise<{ email: string; name: string }> {
    try {
      const [emailResult, nameResult] = await Promise.all([
        execAsync("git config user.email"),
        execAsync("git config user.name"),
      ]);

      return {
        email: emailResult.stdout.trim(),
        name: nameResult.stdout.trim(),
      };
    } catch {
      return { email: "", name: "" };
    }
  }

  private async getCommitsForRepository(
    repoPath: string,
    options: HeatmapOptions,
    gitUser: { email: string; name: string }
  ): Promise<Map<string, number>> {
    const commits = new Map<string, number>();

    // Build git log command
    const dateFormat =
      options.dateSource === "author" ? "--author-date" : "--committer-date";
    const mergeFilter = options.includeMerges ? "" : "--no-merges";
    const authorFilter = gitUser.email ? `--author="${gitUser.email}"` : "";

    const since = options.rangeStart.toISOString().split("T")[0];
    const until = new Date(options.rangeEnd);
    until.setDate(until.getDate() + 1); // Include the end date
    const untilStr = until.toISOString().split("T")[0];

    const command = [
      "git log",
      `--since="${since}"`,
      `--until="${untilStr}"`,
      dateFormat,
      mergeFilter,
      authorFilter,
      "--pretty=format:%ad",
      "--date=short",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const { stdout } = await execAsync(command, { cwd: repoPath });

      // Count commits per date
      const lines = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      for (const line of lines) {
        const date = line.trim();
        if (date) {
          const count = commits.get(date) || 0;
          commits.set(date, count + 1);
        }
      }
    } catch (error) {
      console.warn(`Git command failed for ${repoPath}:`, error);
    }

    return commits;
  }

  private generateCacheKey(options: HeatmapOptions): string {
    const key = JSON.stringify({
      rangeStart: options.rangeStart.toISOString(),
      rangeEnd: options.rangeEnd.toISOString(),
      metric: options.metric,
      colorScheme: options.colorScheme,
      includeMerges: options.includeMerges,
      dateSource: options.dateSource,
    });
    return `heatmap_${Buffer.from(key).toString("base64")}`;
  }

  private getCachedData(cacheKey: string): HeatmapDataset | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_DURATION) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.data;
  }

  private setCachedData(cacheKey: string, data: HeatmapDataset): void {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    // Also persist to extension context if available
    if (this.context) {
      this.context.globalState.update(cacheKey, {
        data,
        timestamp: Date.now(),
      });
    }
  }

  public clearCache(): void {
    this.cache.clear();
    if (this.context) {
      // Clear all heatmap cache entries
      const keys = this.context.globalState.keys();
      for (const key of keys) {
        if (key.startsWith("heatmap_")) {
          this.context.globalState.update(key, undefined);
        }
      }
    }
  }
}
