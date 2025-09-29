const vscode = acquireVsCodeApi();

// DOM Elements
const summaryElement = document.getElementById("summary");
const heatmapElement = document.getElementById("heatmap");
const commitsListElement = document.getElementById("commitsList");
const loadingElement = document.getElementById("loading");
const refreshButton = document.getElementById("refreshButton");

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
  updateFiltersDebounced();
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
  }
});

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
    refreshButton.textContent = isLoading ? "加载中..." : "Refresh";
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

  // Here you could show a detailed panel
  // For now, just show an alert
  const message = `${date}: ${commits} ${commits === 1 ? "commit" : "commits"}`;
  console.log("Cell details:", message);
}

function renderHeatmap(dataset) {
  console.log("Received dataset:", dataset);

  if (!dataset || !Array.isArray(dataset.cells)) {
    console.log("No valid dataset or cells array");
    heatmapElement.innerHTML = '<p class="empty">No data available.</p>';
    return;
  }

  console.log(`Dataset has ${dataset.cells.length} cells`);
  console.log("Sample cells:", dataset.cells.slice(0, 5));

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
  lessLabel.textContent = "Less";
  lessLabel.className = "legend-label";
  legend.appendChild(lessLabel);

  palette.forEach((color) => {
    const legendCell = document.createElement("div");
    legendCell.className = "legend-cell";
    legendCell.style.backgroundColor = color;
    legend.appendChild(legendCell);
  });

  const moreLabel = document.createElement("span");
  moreLabel.textContent = "More";
  moreLabel.className = "legend-label";
  legend.appendChild(moreLabel);

  return legend;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function formatTooltip(date, commits) {
  const options = {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const dateStr = date.toLocaleDateString("en-US", options);
  const commitText = commits === 1 ? "commit" : "commits";
  return `${dateStr}: ${commits} ${commitText}`;
}

function renderCommitsList(commits) {
  if (!commits || commits.length === 0) {
    commitsListElement.innerHTML =
      '<p class="empty">No commits found in the selected range.</p>';
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
      const formattedDate = commitDate.toLocaleDateString(
        "en-US",
        formatOptions
      );

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
  heatmapElement.innerHTML = `<p class="error">Error: ${message}</p>`;
  summaryElement.innerHTML = "";
  commitsListElement.innerHTML = "";
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
