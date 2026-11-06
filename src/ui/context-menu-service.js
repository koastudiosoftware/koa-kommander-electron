import { toast, setStatus } from "../utils/panel-utils.js";

// Local references to app state & callbacks injected from renderer.js
let panels, preferences;
let getActiveSide, setActiveSide;
let getClipboard, setClipboard;
let navigate, askTransferConflict, askForName;

/**
 * Initializes the clipboard service with the provided configuration.
 * @param {*} config - The configuration object containing necessary callbacks and state references.q
 */
export function initClipboardService(config) {
  panels = config.panels;
  preferences = config.preferences;
  getActiveSide = config.getActiveSide;
  getClipboard = config.getClipboard;
  setClipboard = config.setClipboard;
  navigate = config.navigate;
  askTransferConflict = config.askTransferConflict;
  askForName = config.askForName;
}

/**
 * Copies the selected items in the specified panel.
 * @param {string} side - The side of the panel containing the selected items.
 * @param {boolean} cut - Whether to cut (move) or copy the items.
 * @returns {void}
 */
export function copySelection(side, cut) {
  const activeSide = getActiveSide();
  const items = getSelected(side);
  if (!items.length) return;

  setClipboard({
    paths: items.map((item) => item.path),
    operation: cut ? "move" : "copy",
  });

  setStatus(
    `${cut ? "Cut" : "Copied"} ${items.length} item${items.length === 1 ? "" : "s"}`,
  );
  toast(
    `${cut ? "Cut" : "Copied"} ${items.length} item${items.length === 1 ? "" : "s"}`,
  );
}

/**
 * Deletes the selected items in the specified panel.
 * @param {string} side - The side of the panel containing the selected items.
 * @returns {Promise<void>}
 */
export async function deleteSelection(side) {
  const items = getSelected(side);
  if (!items.length) return;

  const outcome = await window.fileManager.delete({
    entries: items.map((item) => item.path),
    confirm: preferences.confirmDelete,
  });

  if (outcome.cancelled) return;
  const failed = outcome.results.find((item) => !item.ok);
  const succeeded = outcome.results.filter((item) => item.ok).length;

  await navigate(side, panels[side].path);

  if (failed) toast(failed.error);
  else if (outcome.permanent) toast(`Permanently deleted ${succeeded} item(s)`);
  else toast(`Moved ${succeeded} item(s) to the Recycle Bin`);
}

/**
 * Retrieves the currently selected entries in the specified panel.
 * @param {string} side - The side of the panel to check.
 * @returns {Array} - An array of selected entries.
 */
export function getSelected(side) {
  const panel = panels[side];
  return panel.entries.filter((entry) => panel.selected.has(entry.path));
}

/**
 * Pastes the copied or cut items into the current panel.
 * @returns {Promise<void>}
 */
export async function pasteSelection() {
  const clipboard = getClipboard();
  const activeSide = getActiveSide();
  if (!clipboard?.paths.length) return;

  const operation = clipboard.operation;
  const result = await transferWithConflicts({
    sources: clipboard.paths,
    destination: panels[activeSide].path,
    operation,
  });

  const succeeded = result.filter((item) => item.ok).length;
  const failed = result.find(
    (item) => !item.ok && !item.cancelled && !item.skipped,
  );
  const cancelled = result.some((item) => item.cancelled);
  const skipped = result.filter((item) => item.skipped).length;

  if (
    operation === "move" &&
    !failed &&
    !cancelled &&
    succeeded === clipboard.paths.length
  ) {
    setClipboard(null);
  }

  await Promise.all([
    navigate("left", panels.left.path),
    navigate("right", panels.right.path),
  ]);

  if (failed) toast(failed.error);
  else if (cancelled) toast("Transfer cancelled");
  else if (skipped) toast(`Skipped ${skipped} existing item(s)`);
  else
    toast(`${operation === "move" ? "Moved" : "Copied"} ${succeeded} item(s)`);
}

/**
 * Renames the selected items in the specified panel.
 * @param {string} side - The side of the panel containing the selected items.
 * @returns {Promise<void>}
 */
export async function renameSelection(side) {
  const selected = getSelected(side);
  if (!selected.length) {
    toast("Select one item to rename");
    return;
  }
  if (selected.length > 1) {
    toast("Rename one item at a time");
    return;
  }

  const item = selected[0];
  const name = await askForName({
    title: "Rename item",
    label: "New name",
    value: item.name,
    confirmLabel: "Rename",
  });

  if (name === null || !name.trim() || name.trim() === item.name) return;
  try {
    await window.fileManager.rename({ source: item.path, name: name.trim() });
    await navigate(side, panels[side].path);
    toast("Item renamed");
  } catch (error) {
    toast(error.message);
  }
}

/**
 * Transfers files with conflict resolution.
 * @param {Object} param0 - The parameters for the transfer.
 * @param {Array} param0.sources - The source paths.
 * @param {string} param0.destination - The destination path.
 * @param {string} param0.operation - The operation to perform.
 * @returns {Promise<Array>} - A promise resolving to the transfer results.
 */
export async function transferWithConflicts({
  sources,
  destination,
  operation,
}) {
  const results = [];
  for (const source of sources) {
    let [result] = await window.fileManager.transfer({
      sources: [source],
      destination,
      operation,
    });
    while (result?.conflict) {
      const decision = await askTransferConflict(result);
      if (decision.choice === "cancel") {
        results.push({ source, ok: false, cancelled: true });
        return results;
      }
      if (decision.choice === "skip") {
        results.push({ source, ok: false, skipped: true });
        result = null;
        break;
      }
      [result] = await window.fileManager.transfer({
        sources: [source],
        destination,
        operation,
        conflictAction: decision.choice,
        renameTo: decision.name,
      });
    }
    if (result) results.push(result);
  }
  return results;
}
