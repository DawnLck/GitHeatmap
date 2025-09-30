/**
 * Commit Detail Panel Module
 * Handles the display and interaction of commit details for a specific date
 */

// Import i18n translation function
import { t } from "./i18n.js";

/**
 * State management for the detail panel
 */
let detailPanelOpen = false;
let currentDetailDate = null;
let vscodeApi = null;

/**
 * Initialize the commit panel module
 * @param {object} vscode - VSCode webview API instance
 */
export function initCommitPanel(vscode) {
  // Store VSCode API reference for module use
  vscodeApi = vscode;

  // Setup global keyboard listener for ESC key
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailPanelOpen) {
      closeDetailPanel();
    }
  });
}

/**
 * Show commit details panel for a specific date
 * @param {string} date - Date string in YYYY-MM-DD format
 * @param {Array} commits - Array of commit objects
 */
export function showCommitDetails(date, commits) {
  if (!commits || commits.length === 0) {
    return;
  }

  // Create or update detail panel
  let detailPanel = document.getElementById("detailPanel");

  if (!detailPanel) {
    detailPanel = document.createElement("div");
    detailPanel.id = "detailPanel";
    detailPanel.className = "detail-panel";
    document.body.appendChild(detailPanel);
  }

  // Format date for display
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Get commit count label (singular/plural)
  const commitCountLabel = getCommitCountLabel(commits.length);

  // Build panel content
  const commitItems = commits
    .map(
      (commit) => `
    <div class="detail-commit-item">
      <div class="detail-commit-header">
        <span class="detail-commit-hash" data-hash="${
          commit.hash
        }" data-repo="${commit.repositoryPath}" title="${commit.hash}">${
        commit.shortHash
      }</span>
        <span class="detail-commit-date">${formatCommitTime(commit.date)}</span>
      </div>
      <div class="detail-commit-message" title="${escapeHtml(
        commit.message
      )}">${escapeHtml(commit.message)}</div>
      <div class="detail-commit-meta">
        <span class="detail-commit-author">👤 ${escapeHtml(
          commit.author
        )}</span>
        <span class="detail-commit-repo">📁 ${escapeHtml(
          commit.repositoryName
        )}</span>
      </div>
      <div class="detail-commit-actions">
        <button class="action-btn view-diff-btn" data-hash="${
          commit.hash
        }" data-repo="${commit.repositoryPath}">
          🔍 ${t("viewDiff")}
        </button>
      </div>
    </div>
  `
    )
    .join("");

  detailPanel.innerHTML = `
    <div class="detail-panel-content">
      <div class="detail-panel-header">
        <div class="detail-panel-title">
          <h3>📅 ${formattedDate}</h3>
          <span class="detail-panel-count">${commits.length} ${commitCountLabel}</span>
        </div>
        <button class="detail-panel-close" id="closeDetailPanel">✕</button>
      </div>
      <div class="detail-panel-body">
        ${commitItems}
      </div>
    </div>
    <div class="detail-panel-backdrop"></div>
  `;

  // Add event listeners
  const closeBtn = document.getElementById("closeDetailPanel");
  const backdrop = detailPanel.querySelector(".detail-panel-backdrop");

  closeBtn.addEventListener("click", closeDetailPanel);
  backdrop.addEventListener("click", closeDetailPanel);

  // Add view diff button listeners
  const viewDiffBtns = detailPanel.querySelectorAll(".view-diff-btn");
  viewDiffBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const hash = btn.dataset.hash;
      const repo = btn.dataset.repo;
      vscodeApi.postMessage({
        command: "openCommitDiff",
        payload: { hash, repositoryPath: repo },
      });
    });
  });

  // Show the panel
  detailPanel.classList.add("open");
  detailPanelOpen = true;
  currentDetailDate = date;

  // Prevent body scrolling
  document.body.style.overflow = "hidden";
}

/**
 * Close the commit detail panel
 */
export function closeDetailPanel() {
  const detailPanel = document.getElementById("detailPanel");
  if (detailPanel) {
    detailPanel.classList.remove("open");
    detailPanelOpen = false;
    currentDetailDate = null;

    // Restore body scrolling
    document.body.style.overflow = "";

    // Remove after animation
    setTimeout(() => {
      if (!detailPanelOpen) {
        detailPanel.remove();
      }
    }, 300);
  }
}

/**
 * Get the state of the detail panel
 * @returns {boolean} Whether the detail panel is open
 */
export function isDetailPanelOpen() {
  return detailPanelOpen;
}

/**
 * Get the current detail date
 * @returns {string|null} Current detail date or null
 */
export function getCurrentDetailDate() {
  return currentDetailDate;
}

/**
 * Get the appropriate commit count label (handles singular/plural)
 * @param {number} count - Number of commits
 * @returns {string} Localized commit count label
 */
function getCommitCountLabel(count) {
  return count === 1 ? t("commit") : t("commits");
}

/**
 * Format commit time to localized time string
 * @param {string} isoDate - ISO date string
 * @returns {string} Formatted time string
 */
function formatCommitTime(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
