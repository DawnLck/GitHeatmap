# Git Heatmap (VS Code Extension)

Git Heatmap surfaces a GitHub-style contribution calendar directly inside Visual Studio Code by scanning local Git repositories. The extension runs fully offline, aggregates commit counts per day, and renders an interactive heatmap so you can review activity without leaving the editor.

## Highlights

![Main Interface](images/heatmap-main.png)
_Git Heatmap main interface - GitHub-style contribution calendar_

![Status Bar Activity](images/status-bar-activity.png)
_Status bar showing last 7 days of Git activity_

- Local & private: data stays on your machine; no network requests.
- Multi-repo workspace: auto-discovers repositories (including nested repos).
- Interactive heatmap: GitHub-style calendar with summary and recent commits.
- Flexible filters: time range (month/quarter/half-year/year), user (current/all/custom email), include merges, date source (author/committer), color schemes.
- Sticky preferences: your filters are saved and restored; reset anytime via `Git Heatmap: Reset Filter Settings`.
- Status bar activity: shows last 7 days (Today/Week); click to open the panel quickly.
- Performance-first: in-memory cache (default 5 min) plus force refresh on demand.

## Commands

- `Git Heatmap: Show` – open the heatmap panel.
- `Git Heatmap: Refresh` – trigger a data refresh (opens the panel if closed).
- `Git Heatmap: Select Repositories` – placeholder for future custom scope selection.
- `Git Heatmap: Reset Filter Settings` – reset filters to defaults.

## Configuration

![Filter Panel](images/heatmap-filters.png)
_Flexible filter options - time range, user filtering, advanced settings_

![VS Code Settings](images/settings-panel.png)
_Configuration options in VS Code settings panel_

- `gitHeatmap.scanMode` (`workspace` | `customPaths`) – repository discovery strategy (defaults to `workspace`).
- `gitHeatmap.customPaths` – additional folders to include when `scanMode` is `customPaths`.
- `gitHeatmap.metric` (`commits` default) – statistic to visualize.
- `gitHeatmap.colorScheme` (`github` default) – heatmap palette.
- `gitHeatmap.includeMerges` (default `false`) – include merge commits.
- `gitHeatmap.dateSource` (`committer` default) – which date field to aggregate.
- `gitHeatmap.statusBar.enabled` (default `true`) – show last-7-days activity indicator in the status bar.
- `gitHeatmap.statusBar.updateInterval` (default `300000` ms) – status bar refresh interval.
- `gitHeatmap.statusBar.displayMode` (`today` | `week`, default `week`) – status bar display mode.

## Development

1. Install dependencies: `npm install`.
2. Compile: `npm run compile` (emits JS into `out/`).
3. Launch the extension host from VS Code (`F5`).
