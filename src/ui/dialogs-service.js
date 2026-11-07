import {
  formatSize,
  formatDate,
  escapeHtml,
  kind,
  icon,
  pathParts,
} from "../utils/panel-utils.js";

let preferences;
let resolveConflictDecision = null;
let activeFolderSizeRequest = null;

// DOM Element References (passed via init)
let propertiesBackdrop,
  conflictBackdrop,
  conflictItems,
  conflictActions,
  conflictRename,
  conflictRenameInput;
let nameDialogBackdrop,
  nameDialogInput,
  resolveNameDialog = null;

/**
 * Initializes the dialogs service with the provided configuration.
 * @param {Object} config
 */
export function initDialogsService(config) {
  preferences = config.preferences;
  propertiesBackdrop = config.propertiesBackdrop;
  conflictBackdrop = config.conflictBackdrop;
  conflictItems = config.conflictItems;
  conflictActions = config.conflictActions;
  conflictRename = config.conflictRename;
  conflictRenameInput = config.conflictRenameInput;
  nameDialogBackdrop = config.nameDialogBackdrop;
  nameDialogInput = config.nameDialogInput;
}

// ----------------------------------------------------------------------------
// 1. DIALOG DRAG & DROP
// ----------------------------------------------------------------------------

/**
 * Makes a dialog draggable by its handle.
 * @param {string} dialogSelector
 * @param {string} handleSelector
 * @returns {void}
 */
export function makeDialogDraggable(dialogSelector, handleSelector) {
  const dialog = document.querySelector(dialogSelector);
  const handle = dialog?.querySelector(handleSelector);
  if (!dialog || !handle) return;
  handle.addEventListener("pointerdown", (event) => {
    if (
      event.button !== 0 ||
      event.target.closest("button,input,select,textarea,a")
    )
      return;
    event.preventDefault();
    const rect = dialog.getBoundingClientRect();
    dialog.style.position = "fixed";
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.margin = "0";
    dialog.style.transform = "none";
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      const maxLeft = Math.max(8, window.innerWidth - dialog.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - dialog.offsetHeight - 8);
      dialog.style.left = `${Math.min(maxLeft, Math.max(8, startLeft + moveEvent.clientX - startX))}px`;
      dialog.style.top = `${Math.min(maxTop, Math.max(8, startTop + moveEvent.clientY - startY))}px`;
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish, { once: true });
    handle.addEventListener("pointercancel", finish, { once: true });
  });
}

// ----------------------------------------------------------------------------
// 2. PROPERTIES & FOLDER SIZE SCANNING
// ----------------------------------------------------------------------------

/**
 * Displays the properties of a file or folder.
 * @param {Object} properties
 */
export function showProperties(properties) {
  cancelFolderSizeScan();
  const rows = [
    ["Type", properties.type],
    ["Location", properties.location],
    [
      "Size",
      properties.isDirectory
        ? "Calculating…"
        : formatSize(properties.size, false),
    ],
    ...(properties.isDirectory
      ? [
          ["Files", "Counting…"],
          ["Folders", "Counting…"],
        ]
      : []),
    ["Created", formatDate(properties.created, preferences())],
    ["Modified", formatDate(properties.modified, preferences())],
    ["Accessed", formatDate(properties.accessed, preferences())],
  ];
  document.querySelector("#properties-title").textContent =
    `${properties.name} Properties`;
  const rowIds = {
    Size: "properties-size",
    Files: "properties-file-count",
    Folders: "properties-folder-count",
  };
  document.querySelector("#properties-content").innerHTML =
    `<div class="properties-name">${escapeHtml(properties.name)}</div><dl class="properties-list">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd ${rowIds[label] ? `id="${rowIds[label]}"` : ""} title="${escapeHtml(value)}">${escapeHtml(value)}</dd></div>`).join("")}</dl><div class="properties-scan-footer" ${properties.isDirectory ? "" : "hidden"}><span id="properties-scan-status">Preparing folder scan…</span><button class="settings-secondary" id="properties-cancel-scan" type="button">Cancel calculation</button></div>`;
  propertiesBackdrop.hidden = false;
  document.querySelector("#properties-close").focus();
  if (properties.isDirectory) startFolderSizeScan(properties.path);
}

/**
 * Cancels the ongoing folder size scan.
 * @returns {void}
 */
export function cancelFolderSizeScan() {
  if (!activeFolderSizeRequest) return;
  window.fileManager.cancelFolderSize(activeFolderSizeRequest);
  activeFolderSizeRequest = null;
}

/**
 * Closes the properties dialog and cancels any ongoing folder size scan.
 */
export function closeProperties() {
  cancelFolderSizeScan();
  propertiesBackdrop.hidden = true;
}

/**
 * Starts scanning the size of a folder.
 * @param {string} itemPath Path to the folder to scan.
 * @returns {Promise<void>}
 */
async function startFolderSizeScan(itemPath) {
  const requestId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  activeFolderSizeRequest = requestId;
  const size = document.querySelector("#properties-size");
  const scanStatus = document.querySelector("#properties-scan-status");
  const cancelButton = document.querySelector("#properties-cancel-scan");
  const setStatusText = (text) => {
    if (scanStatus) scanStatus.textContent = text;
  };
  try {
    const result = await window.fileManager.folderSize({ requestId, itemPath });
    if (activeFolderSizeRequest !== requestId) return;
    if (result.cancelled) {
      size.textContent = "Cancelled";
      document.querySelector("#properties-file-count").textContent =
        "Cancelled";
      document.querySelector("#properties-folder-count").textContent =
        "Cancelled";
      setStatusText("Folder size calculation cancelled.");
    } else {
      size.textContent = formatSize(result.totalBytes, false);
      document.querySelector("#properties-file-count").textContent = String(
        result.fileCount,
      );
      document.querySelector("#properties-folder-count").textContent = String(
        result.folderCount,
      );
      setStatusText(
        `Scanned ${result.fileCount} files and ${result.folderCount} folders.`,
      );
    }
    if (cancelButton) cancelButton.hidden = true;
  } catch (error) {
    if (activeFolderSizeRequest !== requestId) return;
    size.textContent = "Unavailable";
    document.querySelector("#properties-file-count").textContent =
      "Unavailable";
    document.querySelector("#properties-folder-count").textContent =
      "Unavailable";
    setStatusText(`Could not calculate folder size: ${error.message}`);
    if (cancelButton) cancelButton.hidden = true;
  } finally {
    if (activeFolderSizeRequest === requestId) activeFolderSizeRequest = null;
  }
}

// ----------------------------------------------------------------------------
// 3. CONFLICT RESOLUTION
// ----------------------------------------------------------------------------

/**
 * Suggests a new name for a copy of a file or folder, appending " (1)" before the file extension if it exists.
 * @param {string} name Name to suggest for the copy of a file or folder.
 * @returns {string} The suggested name for the copy.
 */
function suggestedCopyName(name) {
  const extensionAt = name.lastIndexOf(".");
  const hasExtension = extensionAt > 0;
  const stem = hasExtension ? name.slice(0, extensionAt) : name;
  const extension = hasExtension ? name.slice(extensionAt) : "";
  return `${stem} (1)${extension}`;
}

/**
 * Creates a card for displaying a conflict object.
 * @param {string} label
 * @param {Object} item
 * @param {string} choice
 * @param {string} actionLabel
 * @param {boolean} primary
 * @returns
 */
function conflictObjectCard(label, item, choice, actionLabel, primary = false) {
  const tag = choice ? "button" : "article";
  const attributes = choice
    ? `type="button" data-conflict-choice="${choice}"`
    : "";
  return `<${tag} class="conflict-object-choice ${primary ? "primary" : ""}" ${attributes}><div class="conflict-object-heading">${label}</div><div class="conflict-object-name"><span class="file-icon ${kind(item)}">${icon(kind(item))}</span><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong></div><dl><div><dt>Type</dt><dd>${item.isDirectory ? "Folder" : "File"}</dd></div><div><dt>Size</dt><dd>${formatSize(item.size, item.isDirectory)}</dd></div><div><dt>Modified</dt><dd>${formatDate(item.modified, preferences())}</dd></div></dl><div class="conflict-object-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div><div class="conflict-object-action">${actionLabel || "Choose Rename below for this item type"}</div></${tag}>`;
}

/**
 * Asks the user to resolve a transfer conflict.
 * @param {Object} conflict
 * @returns {Promise<Object>}
 */
export function askTransferConflict(conflict) {
  return new Promise((resolve) => {
    resolveConflictDecision = resolve;
    const incoming = conflict.sourceInfo;
    const existing = conflict.targetInfo;
    const bothFiles = !incoming.isDirectory && !existing.isDirectory;
    const bothFolders = incoming.isDirectory && existing.isDirectory;
    const newChoice = bothFiles ? "overwrite" : bothFolders ? "merge" : null;
    const newAction = bothFiles
      ? "Overwrite the existing file"
      : bothFolders
        ? "Merge folders · matching files are replaced"
        : null;
    conflictItems.innerHTML = `${conflictObjectCard("New item", incoming, newChoice, newAction, Boolean(newChoice))}${conflictObjectCard("Old item", existing, "skip", "Keep the existing item")}`;
    conflictActions.innerHTML =
      '<button class="conflict-choice" data-conflict-choice="rename">Rename incoming item</button><button class="conflict-choice cancel" data-conflict-choice="cancel">Cancel operation</button>';
    conflictRename.hidden = true;
    const candidate = suggestedCopyName(
      pathParts(conflict.target).at(-1)?.label || incoming.name,
    );
    conflictRenameInput.value = candidate;
    conflictBackdrop.hidden = false;
    (
      conflictItems.querySelector(".primary") ||
      conflictItems.querySelector("[data-conflict-choice]") ||
      conflictActions.querySelector('[data-conflict-choice="rename"]')
    )?.focus();
  });
}

/**
 * Finishes the conflict decision by resolving the promise returned by askTransferConflict.
 * @param {*} decision
 * @returns
 */
export function finishConflictDecision(decision) {
  if (!resolveConflictDecision) return;
  const resolve = resolveConflictDecision;
  resolveConflictDecision = null;
  conflictBackdrop.hidden = true;
  resolve(decision);
}

// ----------------------------------------------------------------------------
// 4. NAME INPUT DIALOG
// ----------------------------------------------------------------------------

/**
 * Asks the user for a name input.
 * @param {Object} param0
 * @param {string} param0.title
 * @param {string} param0.label
 * @param {string} param0.value
 * @param {string} param0.confirmLabel
 * @returns {Promise<string>}
 */
export function askForName({ title, label, value = "", confirmLabel }) {
  nameDialogBackdrop.querySelector("#name-dialog-title").textContent = title;
  nameDialogBackdrop.querySelector("#name-dialog-label").textContent = label;
  nameDialogInput.value = value;
  nameDialogBackdrop.querySelector("#name-dialog-submit").textContent =
    confirmLabel;
  nameDialogBackdrop.hidden = false;
  nameDialogInput.focus();
  nameDialogInput.select();
  return new Promise((resolve) => {
    resolveNameDialog = resolve;
  });
}

/**
 * Finishes the name input dialog by resolving the promise returned by askForName.
 * @param {string} value
 * @returns
 */
export function finishNameDialog(value) {
  if (nameDialogBackdrop.hidden) return;
  nameDialogBackdrop.hidden = true;
  const resolve = resolveNameDialog;
  resolveNameDialog = null;
  resolve?.(value);
}

// ----------------------------------------------------------------------------
// 5. ABOUT DIALOG
// ----------------------------------------------------------------------------

export async function openAbout(aboutBackdrop) {
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

export function closeAbout(aboutBackdrop) {
  aboutBackdrop.hidden = true;
  document.querySelector("#about-button").focus();
}