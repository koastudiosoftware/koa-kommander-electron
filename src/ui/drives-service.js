import { escapeHtml, getPanelElement, toast } from "../utils/panel-utils.js";
import { renderDriveButtons } from "./panel-renderer.js";

let panels, navigate, updateSummary;
let getDetectedDrives, setDetectedDrives;
let getActiveSide, setActiveSide;
let driveContextMenu;
let driveContextSide = null;
let driveContextRoot = null;

/**
 * Initializes the drives service with the provided configuration.
 * @param {*} config The configuration object for the drives service.
 */
export function initDrivesService(config) {
  panels = config.panels;
  navigate = config.navigate;
  updateSummary = config.updateSummary;
  getDetectedDrives = config.getDetectedDrives;
  setDetectedDrives = config.setDetectedDrives;
  getActiveSide = config.getActiveSide;
  setActiveSide = config.setActiveSide;
  driveContextMenu = config.driveContextMenu;

  // Listen for directory watch restoration
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

  // Global mousedown listener to dismiss drive context menu
  document.addEventListener("mousedown", (event) => {
    if (!driveContextMenu.contains(event.target)) {
      driveContextMenu.hidden = true;
      driveContextSide = null;
      driveContextRoot = null;
    }
  });

  // Drive context menu click actions
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
    setDetectedDrives(remainingRoots);
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
}

/**
 * Refreshes the detected drives and updates the drive button groups.
 */
export async function refreshDetectedDrives() {
  try {
    const drives = await window.fileManager.roots();
    setDetectedDrives(drives);
    refreshDriveButtonGroups();
  } catch {
    /* Keep the last detected drive buttons if discovery temporarily fails. */
  }
}

/**
 * Refreshes the drive button groups for both panels.
 */
export function refreshDriveButtonGroups() {
  for (const side of ["left", "right"]) {
    const group = getPanelElement(side).querySelector("[data-drive-buttons]");
    if (!group) continue;
    group.innerHTML = renderDriveButtons(getDetectedDrives(), side, panels);
    bindDriveButtons(side);
  }
}

/**
 * Binds the drive buttons for the specified side.
 * @param {string} side The side for which to bind drive buttons.
 */
export function bindDriveButtons(side) {
  const group = getPanelElement(side).querySelector("[data-drive-buttons]");
  group?.querySelectorAll("[data-drive-button]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveSide(side);
      getPanelElement("left").classList.toggle("is-active", side === "left");
      getPanelElement("right").classList.toggle("is-active", side === "right");
      updateSummary();
      navigate(side, button.dataset.driveButton);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveSide(side);
      getPanelElement("left").classList.toggle("is-active", side === "left");
      getPanelElement("right").classList.toggle("is-active", side === "right");
      updateSummary();
      showDriveContextMenu(
        side,
        button.dataset.driveButton,
        event.clientX,
        event.clientY,
      );
    });
  });
}

/**
 * Shows the drive context menu for the specified side and root path at the given coordinates.
 * @param {string} side The side for which to show the context menu.
 * @param {string} rootPath The root path for which to show the context menu.
 * @param {number} x The x-coordinate at which to display the context menu.
 * @param {number} y The y-coordinate at which to display the context menu.
 * @returns {Promise<void>}
 */
async function showDriveContextMenu(side, rootPath, x, y) {
  driveContextSide = side;
  driveContextRoot = rootPath;
  driveContextMenu.innerHTML =
    '<div class="drive-context-status">Loading drive details…</div>';
  driveContextMenu.hidden = false;
  driveContextMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - 218))}px`;
  driveContextMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - 180))}px`;
  try {
    const roots = await window.fileManager.roots();
    if (
      driveContextSide !== side ||
      driveContextRoot !== rootPath ||
      driveContextMenu.hidden
    )
      return;
    const root = roots.find(
      (entry) => entry.path.toLowerCase() === rootPath.toLowerCase(),
    );
    const driveName = root?.name || rootPath.slice(0, 2);
    const details = root?.label
      ? `<small>${escapeHtml(root.label)}</small>`
      : "";
    const action = root?.canEject
      ? '<button role="menuitem" data-eject-drive>Eject</button>'
      : '<button role="menuitem" data-open-drive>Open in File Explorer</button>';
    driveContextMenu.innerHTML = `<div class="drive-context-heading"><strong>${escapeHtml(driveName)}</strong>${details}</div><div class="menu-separator"></div>${action}`;
  } catch (error) {
    driveContextMenu.innerHTML =
      '<div class="drive-context-status">Could not load drive details.</div>';
    toast(`Could not load drive details: ${error.message}`);
  }
}
