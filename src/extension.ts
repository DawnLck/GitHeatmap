import * as path from "path";
import * as vscode from "vscode";
import { HeatmapPanel } from "./panel/heatmapPanel";
import { RepositoryService } from "./services/repositoryService";
import { GitActivityStatusBar } from "./statusBar/gitActivityStatusBar";

export function activate(context: vscode.ExtensionContext): void {
  const repositoryService = new RepositoryService(vscode.workspace, context);

  // Initialize status bar activity indicator
  let statusBarActivity: GitActivityStatusBar | undefined;
  const config = vscode.workspace.getConfiguration("gitHeatmap");
  const statusBarEnabled = config.get<boolean>("statusBar.enabled", true);

  if (statusBarEnabled) {
    statusBarActivity = new GitActivityStatusBar(context, repositoryService);
  }

  const showCommand = vscode.commands.registerCommand("gitHeatmap.show", () => {
    HeatmapPanel.createOrShow(context, repositoryService);
  });

  const refreshCommand = vscode.commands.registerCommand(
    "gitHeatmap.refresh",
    async () => {
      const panel = HeatmapPanel.getInstance();
      if (panel) {
        await panel.refresh(true); // Force refresh
      } else {
        HeatmapPanel.createOrShow(context, repositoryService);
      }

      // Also refresh status bar
      if (statusBarActivity) {
        await statusBarActivity.updateActivity();
      }
    }
  );

  const selectRepositoriesCommand = vscode.commands.registerCommand(
    "gitHeatmap.selectRepositories",
    async () => {
      const repositories = await repositoryService.discoverRepositories();
      if (!repositories.length) {
        void vscode.window.showInformationMessage(
          "Git Heatmap could not locate any Git repositories in the current workspace."
        );
        return;
      }

      const picks = await vscode.window.showQuickPick(
        repositories.map((repo) => ({
          label: path.basename(repo),
          description: repo,
          picked: true,
        })),
        {
          title: "Select repositories to include (feature placeholder)",
          canPickMany: true,
          placeHolder: "All discovered repositories are selected by default.",
        }
      );

      if (picks) {
        void vscode.window.showInformationMessage(
          "Custom repository scopes will be configurable in an upcoming release."
        );
      }
    }
  );

  const resetFiltersCommand = vscode.commands.registerCommand(
    "gitHeatmap.resetFilters",
    async () => {
      const result = await vscode.window.showInformationMessage(
        "确定要将筛选器设置重置为默认值吗？这将清除您保存的所有筛选器偏好。",
        { modal: true },
        "重置",
        "取消"
      );

      if (result === "重置") {
        // Clear saved filter settings
        repositoryService.clearSavedFilterSettings();

        // Reload filter settings and refresh the panel if it's open
        const panel = HeatmapPanel.getInstance();
        if (panel) {
          await panel.reloadFilterSettings(); // Reload settings and refresh
        }

        void vscode.window.showInformationMessage("筛选器设置已重置为默认值。");
      }
    }
  );

  // Configuration change handler
  const configChangeHandler = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration("gitHeatmap.statusBar.enabled")) {
        const newEnabled = vscode.workspace
          .getConfiguration("gitHeatmap")
          .get<boolean>("statusBar.enabled", true);

        if (newEnabled && !statusBarActivity) {
          // Enable status bar
          statusBarActivity = new GitActivityStatusBar(
            context,
            repositoryService
          );
        } else if (!newEnabled && statusBarActivity) {
          // Disable status bar
          statusBarActivity.dispose();
          statusBarActivity = undefined;
        }
      }

      // Handle display mode changes
      if (
        event.affectsConfiguration("gitHeatmap.statusBar.displayMode") &&
        statusBarActivity
      ) {
        statusBarActivity.updateActivity();
      }
    }
  );

  context.subscriptions.push(
    showCommand,
    refreshCommand,
    selectRepositoriesCommand,
    resetFiltersCommand,
    configChangeHandler
  );
}

export function deactivate(): void {
  // Cleanup is handled by context.subscriptions
}
