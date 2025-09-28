# Git Heatmap (VS Code Extension)

Git Heatmap surfaces a GitHub-style contribution calendar directly inside Visual Studio Code by scanning local Git repositories. The extension runs fully offline, aggregates commit counts per day, and renders an interactive heatmap so you can review activity without leaving the editor.

## Current Status
- **Stage**: Skeleton implementation
- **Default scope**: Workspace repositories
- **Default metric**: Commit count per day (committer date)
- **Default palette**: GitHub green scale

## Commands
- `Git Heatmap: Show` – open the heatmap panel.
- `Git Heatmap: Refresh` – trigger a data refresh (opens the panel if closed).
- `Git Heatmap: Select Repositories` – placeholder for future custom scope selection.

## Configuration
- `gitHeatmap.scanMode` (`workspace` | `customPaths`) – repository discovery strategy (defaults to `workspace`).
- `gitHeatmap.customPaths` – additional folders to include when `scanMode` is `customPaths`.
- `gitHeatmap.metric` (`commits` default) – statistic to visualize.
- `gitHeatmap.colorScheme` (`github` default) – heatmap palette.
- `gitHeatmap.includeMerges` (default `false`) – include merge commits.
- `gitHeatmap.dateSource` (`committer` default) – which date field to aggregate.

## Development
1. Install dependencies: `npm install`.
2. Compile: `npm run compile` (emits JS into `out/`).
3. Launch the extension host from VS Code (`F5`).

Planned future work includes real Git aggregation, cached refreshes, accessibility improvements, and export options. Refer to `docs/PRD.md` for the full product requirements.
