const vscode = acquireVsCodeApi();

const summaryElement = document.getElementById("summary");
const heatmapElement = document.getElementById("heatmap");
const refreshButton = document.getElementById("refreshButton");

refreshButton?.addEventListener("click", () => {
  vscode.postMessage({ command: "refresh" });
});

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.command === "heatmapData") {
    renderHeatmap(message.payload);
  } else if (message.command === "error") {
    showError(message.payload.message);
  }
});

vscode.postMessage({ command: "ready" });

function renderHeatmap(dataset) {
  if (!dataset || !Array.isArray(dataset.cells)) {
    heatmapElement.innerHTML = '<p class="empty">No data available.</p>';
    return;
  }

  const cells = [...dataset.cells].sort((a, b) => (a.date > b.date ? 1 : -1));
  const maxValue = cells.reduce((max, cell) => Math.max(max, cell.commits), 0);
  const palette = getPalette(dataset.summary?.colorScheme ?? "github");
  const levels = [0, 1, 3, 6, 10];

  summaryElement.innerHTML = `
    <div class="summary__item"><span class="label">Repositories</span><span>${
      dataset.summary?.repositories ?? 0
    }</span></div>
    <div class="summary__item"><span class="label">Commits</span><span>${
      dataset.summary?.totalCommits ?? 0
    }</span></div>
    <div class="summary__item"><span class="label">Range</span><span>${
      dataset.summary?.rangeStart ?? "?"
    } → ${dataset.summary?.rangeEnd ?? "?"}</span></div>
    <div class="summary__item"><span class="label">Metric</span><span>${
      dataset.summary?.metric ?? "commits"
    }</span></div>
  `;

  heatmapElement.innerHTML = "";
  heatmapElement.style.setProperty("--max-value", String(maxValue));

  cells.forEach((cell) => {
    const level = levels.findIndex((threshold) => cell.commits <= threshold);
    const bucket = level === -1 ? levels.length : Math.max(level - 1, 0);
    const color = palette[Math.min(bucket, palette.length - 1)];

    const div = document.createElement("div");
    div.className = "heatmap__cell";
    div.setAttribute("role", "gridcell");
    div.setAttribute("tabindex", "0");
    div.style.setProperty("--fill", color);
    div.title = `${cell.date}: ${cell.commits} commits`;
    div.dataset.date = cell.date;
    div.dataset.value = String(cell.commits);
    heatmapElement.appendChild(div);
  });
}

function showError(message) {
  heatmapElement.innerHTML = `<p class="error">Error: ${message}</p>`;
  summaryElement.innerHTML = "";
}

function getPalette(name) {
  switch (name) {
    case "blue":
      return ["#ebf5ff", "#bfdcff", "#7fb3ff", "#3b82f6", "#1d4ed8"];
    case "red":
      return ["#fde8e8", "#f8b4b4", "#f98080", "#f05252", "#c81e1e"];
    case "colorblind":
      return ["#f7f7f7", "#c8e7ff", "#91d6ff", "#4fb3ff", "#2183c6"];
    case "github":
    default:
      return ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  }
}
