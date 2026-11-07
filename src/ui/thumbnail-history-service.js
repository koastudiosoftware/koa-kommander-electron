import {
  escapeHtml,
  getPanelElement,
  formatSize,
  imageExtensions,
} from "../utils/panel-utils.js";

let panels, preferences, getActiveSide, navigate, renderPanel, bindPanel;
let summary, historyMenu;
let diskSpaceTimer = null;
let diskSpaceRequestId = 0;
let displayedSpacePath = null;

/**
 * Initializes the thumbnail history service.
 * @param {*} config
 */
export function initThumbnailHistoryService(config) {
  panels = config.panels;
  preferences = config.preferences;
  getActiveSide = config.getActiveSide;
  navigate = config.navigate;
  renderPanel = config.renderPanel;
  bindPanel = config.bindPanel;
  summary = config.summary;
  historyMenu = config.historyMenu;

  // Directory change watch listener
  window.fileManager.onDirectoryChanged(({ side, directory }) => {
    const panel = panels[side];
    if (!panel || panel.path !== directory) return;
    window.fileManager
      .list(directory)
      .then((result) => {
        if (panel.path !== directory) return;
        panel.entries = result.entries;
        const availablePaths = new Set(
          result.entries.map((entry) => entry.path),
        );
        for (const selectedPath of panel.selected) {
          if (!availablePaths.has(selectedPath))
            panel.selected.delete(selectedPath);
        }
        renderPanel(side);
        bindPanel(side);
      })
      .catch(() => {});
  });

  // Global mousedown listener for history menu dismissal
  document.addEventListener("mousedown", (event) => {
    if (!historyMenu.contains(event.target)) historyMenu.hidden = true;
  });

  bindHistoryLongPress();
}

/**
 * Determines if an entry is an image file.
 * @param {*} entry
 * @returns
 */
export function isImageEntry(entry) {
  return (
    !entry.isDirectory &&
    imageExtensions.has(entry.name.split(".").pop().toLowerCase())
  );
}

/**
 * Applies the thumbnail size to a panel.
 * @param {*} panel
 * @returns
 */
export function applyThumbnailSize(panel) {
  const panelEl = getPanelElement(panel.side);
  if (!panelEl) return;
  panelEl.style.setProperty("--icon-size", `${panel.iconSize}px`);

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

  panelEl.classList.toggle("view-icons", panel.view === "icons");
  panelEl.classList.toggle("view-details", panel.view === "details");
}

/**
 * Loads thumbnail images for a specific panel.
 * @param {string} side
 * @param {number} generation
 * @returns
 */
export async function loadThumbnailImages(side, generation) {
  const panel = panels[side];
  const panelEl = getPanelElement(side);
  if (!panelEl) return;
  const prefs = preferences();
  const tiles = [...panelEl.querySelectorAll(".icon-tile")].filter((tile) => {
    const entry = panel.entries[Number(tile.dataset.entry)];
    return entry && isImageEntry(entry);
  });
  let nextIndex = 0;
  const loadNext = async () => {
    while (
      nextIndex < tiles.length &&
      panel.thumbnailGeneration === generation
    ) {
      const tile = tiles[nextIndex++];
      const entry = panel.entries[Number(tile.dataset.entry)];
      if (!entry || !tile.isConnected) continue;
      try {
        const dataUrl = await window.fileManager.thumbnail(
          entry.path,
          prefs.thumbnailCachePath,
        );
        if (panel.thumbnailGeneration !== generation) return;
        const visual = tile.querySelector(".tile-visual");
        if (!dataUrl || !visual?.isConnected || !tile.isConnected) continue;
        const thumbnail = document.createElement("img");
        thumbnail.className = "thumbnail-image";
        thumbnail.alt = "";
        thumbnail.src = dataUrl;
        visual.replaceChildren(thumbnail);
      } catch {
        /* Keep the file type icon when a preview cannot be created. */
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, tiles.length) }, loadNext),
  );
}

/**
 * Updates the summary information for the active panel.
 * @returns {void}
 */
export function updateSummary() {
  updateHistoryButtons();
  const activeSide = getActiveSide();
  const directory = panels[activeSide].path;
  const requestId = ++diskSpaceRequestId;
  clearTimeout(diskSpaceTimer);
  if (!directory) {
    summary.textContent = "Drive space unavailable";
    displayedSpacePath = null;
    return;
  }
  if (displayedSpacePath !== directory)
    summary.textContent = "Reading drive space…";
  diskSpaceTimer = setTimeout(async () => {
    try {
      const space = await window.fileManager.diskSpace(directory);
      if (
        requestId !== diskSpaceRequestId ||
        panels[activeSide].path !== directory
      )
        return;
      summary.textContent = `Used ${formatSize(space.used, false)} · Free ${formatSize(space.free, false)}`;
      displayedSpacePath = directory;
    } catch {
      if (
        requestId !== diskSpaceRequestId ||
        panels[activeSide].path !== directory
      )
        return;
      summary.textContent = "Drive space unavailable";
      displayedSpacePath = directory;
    }
  }, 120);
}

/**
 * Updates the state of the history navigation buttons based on the current panel's history index.
 */
export function updateHistoryButtons() {
  const activeSide = getActiveSide();
  const panel = panels[activeSide];
  const back = document.querySelector('[data-action="back"]');
  const forward = document.querySelector('[data-action="forward"]');
  if (back) back.disabled = panel.historyIndex <= 0;
  if (forward)
    forward.disabled =
      panel.historyIndex < 0 || panel.historyIndex >= panel.history.length - 1;
}

/**
 * Moves the history index by a specified offset.
 * @param {string} side - The side of the panel to move history for.
 * @param {number} offset - The offset to move the history index by.
 * @returns {void}
 */
export function moveHistory(side, offset) {
  const panel = panels[side];
  const targetIndex = panel.historyIndex + offset;
  if (targetIndex < 0 || targetIndex >= panel.history.length) return;
  moveHistoryTo(side, targetIndex);
}

/**
 * Moves the history index to a specific position.
 * @param {string} side - The side of the panel to move history for.
 * @param {number} targetIndex - The index to move the history to.
 * @returns {Promise<void>}
 */
/**
 * Moves the history index to a specific position.
 * @param {string} side - The side of the panel to move history for.
 * @param {number} targetIndex - The index to move the history to.
 * @returns {Promise<void>}
 */
export async function moveHistoryTo(side, targetIndex) {
  const panel = panels[side];
  if (
    targetIndex < 0 ||
    targetIndex >= panel.history.length ||
    targetIndex === panel.historyIndex
  )
    return;

  const isMovingBack = targetIndex < panel.historyIndex;
  const currentPath = panel.path;

  while (targetIndex >= 0 && targetIndex < panel.history.length) {
    const candidatePath = panel.history[targetIndex];

    // Ignore this entry if we're moving back and it's the exact same as our current directory
    if (isMovingBack && candidatePath === currentPath && targetIndex > 0) {
      targetIndex -= 1;
      continue;
    }

    const suppressToast = isMovingBack && targetIndex < panel.historyIndex;

    const success = await navigate(side, candidatePath, {
      historyMode: "move",
      historyIndex: targetIndex,
      suppressToast,
    });

    if (success) {
      return;
    }

    // If navigation failed (e.g., directory deleted) and we were moving backward, step back further
    if (isMovingBack && targetIndex > 0) {
      targetIndex -= 1;
    } else {
      toast("Could not open folder: Directory no longer exists");
      break;
    }
  }
}

/**
 * Shows the history menu for a given action and button.
 * @param {string} action - The action that triggered the menu.
 * @param {HTMLElement} button - The button that triggered the menu.
 * @returns {void}
 */
function showHistoryMenu(action, button) {
  const activeSide = getActiveSide();
  const panel = panels[activeSide];
  const indices =
    action === "back"
      ? Array.from(
          { length: Math.max(0, panel.historyIndex) },
          (_, index) => panel.historyIndex - index - 1,
        )
      : Array.from(
          {
            length: Math.max(0, panel.history.length - panel.historyIndex - 1),
          },
          (_, index) => panel.historyIndex + index + 1,
        );
  if (!indices.length) return;
  const side = activeSide;
  historyMenu.innerHTML = indices
    .map((index) => {
      const directory = panel.history[index];
      return `<button role="menuitem" data-history-side="${side}" data-history-index="${index}" title="${escapeHtml(directory)}">${escapeHtml(directory)}</button>`;
    })
    .join("");
  const bounds = button.getBoundingClientRect();
  historyMenu.hidden = false;
  historyMenu.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - 330))}px`;
  historyMenu.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, innerHeight - Math.min(historyMenu.scrollHeight, 334) - 8))}px`;
}

/**
 * Binds long-press functionality to the history navigation buttons, allowing users to access a history menu for quick navigation.
 * @returns {void}
 */
export function bindHistoryLongPress() {
  document
    .querySelectorAll('[data-action="back"],[data-action="forward"]')
    .forEach((button) => {
      let holdTimer = null;
      let startX = 0;
      let startY = 0;
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || button.disabled) return;
        startX = event.clientX;
        startY = event.clientY;
        button.setPointerCapture(event.pointerId);
        holdTimer = setTimeout(() => {
          showHistoryMenu(button.dataset.action, button);
          button.dataset.historyLongPress = "true";
        }, 450);
      });
      const clearHold = () => {
        clearTimeout(holdTimer);
        holdTimer = null;
      };
      button.addEventListener("pointermove", (event) => {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 8)
          clearHold();
      });
      button.addEventListener("pointerup", clearHold);
      button.addEventListener("pointercancel", clearHold);
      button.addEventListener("click", (event) => {
        if (button.dataset.historyLongPress === "true") {
          delete button.dataset.historyLongPress;
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      });
    });
  historyMenu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-history-index]");
    if (!item) return;
    historyMenu.hidden = true;
    moveHistoryTo(item.dataset.historySide, Number(item.dataset.historyIndex));
  });
}
