import { PanelModel } from "../models/PanelModel.js";
import { initSearchService } from "../ui/search-service.js";
import {
  panelStatus,
  renderPanel,
} from "../ui/panel-renderer.js";
import {
  escapeHtml,
  getPanelElement,
  formatSize,
  pathParts,
  setStatus,
  toast,
} from "../utils/panel-utils.js";

import {
  copySelection,
  deleteSelection,
  getSelected,
  initClipboardService,
  pasteSelection,
  renameSelection,
  transferWithConflicts,
} from "../ui/context-menu-service.js";

import {
  initDialogsService,
  makeDialogDraggable,
  showProperties,
  closeProperties,
  askTransferConflict,
  finishConflictDecision,
  askForName,
  finishNameDialog,
} from "../ui/dialogs-service.js";

import {
  initSettingsService,
  openSettings,
  closeSettings,
  renderSettingsCategory,
  showDirectorySetMenu,
  closeDirectorySetMenu,
  openDirectorySet,
  renderDirectorySets,
  switchCategory,
} from "../ui/settings-service.js";

import {
  initDragDropService,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  getSuppressRightContextUntil,
  isDraggingCandidate,
  executeDropAction,
} from "../ui/drag-drop-service.js";

import {
  initDrivesService,
  refreshDetectedDrives,
  refreshDriveButtonGroups,
  bindDriveButtons,
} from "../ui/drives-service.js";

import {
  initThumbnailHistoryService,
  applyThumbnailSize,
  loadThumbnailImages,
  updateSummary,
  moveHistory,
  bindHistoryLongPress,
} from "../ui/thumbnail-history-service.js";

// ============================================================================
// 1. STATE INITIALIZATION & LAYOUT RESTORATION
// ============================================================================
let savedLayout = {};
try {
  savedLayout = JSON.parse(localStorage.getItem("koa-layout") || "{}") || {};
} catch {
  savedLayout = {};
}
let currentActiveSide = "left";
const panels = {
  left: new PanelModel("left", savedLayout.left),
  right: new PanelModel("right", savedLayout.right),
};
let layoutInitialized = false;
let activeSide = "left";
let clipboard = null;


// ============================================================================
// 2. PREFERENCES & CONFIGURATION STATE
// ============================================================================

const defaultPreferences = {
  showHidden: false,
  groupFolders: true,
  confirmDelete: true,
  dateFormat: "us",
  timeFormat: "12h",
  theme: "system",
  directorySets: [],
  directorySetSort: "manual",
  thumbnailCachePath: "",
};

let preferences;
let savedPreferences = {};

try {
  savedPreferences = JSON.parse(localStorage.getItem("koa-settings") || "{}");
} catch {
  savedPreferences = {};
}

preferences = { ...defaultPreferences, ...savedPreferences };

if (typeof preferences.thumbnailCachePath !== "string")
  preferences.thumbnailCachePath = "";

if (!["manual", "alphabetical"].includes(preferences.directorySetSort))
  preferences.directorySetSort = "manual";

if (!Array.isArray(savedPreferences.directorySets))
  preferences.directorySets = (savedPreferences.bookmarks || []).map(
    (directory) => ({
      type: "single",
      path: directory,
      openIn: "active",
      name: "",
    }),
  );

delete preferences.bookmarks;


// ============================================================================
// 3. UI ELEMENT REFERENCES & GLOBAL MODAL STATE
// ============================================================================

const summary = document.querySelector("#drive-space-summary");
const menu = document.querySelector("#context-menu");
const historyMenu = document.querySelector("#history-menu");
const directorySetMenu = document.querySelector("#directory-set-menu");
let directorySetMenuSide = null;
let detectedDrives = [];

const driveContextMenu = document.querySelector("#drive-context-menu");
let driveContextSide = null;
let driveContextRoot = null;
const dropActionMenu = document.querySelector("#drop-action-menu");
const conflictBackdrop = document.querySelector("#conflict-backdrop");
const conflictItems = document.querySelector("#conflict-items");
const conflictActions = document.querySelector("#conflict-actions");
const conflictRename = document.querySelector("#conflict-rename");
const conflictRenameInput = document.querySelector("#conflict-rename-name");
const settingsBackdrop = document.querySelector("#settings-backdrop");
const settingsContent = document.querySelector("#settings-content");
const nameDialogBackdrop = document.querySelector("#name-dialog-backdrop");
const nameDialogForm = document.querySelector("#name-dialog-form");
const nameDialogInput = document.querySelector("#name-dialog-input");
const aboutBackdrop = document.querySelector("#about-backdrop");
const propertiesBackdrop = document.querySelector("#properties-backdrop");
let defaultThumbnailCachePath = "";
let directorySetDraft = null;
let activeFolderSizeRequest = null;
let rightDragCandidate = null;
let suppressRightContextUntil = 0;

initDrivesService({
  panels,
  navigate,
  updateSummary,
  getDetectedDrives: () => detectedDrives,
  setDetectedDrives: (drives) => {
    detectedDrives = drives;
  },
  getActiveSide: () => activeSide,
  setActiveSide: (side) => {
    activeSide = side;
  },
  driveContextMenu,
});

initDragDropService({
  panels,
  activeSide: () => activeSide,
  getSelected,
  transferWithConflicts,
  navigate,
  dropActionMenu,
});

initClipboardService({
  panels,
  preferences: () => preferences, // or direct reference if preferences is mutated in place
  getActiveSide: () => activeSide,
  setActiveSide: (side) => {
    activeSide = side;
  },
  getClipboard: () => clipboard,
  setClipboard: (val) => {
    clipboard = val;
  },
  navigate,
  askTransferConflict,
  askForName,
});

// must come after settingsBackdrop is defined
initSettingsService({
  preferences: () => preferences,
  panels,
  getActiveSide: () => activeSide,
  setActiveSide: (side) => {
    activeSide = side;
  },
  navigate,
  savePreferences,
  renderPanel,
  currentActiveSide,
  detectedDrives: () => detectedDrives,
  settingsBackdrop,
  settingsContent,
  directorySetMenu,
});

initThumbnailHistoryService({
  panels,
  preferences: () => preferences,
  getActiveSide: () => activeSide,
  navigate,
  renderPanel: (side) =>
    renderPanel(side, panels, currentActiveSide, detectedDrives, preferences),
  bindPanel,
  summary,
  historyMenu,
});

initSearchService({
  panels,
  preferences: () => preferences,
  getActiveSide: () => activeSide,
  navigate,
  renderPanel: (side, opts) => renderPanel(side, panels, currentActiveSide, detectedDrives, preferences, opts),
  bindPanel, // 👈 Added this
  searchForm: document.querySelector("#global-search"),
  searchQuery: document.querySelector("#search-query"),
  searchMode: document.querySelector("#search-mode"),
  searchCancel: document.querySelector("#search-cancel"),
});


// ============================================================================
// 4. STORAGE PERSISTENCE & THEME SYNC
// ============================================================================

function persistLayout() {
  if (!layoutInitialized) return;
  try {
    localStorage.setItem(
      "koa-layout",
      JSON.stringify({
        panelRatio,
        left: {
          path: panels.left.path,
          columns: panels.left.columns,
          view: panels.left.view,
          iconSize: panels.left.iconSize,
        },
        right: {
          path: panels.right.path,
          columns: panels.right.columns,
          view: panels.right.view,
          iconSize: panels.right.iconSize,
        },
      }),
    );
  } catch {
    /* Keep the file manager usable when storage is unavailable. */
  }
}

function persistPanelViews() {
  try {
    const layout = JSON.parse(localStorage.getItem("koa-layout") || "{}") || {};
    for (const side of ["left", "right"]) {
      layout[side] = {
        ...layout[side],
        view: panels[side].view,
        iconSize: panels[side].iconSize,
      };
    }
    localStorage.setItem("koa-layout", JSON.stringify(layout));
  } catch {
    /* Keep the file manager usable when storage is unavailable. */
  }
}

function savePreferences() {
  localStorage.setItem("koa-settings", JSON.stringify(preferences));
  document.documentElement.dataset.theme = preferences.theme;
}

window.addEventListener("storage", (event) => {
  if (event.key !== "koa-settings") return;
  try {
    savedPreferences = event.newValue ? JSON.parse(event.newValue) : {};
    preferences = { ...defaultPreferences, ...savedPreferences };
    if (typeof preferences.thumbnailCachePath !== "string")
      preferences.thumbnailCachePath = "";
    if (!["manual", "alphabetical"].includes(preferences.directorySetSort))
      preferences.directorySetSort = "manual";
    if (!Array.isArray(savedPreferences.directorySets)) {
      preferences.directorySets = (savedPreferences.bookmarks || []).map(
        (directory) => ({
          type: "single",
          path: directory,
          openIn: "active",
          name: "",
        }),
      );
    }
    delete preferences.bookmarks;
    document.documentElement.dataset.theme = preferences.theme;
    if (layoutInitialized) {
      renderPanel(
        "left",
        panels,
        currentActiveSide,
        detectedDrives,
        preferences,
      );
      bindPanel("left");
      renderPanel(
        "right",
        panels,
        currentActiveSide,
        detectedDrives,
        preferences,
      );
      bindPanel("right");
    }
    if (!settingsBackdrop.hidden && !directorySetDraft)
      renderSettingsCategory();
  } catch {
    /* Keep the current window usable if another instance writes malformed settings. */
  }
});

savePreferences();


// ============================================================================
// 6, 7, 8. DIALOGS, PROPERTIES & CONFLICT RESOLUTION
// ============================================================================

// Initialize the dialogs service with DOM elements and preferences
initDialogsService({
  preferences: () => preferences,
  propertiesBackdrop,
  conflictBackdrop,
  conflictItems,
  conflictActions,
  conflictRename,
  conflictRenameInput,
  nameDialogBackdrop,
  nameDialogInput,
});

// Folder size progress listener (relies on activeFolderSizeRequest from service)
window.fileManager.onFolderSizeProgress((progress) => {
  if (propertiesBackdrop.hidden) return;
  const sizeEl = document.querySelector("#properties-size");
  const fileCountEl = document.querySelector("#properties-file-count");
  const folderCountEl = document.querySelector("#properties-folder-count");
  const scanStatusEl = document.querySelector("#properties-scan-status");

  if (sizeEl)
    sizeEl.textContent = `${formatSize(progress.totalBytes, false)} so far`;
  if (fileCountEl) fileCountEl.textContent = String(progress.fileCount);
  if (folderCountEl) folderCountEl.textContent = String(progress.folderCount);
  if (scanStatusEl)
    scanStatusEl.textContent = "Calculating folder size and contents…";
});

// Make dialogs draggable
[
  [".settings-dialog", ".settings-header"],
  [".conflict-dialog", ".conflict-header"],
  [".name-dialog", "h2"],
  [".about-dialog", "h2"],
  [".properties-dialog", ".properties-header"],
].forEach(([dialogSelector, handleSelector]) =>
  makeDialogDraggable(dialogSelector, handleSelector),
);

// Conflict resolution DOM event bindings
conflictItems.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-conflict-choice]")?.dataset
    .conflictChoice;
  if (choice) finishConflictDecision({ choice });
});

conflictActions.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-conflict-choice]")?.dataset
    .conflictChoice;
  if (!choice) return;
  if (choice === "rename") {
    conflictRename.hidden = false;
    conflictRenameInput.focus();
    conflictRenameInput.select();
    return;
  }
  finishConflictDecision({ choice });
});

document
  .querySelector("[data-conflict-confirm-rename]")
  .addEventListener("click", () => {
    const name = conflictRenameInput.value.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
      toast("Enter a valid file name");
      return;
    }
    finishConflictDecision({ choice: "rename", name });
  });

conflictRenameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    document.querySelector("[data-conflict-confirm-rename]").click();
  }
});


// ============================================================================
// 9. NAVIGATION & PANEL CORE LOGIC
// ============================================================================

async function navigate(
  side,
  directory,
  { historyMode = "push", historyIndex = -1 } = {},
) {
  const panel = panels[side];
  panel.thumbnailGeneration += 1;
  if (panel.searchId) window.fileManager.cancelSearch(panel.searchId);
  panel.searchId = null;
  panel.searchRoot = null;
  setStatus("Loading folder…");
  try {
    const result = await window.fileManager.list(directory);
    panel.path = result.path;
    panel.entries = result.entries;
    if (panel.watchPath !== result.path) {
      const watchedPath = result.path;
      panel.watchPath = watchedPath;
      window.fileManager
        .watchDirectory(side, watchedPath)
        .then((watchResult) => {
          if (!watchResult.ok && panel.watchPath === watchedPath)
            panel.watchPath = null;
        })
        .catch(() => {
          if (panel.watchPath === watchedPath) panel.watchPath = null;
        });
    }
    if (historyMode === "move") panel.historyIndex = historyIndex;
    else if (historyMode === "push" && panel.history.at(-1) !== result.path) {
      panel.history = panel.history.slice(0, panel.historyIndex + 1);
      panel.history.push(result.path);
      panel.historyIndex = panel.history.length - 1;
    } else if (historyMode === "push" && panel.historyIndex < 0) {
      panel.history = [result.path];
      panel.historyIndex = 0;
    }
    panel.selected.clear();
    renderPanel(side, panels, currentActiveSide, detectedDrives, preferences);
    bindPanel(side);
    persistLayout();
    setStatus("Ready");
    return true;
  } catch (error) {
    if (panel.view === "icons")
      loadThumbnailImages(side, panel.thumbnailGeneration);
    toast(`Could not open folder: ${error.message}`);
    setStatus("Could not load folder");
    return false;
  }
}

driveContextMenu.addEventListener("click", async (event) => {
  if (!driveContextRoot) return;
  const eject = event.target.closest("[data-eject-drive]");
  const open = event.target.closest("[data-open-drive]");
  if (!eject && !open) return;
  const rootPath = driveContextRoot;
  const side = driveContextSide;
  driveContextMenu.hidden = true;
  driveContextSide = null;
  driveContextRoot = null;
  if (open) {
    const result = await window.fileManager.openInFileManager(rootPath);
    if (result?.error) toast(result.error);
    return;
  }
  const result = await window.fileManager.ejectDrive(rootPath);
  if (!result.ok) {
    toast(result.error || `Could not eject ${rootPath.slice(0, 2)}.`);
    return;
  }
  toast(`Ejected ${rootPath.slice(0, 2)}.`);
  const remainingRoots = await window.fileManager.roots();
  detectedDrives = remainingRoots;
  refreshDriveButtonGroups();
  const fallback = remainingRoots.find(
    (root) => root.path.toLowerCase() !== rootPath.toLowerCase(),
  );
  const affectedSides = new Set(
    (result.affected || []).map((item) => item.side),
  );
  for (const candidate of ["left", "right"]) {
    if (
      panels[candidate].path?.toLowerCase().startsWith(rootPath.toLowerCase())
    )
      affectedSides.add(candidate);
  }
  if (
    side &&
    panels[side].path?.toLowerCase().startsWith(rootPath.toLowerCase())
  )
    affectedSides.add(side);
  for (const affectedSide of affectedSides) {
    panels[affectedSide].watchPath = null;
    const target = fallback?.path || (await window.fileManager.list()).path;
    await navigate(affectedSide, target);
  }
});

document.addEventListener("mousedown", (event) => {
  if (!driveContextMenu.contains(event.target)) {
    driveContextMenu.hidden = true;
    driveContextSide = null;
    driveContextRoot = null;
  }
});

window.fileManager.onRestoreDirectoryWatch(({ side, directory }) => {
  const panel = panels[side];
  if (!panel || panel.path !== directory) return;
  panel.watchPath = directory;
  window.fileManager
    .watchDirectory(side, directory)
    .then((result) => {
      if (!result.ok && panel.watchPath === directory) panel.watchPath = null;
    })
    .catch(() => {
      if (panel.watchPath === directory) panel.watchPath = null;
    });
});

function editPanelPath(side) {
  const panel = panels[side];
  const panelEl = getPanelElement(side);
  const pathbar = panelEl.querySelector(".pathbar");
  if (!pathbar || pathbar.querySelector(".path-edit-input")) return;
  pathbar.innerHTML = `<input class="path-edit-input" type="text" aria-label="Current folder path" spellcheck="false" value="${escapeHtml(panel.path || "")}">`;
  pathbar.classList.remove("is-invalid");
  const input = pathbar.querySelector(".path-edit-input");
  let submitting = false;
  input.focus();
  input.select();
  input.addEventListener("input", () => {
    pathbar.classList.remove("is-invalid");
    input.removeAttribute("aria-invalid");
  });
  input.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      renderPanel(side, panels, currentActiveSide, detectedDrives, preferences);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const directory = input.value.trim();
      if (!directory) {
        pathbar.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        return;
      }
      submitting = true;
      const opened = await navigate(side, directory);
      submitting = false;
      if (!opened && input.isConnected) {
        pathbar.classList.add("is-invalid");
        input.setAttribute("aria-invalid", "true");
        input.focus();
      }
    }
  });
  input.addEventListener("blur", () => {
    if (
      !submitting &&
      input.isConnected &&
      !pathbar.classList.contains("is-invalid")
    )
      renderPanel(side, panels, currentActiveSide, detectedDrives, preferences);
  });
}


// ============================================================================
// 11. THUMBNAILS, STATUS & HISTORY
// ============================================================================

bindHistoryLongPress();

window.fileManager.onDirectoryChanged(({ side, directory }) => {
  const panel = panels[side];
  if (!panel || panel.path !== directory) return;
  window.fileManager
    .list(directory)
    .then((result) => {
      if (panel.path !== directory) return;
      panel.entries = result.entries;
      const availablePaths = new Set(result.entries.map((entry) => entry.path));
      for (const selectedPath of panel.selected) {
        if (!availablePaths.has(selectedPath))
          panel.selected.delete(selectedPath);
      }
      renderPanel(side, panels, currentActiveSide, detectedDrives, preferences);
      bindPanel(side);
    })
    .catch(() => {});
});

document.addEventListener("auxclick", (event) => {
  if (event.button !== 3 && event.button !== 4) return;
  event.preventDefault();
  event.stopPropagation();
  moveHistory(activeSide, event.button === 3 ? -1 : 1);
});

// ============================================================================
// 12. DIRECTORY SETS, BOOKMARKS & SETTINGS MODAL
// ============================================================================

directorySetMenu.addEventListener("click", async (event) => {
  const item = event.target.closest("[data-menu-directory-set]");
  if (!item) return;
  const set = preferences.directorySets[Number(item.dataset.menuDirectorySet)];
  const side = directorySetMenuSide || activeSide;
  closeDirectorySetMenu();
  if (set) await openDirectorySet(set, side);
});

async function openAbout() {
  aboutBackdrop.hidden = false;
  document.querySelector("#about-close").focus();
  const version = aboutBackdrop.querySelector("#about-version");
  version.textContent = "Version…";
  try {
    const info = await window.fileManager.versionInfo();
    if (!aboutBackdrop.hidden) version.textContent = `Version ${info.version}`;
  } catch {
    if (!aboutBackdrop.hidden) version.textContent = "Version unavailable";
  }
}

function closeAbout() {
  aboutBackdrop.hidden = true;
  document.querySelector("#about-button").focus();
}

// ============================================================================
// 13. PANEL ACTIONS, SELECTION & FILE OPERATIONS
// ============================================================================

function refreshSelection() {
  document.querySelectorAll(".panel").forEach((panelElement) => {
    const side = panelElement.dataset.panel;
    const panel = panels[side];
    panelElement.classList.toggle("is-active", side === activeSide);
    panelElement.querySelectorAll("[data-entry]").forEach((item) => {
      const entry = panel.entries[Number(item.dataset.entry)];
      item.classList.toggle("selected", panel.selected.has(entry.path));
    });
    const bottom = panelElement.querySelector(".panel-bottom");
    if (bottom) bottom.innerHTML = panelStatus(panel);
  });
  updateSummary();
}

async function createFolder(side) {
  const parent = panels[side].path;
  const name = await askForName({
    title: "New folder",
    label: "Folder name",
    confirmLabel: "Create folder",
  });
  if (name === null || !name.trim()) return;
  try {
    await window.fileManager.createFolder({ parent, name: name.trim() });
    await navigate(side, parent);
  } catch (error) {
    toast(error.message);
  }
}

function bindPanel(side) {
  const panel = panels[side];
  const panelEl = getPanelElement(side);
  bindDriveButtons(side);
  panelEl
    .querySelector(".path-home")
    ?.addEventListener("click", () => navigate(side, undefined));
  panelEl.querySelector(".pathbar")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) editPanelPath(side);
  });
  panelEl
    .querySelector('[data-action="directory-sets"]')
    ?.addEventListener("click", (event) => {
      showDirectorySetMenu(side, event.currentTarget);
    });
  panelEl.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (panel.view === view) return;
      panel.view = view;
      activeSide = side;
      renderPanel(side, panels, currentActiveSide, detectedDrives, preferences);
      persistPanelViews();
      persistLayout();
    }),
  );
  const sizeSlider = panelEl.querySelector('[data-action="icon-size"]');
  sizeSlider?.addEventListener("input", () => {
    panel.iconSize = Number(sizeSlider.value);
    panelEl.querySelector("[data-size-value]").textContent = String(
      panel.iconSize,
    );
    applyThumbnailSize(panel);

    // Dynamically update live tile and grid sizes
    const tileSize = panel.iconSize + 48;
    const iconGrid = panelEl.querySelector(".icon-grid");
    if (iconGrid) {
      iconGrid.style.setProperty("--tile-width", `${tileSize}px`);
    }
    panelEl.querySelectorAll(".icon-tile").forEach((tile) => {
      tile.style.width = `${tileSize}px`;
      tile.style.height = `${tileSize}px`;
    });
    panelEl.querySelectorAll(".tile-visual").forEach((visual) => {
      visual.style.width = `${panel.iconSize}px`;
      visual.style.height = `${panel.iconSize}px`;
    });

    persistPanelViews();
    persistLayout();
  });
  panelEl.querySelectorAll("[data-crumb]").forEach((crumb) =>
    crumb.addEventListener("click", () => {
      const part = pathParts(panel.path)[Number(crumb.dataset.crumb)];
      if (part) navigate(side, part.path);
    }),
  );
  panelEl.querySelectorAll("[data-sort]").forEach((heading) =>
    heading.addEventListener("click", () => {
      const column = heading.dataset.sort;
      if (panel.sortBy === column)
        panel.sortDirection = panel.sortDirection === "asc" ? "desc" : "asc";
      else {
        panel.sortBy = column;
        panel.sortDirection = "asc";
      }
      renderPanel(side, panels, currentActiveSide, detectedDrives, preferences);
    }),
  );
  panelEl.querySelectorAll("[data-column-boundary]").forEach((grip) => {
    let startX = 0;
    let startWidths = null;
    const boundary = Number(grip.dataset.columnBoundary);
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      activeSide = side;
      refreshSelection();
      startX = event.clientX;
      startWidths = [...panel.columns];
      grip.classList.add("is-dragging");
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove", (event) => {
      if (!startWidths || !grip.hasPointerCapture(event.pointerId)) return;
      const tableWidth = grip.closest("table").getBoundingClientRect().width;
      const delta = ((event.clientX - startX) / tableWidth) * 100;
      const leftColumn = boundary;
      const rightColumn = boundary + 1;
      const leftMin = leftColumn === 0 ? 25 : 10;
      const rightMin = rightColumn === 2 ? 15 : 10;
      const leftWidth = Math.max(
        leftMin,
        Math.min(
          startWidths[leftColumn] + startWidths[rightColumn] - rightMin,
          startWidths[leftColumn] + delta,
        ),
      );
      panel.columns[leftColumn] = leftWidth;
      panel.columns[rightColumn] =
        startWidths[leftColumn] + startWidths[rightColumn] - leftWidth;
      const table = grip.closest("table");
      table.style.setProperty("--name-width", `${panel.columns[0]}%`);
      table.style.setProperty("--size-width", `${panel.columns[1]}%`);
      table.style.setProperty("--date-width", `${panel.columns[2]}%`);
      table.querySelectorAll("col").forEach((col, index) => {
        col.style.width = `${panel.columns[index]}%`;
      });
    });
    const finishResize = (event) => {
      if (!startWidths) return;
      startWidths = null;
      grip.classList.remove("is-dragging");
      if (grip.hasPointerCapture(event.pointerId))
        grip.releasePointerCapture(event.pointerId);
      persistLayout();
    };
    grip.addEventListener("pointerup", finishResize);
    grip.addEventListener("pointercancel", finishResize);
  });
  panelEl
    .querySelectorAll('[data-action="up"]')
    .forEach((button) =>
      button.addEventListener("click", () =>
        navigate(
          side,
          pathParts(panel.path).length > 1
            ? pathParts(panel.path).at(-2).path
            : panel.path,
        ),
      ),
    );
  panelEl.querySelectorAll('[data-action="refresh"]').forEach((button) =>
    button.addEventListener("click", () => {
      navigate(side, panel.path);
      refreshDetectedDrives();
    }),
  );
  panelEl
    .querySelector('[data-action="match-other"]')
    ?.addEventListener("click", () => {
      const otherSide = side === "left" ? "right" : "left";
      if (panels[otherSide].path) navigate(side, panels[otherSide].path);
    });
  panelEl.querySelectorAll("[data-entry]").forEach((row) => {
    const entry = panel.entries[Number(row.dataset.entry)];
    row.addEventListener("click", (event) => {
      activeSide = side;
      if (event.ctrlKey || event.metaKey) {
        panel.selected.has(entry.path)
          ? panel.selected.delete(entry.path)
          : panel.selected.add(entry.path);
      } else if (event.shiftKey) {
        const indices = [...panel.selected]
          .map((selected) =>
            panel.entries.findIndex((candidate) => candidate.path === selected),
          )
          .filter((n) => n >= 0);
        const start = indices.length
          ? Math.min(...indices)
          : Number(row.dataset.entry);
        const end = Number(row.dataset.entry);
        panel.selected.clear();
        panel.entries
          .slice(Math.min(start, end), Math.max(start, end) + 1)
          .forEach((item) => panel.selected.add(item.path));
      } else if (!panel.selected.has(entry.path) || panel.selected.size > 1) {
        panel.selected.clear();
        panel.selected.add(entry.path);
      }
      refreshSelection();
    });
    row.addEventListener("dblclick", async () => {
      const result = await window.fileManager.open(entry.path);
      if (result.navigateTo) navigate(side, result.navigateTo);
      else if (result.error) toast(result.error);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (
        rightDragCandidate?.dragging ||
        Date.now() < suppressRightContextUntil
      )
        return;
      activeSide = side;
      if (!panel.selected.has(entry.path)) {
        panel.selected.clear();
        panel.selected.add(entry.path);
      }
      refreshSelection();
      showContextMenu(event.clientX, event.clientY, side, entry);
    });
    row.addEventListener("dragstart", (event) => {
      activeSide = side;
      if (!panel.selected.has(entry.path)) {
        panel.selected.clear();
        panel.selected.add(entry.path);
      }
      const paths = getSelected(side).map((item) => item.path);
      event.dataTransfer.setData(
        "application/x-koa-files",
        JSON.stringify({ side, paths }),
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setTimeout(refreshSelection, 0);
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", () =>
      row.classList.remove("drop-target"),
    );
    row.addEventListener("drop", async (event) => {
      event.preventDefault();
      row.classList.remove("drop-target");
      await handleDrop(
        event,
        side,
        entry.isDirectory ? entry.path : panel.path,
      );
    });
  });
  panelEl
    .querySelector(".file-area")
    ?.addEventListener("dragover", (event) => event.preventDefault());
  panelEl
    .querySelector(".file-area")
    ?.addEventListener("contextmenu", (event) => {
      if (event.target.closest("[data-entry]")) return;
      event.preventDefault();
      activeSide = side;
      getPanelElement("left").classList.toggle("is-active", side === "left");
      getPanelElement("right").classList.toggle("is-active", side === "right");
      updateSummary();
      showBackgroundContextMenu(event.clientX, event.clientY, side);
    });
  panelEl
    .querySelector(".file-area")
    ?.addEventListener("drop", async (event) => {
      if (event.target.closest("[data-entry]")) return;
      event.preventDefault();
      await handleDrop(event, side, panel.path);
    });
}

// ============================================================================
// 14. CONTEXT MENUS & CLIPBOARD OPERATIONS
// ============================================================================
function showContextMenu(x, y, side, entry) {
  const openAction = [
    "Open",
    "Enter",
    () =>
      window.fileManager
        .open(entry.path)
        .then(
          (result) => result.navigateTo && navigate(side, result.navigateTo),
        ),
  ];

  const actions = [
    openAction,
    ["Copy", "Ctrl+C", () => copySelection(side, false)],
    ["Cut", "Ctrl+X", () => copySelection(side, true)],
    ["Paste", "Ctrl+V", () => pasteSelection()],
    ["Rename", "", () => renameSelection(side)],
    ["Delete", "Delete", () => deleteSelection(side)],
  ];

  if (entry.isDirectory) {
    actions.push([
      "Open in File Explorer",
      "",
      () => window.fileManager.openInFileManager(entry.path),
    ]);
  }

  actions.push([
    "Properties",
    "",
    async () => {
      try {
        showProperties(await window.fileManager.properties(entry.path));
      } catch (error) {
        toast(`Could not open Properties: ${error.message}`);
      }
    },
  ]);
  const separators = new Set([1, 5, actions.length - 1]);
  if (entry.isDirectory) separators.add(actions.length - 2);
  menu.innerHTML = actions
    .map(
      ([label, shortcut], index) =>
        `${separators.has(index) ? '<div class="menu-separator"></div>' : ""}<button role="menuitem" data-menu-index="${index}">${label}<kbd>${shortcut}</kbd></button>`,
    )
    .join("");
  menu.hidden = false;
  menu.style.left = `${Math.min(x, innerWidth - 218)}px`;
  menu.style.top = `${Math.min(y, innerHeight - 220)}px`;
  menu.querySelectorAll("[data-menu-index]").forEach((button) =>
    button.addEventListener("click", () => {
      menu.hidden = true;
      const index = Number(button.dataset.menuIndex);
      actions[index][2]();
    }),
  );
  document.addEventListener("mousedown", hideMenu, { once: true });
}

function showBackgroundContextMenu(x, y, side) {
  menu.innerHTML =
    '<div class="context-menu-item context-submenu-parent"><button role="menuitem" data-open-new-submenu aria-haspopup="true" aria-expanded="false">New<span aria-hidden="true">›</span></button><div class="context-submenu" hidden><button role="menuitem" data-background-action="folder">Folder</button><button role="menuitem" data-background-action="shortcut">Shortcut</button></div></div><div class="menu-separator"></div><button role="menuitem" data-background-action="properties">Properties</button><button role="menuitem" data-background-action="explorer">Open in File Explorer</button>';
  menu.hidden = false;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - 218))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - 150))}px`;
  const submenuParent = menu.querySelector(".context-submenu-parent");
  const submenuButton = menu.querySelector("[data-open-new-submenu]");
  const submenu = menu.querySelector(".context-submenu");
  const showSubmenu = () => {
    submenu.hidden = false;
    submenuButton.setAttribute("aria-expanded", "true");
    const rect = menu.getBoundingClientRect();
    submenuParent.classList.toggle("opens-left", rect.right + 180 > innerWidth);
  };
  const hideSubmenu = () => {
    submenu.hidden = true;
    submenuButton.setAttribute("aria-expanded", "false");
  };
  submenuParent.addEventListener("mouseenter", showSubmenu);
  submenuParent.addEventListener("mouseleave", hideSubmenu);
  submenuButton.addEventListener("focus", showSubmenu);
  submenuButton.addEventListener("click", showSubmenu);
  const dismissBackgroundMenu = (event) => {
    if (menu.contains(event.target)) return;
    menu.hidden = true;
    document.removeEventListener("mousedown", dismissBackgroundMenu);
  };
  document.addEventListener("mousedown", dismissBackgroundMenu);
  menu.querySelectorAll("[data-background-action]").forEach((button) =>
    button.addEventListener("click", async () => {
      const action = button.dataset.backgroundAction;
      menu.hidden = true;
      document.removeEventListener("mousedown", dismissBackgroundMenu);
      if (action === "folder") {
        await createFolder(side);
      } else if (action === "shortcut") {
        try {
          const result = await window.fileManager.createShortcutWizard(
            panels[side].path,
          );
          await navigate(side, panels[side].path);
          if (result.created) toast("Shortcut created");
        } catch (error) {
          toast(error.message);
        }
      } else if (action === "properties") {
        try {
          showProperties(
            await window.fileManager.properties(panels[side].path),
          );
        } catch (error) {
          toast(`Could not open Properties: ${error.message}`);
        }
      } else if (action === "explorer") {
        const result = await window.fileManager.openInFileManager(
          panels[side].path,
        );
        if (result?.error) toast(result.error);
      }
    }),
  );
}

function hideMenu(event) {
  if (!menu.contains(event.target)) menu.hidden = true;
}

async function handleDrop(event, destinationSide, destination) {
  let payload;
  try {
    payload = JSON.parse(event.dataTransfer.getData("application/x-koa-files"));
  } catch {
    return;
  }
  const operation = event.ctrlKey ? "copy" : "move";
  const result = await transferWithConflicts({
    sources: payload.paths,
    destination,
    operation,
  });
  const failed = result.find(
    (item) => !item.ok && !item.cancelled && !item.skipped,
  );
  const cancelled = result.some((item) => item.cancelled);
  await Promise.all([
    navigate("left", panels.left.path),
    navigate("right", panels.right.path),
  ]);
  const succeeded = result.filter((item) => item.ok).length;
  const skipped = result.filter((item) => item.skipped).length;
  if (failed) toast(failed.error);
  else if (cancelled)
    toast(
      succeeded
        ? `${operation === "copy" ? "Copied" : "Moved"} ${succeeded} item${succeeded === 1 ? "" : "s"}; remaining items skipped`
        : "Transfer cancelled",
    );
  else if (skipped && succeeded)
    toast(
      `${operation === "copy" ? "Copied" : "Moved"} ${succeeded} item${succeeded === 1 ? "" : "s"}; skipped ${skipped} existing item${skipped === 1 ? "" : "s"}`,
    );
  else if (skipped)
    toast(`Skipped ${skipped} existing item${skipped === 1 ? "" : "s"}`);
  else
    toast(
      `${operation === "copy" ? "Copied" : "Moved"} ${succeeded} item${succeeded === 1 ? "" : "s"}`,
    );
}

// ============================================================================
// 15. DRAG & DROP BETWEEN PANELS
// ============================================================================
function clearRightDropTargets() {
  document
    .querySelectorAll(
      ".panel.right-drop-target,.panel [data-entry].right-drop-target",
    )
    .forEach((element) => element.classList.remove("right-drop-target"));
}

document.addEventListener("pointerdown", (event) => {
  handlePointerDown(event, panels, getSelected);
});

document.addEventListener("pointermove", (event) => {
  handlePointerMove(event, refreshSelection);
});

window.addEventListener("pointerup", handlePointerUp);

window.addEventListener("pointercancel", (event) => {
  if (rightDragCandidate?.pointerId !== event.pointerId) return;
  rightDragCandidate = null;
  document.body.classList.remove("right-dragging");
  clearRightDropTargets();
});

document.addEventListener("contextmenu", (event) => {
  if (isDraggingCandidate() || Date.now() < getSuppressRightContextUntil()) {
    event.preventDefault();
    event.stopPropagation();
  }
});

dropActionMenu.addEventListener("click", async (event) => {
  const choice = event.target.closest("[data-drop-choice]")?.dataset.dropChoice;
  if (choice) await executeDropAction(choice);
});

document.addEventListener("mousedown", (event) => {
  if (
    directorySetMenu.contains(event.target) ||
    event.target.closest('[data-action="directory-sets"]')
  )
    return;
  closeDirectorySetMenu();
});

// ============================================================================
// 16. GLOBAL EVENT LISTENERS & KEYBOARD SHORTCUTS
// ============================================================================

document.addEventListener("click", (event) => {
  const panelElement = event.target.closest(".panel");
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (panelElement) activeSide = panelElement.dataset.panel;
  else if (!action) return;
  document
    .querySelectorAll(".panel")
    .forEach((panel) =>
      panel.classList.toggle("is-active", panel.dataset.panel === activeSide),
    );
  updateSummary();
  if (action === "copy") copySelection(activeSide, false);
  if (action === "cut") copySelection(activeSide, true);
  if (action === "paste") pasteSelection();
  if (action === "rename") renameSelection(activeSide);
  if (action === "delete") deleteSelection(activeSide);
  if (action === "new-folder") createFolder(activeSide);
  if (action === "back") moveHistory(activeSide, -1);
  if (action === "forward") moveHistory(activeSide, 1);
  if (action === "about") openAbout();
});

document.addEventListener("keydown", async (event) => {
  if (!nameDialogBackdrop.hidden) {
    if (event.key === "Escape") finishNameDialog(null);
    return;
  }
  if (!aboutBackdrop.hidden) {
    if (event.key === "Escape") closeAbout();
    return;
  }
  if (!propertiesBackdrop.hidden) {
    if (event.key === "Escape") closeProperties();
    return;
  }
  if (!conflictBackdrop.hidden) {
    if (event.key === "Escape") finishConflictDecision({ choice: "cancel" });
    return;
  }
  if (!settingsBackdrop.hidden) {
    if (event.key === "Escape") closeSettings();
    return;
  }
  if (!directorySetMenu.hidden && event.key === "Escape") {
    closeDirectorySetMenu();
    return;
  }
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelection(activeSide, false);
  } else if (mod && event.key.toLowerCase() === "x") {
    event.preventDefault();
    copySelection(activeSide, true);
  } else if (mod && event.key.toLowerCase() === "v") {
    event.preventDefault();
    await pasteSelection();
  } else if (event.key === "Delete") {
    event.preventDefault();
    await deleteSelection(activeSide);
  } else if (event.key === "Enter") {
    const entry = getSelected(activeSide)[0];
    if (entry) {
      const result = await window.fileManager.open(entry.path);
      if (result.navigateTo) navigate(activeSide, result.navigateTo);
    }
  } else if (event.key === "Escape") {
    menu.hidden = true;
    historyMenu.hidden = true;
    dropActionMenu.hidden = true;
    pendingRightDrop = null;
    if (!settingsBackdrop.hidden) closeSettings();
  }
});

// ============================================================================
// 17. SETTINGS & DIALOG BINDINGS
// ============================================================================
document
  .querySelector("#settings-button")
  .addEventListener("click", () => openSettings(settingsBackdrop));

document
  .querySelector("#settings-close")
  .addEventListener("click", () => closeSettings(settingsBackdrop));

nameDialogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  finishNameDialog(nameDialogInput.value);
});

document
  .querySelector("#name-dialog-cancel")
  .addEventListener("click", () => finishNameDialog(null));

nameDialogBackdrop.addEventListener("click", (event) => {
  if (event.target === nameDialogBackdrop) finishNameDialog(null);
});

document.querySelector("#about-close").addEventListener("click", closeAbout);

aboutBackdrop.addEventListener("click", (event) => {
  if (event.target === aboutBackdrop) closeAbout();
});

document
  .querySelector("#properties-close")
  .addEventListener("click", closeProperties);

propertiesBackdrop.addEventListener("click", (event) => {
  if (event.target.closest("#properties-cancel-scan")) {
    if (activeFolderSizeRequest) {
      window.fileManager.cancelFolderSize(activeFolderSizeRequest);
      event.target.disabled = true;
      document.querySelector("#properties-scan-status").textContent =
        "Cancelling folder size calculation…";
    }
    return;
  }
  if (event.target === propertiesBackdrop) closeProperties();
});

document.querySelectorAll(".settings-category").forEach((button) =>
  button.addEventListener("click", () => {
    switchCategory(button.dataset.category);
  }),
);

settingsContent.addEventListener("change", (event) => {
  const setField = event.target.closest("[data-set-field]");
  if (setField && directorySetDraft) {
    directorySetDraft[setField.dataset.setField] = setField.value;
    if (setField.dataset.setField === "type") {
      if (setField.value === "pair") {
        directorySetDraft.leftPath ||= panels.left.path || "";
        directorySetDraft.rightPath ||= panels.right.path || "";
      } else directorySetDraft.path ||= panels[activeSide].path || "";
      renderDirectorySets();
    }
    return;
  }
  const control = event.target.closest("[data-preference]");
  if (!control) return;
  preferences[control.dataset.preference] =
    control.type === "checkbox" ? control.checked : control.value;
  savePreferences();
  if (control.dataset.preference === "directorySetSort") renderDirectorySets();
  if (
    control.dataset.preference === "showHidden" ||
    control.dataset.preference === "groupFolders"
  ) {
    renderPanel("left", panels, currentActiveSide, detectedDrives, preferences);
    renderPanel(
      "right",
      panels,
      currentActiveSide,
      detectedDrives,
      preferences,
    );
  }
  if (
    control.dataset.preference === "dateFormat" ||
    control.dataset.preference === "timeFormat"
  ) {
    renderPanel("left", panels, currentActiveSide, detectedDrives, preferences);
    renderPanel(
      "right",
      panels,
      currentActiveSide,
      detectedDrives,
      preferences,
    );
  }
});

settingsContent.addEventListener("dragstart", (event) => {
  const row = event.target.closest("[data-sortable-set]");
  if (!row || preferences.directorySetSort !== "manual") {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData("text/plain", row.dataset.sortableSet);
  event.dataTransfer.effectAllowed = "move";
  row.classList.add("is-dragging");
});

settingsContent.addEventListener("dragend", (event) => {
  event.target.closest("[data-sortable-set]")?.classList.remove("is-dragging");
  settingsContent
    .querySelectorAll(".drop-before,.drop-after")
    .forEach((row) => row.classList.remove("drop-before", "drop-after"));
});

settingsContent.addEventListener("dragover", (event) => {
  const row = event.target.closest("[data-sortable-set]");
  if (preferences.directorySetSort !== "manual" || !row) return;
  event.preventDefault();
  settingsContent
    .querySelectorAll(".drop-before,.drop-after")
    .forEach((item) => item.classList.remove("drop-before", "drop-after"));
  const position =
    event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2
      ? "drop-before"
      : "drop-after";
  row.classList.add(position);
});

settingsContent.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-sortable-set]");
  const draggedIndex = event.dataTransfer.getData("text/plain");
  if (
    !target ||
    preferences.directorySetSort !== "manual" ||
    !/^\d+$/.test(draggedIndex)
  )
    return;
  const sourceIndex = Number(draggedIndex);
  event.preventDefault();
  const targetIndex = Number(target.dataset.sortableSet);
  if (sourceIndex === targetIndex || !preferences.directorySets[sourceIndex])
    return;
  let insertIndex =
    targetIndex + (target.classList.contains("drop-after") ? 1 : 0);
  const [set] = preferences.directorySets.splice(sourceIndex, 1);
  if (sourceIndex < insertIndex) insertIndex -= 1;
  preferences.directorySets.splice(insertIndex, 0, set);
  savePreferences();
  renderDirectorySets();
});

settingsContent.addEventListener("input", (event) => {
  const field = event.target.closest("[data-set-field]");
  if (field && directorySetDraft && field.dataset.setField !== "type") {
    directorySetDraft[field.dataset.setField] = field.value;
  }
});

settingsContent.addEventListener("click", async (event) => {
  if (event.target.closest("[data-cache-browse]")) {
    const input = settingsContent.querySelector("#thumbnail-cache-path");
    try {
      const directory = await window.fileManager.chooseDirectory(
        input.value.trim() || defaultThumbnailCachePath,
      );
      if (directory) {
        preferences.thumbnailCachePath = directory;
        savePreferences();
        renderSettingsCategory();
      }
    } catch (error) {
      toast(`Could not choose cache folder: ${error.message}`);
    }
    return;
  }
  if (event.target.closest("[data-cache-default]")) {
    preferences.thumbnailCachePath = "";
    savePreferences();
    renderSettingsCategory();
    return;
  }
  if (event.target.closest("[data-clear-thumbnail-cache]")) {
    const button = event.target.closest("[data-clear-thumbnail-cache]");
    const input = settingsContent.querySelector("#thumbnail-cache-path");
    const status = settingsContent.querySelector("#thumbnail-cache-status");
    preferences.thumbnailCachePath = input.value.trim();
    savePreferences();
    button.disabled = true;
    status.textContent = "Clearing cached thumbnails…";
    try {
      const count = await window.fileManager.clearThumbnailCache(
        preferences.thumbnailCachePath,
      );
      status.textContent = `Cleared ${count} cached thumbnail${count === 1 ? "" : "s"}.`;
    } catch (error) {
      status.textContent = `Could not clear the cache: ${error.message}`;
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (event.target.closest("[data-new-set]")) {
    directorySetDraft = {
      index: null,
      type: "single",
      path: panels[activeSide].path || "",
      openIn: "active",
      name: "",
    };
    renderDirectorySets();
    return;
  }
  const usePanel = event.target.closest("[data-use-panel]");
  if (usePanel && directorySetDraft) {
    const side = usePanel.dataset.usePanel;
    const field = directorySetDraft.type === "pair" ? `${side}Path` : "path";
    directorySetDraft[field] = panels[side].path || "";
    renderDirectorySets();
    return;
  }
  const browse = event.target.closest("[data-browse-field]");
  if (browse && directorySetDraft) {
    try {
      const directory = await window.fileManager.chooseDirectory();
      if (directory) {
        directorySetDraft[browse.dataset.browseField] = directory;
        renderDirectorySets();
      }
    } catch (error) {
      toast(`Could not open folder picker: ${error.message}`);
    }
    return;
  }
  if (event.target.closest("[data-cancel-set]")) {
    directorySetDraft = null;
    renderDirectorySets();
    return;
  }
  if (event.target.closest("[data-save-set]")) {
    const draft = directorySetDraft;
    const requiredPaths =
      draft.type === "pair" ? [draft.leftPath, draft.rightPath] : [draft.path];
    if (requiredPaths.some((directory) => !directory?.trim())) {
      toast("Enter a directory for each panel");
      return;
    }
    const record =
      draft.type === "pair"
        ? {
            type: "pair",
            leftPath: draft.leftPath.trim(),
            rightPath: draft.rightPath.trim(),
            name: (draft.name || "").trim(),
          }
        : {
            type: "single",
            path: draft.path.trim(),
            openIn: draft.openIn || "active",
            name: (draft.name || "").trim(),
          };
    if (draft.index === null) preferences.directorySets.push(record);
    else preferences.directorySets[draft.index] = record;
    savePreferences();
    directorySetDraft = null;
    renderDirectorySets();
    return;
  }
  const remove = event.target.closest("[data-remove-set]");
  if (remove) {
    preferences.directorySets.splice(Number(remove.dataset.removeSet), 1);
    savePreferences();
    renderDirectorySets();
    return;
  }
  const edit = event.target.closest("[data-edit-set]");
  if (edit) {
    directorySetDraft = {
      ...preferences.directorySets[Number(edit.dataset.editSet)],
      index: Number(edit.dataset.editSet),
    };
    renderDirectorySets();
    return;
  }
  const open = event.target.closest("[data-open-set]");
  if (open) {
    const set = preferences.directorySets[Number(open.dataset.openSet)];
    if (!set) return;
    closeSettings();
    openDirectorySet(set, activeSide);
  }
});

// ============================================================================
// 18. APP INITIALIZATION & SPLITTER RESIZING
// ============================================================================
async function initialize() {
  const home = await window.fileManager.list(undefined).catch(() => null);
  refreshDetectedDrives();
  const start = home?.path || "C:\\";
  const docs = `${start.replace(/[\\/]$/, "")}${start.includes("\\") ? "\\" : "/"}Documents`;
  const savedLeft =
    typeof savedLayout.left?.path === "string" ? savedLayout.left.path : null;
  const savedRight =
    typeof savedLayout.right?.path === "string" ? savedLayout.right.path : null;
  const leftOpened = await navigate("left", savedLeft || start);
  if (!leftOpened && savedLeft) await navigate("left", start);
  const rightStart = savedRight || docs;
  let rightExists = await window.fileManager.list(rightStart).catch(() => null);
  if (!rightExists && savedRight)
    rightExists = await window.fileManager.list(docs).catch(() => null);
  await navigate("right", rightExists?.path || start);
  layoutInitialized = true;
  persistLayout();
}

initialize();

window.addEventListener("focus", refreshDetectedDrives);

document.querySelectorAll(".menu-trigger").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const wasOpen = trigger.getAttribute("aria-expanded") === "true";
    document.querySelectorAll(".menu-trigger").forEach((item) => {
      item.setAttribute("aria-expanded", "false");
      item.nextElementSibling.hidden = true;
    });
    if (!wasOpen) {
      trigger.setAttribute("aria-expanded", "true");
      trigger.nextElementSibling.hidden = false;
    }
  });
});

document.addEventListener("click", (event) => {
  if (event.target.closest(".menu-group")) return;
  document.querySelectorAll(".menu-trigger").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.nextElementSibling.hidden = true;
  });
});

document.querySelectorAll(".menu-group").forEach((group) => {
  group.addEventListener("mouseenter", () => {
    const triggers = [...document.querySelectorAll(".menu-trigger")];
    const menuIsOpen = triggers.some(
      (trigger) => trigger.getAttribute("aria-expanded") === "true",
    );
    if (!menuIsOpen) return;
    const current = group.querySelector(".menu-trigger");
    triggers.forEach((trigger) => {
      const shouldOpen = trigger === current;
      trigger.setAttribute("aria-expanded", String(shouldOpen));
      trigger.nextElementSibling.hidden = !shouldOpen;
    });
  });
});

const workspaceElement = document.querySelector(".workspace");
const splitterElement = document.querySelector(".splitter");
let panelRatio = Number.isFinite(savedLayout.panelRatio)
  ? savedLayout.panelRatio
  : 0.5;

function setPanelRatio(ratio) {
  const availableWidth = Math.max(
    1,
    workspaceElement.clientWidth - splitterElement.offsetWidth,
  );
  const minimumRatio = Math.min(0.5, 240 / availableWidth);
  panelRatio = Math.max(minimumRatio, Math.min(1 - minimumRatio, ratio));
  workspaceElement.style.setProperty("--left-panel", `${panelRatio}fr`);
  workspaceElement.style.setProperty("--right-panel", `${1 - panelRatio}fr`);
  splitterElement.setAttribute(
    "aria-valuenow",
    String(Math.round(panelRatio * 100)),
  );
}

setPanelRatio(panelRatio);

let resizingPointerId = null;
splitterElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  splitterElement.focus({ preventScroll: true });
  event.preventDefault();
  resizingPointerId = event.pointerId;
  splitterElement.classList.add("is-dragging");
  splitterElement.setPointerCapture(event.pointerId);
});

splitterElement.addEventListener("pointermove", (event) => {
  if (resizingPointerId !== event.pointerId) return;
  const bounds = workspaceElement.getBoundingClientRect();
  const availableWidth = Math.max(
    1,
    bounds.width - splitterElement.offsetWidth,
  );
  const leftWidth =
    event.clientX - bounds.left - splitterElement.offsetWidth / 2;
  setPanelRatio(leftWidth / availableWidth);
});

function stopPanelResize(event) {
  if (resizingPointerId !== event.pointerId) return;
  resizingPointerId = null;
  splitterElement.classList.remove("is-dragging");
  if (splitterElement.hasPointerCapture(event.pointerId))
    splitterElement.releasePointerCapture(event.pointerId);
  persistLayout();
}

splitterElement.addEventListener("pointerup", stopPanelResize);
splitterElement.addEventListener("pointercancel", stopPanelResize);
splitterElement.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    setPanelRatio(panelRatio + (event.key === "ArrowRight" ? 0.01 : -0.01));
    persistLayout();
  }
});

window.addEventListener("beforeunload", persistLayout);
