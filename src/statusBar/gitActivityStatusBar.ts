/*
 * Git Heatmap - VSCode Extension
 * Copyright (C) 2025 Git Heatmap
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
  private currentLanguage: string = "en";

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
      // Get configuration
      const config = vscode.workspace.getConfiguration("gitHeatmap");
      this.displayMode = config.get<"today" | "week">(
        "statusBar.displayMode",
        "week"
      );

      // Detect language
      this.currentLanguage = this.detectLanguage();

      const activityData = await this.getLast7DaysActivity();
      const today = this.formatLocalDate(new Date());
      const todayData = activityData.find((d) => d.date === today);
      const todayCommits = todayData?.commits || 0;
      const weekCommits = activityData.reduce(
        (sum, day) => sum + day.commits,
        0
      );

      const commits = this.displayMode === "today" ? todayCommits : weekCommits;
      const currentLevel = this.getActivityLevel(commits);

      // Check for achievement
      await this.checkAchievement(currentLevel, commits);

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

    // Different thresholds for different time ranges
    if (this.displayMode === "today") {
      // Today (1 day) - lower thresholds
      if (commits <= 5) return 1; // 1 commit = low
      if (commits <= 10) return 2; // 2-3 commits = medium
      if (commits <= 15) return 3; // 4-5 commits = high
      return 4; // 6+ commits = very high
    } else {
      // Week (7 days) - higher thresholds
      if (commits <= 10) return 1; // 1-3 commits = low (~0.4/day)
      if (commits <= 20) return 2; // 4-10 commits = medium (~1.4/day)
      if (commits <= 30) return 3; // 11-20 commits = high (~2.8/day)
      return 4; // 21+ commits = very high (3+/day)
    }
  }

  private getActivityIcon(level: number): string {
    // Use VS Code codicons following official guidelines
    const icons = [
      "$(git-commit)", // 0 commits - basic git icon
      "$(git-commit)", // 1-2 commits - same icon
      "$(sparkle)", // 3-5 commits - same icon
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

  private detectLanguage(): string {
    const config = vscode.workspace.getConfiguration("gitHeatmap");
    const configLanguage = config.get<string>("language", "auto");

    if (configLanguage === "auto") {
      const vscodeLanguage = vscode.env.language;
      if (vscodeLanguage.startsWith("zh")) {
        return "zh-CN";
      }
      return "en";
    }

    return configLanguage;
  }

  private async checkAchievement(
    currentLevel: number,
    commits: number
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("gitHeatmap");
    const showAchievements = config.get<boolean>(
      "statusBar.showAchievements",
      true
    );

    if (!showAchievements || currentLevel === 0) {
      return;
    }

    // Get storage key based on display mode and current date/week
    const storageKey = this.getAchievementStorageKey();
    const previousLevel = this.context.workspaceState.get<number>(
      storageKey,
      0
    );

    // Only notify when level increases
    if (currentLevel > previousLevel) {
      const message = this.getAchievementMessage(currentLevel, commits);
      void vscode.window.showInformationMessage(message);

      // Update stored level
      await this.context.workspaceState.update(storageKey, currentLevel);
    }
  }

  private getAchievementStorageKey(): string {
    const today = this.formatLocalDate(new Date());

    if (this.displayMode === "today") {
      // Reset daily
      return `achievement.today.${today}`;
    } else {
      // Reset weekly (use ISO week number)
      const date = new Date();
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      return `achievement.week.${year}.${weekNumber}`;
    }
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private getAchievementMessage(level: number, commits: number): string {
    const timeLabel =
      this.displayMode === "today"
        ? this.currentLanguage === "zh-CN"
          ? "今天"
          : "today"
        : this.currentLanguage === "zh-CN"
        ? "本周"
        : "this week";

    const messages = {
      en: {
        1: `🎯 First commit ${timeLabel}! Every journey begins with a single step. Keep it up!`,
        2: `✨ ${commits} commits ${timeLabel}! You're building momentum. Great progress!`,
        3: `🔥 ${commits} commits ${timeLabel}! You're on fire! Your dedication is impressive!`,
        4: `🚀 ${commits} commits ${timeLabel}! Outstanding achievement! You're absolutely crushing it! 🎉`,
      },
      "zh-CN": {
        1: `🎯 ${timeLabel}第一次提交！千里之行，始于足下。继续加油！`,
        2: `✨ ${timeLabel}已有 ${commits} 次提交！你正在积累动力。进展不错！`,
        3: `🔥 ${timeLabel}已有 ${commits} 次提交！你的状态火热！专注度令人印象深刻！`,
        4: `🚀 ${timeLabel}已有 ${commits} 次提交！成就卓越！你简直太棒了！🎉`,
      },
    };

    const lang = this.currentLanguage === "zh-CN" ? "zh-CN" : "en";
    return messages[lang][level as keyof typeof messages.en] || "";
  }

  public dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    this.statusBarItem.dispose();
  }
}
