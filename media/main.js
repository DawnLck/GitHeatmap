const vscode = acquireVsCodeApi();

// Import i18n module
import { t, setLanguage, updateUILanguage } from "./i18n.js";

// Import commit panel module
import {
  initCommitPanel,
  showCommitDetails,
  closeDetailPanel,
  isDetailPanelOpen,
} from "./commitPanel.js";

// DOM Elements
const summaryElement = document.getElementById("summary");
const heatmapElement = document.getElementById("heatmap");
const commitsListElement = document.getElementById("commitsList");
const loadingElement = document.getElementById("loading");
const refreshButton = document.getElementById("refreshButton");
const exportButton = document.getElementById("exportButton");
const exportMenu = document.getElementById("exportMenu");
const exportSVGBtn = document.getElementById("exportSVGBtn");
const exportPNGBtn = document.getElementById("exportPNGBtn");

// Filter Elements
const timeRangeSelect = document.getElementById("timeRangeSelect");
const userFilterSelect = document.getElementById("userFilterSelect");
const customUserGroup = document.getElementById("customUserGroup");
const customUserInput = document.getElementById("customUserInput");
const colorSchemeSelect = document.getElementById("colorSchemeSelect");
const dateSourceSelect = document.getElementById("dateSourceSelect");
const includeMerges = document.getElementById("includeMerges");

// State
let currentFilters = {
  timeRange: "halfYear",
  userFilter: "current",
  customUser: "",
  colorScheme: "github",
  dateSource: "committer",
  includeMerges: false,
};

let userList = [];

// Event Listeners
refreshButton?.addEventListener("click", () => {
  vscode.postMessage({ command: "refresh" });
});

// Export menu toggle
exportButton?.addEventListener("click", () => {
  exportMenu.style.display =
    exportMenu.style.display === "none" ? "block" : "none";
});

// Close export menu when clicking outside
document.addEventListener("click", (e) => {
  if (
    exportMenu &&
    exportButton &&
    !exportMenu.contains(e.target) &&
    !exportButton.contains(e.target)
  ) {
    exportMenu.style.display = "none";
  }
});

exportSVGBtn?.addEventListener("click", () => {
  exportMenu.style.display = "none";
  exportAsSVG();
});

exportPNGBtn?.addEventListener("click", () => {
  exportMenu.style.display = "none";
  exportAsPNG();
});

// Filter Event Listeners with debouncing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const updateFiltersDebounced = debounce(() => {
  vscode.postMessage({
    command: "updateFilters",
    payload: currentFilters,
  });
}, 500);

timeRangeSelect?.addEventListener("change", (e) => {
  currentFilters.timeRange = e.target.value;
  updateFiltersDebounced();
});

userFilterSelect?.addEventListener("change", (e) => {
  currentFilters.userFilter = e.target.value;

  // Show/hide custom user input
  if (e.target.value === "custom") {
    customUserGroup.style.display = "block";
    requestUserList();
  } else {
    customUserGroup.style.display = "none";
  }

  updateFiltersDebounced();
});

customUserInput?.addEventListener("input", (e) => {
  currentFilters.customUser = e.target.value;
  updateFiltersDebounced();
});

colorSchemeSelect?.addEventListener("change", (e) => {
  currentFilters.colorScheme = e.target.value;

  // For color scheme changes, just re-render with existing data
  // No need to fetch data from backend
  if (currentDataset) {
    // Update the color scheme in the dataset summary
    currentDataset.summary.colorScheme = e.target.value;
    renderHeatmap(currentDataset);
  }

  // Save the preference without refreshing
  vscode.postMessage({
    command: "updateFilters",
    payload: { colorScheme: currentFilters.colorScheme },
  });
});

dateSourceSelect?.addEventListener("change", (e) => {
  currentFilters.dateSource = e.target.value;
  updateFiltersDebounced();
});

includeMerges?.addEventListener("change", (e) => {
  currentFilters.includeMerges = e.target.checked;
  updateFiltersDebounced();
});

function requestUserList() {
  vscode.postMessage({ command: "getUserList" });
}

window.addEventListener("message", (event) => {
  const message = event.data;
  console.log("Received message:", message);
  if (!message) {
    return;
  }

  switch (message.command) {
    case "setLanguage":
      setLanguage(message.payload);
      break;
    case "filtersInitialized":
      initializeFilters(message.payload);
      break;
    case "heatmapData":
      console.log("Processing heatmap data");
      renderHeatmap(message.payload);
      break;
    case "userList":
      handleUserList(message.payload);
      break;
    case "loading":
      handleLoading(message.payload.isLoading);
      break;
    case "error":
      console.log("Processing error message");
      showError(message.payload.message);
      break;
    case "commitsForDate":
      showCommitDetails(message.payload.date, message.payload.commits);
      break;
    case "requestExportSVG":
      handleExportSVGRequest();
      break;
    case "requestExportPNG":
      handleExportPNGRequest();
      break;
  }
});

// Set up i18n dataset renderer callback for language switching
window.__i18nDatasetRenderer = () => {
  if (currentDataset) {
    renderHeatmap(currentDataset);
  }
};

// Initialize commit panel module
initCommitPanel(vscode);

// Initialize
vscode.postMessage({ command: "ready" });

// Filter Management Functions
function initializeFilters(filters) {
  currentFilters = { ...currentFilters, ...filters };

  // Update UI elements
  if (timeRangeSelect) timeRangeSelect.value = filters.timeRange || "halfYear";
  if (userFilterSelect)
    userFilterSelect.value = filters.userFilter || "current";
  if (colorSchemeSelect)
    colorSchemeSelect.value = filters.colorScheme || "github";
  if (dateSourceSelect)
    dateSourceSelect.value = filters.dateSource || "committer";
  if (includeMerges) includeMerges.checked = filters.includeMerges || false;

  // Handle custom user visibility
  if (filters.userFilter === "custom") {
    customUserGroup.style.display = "block";
    if (customUserInput) customUserInput.value = filters.customUser || "";
    requestUserList();
  }
}

function handleUserList(users) {
  userList = users;
  updateCustomUserOptions();
}

function updateCustomUserOptions() {
  // Add datalist for autocomplete
  let datalist = document.getElementById("userDatalist");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "userDatalist";
    customUserInput.setAttribute("list", "userDatalist");
    document.body.appendChild(datalist);
  }

  datalist.innerHTML = "";
  userList.forEach((user) => {
    const option = document.createElement("option");
    option.value = user;
    datalist.appendChild(option);
  });
}

function handleLoading(isLoading) {
  if (loadingElement) {
    loadingElement.style.display = isLoading ? "flex" : "none";
  }

  // Disable filters during loading
  const filterElements = [
    timeRangeSelect,
    userFilterSelect,
    customUserInput,
    colorSchemeSelect,
    dateSourceSelect,
    includeMerges,
  ];

  filterElements.forEach((element) => {
    if (element) {
      element.disabled = isLoading;
    }
  });

  if (refreshButton) {
    refreshButton.disabled = isLoading;
    refreshButton.textContent = isLoading ? t("refreshing") : t("refresh");
  }
}

// Keyboard navigation
let focusedCell = null;

document.addEventListener("keydown", (event) => {
  if (!focusedCell) return;

  const cells = Array.from(
    document.querySelectorAll(".calendar-cell:not(.empty-cell)")
  );
  const currentIndex = cells.indexOf(focusedCell);

  let newIndex = currentIndex;

  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      newIndex = currentIndex - 1;
      break;
    case "ArrowDown":
      event.preventDefault();
      newIndex = currentIndex + 1;
      break;
    case "ArrowLeft":
      event.preventDefault();
      newIndex = currentIndex - 7;
      break;
    case "ArrowRight":
      event.preventDefault();
      newIndex = currentIndex + 7;
      break;
    case "Enter":
      event.preventDefault();
      showCellDetails(focusedCell);
      return;
    case "Escape":
      event.preventDefault();
      focusedCell.blur();
      focusedCell = null;
      return;
  }

  if (newIndex >= 0 && newIndex < cells.length) {
    cells[newIndex].focus();
  }
});

function showCellDetails(cell) {
  const date = cell.dataset.date;
  const value = cell.dataset.value;
  const commits = parseInt(value, 10);

  if (commits === 0) {
    return; // 没有提交就不显示详情
  }

  // Request commits for this date from backend
  vscode.postMessage({
    command: "getCommitsForDate",
    payload: date,
  });
}

function renderHeatmap(dataset) {
  console.log("Received dataset:", dataset);

  if (!dataset || !Array.isArray(dataset.cells)) {
    console.log("No valid dataset or cells array");
    heatmapElement.innerHTML = `<p class="empty">${t("noData")}</p>`;
    return;
  }

  // Store dataset for export
  currentDataset = dataset;

  console.log(`Dataset has ${dataset.cells.length} cells`);
  console.log("Sample cells:", dataset.cells.slice(0, 5));

  const cells = [...dataset.cells].sort((a, b) => (a.date > b.date ? 1 : -1));
  const maxValue = cells.reduce((max, cell) => Math.max(max, cell.commits), 0);
  const palette = getPalette(dataset.summary?.colorScheme ?? "github");
  const levels = [0, 5, 10, 15, 20];

  const repoCount = dataset.summary?.repositories ?? 0;
  const commitCount = dataset.summary?.totalCommits ?? 0;
  const repoLabel = repoCount === 1 ? t("repo") : t("repos");
  const commitLabel = commitCount === 1 ? t("commit") : t("commits");
  const timeRangeLabel = t("timeRange");

  summaryElement.innerHTML = `
    <div class="summary__item"><span class="label">${repoLabel}</span><span>${repoCount}</span></div>
    <div class="summary__item"><span class="label">${commitLabel}</span><span>${commitCount}</span></div>
    <div class="summary__item"><span class="label">${timeRangeLabel}</span><span>${
    dataset.summary?.rangeStart ?? "?"
  } → ${dataset.summary?.rangeEnd ?? "?"}</span></div>
  `;

  // Create GitHub-style calendar heatmap
  renderGitHubCalendar(cells, palette, levels, maxValue, dataset.summary);

  // Render commits list
  renderCommitsList(dataset.allCommits || []);
}

function renderGitHubCalendar(cells, palette, levels, maxValue, summary) {
  // Create data map for quick lookup
  const dataMap = new Map();
  cells.forEach((cell) => {
    dataMap.set(cell.date, cell.commits);
  });

  // Use the actual date range from the data
  const startDate = new Date(summary.rangeStart);
  const endDate = new Date(summary.rangeEnd);

  // Adjust to start from Sunday
  const startSunday = new Date(startDate);
  startSunday.setDate(startDate.getDate() - startDate.getDay());

  // Calculate the number of weeks needed
  const daysDiff = Math.ceil((endDate - startSunday) / (1000 * 60 * 60 * 24));
  const weeksNeeded = Math.ceil(daysDiff / 7);

  // Generate calendar grid
  const calendarContainer = document.createElement("div");
  calendarContainer.className = "calendar-container";

  // Create month labels
  const monthLabels = createMonthLabels(startSunday, endDate);
  calendarContainer.appendChild(monthLabels);

  // Create main calendar grid
  const calendarGrid = document.createElement("div");
  calendarGrid.className = "calendar-grid";

  // Create weekday labels
  const weekdayLabels = createWeekdayLabels();
  calendarGrid.appendChild(weekdayLabels);

  // Create week columns (dynamic number of weeks)
  for (let week = 0; week < weeksNeeded; week++) {
    const weekColumn = document.createElement("div");
    weekColumn.className = "week-column";

    // Create 7 days for each week
    for (let day = 0; day < 7; day++) {
      const currentDate = new Date(startSunday);
      currentDate.setDate(startSunday.getDate() + week * 7 + day);

      const dateStr = formatDate(currentDate);
      const commits = dataMap.get(dateStr) || 0;

      const level = levels.findIndex((threshold) => commits <= threshold);
      const bucket = level === -1 ? levels.length : Math.max(level - 1, 0);
      const color = palette[Math.min(bucket, palette.length - 1)];

      const cell = document.createElement("div");
      cell.className = "calendar-cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "0");
      cell.style.setProperty("--fill", color);
      cell.title = formatTooltip(currentDate, commits);
      cell.dataset.date = dateStr;
      cell.dataset.value = String(commits);

      // Add focus and click event listeners
      cell.addEventListener("focus", () => {
        focusedCell = cell;
      });

      cell.addEventListener("click", () => {
        showCellDetails(cell);
      });

      // Only show cells within our data range
      if (currentDate <= endDate) {
        weekColumn.appendChild(cell);
      } else {
        // Empty cell for future dates
        const emptyCell = document.createElement("div");
        emptyCell.className = "calendar-cell empty-cell";
        weekColumn.appendChild(emptyCell);
      }
    }

    calendarGrid.appendChild(weekColumn);
  }

  calendarContainer.appendChild(calendarGrid);

  // Create legend
  const legend = createLegend(palette);
  calendarContainer.appendChild(legend);

  // Replace heatmap content
  heatmapElement.innerHTML = "";
  heatmapElement.appendChild(calendarContainer);
}

function createMonthLabels(startDate, endDate) {
  const monthLabels = document.createElement("div");
  monthLabels.className = "month-labels";

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let currentMonth = -1;

  // Create week labels (dynamic number)
  const totalWeeks =
    Math.ceil((new Date(endDate) - startDate) / (7 * 24 * 60 * 60 * 1000)) + 1;
  for (let week = 0; week < totalWeeks; week++) {
    const weekDate = new Date(startDate);
    weekDate.setDate(startDate.getDate() + week * 7);

    const monthIndex = weekDate.getMonth();
    const label = document.createElement("div");
    label.className = "month-label";

    // Only show month name at the start of each month
    if (monthIndex !== currentMonth && weekDate.getDate() <= 7) {
      label.textContent = months[monthIndex];
      currentMonth = monthIndex;
    }

    monthLabels.appendChild(label);
  }

  return monthLabels;
}

function createWeekdayLabels() {
  const weekdayLabels = document.createElement("div");
  weekdayLabels.className = "weekday-labels";

  const days = ["S", "M", "T", "W", "T", "F", "S"];
  days.forEach((day, index) => {
    const label = document.createElement("div");
    label.className = "weekday-label";
    if (index % 2 === 1) {
      // Show only M, W, F for space
      label.textContent = day;
    }
    weekdayLabels.appendChild(label);
  });

  return weekdayLabels;
}

function createLegend(palette) {
  const legend = document.createElement("div");
  legend.className = "legend";

  const lessLabel = document.createElement("span");
  lessLabel.textContent = t("less");
  lessLabel.className = "legend-label";
  legend.appendChild(lessLabel);

  palette.forEach((color) => {
    const legendCell = document.createElement("div");
    legendCell.className = "legend-cell";
    legendCell.style.backgroundColor = color;
    legend.appendChild(legendCell);
  });

  const moreLabel = document.createElement("span");
  moreLabel.textContent = t("more");
  moreLabel.className = "legend-label";
  legend.appendChild(moreLabel);

  return legend;
}

function formatDate(date) {
  // Use local date formatting instead of UTC to prevent timezone conversion issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTooltip(date, commits) {
  const options = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const dateStr = date.toLocaleDateString(undefined, options);
  const commitText = commits === 1 ? "commit" : "commits";
  return `${dateStr}: ${commits} ${commitText}`;
}

function renderCommitsList(commits) {
  if (!commits || commits.length === 0) {
    commitsListElement.innerHTML = `<p class="empty">${t("noCommits")}</p>`;
    return;
  }

  // Show latest 50 commits
  const recentCommits = commits.slice(0, 50);

  const commitElements = recentCommits
    .map((commit) => {
      const commitDate = new Date(commit.date);
      const formatOptions = {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      const formattedDate = commitDate.toLocaleString(undefined, formatOptions);

      return `
      <div class="commit-item">
        <div class="commit-header">
          <span class="commit-hash" title="${
            commit.hash
          }">${commit.hash.substring(0, 7)}</span>
          <span class="commit-date">${formattedDate}</span>
        </div>
        <div class="commit-message" title="${commit.message}">${
        commit.message
      }</div>
        <div class="commit-meta">
          <span class="commit-author">${commit.author}</span>
          <span class="commit-repo">${commit.repository}</span>
        </div>
      </div>
    `;
    })
    .join("");

  commitsListElement.innerHTML = commitElements;
}

function showError(message) {
  heatmapElement.innerHTML = `<p class="error">${t(
    "errorPrefix"
  )}${message}</p>`;
  summaryElement.innerHTML = "";
  commitsListElement.innerHTML = "";
}

function getPalette(name) {
  switch (name) {
    case "blue":
      return ["#ebf5ff", "#bfdcff", "#7fb3ff", "#3b82f6", "#1d4ed8"];
    case "red":
      return ["#fde8e8", "#f8b4b4", "#f98080", "#f05252", "#c81e1e"];
    case "purple":
      return ["#f3e8ff", "#e9d5ff", "#c084fc", "#a855f7", "#7c3aed"];
    case "orange":
      return ["#fff7ed", "#fed7aa", "#fb923c", "#f97316", "#ea580c"];
    case "colorblind":
      // Orange-Blue gradient - friendly for red-green colorblind users
      return ["#f0f0f0", "#ffffcc", "#ffeda0", "#feb24c", "#fd8d3c"];
    case "github":
    default:
      return ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  }
}

// Note: showCommitDetails, closeDetailPanel and related functions
// are now handled by the commitPanel.js module

// Export functions
let currentDataset = null; // Store current dataset for export

function exportAsSVG() {
  handleExportSVGRequest();
}

function exportAsPNG() {
  handleExportPNGRequest();
}

function handleExportSVGRequest() {
  const calendar = document.querySelector(".calendar-container");
  if (!calendar || !currentDataset) {
    console.error("No heatmap data available for export");
    return;
  }

  const svgData = generateSVG(currentDataset);
  vscode.postMessage({
    command: "exportData",
    payload: {
      type: "svg",
      data: svgData,
    },
  });
}

function handleExportPNGRequest() {
  const calendar = document.querySelector(".calendar-container");
  if (!calendar) {
    console.error("No heatmap available for export");
    return;
  }

  // Create a canvas and draw the heatmap
  const canvas = document.createElement("canvas");
  const scale = 2; // 2x for better quality
  const rect = calendar.getBoundingClientRect();

  canvas.width = rect.width * scale;
  canvas.height = rect.height * scale;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Draw white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Use html2canvas-like approach: render DOM to canvas
  renderDOMToCanvas(calendar, ctx)
    .then(() => {
      const pngData = canvas.toDataURL("image/png");
      vscode.postMessage({
        command: "exportData",
        payload: {
          type: "png",
          data: pngData,
        },
      });
    })
    .catch((err) => {
      console.error("Failed to generate PNG:", err);
    });
}

function generateSVG(dataset) {
  const { cells, summary } = dataset;
  const palette = getPalette(summary.colorScheme);
  const levels = [0, 1, 3, 6, 10];

  // Calculate SVG dimensions
  const cellSize = 11;
  const cellGap = 3;
  const weekdayLabelWidth = 24;
  const monthLabelHeight = 20;
  const legendHeight = 40;
  const padding = 20;

  // Prepare data
  const dataMap = new Map();
  cells.forEach((cell) => {
    dataMap.set(cell.date, cell.commits);
  });

  const startDate = new Date(summary.rangeStart);
  const endDate = new Date(summary.rangeEnd);
  const startSunday = new Date(startDate);
  startSunday.setDate(startDate.getDate() - startDate.getDay());

  const daysDiff = Math.ceil((endDate - startSunday) / (1000 * 60 * 60 * 24));
  const weeksNeeded = Math.ceil(daysDiff / 7);

  const gridWidth = weeksNeeded * (cellSize + cellGap);
  const gridHeight = 7 * (cellSize + cellGap);

  // Ensure minimum width for title and summary text
  const minWidth = 260; // Minimum width to accommodate text
  const calculatedWidth = weekdayLabelWidth + gridWidth + padding * 2;
  const totalWidth = Math.max(minWidth, calculatedWidth);
  const totalHeight =
    monthLabelHeight + gridHeight + legendHeight + padding * 2 + 80; // +80 for title, summary and bottom date range

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .title { font-size: 16px; font-weight: 600; fill: #24292e; }
      .summary-text { font-size: 11px; fill: #586069; }
      .month-label { font-size: 10px; fill: #586069; }
      .weekday-label { font-size: 9px; fill: #586069; }
      .legend-label { font-size: 11px; fill: #586069; }
      .calendar-cell { stroke: rgba(0,0,0,0.05); stroke-width: 1; }
    </style>
  </defs>
  
  <!-- Title and Summary -->
  <text x="${padding}" y="${padding + 15}" class="title">${t("title")}</text>
  <text x="${padding}" y="${padding + 35}" class="summary-text">${
    summary.repositories
  } ${summary.repositories === 1 ? t("repo") : t("repos")} · ${
    summary.totalCommits
  } ${summary.totalCommits === 1 ? t("commit") : t("commits")}</text>
  
  <!-- Calendar -->
  <g transform="translate(${padding}, ${padding + 50})">`;

  // Month labels
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  let currentMonth = -1;

  for (let week = 0; week < weeksNeeded; week++) {
    const weekDate = new Date(startSunday);
    weekDate.setDate(startSunday.getDate() + week * 7);
    const monthIndex = weekDate.getMonth();

    if (monthIndex !== currentMonth && weekDate.getDate() <= 7) {
      const x = weekdayLabelWidth + week * (cellSize + cellGap);
      svg += `
    <text x="${x}" y="10" class="month-label">${months[monthIndex]}</text>`;
      currentMonth = monthIndex;
    }
  }

  // Weekday labels
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let day = 0; day < 7; day++) {
    if (day % 2 === 1) {
      // Show Mon, Wed, Fri
      const y =
        monthLabelHeight + day * (cellSize + cellGap) + cellSize / 2 + 3;
      svg += `
    <text x="0" y="${y}" class="weekday-label" text-anchor="start">${weekdays[day]}</text>`;
    }
  }

  // Calendar cells
  for (let week = 0; week < weeksNeeded; week++) {
    for (let day = 0; day < 7; day++) {
      const currentDate = new Date(startSunday);
      currentDate.setDate(startSunday.getDate() + week * 7 + day);

      if (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        const commits = dataMap.get(dateStr) || 0;
        const level = levels.findIndex((threshold) => commits <= threshold);
        const bucket = level === -1 ? levels.length : Math.max(level - 1, 0);
        const color = palette[Math.min(bucket, palette.length - 1)];

        const x = weekdayLabelWidth + week * (cellSize + cellGap);
        const y = monthLabelHeight + day * (cellSize + cellGap);

        svg += `
    <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}" class="calendar-cell">
      <title>${formatDate(currentDate)}: ${commits} ${
          commits === 1 ? "commit" : "commits"
        }</title>
    </rect>`;
      }
    }
  }

  // Legend
  const legendY = monthLabelHeight + gridHeight + 20;
  svg += `
    <g transform="translate(${
      gridWidth + weekdayLabelWidth - 140
    }, ${legendY})">
      <text x="0" y="10" class="legend-label">${t("less")}</text>`;

  palette.forEach((color, i) => {
    const x = 35 + i * (cellSize + cellGap);
    svg += `
      <rect x="${x}" y="0" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}" class="calendar-cell"/>`;
  });

  svg += `
      <text x="${
        35 + palette.length * (cellSize + cellGap) + 5
      }" y="10" class="legend-label">${t("more")}</text>
    </g>`;

  // Date range at the bottom
  const dateRangeY = legendY + 35;
  const dateRangeText = `${summary.rangeStart} → ${summary.rangeEnd}`;
  svg += `
    <text x="${
      gridWidth / 2 + weekdayLabelWidth / 2
    }" y="${dateRangeY}" class="summary-text" text-anchor="middle">📅 ${dateRangeText}</text>`;

  svg += `
  </g>
</svg>`;

  return svg;
}

async function renderDOMToCanvas(element, ctx) {
  // Simple DOM to Canvas renderer
  // This is a simplified version - for production, use html2canvas library
  return new Promise((resolve) => {
    const cells = element.querySelectorAll(".calendar-cell:not(.empty-cell)");
    const weekLabels = element.querySelectorAll(".weekday-label");
    const monthLabels = element.querySelectorAll(".month-label");

    const cellSize = 11;
    const cellGap = 3;
    const offsetX = 24;
    const offsetY = 20;

    // Draw month labels
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillStyle = "#586069";
    monthLabels.forEach((label, index) => {
      if (label.textContent.trim()) {
        ctx.fillText(
          label.textContent,
          offsetX + index * (cellSize + cellGap),
          12
        );
      }
    });

    // Draw weekday labels
    weekLabels.forEach((label, index) => {
      if (label.textContent.trim()) {
        const y = offsetY + Math.floor(index / 2) * 2 * (cellSize + cellGap);
        ctx.fillText(label.textContent, 0, y + cellSize / 2 + 3);
      }
    });

    // Draw cells
    cells.forEach((cell) => {
      const rect = cell.getBoundingClientRect();
      const parentRect = element.getBoundingClientRect();
      const x = rect.left - parentRect.left;
      const y = rect.top - parentRect.top;
      const color = window.getComputedStyle(cell).backgroundColor;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellSize, cellSize);

      // Border
      ctx.strokeStyle = "rgba(0,0,0,0.1)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellSize, cellSize);
    });

    resolve();
  });
}
