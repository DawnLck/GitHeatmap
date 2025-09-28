# Git Heatmap VS Code Extension PRD

## 1. Overview
- **Product Name**: Git Heatmap
- **Version**: v0.1 (MVP scope)
- **Status**: Draft
- **Owners**: TBD (Product/Engineering)  
- **Last Updated**: 2025-09-28

Git Heatmap is a Visual Studio Code extension that visualizes local Git activity as a GitHub-style contribution calendar. The extension reads local repositories, aggregates contributions per day, and renders an interactive heatmap directly inside VS Code. The product respects user privacy by keeping all calculations offline and targets developers who want a fast snapshot of their personal commit cadence without leaving the editor.

## 2. Goals & Success Metrics
### 2.1 Primary Goals
1. Provide an at-a-glance heatmap for local Git activity covering at least the past 12 months.
2. Deliver a frictionless, privacy-safe experience entirely inside VS Code.
3. Support multi-repository aggregation for developers working across several projects.

### 2.2 Guardrail Goals
- Maintain responsive UI: first render within 2 seconds for repositories with \<= 50k commits in scope.
- Ensure consistent behavior across Windows, macOS, and Linux.
- Respect user privacy by never transmitting repository data.

### 2.3 Success Metrics (post-launch)
- Activation-to-render success rate \> 95% for supported environments.
- User-specified refresh action completes within 3 seconds for cached repositories.
- Extension rating \>= 4.5 in VS Code Marketplace after first 50 reviews.

## 3. Target Users & Use Cases
### 3.1 User Profiles
- **Individual developers** who want to track personal productivity without relying on GitHub-hosted activity.
- **Team members** who work in multiple local repositories (client/internal) and need a unified view of their commit cadence.

### 3.2 Key Use Cases
1. Daily stand-up preparation: quickly review yesterday's contributions.
2. Sprint retrospectives: identify high/low activity periods in the current sprint.
3. Year-end review: export contribution history as motivation or documentation.

## 4. Product Scope
### 4.1 In Scope (MVP)
- Scan Git repositories in the current VS Code workspace.
- Aggregate commit counts per day for the past 52 weeks (default).
- Render GitHub-style heatmap with GitHub green palette.
- Provide tooltip with date and counts; clicking shows daily commit list.
- Allow configuration of author identity (one or more emails/names).
- Support manual refresh and incremental updates.

### 4.2 Out of Scope (MVP)
- Remote repository scanning beyond workspace roots (retain API opening for future custom paths).
- Telemetry or analytics collection.
- Server-side components.
- Team-sharing or collaboration features.

### 4.3 Future Considerations
- Line-change metrics, branch filtering, export to SVG/PNG, keyboard navigation enhancements, cached incremental updates, and colorblind-friendly themes.

## 5. User Experience & Design
### 5.1 Entry Points
- Command Palette: `Git Heatmap: Show`, `Git Heatmap: Refresh`, `Git Heatmap: Select Repositories`, `Git Heatmap: Export as SVG` (future).
- View container: dedicated sidebar view or Webview panel launched on demand.

### 5.2 Heatmap Layout
- 7x53 grid mirroring GitHub contribution calendar.
- Month labels across top; weekday labels on the left.
- Tooltip on hover with date + commit count.
- Selection reveals daily detail panel listing commits with repository, branch, message, and lines changed (future metric support noted).

### 5.3 Accessibility & Theming
- Adapts to VS Code light/dark theme using theme tokens.
- Provide alternative color palette for color-vision deficiencies in roadmap.
- Keyboard navigation (arrow keys to move focus, Enter to open detail) planned for post-MVP but design must accommodate.

## 6. Functional Requirements
### 6.1 Repository Discovery
- Use VS Code Git extension API to list repositories within the workspace.
- Support multiple root folders (multi-root workspace).
- Future hook: accept user-defined custom directories while guarding duplicates.

### 6.2 Author Filtering
- Default email/name pulled from `git config user.email` and `user.name`.
- Users can override or list multiple identifiers; extension should merge metrics across them.

### 6.3 Data Collection & Aggregation
- Execute Git log commands via child processes with parameterized arguments (no shell string concatenation).
- Default metric: commit count per day using committer date in local timezone.
- Aggregate daily counts per repository, then sum across repositories for the display.
- Cache raw counts per repo per day to minimize reprocessing.

### 6.4 Interaction & Controls
- Refresh button triggers re-scan.
- Settings surface in VS Code `settings.json` with defaults:
  - `gitHeatmap.scanMode`: `workspace`
  - `gitHeatmap.customPaths`: empty array but available for future use
  - `gitHeatmap.metric`: `commits`
  - `gitHeatmap.colorScheme`: `github`
- Detail view lists commits for selected day with link-out actions (`Open Commit in Diff`, `Open File at Revision`).

### 6.5 Performance & Reliability
- Limit concurrent Git processes (default max 3).
- Timeboxed operations with graceful fallback messaging on timeout (e.g., “Partial data shown”).
- Handle large repositories by chunking date ranges (per month) if necessary.
- Cache results using `ExtensionContext.globalState` keyed by repo path + date range + author signature.

## 7. Data & Privacy
- All data stays local; no external services.
- Extension reads `.git` directories and commit metadata only.
- No telemetry by default; provide setting toggle when telemetry becomes a consideration.

## 8. Technical Architecture
### 8.1 Components
- **Extension Host Module**: handles activation, repository discovery, Git command execution, caching, and messaging to Webview.
- **Webview UI**: renders heatmap using SVG for straightforward export and accessibility.
- **Communication**: `postMessage`/`onDidReceiveMessage` channel with typed messages for data updates and user actions.

### 8.2 Git Command Strategy
- Commit counts: `git -C <repo> log --since=<ISO> --until=<ISO> --no-merges --author=<pattern> --date=short --pretty=%ad`.
- When future metrics require line counts: `git ... --numstat --pretty=format:"commit %H %ad" --date=iso-strict-local` and accumulate additions/deletions per day.
- Branch scope: default HEAD + default branch; ability to extend to `--all` later.

### 8.3 Caching & Refresh
- Cache per repo day-level aggregates; on refresh, fetch only new commits since last `until` timestamp.
- Invalidate cache when HEAD or default branch tip changes.

### 8.4 Error Handling
- Detect missing Git installation and surface actionable message.
- Surface permission or command failures with guidance.
- Wrap child processes with timeout and cancellation to respect VS Code cancellation tokens.

## 9. Non-Functional Requirements
- **Performance**: first paint under 2 seconds with cached data; under 5 seconds for initial scan on medium repositories (<5000 commits).
- **Scalability**: handle up to 10 repositories concurrently; degrade gracefully with progress indicator.
- **Compatibility**: VS Code 1.85.0+, Git 2.30+.
- **Security**: parameterized command execution to prevent injection; no network access.

## 10. Release Plan
### 10.1 Milestones
1. **v0.1 (Week 1)**: Extension skeleton, single-repo commit count heatmap, manual refresh.
2. **v0.2 (Week 2)**: Multi-repo aggregation, author filtering, caching strategy.
3. **v0.3 (Weeks 3-4)**: Branch filter, metric switcher, export option, colorblind palette.
4. **v1.0 (Week 5)**: Performance hardening, accessibility pass, documentation, marketplace publish.

### 10.2 Launch Checklist
- README and marketplace assets complete.
- Unit tests for aggregation and parsing.
- Manual test pass across macOS, Windows, Linux.
- `vsce package`/`vsce publish` pipeline validated.

## 11. Open Questions
- Do we need to support submodules in MVP or treat them as future enhancement?
- Should the extension auto-refresh on repository changes or rely on manual refresh in MVP?
- What telemetry (if any) will be acceptable for post-launch improvements?

## 12. Risks & Mitigations
- **Large repository performance**: mitigate via caching, chunked log queries, concurrency limits.
- **Author identification mismatch**: provide clear settings UI to manage multiple emails/names.
- **Timezone discrepancies**: allow switching between local time and UTC, document caveats.
- **Accessibility gaps**: schedule dedicated QA for keyboard navigation and color contrast before v1.0.

