import * as vscode from "vscode";
import {
  HeatmapDataset,
  HeatmapFilterOptions,
  RepositoryService,
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
    // Send current filters to frontend
    await this.postMessage({
      command: "filtersInitialized",
      payload: this.currentFilters,
    });

    // Load initial data
    await this.refresh();
  }

  private async updateFilters(filters: HeatmapFilterOptions): Promise<void> {
    this.currentFilters = { ...this.currentFilters, ...filters };

    // Save the updated filters to persistence
    this.repositoryService.saveFilterSettings(this.currentFilters);

    await this.refresh();
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
      <button id="refreshButton" type="button">Refresh</button>
    </header>
    
    <section id="filters" class="filters">
      <div class="filter-row">
        <div class="filter-group">
          <label for="timeRangeSelect">📅 时间范围</label>
          <select id="timeRangeSelect">
            <option value="month">近一个月</option>
            <option value="quarter">近三个月</option>
            <option value="halfYear" selected>近六个月</option>
            <option value="year">近一年</option>
          </select>
        </div>
        
        <div class="filter-group">
          <label for="userFilterSelect">👤 用户筛选</label>
          <select id="userFilterSelect">
            <option value="current" selected>当前用户</option>
            <option value="all">所有用户</option>
            <option value="custom">自定义用户</option>
          </select>
        </div>
        
        <div class="filter-group" id="customUserGroup" style="display: none;">
          <label for="customUserInput">用户</label>
          <input type="text" id="customUserInput" placeholder="输入用户邮箱..." />
        </div>
      </div>
      
      <details class="advanced-filters">
        <summary>⚙️ 高级选项</summary>
        <div class="advanced-row">
          <div class="filter-group">
            <label for="colorSchemeSelect">🎨 颜色主题</label>
            <select id="colorSchemeSelect">
              <option value="github" selected>GitHub</option>
              <option value="blue">蓝色</option>
              <option value="red">红色</option>
              <option value="colorblind">色盲友好</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label for="dateSourceSelect">📍 日期源</label>
            <select id="dateSourceSelect">
              <option value="committer" selected>提交者日期</option>
              <option value="author">作者日期</option>
            </select>
          </div>
          
          <div class="filter-group checkbox-group">
            <label>
              <input type="checkbox" id="includeMerges" />
              包含合并提交
            </label>
          </div>
        </div>
      </details>
    </section>
    
    <section id="loading" class="loading" style="display: none;">
      <div class="loading-spinner"></div>
      <span>正在加载数据...</span>
    </section>
    
    <section id="summary" class="summary"></section>
    <section id="heatmap" class="heatmap" aria-label="Contribution heatmap" role="grid"></section>
    <section id="commits" class="commits">
      <h2>Recent Commits</h2>
      <div id="commitsList" class="commits-list"></div>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
