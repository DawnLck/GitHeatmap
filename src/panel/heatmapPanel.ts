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
import * as fs from "fs";
import {
  HeatmapDataset,
  HeatmapFilterOptions,
  RepositoryService,
  CommitDetail,
} from "../services/repositoryService";

export class HeatmapPanel {
  private static instance: HeatmapPanel | undefined;

  public static getInstance(): HeatmapPanel | undefined {
    return HeatmapPanel.instance;
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    repositoryService: RepositoryService
  ): HeatmapPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (HeatmapPanel.instance) {
      HeatmapPanel.instance.panel.reveal(column);
      return HeatmapPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(
      "gitHeatmap.heatmap",
      "Git Heatmap",
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
        ],
      }
    );

    HeatmapPanel.instance = new HeatmapPanel(panel, context, repositoryService);
    return HeatmapPanel.instance;
  }

  private readonly disposables: vscode.Disposable[] = [];
  private currentDataset: HeatmapDataset | undefined;
  private currentFilters: HeatmapFilterOptions;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly repositoryService: RepositoryService
  ) {
    // Initialize with saved filters (falls back to defaults if no saved settings)
    this.currentFilters = this.repositoryService.loadFilterSettings();

    this.panel.webview.html = this.getHtml();

    this.setContext(true);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(
      () => {
        const visible = this.panel.visible;
        this.setContext(visible);
        if (visible && !this.currentDataset) {
          void this.refresh();
        }
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        if (message?.command === "ready") {
          void this.initializeFilters();
        }
        if (message?.command === "refresh") {
          void this.refresh();
        }
        if (message?.command === "updateFilters") {
          void this.updateFilters(message.payload);
        }
        if (message?.command === "getUserList") {
          void this.sendUserList();
        }
        if (message?.command === "getCommitsForDate") {
          void this.sendCommitsForDate(message.payload);
        }
        if (message?.command === "openCommitDiff") {
          void this.openCommitDiff(message.payload);
        }
        if (message?.command === "exportData") {
          void this.handleExportData(message.payload);
        }
      },
      undefined,
      this.disposables
    );
  }

  public dispose(): void {
    HeatmapPanel.instance = undefined;
    this.setContext(false);
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
    this.panel.dispose();
  }

  private async initializeFilters(): Promise<void> {
    // Detect and send language setting
    const language = this.getLanguage();
    await this.postMessage({
      command: "setLanguage",
      payload: language,
    });

    // Send current filters to frontend
    await this.postMessage({
      command: "filtersInitialized",
      payload: this.currentFilters,
    });

    // Load initial data
    await this.refresh();
  }

  private getLanguage(): string {
    const config = vscode.workspace.getConfiguration("gitHeatmap");
    const configLanguage = config.get<string>("language", "auto");

    if (configLanguage === "auto") {
      // Follow VS Code language
      const vscodeLanguage = vscode.env.language;
      // Map common language codes to our supported languages
      if (vscodeLanguage.startsWith("zh")) {
        return "zh-CN";
      }
      // Default to English for all other languages
      return "en";
    }

    return configLanguage;
  }

  private async updateFilters(
    filters: Partial<HeatmapFilterOptions>
  ): Promise<void> {
    this.currentFilters = { ...this.currentFilters, ...filters };

    // Save the updated filters to persistence
    this.repositoryService.saveFilterSettings(this.currentFilters);

    // Only refresh if filters other than colorScheme changed
    // Color scheme changes are handled client-side for better performance
    const filterKeys = Object.keys(filters);
    const needsRefresh = filterKeys.some((key) => key !== "colorScheme");

    if (needsRefresh) {
      await this.refresh();
    }
  }

  private async sendUserList(): Promise<void> {
    try {
      const users = await this.repositoryService.getUserList();
      await this.postMessage({
        command: "userList",
        payload: users,
      });
    } catch (error) {
      console.warn("Failed to get user list:", error);
    }
  }

  private async sendCommitsForDate(date: string): Promise<void> {
    try {
      const commits = await this.repositoryService.getCommitsForDate(
        date,
        this.currentFilters
      );
      await this.postMessage({
        command: "commitsForDate",
        payload: { date, commits },
      });
    } catch (error) {
      console.error("Failed to get commits for date:", error);
      await this.postMessage({
        command: "error",
        payload: {
          message: `Failed to load commits for ${date}`,
        },
      });
    }
  }

  private async openCommitDiff(payload: {
    hash: string;
    repositoryPath: string;
  }): Promise<void> {
    try {
      const { hash, repositoryPath } = payload;

      // Use VS Code's git extension API to show the commit
      const gitExtension = vscode.extensions.getExtension("vscode.git");
      if (!gitExtension) {
        void vscode.window.showWarningMessage("Git extension is not available");
        return;
      }

      const git = gitExtension.exports.getAPI(1);
      const repository = git.repositories.find(
        (repo: { rootUri: { fsPath: string } }) =>
          repo.rootUri.fsPath === repositoryPath
      );

      if (!repository) {
        void vscode.window.showWarningMessage(
          `Repository not found: ${repositoryPath}`
        );
        return;
      }

      // Get the commit object
      const commit = await repository.getCommit(hash);

      if (commit) {
        // Show the commit in a new editor
        void vscode.commands.executeCommand(
          "git.openChange",
          commit.hash,
          repository
        );
      }
    } catch (error) {
      console.error("Failed to open commit diff:", error);
      void vscode.window.showWarningMessage(
        "Failed to open commit. You can manually view it in the Source Control panel."
      );
    }
  }

  public async exportAsSVG(): Promise<void> {
    try {
      // Request SVG data from webview
      await this.postMessage({
        command: "requestExportSVG",
      });
    } catch (error) {
      console.error("Failed to initiate SVG export:", error);
      void vscode.window.showErrorMessage("导出 SVG 失败");
    }
  }

  public async exportAsPNG(): Promise<void> {
    try {
      // Request PNG data from webview
      await this.postMessage({
        command: "requestExportPNG",
      });
    } catch (error) {
      console.error("Failed to initiate PNG export:", error);
      void vscode.window.showErrorMessage("导出 PNG 失败");
    }
  }

  private async handleExportData(payload: {
    type: "svg" | "png";
    data: string;
  }): Promise<void> {
    try {
      const { type, data } = payload;

      // Determine default save location
      let defaultPath: vscode.Uri;
      const fileName = `git-heatmap-${new Date()
        .toISOString()
        .slice(0, 10)}.${type}`;

      // Try workspace folder first, then home directory
      if (
        vscode.workspace.workspaceFolders &&
        vscode.workspace.workspaceFolders.length > 0
      ) {
        defaultPath = vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders[0].uri,
          fileName
        );
      } else {
        // Use home directory as fallback
        const homeDir =
          process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
        if (homeDir) {
          defaultPath = vscode.Uri.file(`${homeDir}/${fileName}`);
        } else {
          // Last resort: current working directory
          defaultPath = vscode.Uri.file(fileName);
        }
      }

      // Show save dialog
      const fileUri = await vscode.window.showSaveDialog({
        defaultUri: defaultPath,
        filters:
          type === "svg" ? { "SVG 文件": ["svg"] } : { "PNG 图片": ["png"] },
      });

      if (!fileUri) {
        return; // User cancelled
      }

      // Write file
      if (type === "svg") {
        // SVG is plain text
        await fs.promises.writeFile(fileUri.fsPath, data, "utf8");
      } else {
        // PNG is base64 encoded
        const base64Data = data.replace(/^data:image\/png;base64,/, "");
        await fs.promises.writeFile(
          fileUri.fsPath,
          Buffer.from(base64Data, "base64")
        );
      }

      // Show success message with option to open file
      const action = await vscode.window.showInformationMessage(
        `成功导出为 ${type.toUpperCase()}`,
        "打开文件"
      );

      if (action === "打开文件") {
        await vscode.commands.executeCommand("vscode.open", fileUri);
      }
    } catch (error) {
      console.error("Failed to save export:", error);
      void vscode.window.showErrorMessage(
        `保存文件失败: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async reloadFilterSettings(): Promise<void> {
    // Reload filter settings from persistence
    this.currentFilters = this.repositoryService.loadFilterSettings();

    // Send updated filters to frontend
    await this.postMessage({
      command: "filtersInitialized",
      payload: this.currentFilters,
    });

    // Refresh data with new filters
    await this.refresh(true);
  }

  public async refresh(forceRefresh = false): Promise<void> {
    try {
      // Show loading state
      await this.postMessage({
        command: "loading",
        payload: { isLoading: true },
      });

      const dataset = await this.repositoryService.getFilteredHeatmapData(
        this.currentFilters,
        forceRefresh
      );
      this.currentDataset = dataset;

      await this.postMessage({
        command: "heatmapData",
        payload: dataset,
      });

      await this.postMessage({
        command: "loading",
        payload: { isLoading: false },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      await this.postMessage({
        command: "loading",
        payload: { isLoading: false },
      });

      await this.postMessage({
        command: "error",
        payload: { message: errorMessage },
      });

      // Show error to user
      void vscode.window.showErrorMessage(`Git Heatmap: ${errorMessage}`);
    }
  }

  private async postMessage(message: unknown): Promise<boolean> {
    return this.panel.webview.postMessage(message);
  }

  private setContext(visible: boolean): void {
    void vscode.commands.executeCommand(
      "setContext",
      "gitHeatmap.webviewVisible",
      visible
    );
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js")
    );
    const commitPanelUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "commitPanel.js")
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Git Heatmap</title>
</head>
<body>
  <main class="container">
    <header class="header">
      <h1>Git Heatmap</h1>
      <div class="header-actions">
        <button id="exportButton" type="button" class="export-btn">Export</button>
        <button id="refreshButton" type="button">Refresh</button>
      </div>
    </header>
    
    <div id="exportMenu" class="export-menu" style="display: none;">
      <button id="exportSVGBtn" type="button" class="export-menu-item">
        📄 导出为 SVG
      </button>
      <button id="exportPNGBtn" type="button" class="export-menu-item">
        🖼️ 导出为 PNG
      </button>
    </div>
    
    <section id="filters" class="filters">
      <div class="filter-row">
        <div class="filter-group">
          <label for="timeRangeSelect" id="labelTimeRange">📅 Time Range</label>
          <select id="timeRangeSelect">
            <option value="month">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="halfYear" selected>Last Half Year</option>
            <option value="year">Last Year</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="userFilterSelect" id="labelUserFilter">👤 User Filter</label>
          <select id="userFilterSelect">
            <option value="current" selected>Current User</option>
            <option value="all">All Users</option>
            <option value="custom">Custom User</option>
          </select>
        </div>
        
        <div class="filter-group" id="customUserGroup" style="display: none;">
          <label for="customUserInput" id="labelCustomUser">User</label>
          <input type="text" id="customUserInput" placeholder="Enter user email..." />
        </div>
      </div>
      
      <details class="advanced-filters">
        <summary id="summaryAdvanced">⚙️ Advanced Options</summary>
        <div class="advanced-row">
          <div class="filter-group">
            <label for="colorSchemeSelect" id="labelColorScheme">🎨 Color Scheme</label>
            <select id="colorSchemeSelect">
              <option value="github" selected>GitHub</option>
              <option value="blue">Blue</option>
              <option value="red">Red</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="colorblind">Colorblind Friendly</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label for="dateSourceSelect" id="labelDateSource">📍 Date Source</label>
            <select id="dateSourceSelect">
              <option value="committer" selected>Committer Date</option>
              <option value="author">Author Date</option>
            </select>
          </div>
          
          <div class="filter-group checkbox-group">
            <label id="labelIncludeMerges">
              <input type="checkbox" id="includeMerges" />
              Include Merge Commits
            </label>
          </div>
        </div>
      </details>
    </section>
    
    <section id="loading" class="loading" style="display: none;">
      <div class="loading-spinner"></div>
      <span id="loadingText">Loading data...</span>
    </section>
    
    <section id="summary" class="summary"></section>
    <section id="heatmap" class="heatmap" aria-label="Contribution heatmap" role="grid"></section>
    <section id="commits" class="commits">
      <h2 id="commitsTitle">Recent Commits</h2>
      <div id="commitsList" class="commits-list"></div>
    </section>
  </main>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return nonce;
}
