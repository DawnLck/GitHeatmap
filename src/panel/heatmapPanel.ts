import * as vscode from "vscode";
import {
  HeatmapDataset,
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

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly repositoryService: RepositoryService
  ) {
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
          void this.refresh();
        }
        if (message?.command === "refresh") {
          void this.refresh();
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

  public async refresh(forceRefresh = false): Promise<void> {
    try {
      const options = this.repositoryService.getDefaultOptions();
      const dataset = await this.repositoryService.getHeatmapData(
        options,
        forceRefresh
      );
      this.currentDataset = dataset;
      await this.postMessage({
        command: "heatmapData",
        payload: dataset,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
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
    <section id="summary" class="summary"></section>
    <section id="heatmap" class="heatmap" aria-label="Contribution heatmap" role="grid"></section>
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
