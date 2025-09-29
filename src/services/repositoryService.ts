import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string; // ISO datetime string with timezone info
  repository: string;
}

export interface HeatmapCell {
  date: string; // ISO date YYYY-MM-DD
  commits: number;
  commitDetails?: CommitInfo[];
}

export interface HeatmapDataset {
  cells: HeatmapCell[];
  allCommits: CommitInfo[];
  summary: {
    repositories: number;
    totalCommits: number;
    rangeStart: string;
    rangeEnd: string;
    metric: string;
    colorScheme: string;
  };
}

export interface HeatmapFilterOptions {
  timeRange: "year" | "halfYear" | "quarter" | "month" | "custom";
  customStartDate?: Date;
  customEndDate?: Date;
  userFilter: "current" | "all" | "custom";
  customUser?: string;
  includeMerges: boolean;
  dateSource: "author" | "committer";
  colorScheme: "github" | "blue" | "red" | "colorblind";
  metric: "commits" | "linesChanged" | "added" | "deleted";
}

export interface HeatmapOptions {
  rangeStart: Date;
  rangeEnd: Date;
  metric: "commits" | "linesChanged" | "added" | "deleted";
  colorScheme: string;
  includeMerges: boolean;
  dateSource: "committer" | "author";
  filterByAuthor: boolean;
  authorEmail?: string;
  authorName?: string;
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

      // Also check for nested git repositories (excluding the current folder)
      const nestedRepos = await this.findNestedGitRepositories(folderPath);
      // Filter out the current folder to avoid duplicates
      const filteredNestedRepos = nestedRepos.filter(
        (repo) => repo !== folderPath
      );
      repositories.push(...filteredNestedRepos);
    }

    // Remove duplicates using Set
    return [...new Set(repositories)];
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

  public getDefaultFilterOptions(): HeatmapFilterOptions {
    const config = vscode.workspace.getConfiguration("gitHeatmap");

    return {
      timeRange: config.get<"year" | "halfYear" | "quarter" | "month">(
        "defaultTimeRange",
        "halfYear"
      ),
      userFilter: config.get<"current" | "all" | "custom">(
        "defaultUserFilter",
        "current"
      ),
      includeMerges: config.get<boolean>("includeMerges", false),
      dateSource: config.get<"author" | "committer">("dateSource", "committer"),
      colorScheme: config.get<"github" | "blue" | "red" | "colorblind">(
        "colorScheme",
        "github"
      ),
      metric: config.get<"commits" | "linesChanged" | "added" | "deleted">(
        "metric",
        "commits"
      ),
    };
  }

  /**
   * Save user's current filter settings to workspace state
   */
  public saveFilterSettings(filters: HeatmapFilterOptions): void {
    if (!this.context) {
      console.warn(
        "Extension context not available, cannot save filter settings"
      );
      return;
    }

    try {
      // Save to workspace state so settings are workspace-specific
      this.context.workspaceState.update("gitHeatmap.savedFilters", {
        timeRange: filters.timeRange,
        userFilter: filters.userFilter,
        customUser: filters.customUser,
        includeMerges: filters.includeMerges,
        dateSource: filters.dateSource,
        colorScheme: filters.colorScheme,
        metric: filters.metric,
        // Add timestamp for potential future cleanup
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to save filter settings:", error);
    }
  }

  /**
   * Load previously saved filter settings, falling back to defaults
   */
  public loadFilterSettings(): HeatmapFilterOptions {
    if (!this.context) {
      console.log("Extension context not available, using default settings");
      return this.getDefaultFilterOptions();
    }

    try {
      const savedSettings = this.context.workspaceState.get<{
        timeRange?: "year" | "halfYear" | "quarter" | "month";
        userFilter?: "current" | "all" | "custom";
        customUser?: string;
        includeMerges?: boolean;
        dateSource?: "author" | "committer";
        colorScheme?: "github" | "blue" | "red" | "colorblind";
        metric?: "commits" | "linesChanged" | "added" | "deleted";
        timestamp?: number;
      }>("gitHeatmap.savedFilters");

      if (savedSettings) {
        console.log("Loaded saved filter settings:", savedSettings);

        // Merge saved settings with defaults to handle any missing properties
        const defaultSettings = this.getDefaultFilterOptions();
        return {
          timeRange: savedSettings.timeRange ?? defaultSettings.timeRange,
          userFilter: savedSettings.userFilter ?? defaultSettings.userFilter,
          customUser: savedSettings.customUser ?? defaultSettings.customUser,
          includeMerges:
            savedSettings.includeMerges ?? defaultSettings.includeMerges,
          dateSource: savedSettings.dateSource ?? defaultSettings.dateSource,
          colorScheme: savedSettings.colorScheme ?? defaultSettings.colorScheme,
          metric: savedSettings.metric ?? defaultSettings.metric,
        };
      }
    } catch (error) {
      console.error("Failed to load filter settings:", error);
    }

    // Fallback to defaults if no saved settings or error occurred
    console.log("No saved filter settings found, using defaults");
    return this.getDefaultFilterOptions();
  }

  /**
   * Clear saved filter settings (reset to defaults)
   */
  public clearSavedFilterSettings(): void {
    if (!this.context) {
      return;
    }

    try {
      this.context.workspaceState.update("gitHeatmap.savedFilters", undefined);
      console.log("Cleared saved filter settings");
    } catch (error) {
      console.error("Failed to clear filter settings:", error);
    }
  }

  public getDefaultOptions(): HeatmapOptions {
    const filters = this.getDefaultFilterOptions();
    return this.convertFiltersToOptions(filters);
  }

  private convertFiltersToOptions(
    filters: HeatmapFilterOptions
  ): HeatmapOptions {
    const rangeEnd = new Date();
    let rangeStart = new Date(rangeEnd);

    // Calculate date range based on timeRange
    switch (filters.timeRange) {
      case "year":
        rangeStart.setDate(rangeEnd.getDate() - 365);
        break;
      case "halfYear":
        rangeStart.setDate(rangeEnd.getDate() - 180);
        break;
      case "quarter":
        rangeStart.setDate(rangeEnd.getDate() - 90);
        break;
      case "month":
        rangeStart.setDate(rangeEnd.getDate() - 30);
        break;
      case "custom":
        if (filters.customStartDate)
          rangeStart = new Date(filters.customStartDate);
        if (filters.customEndDate)
          rangeEnd.setTime(filters.customEndDate.getTime());
        break;
    }

    // Debug logging
    console.log(
      `Date range: ${rangeStart.toISOString().split("T")[0]} to ${
        rangeEnd.toISOString().split("T")[0]
      }`
    );

    return {
      rangeStart,
      rangeEnd,
      metric: filters.metric,
      colorScheme: filters.colorScheme,
      includeMerges: filters.includeMerges,
      dateSource: filters.dateSource,
      filterByAuthor: filters.userFilter !== "all",
      authorEmail:
        filters.userFilter === "custom" ? filters.customUser : undefined,
    };
  }

  public async getFilteredHeatmapData(
    filters: HeatmapFilterOptions,
    forceRefresh = false
  ): Promise<HeatmapDataset> {
    const options = this.convertFiltersToOptions(filters);
    return this.getHeatmapData(options, forceRefresh);
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
    console.log(`Discovered repositories: ${repositories}`);

    if (repositories.length === 0) {
      console.log("No repositories found, returning empty dataset");
      const emptyDataset = this.createEmptyDataset(options);
      this.setCachedData(cacheKey, emptyDataset);
      return emptyDataset;
    }

    // Get git user info for author filtering
    const gitUser = await this.getGitUserInfo();
    console.log(`Git user info: ${JSON.stringify(gitUser)}`);
    console.log(
      `Options: ${JSON.stringify({
        rangeStart: options.rangeStart.toISOString().split("T")[0],
        rangeEnd: options.rangeEnd.toISOString().split("T")[0],
        filterByAuthor: options.filterByAuthor,
        includeMerges: options.includeMerges,
      })}`
    );

    // Warning if author filtering is enabled but no git user info
    if (options.filterByAuthor && !gitUser.email && !gitUser.name) {
      console.warn(
        "Author filtering is enabled but no git user email/name found. This may result in no commits being returned."
      );
    }

    // Collect data from all repositories
    const allCommits = new Map<string, number>();
    const allCommitDetails: CommitInfo[] = [];
    let errorCount = 0;

    for (const repoPath of repositories) {
      try {
        const repoCommits = await this.getCommitsForRepository(
          repoPath,
          options,
          gitUser
        );

        // Aggregate commits by date and collect details
        for (const commit of repoCommits) {
          // Extract date part from full datetime for aggregation
          const commitDate = new Date(commit.date);
          const dateStr = commitDate.toISOString().split("T")[0];
          const currentCount = allCommits.get(dateStr) || 0;
          allCommits.set(dateStr, currentCount + 1);
          allCommitDetails.push(commit);
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
      allCommits: allCommitDetails.sort((a, b) => b.date.localeCompare(a.date)),
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
      allCommits: [],
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
  ): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];

    // Build git log command to get detailed commit info
    const dateFormat = options.dateSource === "author" ? "%ad" : "%cd";
    const mergeFilter = options.includeMerges ? "" : "--no-merges";
    // Determine author filter based on options
    let authorFilter = "";
    if (options.filterByAuthor) {
      if (options.authorEmail) {
        // Custom user specified
        authorFilter = `--author="${options.authorEmail}"`;
      } else if (gitUser.email) {
        // Use current user's email
        authorFilter = `--author="${gitUser.email}"`;
      } else if (gitUser.name) {
        // Fall back to current user's name
        authorFilter = `--author="${gitUser.name}"`;
      } else {
        console.warn(
          "Author filtering requested but no git user email or name found. Skipping author filter."
        );
      }
    }

    const since = options.rangeStart.toISOString().split("T")[0];
    const until = new Date(options.rangeEnd);
    until.setDate(until.getDate() + 1); // Include the end date
    const untilStr = until.toISOString().split("T")[0];

    // Format: hash|author|date|message
    const prettyFormat = `"%H|%an|${dateFormat}|%s"`;

    const command = [
      "git log",
      `--since="${since}"`,
      `--until="${untilStr}"`,
      mergeFilter,
      authorFilter,
      `--pretty=format:${prettyFormat}`,
      "--date=iso-strict-local",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      console.log(`Executing git command: ${command}`);
      console.log(`Repository path: ${repoPath}`);
      console.log(`Date range: ${since} to ${untilStr}`);

      const { stdout, stderr } = await execAsync(command, { cwd: repoPath });

      console.log(`Git command output: "${stdout}"`);
      if (stderr) {
        console.log(`Git command stderr: "${stderr}"`);
      }

      // Parse commit details
      const lines = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      console.log(`Processed lines: ${lines.length}`);

      for (const line of lines) {
        const parts = line.split("|");
        if (parts.length >= 4) {
          const [hash, author, date, ...messageParts] = parts;
          const message = messageParts.join("|"); // In case message contains "|"

          commits.push({
            hash: hash.trim(),
            author: author.trim(),
            date: date.trim(),
            message: message.trim(),
            repository: require("path").basename(repoPath),
          });

          console.log(
            `Added commit: ${hash.substring(0, 8)} - ${message.substring(
              0,
              50
            )}...`
          );
        }
      }
    } catch (error) {
      console.warn(`Git command failed for ${repoPath}:`, error);
      console.warn(`Failed command was: ${command}`);
      console.warn(`Working directory: ${repoPath}`);
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
      filterByAuthor: options.filterByAuthor,
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

  public async getUserList(): Promise<string[]> {
    const repositories = await this.discoverRepositories();
    const users = new Set<string>();

    for (const repoPath of repositories) {
      try {
        // Get all unique authors from the repository
        const { stdout } = await execAsync(
          'git log --pretty=format:"%an <%ae>" | sort | uniq',
          { cwd: repoPath }
        );

        const lines = stdout
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        lines.forEach((line) => {
          if (line.trim()) {
            users.add(line.trim());
          }
        });
      } catch (error) {
        console.warn(`Failed to get user list from ${repoPath}:`, error);
      }
    }

    return Array.from(users).sort();
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
