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
  handleDrop;

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
}

export function getActiveSideRef() {
  return typeof currentActiveSide === "function"
    ? currentActiveSide()
    : currentActiveSide;
}

export function refreshSelection(activeSide) {
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

export async function createFolder(side, activeSide) {
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
      // Trigger directory set menu handler via custom dispatch or shared callback if needed
      // (Handled by settings service or kept modular)
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
      const column = heading.dataset.sort;
      if (panel.sortBy === column)
        panel.sortDirection = panel.sortDirection === "asc" ? "desc" : "asc";
      else {
        panel.sortBy = column;
        panel.sortDirection = "asc";
      }
      renderPanel(side);
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

  panelEl
    .querySelector(".file-area")
    ?.addEventListener("dragover", (event) => event.preventDefault());

  panelEl
    .querySelector(".file-area")
    ?.addEventListener("contextmenu", (event) => {
      if (event.target.closest("[data-entry]")) return;
      event.preventDefault();
      setActiveSideFn(side);
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
