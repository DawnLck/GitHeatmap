/**
 * Internationalization (i18n) Module
 * Provides translation and language management for the Git Heatmap extension
 */

/**
 * Current active language
 * @type {string}
 */
let currentLanguage = "en"; // Default to English

/**
 * Translation dictionary
 * Contains all translatable strings for supported languages
 */
const translations = {
  en: {
    // Header
    title: "Git Heatmap",
    export: "Export",
    refresh: "Refresh",

    // Export menu
    exportSVG: "Export as SVG",
    exportPNG: "Export as PNG",

    // Filters
    timeRange: "Time Range",
    timeRangeMonth: "Last Month",
    timeRangeQuarter: "Last Quarter",
    timeRangeHalfYear: "Last Half Year",
    timeRangeYear: "Last Year",

    userFilter: "User Filter",
    userFilterCurrent: "Current User",
    userFilterAll: "All Users",
    userFilterCustom: "Custom User",
    userFilterPlaceholder: "Enter user email...",

    advancedOptions: "Advanced Options",
    colorScheme: "Color Scheme",
    colorSchemeGithub: "GitHub Green",
    colorSchemeBlue: "Blue",
    colorSchemeRed: "Red",
    colorSchemePurple: "Purple",
    colorSchemeOrange: "Orange",
    colorSchemeColorblind: "Colorblind Friendly",

    dateSource: "Date Source",
    dateSourceCommitter: "Committer Date",
    dateSourceAuthor: "Author Date",

    includeMerges: "Include Merge Commits",

    // Loading and status
    loading: "Loading data...",
    refreshing: "Loading...",

    // Summary
    repo: "repo",
    repos: "repos",
    commit: "commit",
    commits: "commits",

    // Commits list
    recentCommits: "Recent Commits",
    noCommits: "No commits found in the selected range.",
    noData: "No data available.",

    // Detail panel
    viewDiff: "View Changes",

    // Legend
    less: "Less",
    more: "More",

    // Errors
    errorPrefix: "Error: ",
  },

  "zh-CN": {
    // Header
    title: "Git 热力图",
    export: "导出",
    refresh: "刷新",

    // Export menu
    exportSVG: "导出为 SVG",
    exportPNG: "导出为 PNG",

    // Filters
    timeRange: "时间范围",
    timeRangeMonth: "近一个月",
    timeRangeQuarter: "近三个月",
    timeRangeHalfYear: "近六个月",
    timeRangeYear: "近一年",

    userFilter: "用户筛选",
    userFilterCurrent: "当前用户",
    userFilterAll: "所有用户",
    userFilterCustom: "自定义用户",
    userFilterPlaceholder: "输入用户邮箱...",

    advancedOptions: "高级选项",
    colorScheme: "颜色主题",
    colorSchemeGithub: "GitHub 绿",
    colorSchemeBlue: "蓝色",
    colorSchemeRed: "红色",
    colorSchemePurple: "紫色",
    colorSchemeOrange: "橙色",
    colorSchemeColorblind: "色盲友好",

    dateSource: "日期源",
    dateSourceCommitter: "提交者日期",
    dateSourceAuthor: "作者日期",

    includeMerges: "包含合并提交",

    // Loading and status
    loading: "正在加载数据...",
    refreshing: "加载中...",

    // Summary
    repo: "仓库",
    repos: "仓库",
    commit: "提交",
    commits: "提交",

    // Commits list
    recentCommits: "最近提交",
    noCommits: "所选范围内未找到提交。",
    noData: "无可用数据。",

    // Detail panel
    viewDiff: "查看变更",

    // Legend
    less: "少",
    more: "多",

    // Errors
    errorPrefix: "错误: ",
  },
};

/**
 * Translate a key to the current language
 * @param {string} key - Translation key
 * @returns {string} Translated string, or the key itself if translation not found
 */
export function t(key) {
  return translations[currentLanguage]?.[key] || translations["en"][key] || key;
}

/**
 * Set the current language and update the UI
 * @param {string} lang - Language code (e.g., 'en', 'zh-CN')
 */
export function setLanguage(lang) {
  currentLanguage = lang;
  updateUILanguage();
}

/**
 * Get the current active language
 * @returns {string} Current language code
 */
export function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * Update all UI elements with current language translations
 * This function updates all static labels, buttons, and form elements
 */
export function updateUILanguage() {
  // Update all static labels
  const labelTimeRange = document.getElementById("labelTimeRange");
  if (labelTimeRange) labelTimeRange.textContent = `📅 ${t("timeRange")}`;

  const labelUserFilter = document.getElementById("labelUserFilter");
  if (labelUserFilter) labelUserFilter.textContent = `👤 ${t("userFilter")}`;

  const labelCustomUser = document.getElementById("labelCustomUser");
  if (labelCustomUser) labelCustomUser.textContent = t("userFilter");

  const summaryAdvanced = document.getElementById("summaryAdvanced");
  if (summaryAdvanced)
    summaryAdvanced.textContent = `⚙️ ${t("advancedOptions")}`;

  const labelColorScheme = document.getElementById("labelColorScheme");
  if (labelColorScheme) labelColorScheme.textContent = `🎨 ${t("colorScheme")}`;

  const labelDateSource = document.getElementById("labelDateSource");
  if (labelDateSource) labelDateSource.textContent = `📍 ${t("dateSource")}`;

  const labelIncludeMerges = document.getElementById("labelIncludeMerges");
  if (labelIncludeMerges) {
    const checkbox = labelIncludeMerges.querySelector("input");
    labelIncludeMerges.innerHTML = "";
    labelIncludeMerges.appendChild(checkbox);
    labelIncludeMerges.appendChild(document.createTextNode(t("includeMerges")));
  }

  // Update select options
  const timeRangeSelect = document.getElementById("timeRangeSelect");
  if (timeRangeSelect) {
    timeRangeSelect.options[0].text = t("timeRangeMonth");
    timeRangeSelect.options[1].text = t("timeRangeQuarter");
    timeRangeSelect.options[2].text = t("timeRangeHalfYear");
    timeRangeSelect.options[3].text = t("timeRangeYear");
  }

  const userFilterSelect = document.getElementById("userFilterSelect");
  if (userFilterSelect) {
    userFilterSelect.options[0].text = t("userFilterCurrent");
    userFilterSelect.options[1].text = t("userFilterAll");
    userFilterSelect.options[2].text = t("userFilterCustom");
  }

  const colorSchemeSelect = document.getElementById("colorSchemeSelect");
  if (colorSchemeSelect) {
    colorSchemeSelect.options[0].text = t("colorSchemeGithub");
    colorSchemeSelect.options[1].text = t("colorSchemeBlue");
    colorSchemeSelect.options[2].text = t("colorSchemeRed");
    colorSchemeSelect.options[3].text = t("colorSchemePurple");
    colorSchemeSelect.options[4].text = t("colorSchemeOrange");
    colorSchemeSelect.options[5].text = t("colorSchemeColorblind");
  }

  const dateSourceSelect = document.getElementById("dateSourceSelect");
  if (dateSourceSelect) {
    dateSourceSelect.options[0].text = t("dateSourceCommitter");
    dateSourceSelect.options[1].text = t("dateSourceAuthor");
  }

  const customUserInput = document.getElementById("customUserInput");
  if (customUserInput) {
    customUserInput.placeholder = t("userFilterPlaceholder");
  }

  // Update buttons
  const exportButton = document.getElementById("exportButton");
  if (exportButton) {
    exportButton.textContent = t("export");
  }

  const refreshButton = document.getElementById("refreshButton");
  if (refreshButton) {
    refreshButton.textContent = t("refresh");
  }

  // Update export menu
  const exportSVGBtn = document.getElementById("exportSVGBtn");
  if (exportSVGBtn) {
    exportSVGBtn.innerHTML = `📄 ${t("exportSVG")}`;
  }

  const exportPNGBtn = document.getElementById("exportPNGBtn");
  if (exportPNGBtn) {
    exportPNGBtn.innerHTML = `🖼️ ${t("exportPNG")}`;
  }

  // Update loading text
  const loadingText = document.getElementById("loadingText");
  if (loadingText) {
    loadingText.textContent = t("loading");
  }

  // Update commits title
  const commitsTitle = document.getElementById("commitsTitle");
  if (commitsTitle) {
    commitsTitle.textContent = t("recentCommits");
  }

  // Re-render current data with new language if available
  // Note: This is handled by the main module which has access to currentDataset
  if (typeof window.__i18nDatasetRenderer === "function") {
    window.__i18nDatasetRenderer();
  }
}

/**
 * Get all available language codes
 * @returns {string[]} Array of supported language codes
 */
export function getAvailableLanguages() {
  return Object.keys(translations);
}

/**
 * Check if a language is supported
 * @param {string} lang - Language code to check
 * @returns {boolean} True if language is supported
 */
export function isLanguageSupported(lang) {
  return lang in translations;
}

/**
 * Add or update translations for a language
 * @param {string} lang - Language code
 * @param {object} newTranslations - Translation key-value pairs
 */
export function addTranslations(lang, newTranslations) {
  if (!translations[lang]) {
    translations[lang] = {};
  }
  translations[lang] = { ...translations[lang], ...newTranslations };
}
