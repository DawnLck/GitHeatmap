# Git Heatmap（VS Code 扩展）

Git Heatmap 会在 Visual Studio Code 内直接展示一块 GitHub 风格的贡献热图，通过扫描本地 Git 仓库，对每天的提交次数进行聚合，并以交互式面板呈现，让你无需离开编辑器即可快速回顾近期开发节奏。

## 命令

- `Git Heatmap: Show` — 打开热图面板。
- `Git Heatmap: Refresh` — 触发数据刷新（若面板关闭会自动打开）。
- `Git Heatmap: Select Repositories` — 为未来的自定义仓库范围选择预留。

## 配置项

- `gitHeatmap.scanMode`（`workspace` | `customPaths`）— 仓库发现策略，默认 `workspace`。
- `gitHeatmap.customPaths` — 当 `scanMode` 为 `customPaths` 时可额外指定的目录列表。
- `gitHeatmap.metric`（默认 `commits`）— 热图展示的统计指标。
- `gitHeatmap.colorScheme`（默认 `github`）— 热图配色方案。
- `gitHeatmap.includeMerges`（默认 `false`）— 是否统计合并提交。
- `gitHeatmap.dateSource`（默认 `committer`）— 聚合时使用的 Git 日期字段。

## 开发步骤

1. 安装依赖：`npm install`。
2. 编译 TypeScript：`npm run compile`（编译输出位于 `out/` 目录）。
3. 在 VS Code 中按 `F5` 启动扩展调试会话。
