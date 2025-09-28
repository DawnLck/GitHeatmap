import * as path from "path";
import * as vscode from "vscode";
import { HeatmapPanel } from "./panel/heatmapPanel";
import { RepositoryService } from "./services/repositoryService";

export function activate(context: vscode.ExtensionContext): void {
  const repositoryService = new RepositoryService(vscode.workspace, context);

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

  context.subscriptions.push(
    showCommand,
    refreshCommand,
    selectRepositoriesCommand
  );
}

export function deactivate(): void {
  // no-op for now
}
