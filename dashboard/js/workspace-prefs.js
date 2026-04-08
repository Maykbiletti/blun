/**
 * Workspace-Prefs: LocalStorage Persistence für User-Settings
 * Sidebar-State, Theme, Panel-Größen, Split-Ratio, zuletzt geöffneter Agent
 */

const PREFS_KEY = 'blun_workspace_prefs';
const PREFS_VERSION = 3;

const THEME_PRESETS = {
  dark: {
    name: 'Dark',
    bg: '#0f172a',
    surface: '#1e293b',
    border: '#334155',
    text: '#e2e8f0',
    accent: '#3b82f6'
  },
  light: {
    name: 'Light',
    bg: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    text: '#1e293b',
    accent: '#2563eb'
  },
  midnight: {
    name: 'Midnight',
    bg: '#020617',
    surface: '#0f172a',
    border: '#1e293b',
    text: '#cbd5e1',
    accent: '#8b5cf6'
  }
};

const DEFAULTS = {
  version: PREFS_VERSION,
  theme: 'dark',
  splitRatio: 0.5,
  panelSizes: {},
  scrollPositions: {},
  lastAgent: null,
  lastDepartment: null,
  lastSection: 'dashboard',
  sidebarCollapsed: false,
  fontSize: 14,
  recentAgents: [],
  openTabs: [],
  autoSave: true,
  lastSaved: null
};

/**
 * Load preferences from localStorage
 */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULTS };

    const parsed = JSON.parse(raw);
    if (parsed.version !== PREFS_VERSION) {
      return migratePrefs(parsed);
    }

    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    console.warn('Prefs load error:', e);
    return { ...DEFAULTS };
  }
}

/**
 * Migrate old preference versions
 */
function migratePrefs(old) {
  const migrated = { ...DEFAULTS, ...old, version: PREFS_VERSION };

  if (!migrated.openTabs) migrated.openTabs = [];
  if (!migrated.scrollPositions) migrated.scrollPositions = {};
  if (!migrated.lastSection) migrated.lastSection = 'dashboard';

  savePrefs(migrated);
  return migrated;
}

/**
 * Save preferences to localStorage
 */
function savePrefs(prefs) {
  try {
    prefs.lastSaved = Date.now();
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Prefs save error:', e);
  }
}

/**
 * Get single preference
 */
function getPref(key) {
  return loadPrefs()[key];
}

/**
 * Set single preference
 */
function setPref(key, value) {
  const prefs = loadPrefs();
  prefs[key] = value;
  savePrefs(prefs);
  return prefs;
}

/**
 * Panel Size Management
 */
function savePanelSize(panelId, size) {
  const prefs = loadPrefs();
  if (!prefs.panelSizes) prefs.panelSizes = {};
  prefs.panelSizes[panelId] = size;
  savePrefs(prefs);
}

function getPanelSize(panelId) {
  return loadPrefs().panelSizes?.[panelId] || null;
}

/**
 * Scroll Position Management
 */
function saveScrollPosition(panelId, scrollTop) {
  const prefs = loadPrefs();
  if (!prefs.scrollPositions) prefs.scrollPositions = {};
  prefs.scrollPositions[panelId] = scrollTop;
  savePrefs(prefs);
}

function restoreScrollPosition(panelId) {
  const pos = loadPrefs().scrollPositions?.[panelId];
  if (pos !== undefined && pos !== null) {
    const el = document.getElementById(panelId);
    if (el) {
      el.scrollTop = pos;
    }
  }
}

/**
 * Theme Management
 */
function setTheme(theme) {
  const preset = THEME_PRESETS[theme] || THEME_PRESETS.dark;
  setPref('theme', theme);

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--theme-bg', preset.bg);
  document.documentElement.style.setProperty('--theme-surface', preset.surface);
  document.documentElement.style.setProperty('--theme-border', preset.border);
  document.documentElement.style.setProperty('--theme-text', preset.text);
  document.documentElement.style.setProperty('--theme-accent', preset.accent);

  if (document.body) {
    document.body.className = document.body.className.replace(/theme-\w+/g, '');
    document.body.classList.add(`theme-${theme}`);
  }
}

function applyTheme() {
  const theme = getPref('theme') || 'dark';
  setTheme(theme);
}

function getTheme() {
  return getPref('theme') || 'dark';
}

function getThemePresets() {
  return THEME_PRESETS;
}

/**
 * Agent Tracking
 */
function trackRecentAgent(agentId, agentName) {
  const prefs = loadPrefs();
  if (!prefs.recentAgents) prefs.recentAgents = [];

  prefs.recentAgents = [
    { id: agentId, name: agentName, time: Date.now() },
    ...prefs.recentAgents.filter(a => a.id !== agentId)
  ].slice(0, 10);

  prefs.lastAgent = agentId;
  savePrefs(prefs);
}

function getRecentAgents() {
  return getPref('recentAgents') || [];
}

/**
 * Sidebar State
 */
function setSidebarCollapsed(collapsed) {
  setPref('sidebarCollapsed', collapsed);
}

function isSidebarCollapsed() {
  return getPref('sidebarCollapsed') || false;
}

/**
 * Section Navigation
 */
function setLastSection(section) {
  setPref('lastSection', section);
}

function getLastSection() {
  return getPref('lastSection') || 'dashboard';
}

/**
 * Tab Management
 */
function saveOpenTabs(tabs) {
  setPref('openTabs', tabs);
}

function getOpenTabs() {
  return getPref('openTabs') || [];
}

/**
 * Split Ratio (Canvas Editor)
 */
function saveSplitRatio(ratio) {
  setPref('splitRatio', ratio);
}

function getSplitRatio() {
  return getPref('splitRatio') || 0.5;
}

/**
 * Font Size
 */
function setFontSize(size) {
  setPref('fontSize', size);
  document.documentElement.style.setProperty('--editor-font-size', `${size}px`);
}

function getFontSize() {
  return getPref('fontSize') || 14;
}

/**
 * Watch Panel Resizes (ResizeObserver)
 */
function watchPanelResizes(panelIds) {
  if (typeof ResizeObserver === 'undefined') return null;

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const id = entry.target.id;
      if (!id) continue;

      savePanelSize(id, {
        width: `${entry.contentRect.width}px`,
        height: `${entry.contentRect.height}px`
      });
    }
  });

  panelIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });

  return observer;
}

/**
 * Watch Scroll Positions
 */
function watchScrollPositions(panelIds) {
  panelIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('scroll', () => {
      saveScrollPosition(id, el.scrollTop);
    }, { passive: true });
  });
}

/**
 * Restore Full Workspace State
 */
function restoreWorkspace() {
  const prefs = loadPrefs();

  // Theme
  applyTheme();

  // Font Size
  setFontSize(prefs.fontSize || 14);

  // Split Ratio
  if (prefs.splitRatio) {
    if (window.CanvasEditor && window._canvasEditor) {
      window._canvasEditor.setSplitRatio(prefs.splitRatio);
    }
  }

  // Panel Sizes
  for (const [panelId, size] of Object.entries(prefs.panelSizes || {})) {
    const el = document.getElementById(panelId);
    if (el) {
      if (size.width) el.style.width = size.width;
      if (size.height) el.style.height = size.height;
    }
  }

  // Scroll Positions
  for (const [panelId, scrollTop] of Object.entries(prefs.scrollPositions || {})) {
    setTimeout(() => {
      const el = document.getElementById(panelId);
      if (el) el.scrollTop = scrollTop;
    }, 100);
  }

  // Sidebar State
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    if (prefs.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }

  return prefs;
}

/**
 * Export/Import Prefs (JSON)
 */
function exportPrefs() {
  const prefs = loadPrefs();
  return JSON.stringify(prefs, null, 2);
}

function importPrefs(jsonStr) {
  try {
    const imported = JSON.parse(jsonStr);
    if (typeof imported !== 'object') {
      throw new Error('Invalid JSON');
    }

    imported.version = PREFS_VERSION;
    savePrefs(imported);
    applyTheme();
    return imported;
  } catch (e) {
    throw new Error('Import failed: ' + e.message);
  }
}

/**
 * Clear All Prefs
 */
function clearPrefs() {
  localStorage.removeItem(PREFS_KEY);
}

/**
 * Auto-Save on beforeunload
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const prefs = loadPrefs();
    prefs.lastSaved = Date.now();
    savePrefs(prefs);
  });

  // Apply theme on load
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
  }, { once: true });
}

// Export for module usage
if (typeof module !== 'undefined') {
  module.exports = {
    loadPrefs,
    savePrefs,
    getPref,
    setPref,
    savePanelSize,
    getPanelSize,
    saveScrollPosition,
    restoreScrollPosition,
    setTheme,
    applyTheme,
    getTheme,
    getThemePresets,
    trackRecentAgent,
    getRecentAgents,
    setSidebarCollapsed,
    isSidebarCollapsed,
    setLastSection,
    getLastSection,
    saveOpenTabs,
    getOpenTabs,
    saveSplitRatio,
    getSplitRatio,
    setFontSize,
    getFontSize,
    watchPanelResizes,
    watchScrollPositions,
    restoreWorkspace,
    exportPrefs,
    importPrefs,
    clearPrefs,
    THEME_PRESETS,
    DEFAULTS
  };
}

// Global namespace
if (typeof window !== 'undefined') {
  window.WorkspacePrefs = {
    loadPrefs,
    savePrefs,
    getPref,
    setPref,
    savePanelSize,
    getPanelSize,
    saveScrollPosition,
    restoreScrollPosition,
    setTheme,
    applyTheme,
    getTheme,
    getThemePresets,
    trackRecentAgent,
    getRecentAgents,
    setSidebarCollapsed,
    isSidebarCollapsed,
    setLastSection,
    getLastSection,
    saveOpenTabs,
    getOpenTabs,
    saveSplitRatio,
    getSplitRatio,
    setFontSize,
    getFontSize,
    watchPanelResizes,
    watchScrollPositions,
    restoreWorkspace,
    exportPrefs,
    importPrefs,
    clearPrefs
  };
}
