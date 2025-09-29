import * as vscode from "vscode";
import { RepositoryService, CommitInfo } from "../services/repositoryService";

export interface DailyCommit {
  date: string;
  commits: number;
}

export class GitActivityStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private updateTimer: NodeJS.Timeout | undefined;
  private readonly DAYS_TO_SHOW = 7;
  private displayMode: "today" | "week" = "week";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repositoryService: RepositoryService
  ) {
    // Create status bar item - positioned on the right side (secondary area)
    // Following VS Code guidelines: contextual items on the right
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      50 // Moderate priority for contextual status
    );

    // Set up click command to open heatmap panel
    this.statusBarItem.command = "gitHeatmap.show";

    // Initialize and show
    this.statusBarItem.show();
    this.updateActivity();
    this.setupAutoUpdate();

    // Register for disposal
    this.context.subscriptions.push(this.statusBarItem);
  }

  public async updateActivity(): Promise<void> {
    try {
      // Get display mode from configuration
      const config = vscode.workspace.getConfiguration("gitHeatmap");
      this.displayMode = config.get<"today" | "week">(
        "statusBar.displayMode",
        "week"
      );

      const activityData = await this.getLast7DaysActivity();
      const displayText = this.renderActivityDisplay(activityData);
      const tooltip = this.getTooltipText(activityData);

      this.statusBarItem.text = displayText;
      this.statusBarItem.tooltip = tooltip;

      console.log("Status bar updated:", displayText);
    } catch (error) {
      console.warn("Failed to update Git activity status bar:", error);
      this.statusBarItem.text = "$(git-commit) ⚠️";
      this.statusBarItem.tooltip = "Failed to load Git activity data";
    }
  }

  private async getLast7DaysActivity(): Promise<DailyCommit[]> {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (this.DAYS_TO_SHOW - 1));

    // Create filter options for the last 7 days
    const filters = {
      timeRange: "custom" as const,
      customStartDate: startDate,
      customEndDate: endDate,
      userFilter: "current" as const,
      includeMerges: false,
      dateSource: "committer" as const,
      colorScheme: "github" as const,
      metric: "commits" as const,
    };

    const dataset = await this.repositoryService.getFilteredHeatmapData(
      filters
    );

    // Convert to daily activity format
    const dailyActivity: DailyCommit[] = [];

    for (let i = 0; i < this.DAYS_TO_SHOW; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = this.formatLocalDate(currentDate);

      const cell = dataset.cells.find((c) => c.date === dateStr);
      const commits = cell?.commits || 0;

      dailyActivity.push({
        date: dateStr,
        commits: commits,
      });
    }

    return dailyActivity;
  }

  private renderActivityDisplay(activityData: DailyCommit[]): string {
    const today = this.formatLocalDate(new Date());
    const todayData = activityData.find((d) => d.date === today);
    const todayCommits = todayData?.commits || 0;
    const weekCommits = activityData.reduce((sum, day) => sum + day.commits, 0);

    // Choose display data based on configuration
    const commits = this.displayMode === "today" ? todayCommits : weekCommits;
    const label = this.displayMode === "today" ? "Today" : "Week";

    // Follow VS Code guidelines: use short text labels, minimal icons
    if (commits === 0) {
      return `$(git-commit) 0`;
    }

    // Show activity level with simple icon
    const level = this.getActivityLevel(commits);
    const icon = this.getActivityIcon(level);

    return `${icon} ${commits}`;
  }

  private getActivityLevel(commits: number): number {
    if (commits === 0) return 0;
    if (commits <= 2) return 1;
    if (commits <= 5) return 2;
    if (commits <= 9) return 3;
    return 4;
  }

  private getActivityIcon(level: number): string {
    // Use VS Code codicons following official guidelines
    const icons = [
      "$(git-commit)", // 0 commits - basic git icon
      "$(git-commit)", // 1-2 commits - same icon
      "$(git-commit)", // 3-5 commits - same icon
      "$(flame)", // 6-9 commits - flame for high activity
      "$(rocket)", // 10+ commits - rocket for very high activity
    ];
    return icons[level] || "$(git-commit)";
  }

  private getTooltipText(activityData: DailyCommit[]): string {
    const today = this.formatLocalDate(new Date());
    const todayData = activityData.find((d) => d.date === today);
    const todayCommits = todayData?.commits || 0;
    const weekTotal = activityData.reduce((sum, day) => sum + day.commits, 0);

    // Dynamic tooltip based on display mode
    const displayLabel = this.displayMode === "today" ? "Today" : "This Week";
    const displayCommits =
      this.displayMode === "today" ? todayCommits : weekTotal;

    const lines = [
      `Git Heatmap: ${displayCommits} commits ${displayLabel.toLowerCase()}`,
      this.displayMode === "today"
        ? `This week: ${weekTotal} commits`
        : `Today: ${todayCommits} commits`,
      "",
      "Click to open detailed heatmap",
    ];

    return lines.join("\n");
  }

  private setupAutoUpdate(): void {
    const config = vscode.workspace.getConfiguration("gitHeatmap");
    const updateInterval = config.get<number>(
      "statusBar.updateInterval",
      5 * 60 * 1000
    ); // 5 minutes

    // Update every interval
    this.updateTimer = setInterval(() => {
      this.updateActivity();
    }, updateInterval);

    // Update on workspace changes
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(
      () => {
        this.updateActivity();
      }
    );

    // Update when files are saved (potential git activity)
    const saveWatcher = vscode.workspace.onDidSaveTextDocument(() => {
      // Debounce to avoid too frequent updates
      this.debouncedUpdate();
    });

    this.context.subscriptions.push(workspaceWatcher, saveWatcher);
  }

  private debouncedUpdate = this.debounce(() => {
    this.updateActivity();
  }, 2000); // 2 second debounce

  private debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | undefined;
    return (...args: Parameters<T>) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * Format date to YYYY-MM-DD using local timezone instead of UTC
   * This prevents timezone conversion issues that cause commits to appear on wrong days
   */
  private formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  public dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    this.statusBarItem.dispose();
  }
}
