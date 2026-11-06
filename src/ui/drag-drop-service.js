import { toast } from "../utils/panel-utils.js";

let panels, activeSide, getSelected, transferWithConflicts, navigate;
let dropActionMenu,
  rightDragCandidate = null;
let pendingRightDrop = null;
let suppressRightContextUntil = 0;

/**
 *
 * @param {*} config
 */
export function initDragDropService(config) {
  panels = config.panels;
  activeSide = () => config.activeSide;
  getSelected = config.getSelected;
  transferWithConflicts = config.transferWithConflicts;
  navigate = config.navigate;
  dropActionMenu = config.dropActionMenu;
}

/**
 * Clears all right drop targets.
 */
export function clearRightDropTargets() {
  document
    .querySelectorAll(
      ".panel.right-drop-target,.panel [data-entry].right-drop-target",
    )
    .forEach((element) => element.classList.remove("right-drop-target"));
}

/**
 *
 * @param {*} x
 * @param {*} y
 * @returns
 */
export function updateRightDropTarget(x, y) {
  clearRightDropTargets();
  const underPointer = document.elementFromPoint(x, y);
  const targetPanel = underPointer?.closest(".panel");
  if (!targetPanel || targetPanel.dataset.panel === rightDragCandidate.side) {
    rightDragCandidate.destination = null;
    return;
  }
  const side = targetPanel.dataset.panel;
  const row = underPointer.closest("[data-entry]");
  const targetEntry = row
    ? panels[side].entries[Number(row.dataset.entry)]
    : null;
  const destination = targetEntry?.isDirectory
    ? targetEntry.path
    : panels[side].path;
  rightDragCandidate.destination = destination
    ? { side, path: destination }
    : null;
  if (rightDragCandidate.destination) {
    (targetEntry?.isDirectory ? row : targetPanel).classList.add(
      "right-drop-target",
    );
  }
}

/**
 * Opens the drop action menu at the specified position.
 * @param {*} paths
 * @param {*} destination
 * @param {*} x
 * @param {*} y
 */
export function openDropActionMenu(paths, destination, x, y) {
  pendingRightDrop = { paths, destination };
  dropActionMenu.hidden = false;
  const width = dropActionMenu.offsetWidth;
  const height = dropActionMenu.offsetHeight;
  dropActionMenu.style.left = `${Math.max(6, Math.min(x, innerWidth - width - 6))}px`;
  dropActionMenu.style.top = `${Math.max(6, Math.min(y, innerHeight - height - 6))}px`;
}

/**
 * Handles the pointer down event for right-click drag operations.
 * @param {*} event
 * @param {*} panelsRef
 * @param {*} getSelectedFn
 * @returns
 */
export function handlePointerDown(event, panelsRef, getSelectedFn) {
  if (event.button !== 2) return;
  const row = event.target.closest("[data-entry]");
  const panelElement = row?.closest(".panel");
  if (!row || !panelElement) return;
  const side = panelElement.dataset.panel;
  const entry = panelsRef[side].entries[Number(row.dataset.entry)];
  if (!entry) return;
  const panel = panelsRef[side];
  rightDragCandidate = {
    pointerId: event.pointerId,
    side,
    entry,
    paths: panel.selected.has(entry.path)
      ? getSelectedFn(side).map((item) => item.path)
      : [entry.path],
    startX: event.clientX,
    startY: event.clientY,
    dragging: false,
    destination: null,
  };
}

/**
 * Handles the pointer move event for right-click drag operations.
 * @param {*} event
 * @param {*} refreshSelectionFn
 * @returns
 */
export function handlePointerMove(event, refreshSelectionFn) {
  const drag = rightDragCandidate;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (
    !drag.dragging &&
    Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6
  ) {
    drag.dragging = true;
    document.body.classList.add("right-dragging");
    const panel = panels[drag.side];
    if (!panel.selected.has(drag.entry.path)) {
      panel.selected.clear();
      panel.selected.add(drag.entry.path);
    }
    refreshSelectionFn();
  }
  if (!drag.dragging) return;
  event.preventDefault();
  updateRightDropTarget(event.clientX, event.clientY);
}

/**
 *
 * @param {*} event
 * @returns
 */
export function handlePointerUp(event) {
  const drag = rightDragCandidate;
  if (!drag || drag.pointerId !== event.pointerId) return;
  rightDragCandidate = null;
  if (!drag.dragging) return;
  document.body.classList.remove("right-dragging");
  event.preventDefault();
  clearRightDropTargets();
  suppressRightContextUntil = Date.now() + 700;
  if (drag.destination)
    openDropActionMenu(
      drag.paths,
      drag.destination,
      event.clientX,
      event.clientY,
    );
  else toast("Drop on the other panel to choose an action");
}

/**
 *
 * @returns
 */
export function getSuppressRightContextUntil() {
  return suppressRightContextUntil;
}

/**
 *
 * @returns
 */
export function isDraggingCandidate() {
  return Boolean(rightDragCandidate?.dragging);
}

/**
 *
 * @param {*} choice
 * @returns
 */
export async function executeDropAction(choice) {
  const drop = pendingRightDrop;
  if (!choice || !drop) return;
  dropActionMenu.hidden = true;
  pendingRightDrop = null;
  if (choice === "cancel") return;
  if (choice === "shortcut") {
    const results = await window.fileManager.createShortcuts({
      sources: drop.paths,
      destination: drop.destination.path,
    });
    const failed = results.find((item) => !item.ok);
    await navigate(drop.destination.side, panels[drop.destination.side].path);
    toast(
      failed
        ? failed.error
        : `Created ${results.length} shortcut${results.length === 1 ? "" : "s"}`,
    );
    return;
  }
  const results = await transferWithConflicts({
    sources: drop.paths,
    destination: drop.destination.path,
    operation: choice,
  });
  const failed = results.find(
    (item) => !item.ok && !item.cancelled && !item.skipped,
  );
  const cancelled = results.some((item) => item.cancelled);
  const skipped = results.filter((item) => item.skipped).length;
  const succeeded = results.filter((item) => item.ok).length;
  await Promise.all([
    navigate("left", panels.left.path),
    navigate("right", panels.right.path),
  ]);
  if (failed) toast(failed.error);
  else if (cancelled)
    toast(
      succeeded
        ? `${choice === "copy" ? "Copied" : "Moved"} ${succeeded} item${succeeded === 1 ? "" : "s"}; remaining items skipped`
        : "Transfer cancelled",
    );
  else if (skipped && succeeded)
    toast(
      `${choice === "copy" ? "Copied" : "Moved"} ${succeeded} item${succeeded === 1 ? "" : "s"}; skipped ${skipped} existing item${skipped === 1 ? "" : "s"}`,
    );
  else if (skipped)
    toast(`Skipped ${skipped} existing item${skipped === 1 ? "" : "s"}`);
  else
    toast(
      `${choice === "copy" ? "Copied" : "Moved"} ${succeeded} item${succeeded === 1 ? "" : "s"}`,
    );
}
