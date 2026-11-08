import {
  escapeHtml,
  getPanelElement,
  pathParts,
  toast,
} from "../utils/panel-utils.js";

import { panelStatus } from "./panel-renderer.js";

import { bindDriveButtons as executeBindDriveButtons } from "./drives-service.js";

let panels,
  currentActiveSide,
  detectedDrives,
  preferences,
  navigate,
  renderPanel,
  bindDriveButtons,
  getSelected,
  transferWithConflicts,
  askForName,
  showContextMenu,
  showBackgroundContextMenu,
  updateSummary,
  getRightDragCandidate,
  getSuppressRightContextUntil,
  handleDrop,
  onOpenDirectorySets;

/**
 * Initializes the panel interaction service with the provided configuration.
 * @param {Object} config - The configuration object containing service dependencies.
 * @returns {void}
 */
export function initPanelInteractionService(config) {
  panels = config.panels;
  currentActiveSide = config.currentActiveSide; // Can be getter or value
  detectedDrives = config.detectedDrives;
  preferences = config.preferences;
  navigate = config.navigate;
  renderPanel = config.renderPanel;
  bindDriveButtons = config.bindDriveButtons;
  getSelected = config.getSelected;
  transferWithConflicts = config.transferWithConflicts;
  askForName = config.askForName;
  showContextMenu = config.showContextMenu;
  showBackgroundContextMenu = config.showBackgroundContextMenu;
  updateSummary = config.updateSummary;
  getRightDragCandidate = config.getRightDragCandidate;
  getSuppressRightContextUntil = config.getSuppressRightContextUntil;
  handleDrop = config.handleDrop;
  onOpenDirectorySets = config.onOpenDirectorySets;
}


/**
 * Gets the current active panel side.
 * @returns {string} The active panel side.
 */
export function getActiveSideRef() {
  return typeof currentActiveSide === "function"
    ? currentActiveSide()
    : currentActiveSide;
}

/**
 * Refreshes the selection state and status for all panels.
 * @param {string} activeSide - The active panel side.
 * @returns {void}
 */
export function refreshSelection(activeSide) {
  document.querySelectorAll(".panel").forEach((panelElement) => {
    const side = panelElement.dataset.panel;
    const panel = panels[side];
    panelElement.classList.toggle("is-active", side === activeSide);

    panelElement.querySelectorAll("[data-entry]").forEach((item) => {
      const entry = panel.entries[Number(item.dataset.entry)];
      item.classList.toggle("selected", panel.selected.has(entry.path));
    });

    // Also update the special ".." (up) entry selection state
    const specialUp = panelElement.querySelector('[data-special-entry="up"]');
    if (specialUp) {
      specialUp.classList.toggle("selected", panel.selected.has("__UP__"));
    }

    const bottom = panelElement.querySelector(".panel-bottom");
    if (bottom) bottom.innerHTML = panelStatus(panel);
  });
  updateSummary();
}

/**
 * Creates a new folder in the specified panel.
 * @param {string} side - The panel side in which to create the folder.
 * @param {string} activeSide - The active panel side.
 * @returns {Promise<void>}
 */
export async function createFolder(side, activeSide) {
  const parent = panels[side].path;
  const nameInput = await askForName({
    title: "New folder",
    label: "Folder name",
    confirmLabel: "Create folder",
  });
  if (nameInput === null || !nameInput.trim()) return;
  const trimmedName = nameInput.trim();
  try {
    await window.fileManager.createFolder({ parent, name: trimmedName });
    const success = await navigate(side, parent);
    if (success) {
      const panel = panels[side];
      panel.selected.clear();
      const newEntry = panel.entries.find(
        (entry) => entry.name === trimmedName,
      );
      if (newEntry) {
        panel.selected.add(newEntry.path);
      }
      refreshSelection(side);
    }
  } catch (error) {
    toast(error.message);
  }
}

/**
 * Enables inline editing of a panel's path.
 * @param {string} side - The panel side to edit.
 * @param {string} activeSide - The active panel side.
 * @returns {void}
 */
export function editPanelPath(side, activeSide) {
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
      renderPanel(side);
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
      renderPanel(side);
  });
}


/**
 * Updates the enabled state of the back and forward toolbar buttons.
 * @param {Object} panels - The panel state for each side.
 * @param {string} activeSide - The active panel side.
 */
export function updateToolbarState(panels, activeSide) {
  const panel = panels[activeSide];
  const backBtn = document.querySelector('[data-action="back"]');
  const forwardBtn = document.querySelector('[data-action="forward"]');

  if (backBtn) {
    const canBack = panel && panel.historyIndex > 0;
    backBtn.disabled = !canBack;
  }
  if (forwardBtn) {
    const canForward =
      panel &&
      panel.historyIndex >= 0 &&
      panel.historyIndex < panel.history.length - 1;
    forwardBtn.disabled = !canForward;
  }
}

/**
 * Binds the interaction handlers for a panel.
 * @param {string} side - The panel side to bind.
 * @param {Function} getActiveSideFn - Gets the active panel side.
 * @param {Function} setActiveSideFn - Sets the active panel side.
 * @param {Function} applyThumbnailSize - Applies the panel's thumbnail size.
 * @returns {void}
 */
export function bindPanel(
  side,
  getActiveSideFn,
  setActiveSideFn,
  applyThumbnailSize,
) {
  const panel = panels[side];
  const panelEl = getPanelElement(side);
  executeBindDriveButtons(side);

  panelEl
    .querySelector(".path-home")
    ?.addEventListener("click", () => navigate(side, undefined));

  panelEl.querySelector(".pathbar")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget)
      editPanelPath(side, getActiveSideFn());
  });

  panelEl
    .querySelector('[data-action="directory-sets"]')
    ?.addEventListener("click", (event) => {
      setActiveSideFn(side);
      if (onOpenDirectorySets) {
        onOpenDirectorySets(side, event);
      }
    });

  panelEl.querySelectorAll("[data-view]").forEach((button) =>
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (panel.view === view) return;
      panel.view = view;
      setActiveSideFn(side);

      // Render the panel and immediately re-bind its elements so view buttons stay responsive
      renderPanel(side);
      bindPanel(side, getActiveSideFn, setActiveSideFn, applyThumbnailSize);
    }),
  );

  // Bind the special ".." (up) entry at the top of the panel
  panelEl.querySelectorAll('[data-special-entry="up"]').forEach((upEl) => {
    upEl.addEventListener("click", (event) => {
      if (upEl.classList.contains("disabled")) return;
      setActiveSideFn(side);

      // Handle single-click selection behavior matching standard files
      if (event.ctrlKey || event.metaKey) {
        panel.selected.has("__UP__")
          ? panel.selected.delete("__UP__")
          : panel.selected.add("__UP__");
      } else {
        panel.selected.clear();
        panel.selected.add("__UP__");
      }
      refreshSelection(getActiveSideFn());
    });

    upEl.addEventListener("dblclick", async () => {
      if (upEl.classList.contains("disabled")) return;
      const parts = pathParts(panel.path);
      if (parts.length > 1) {
        const parentPath = parts.at(-2).path;
        await navigate(side, parentPath);
      }
    });
  });

  const sizeSlider = panelEl.querySelector('[data-action="icon-size"]');
  sizeSlider?.addEventListener("input", () => {
    panel.iconSize = Number(sizeSlider.value);
    panelEl.querySelector("[data-size-value]").textContent = String(
      panel.iconSize,
    );
    applyThumbnailSize(panel);
  });

  panelEl.querySelectorAll("[data-crumb]").forEach((crumb) =>
    crumb.addEventListener("click", () => {
      const part = pathParts(panel.path)[Number(crumb.dataset.crumb)];
      if (part) navigate(side, part.path);
    }),
  );

  panelEl.querySelectorAll("[data-sort]").forEach((heading) =>
    heading.addEventListener("click", () => {
      setActiveSideFn(side);
      refreshSelection(getActiveSideFn());

      const column = heading.dataset.sort;
      if (panel.sortBy === column)
        panel.sortDirection = panel.sortDirection === "asc" ? "desc" : "asc";
      else {
        panel.sortBy = column;
        panel.sortDirection = "asc";
      }
      renderPanel(side);
      bindPanel(side, getActiveSideFn, setActiveSideFn, applyThumbnailSize);
    }),
  );

  // Column resizing grid logic
  panelEl.querySelectorAll("[data-column-boundary]").forEach((grip) => {
    let startX = 0;
    let startWidths = null;
    const boundary = Number(grip.dataset.columnBoundary);
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setActiveSideFn(side);
      refreshSelection(getActiveSideFn());
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
      setActiveSideFn(side);
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        panel.selected.clear(); // This naturally clears "__UP__" as well!
      } else {
        panel.selected.delete("__UP__");
      }
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
      refreshSelection(getActiveSideFn());
    });

    row.addEventListener("dblclick", async () => {
      const result = await window.fileManager.open(entry.path);
      if (result.navigateTo) navigate(side, result.navigateTo);
      else if (result.error) toast(result.error);
    });

    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const rightDragCandidate = getRightDragCandidate();
      if (
        rightDragCandidate?.dragging ||
        Date.now() < getSuppressRightContextUntil()
      )
        return;
      setActiveSideFn(side);
      if (!panel.selected.has(entry.path)) {
        panel.selected.clear();
        panel.selected.add(entry.path);
      }
      refreshSelection(getActiveSideFn());
      showContextMenu(event.clientX, event.clientY, side, entry);
    });

    row.addEventListener("dragstart", (event) => {
      setActiveSideFn(side);
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
      setTimeout(() => refreshSelection(getActiveSideFn()), 0);
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

  const fileArea = panelEl.querySelector(".file-area");
  if (fileArea) {
    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let selectionBox = null;
    let initialSelectedPaths = new Set();
    let hasDragged = false;

    // 1. Clean click handler for empty space deselection or panel switching
    fileArea.addEventListener("click", (event) => {
      if (
        event.target.closest("[data-entry]") ||
        event.target.closest("button") ||
        event.target.closest("input") ||
        event.target.closest("thead") ||
        hasDragged
      ) {
        return;
      }

      const activeSide = getActiveSideFn();
      if (activeSide === side) {
        if (panel.selected.size > 0) {
          panel.selected.clear();
          refreshSelection(activeSide);
        }
      } else {
        setActiveSideFn(side);
        refreshSelection(side);
      }
    });

    // 2. Drag-to-select (Rubber-band box) using pointer events
    fileArea.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return; // Only left-click
      if (
        event.target.closest("[data-entry]") ||
        event.target.closest("button") ||
        event.target.closest("input") ||
        event.target.closest("thead")
      ) {
        return;
      }

      isSelecting = true;
      hasDragged = false;
      const rect = fileArea.getBoundingClientRect();
      startX = event.clientX - rect.left + fileArea.scrollLeft;
      startY = event.clientY - rect.top + fileArea.scrollTop;

      initialSelectedPaths = new Set(panel.selected);
      if (!event.ctrlKey && !event.shiftKey) {
        panel.selected.clear();
      }
    });

    fileArea.addEventListener("pointermove", (event) => {
      if (!isSelecting) return;

      const rect = fileArea.getBoundingClientRect();
      const currentX = event.clientX - rect.left + fileArea.scrollLeft;
      const currentY = event.clientY - rect.top + fileArea.scrollTop;

      const deltaX = Math.abs(currentX - startX);
      const deltaY = Math.abs(currentY - startY);

      if (!hasDragged && (deltaX > 4 || deltaY > 4)) {
        hasDragged = true;
        if (!selectionBox) {
          selectionBox = document.createElement("div");
          selectionBox.className = "selection-box";
          fileArea.appendChild(selectionBox);
        }
        selectionBox.style.display = "block";
      }

      if (!hasDragged) return;

      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      selectionBox.style.left = `${left}px`;
      selectionBox.style.top = `${top}px`;
      selectionBox.style.width = `${width}px`;
      selectionBox.style.height = `${height}px`;

      const boxRect = {
        left: fileArea.scrollLeft + left,
        top: fileArea.scrollTop + top,
        right: fileArea.scrollLeft + left + width,
        bottom: fileArea.scrollTop + top + height,
      };

      fileArea.querySelectorAll("[data-entry]").forEach((row) => {
        const entryIndex = Number(row.dataset.entry);
        const entry = panel.entries[entryIndex];
        if (!entry) return;

        const rowRect = {
          left: row.offsetLeft,
          top: row.offsetTop,
          right: row.offsetLeft + row.offsetWidth,
          bottom: row.offsetTop + row.offsetHeight,
        };

        const intersects = !(
          rowRect.left > boxRect.right ||
          rowRect.right < boxRect.left ||
          rowRect.top > boxRect.bottom ||
          rowRect.bottom < boxRect.top
        );

        if (intersects) {
          panel.selected.add(entry.path);
        } else if (!initialSelectedPaths.has(entry.path) && !event.ctrlKey) {
          panel.selected.delete(entry.path);
        }
      });

      refreshSelection(getActiveSideFn());
    });

    const endSelection = () => {
      if (!isSelecting) return;
      isSelecting = false;

      if (selectionBox) {
        selectionBox.style.display = "none";
        selectionBox.remove();
        selectionBox = null;
      }

      // Reset hasDragged after a short timeout so the click event can inspect it, then clear it
      setTimeout(() => {
        hasDragged = false;
      }, 50);
    };

    fileArea.addEventListener("pointerup", endSelection);
    fileArea.addEventListener("pointercancel", endSelection);

    // Context Menu & Drop handlers
    fileArea.addEventListener("contextmenu", (event) => {
      if (event.target.closest("[data-entry]")) return;
      event.preventDefault();
      setActiveSideFn(side);
      refreshSelection(side);
      showBackgroundContextMenu(event.clientX, event.clientY, side);
    });

    fileArea.addEventListener("drop", async (event) => {
      if (event.target.closest("[data-entry]")) return;
      event.preventDefault();
      await handleDrop(event, side, panel.path);
    });

    fileArea.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
  }
}
