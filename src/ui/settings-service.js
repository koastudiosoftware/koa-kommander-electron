import { escapeHtml, getPanelElement } from "../utils/panel-utils.js";

// Injected state and callbacks
let preferences, panels, activeSide;
let getActiveSide, setActiveSide;
let navigate;
let settingsBackdrop, settingsContent;
let directorySetMenu,
  directorySetMenuSide = null;
let settingsCategory = "files";
let defaultThumbnailCachePath = "";
let directorySetDraft = null;
let savePreferences, renderPanel, currentActiveSide, detectedDrives;

/**
 * Initializes the settings service with the provided configuration.
 * @param {Object} config - The configuration object.
 */
export function initSettingsService(config) {
  preferences = config.preferences;
  panels = config.panels;
  getActiveSide = config.getActiveSide;
  setActiveSide = config.setActiveSide;
  navigate = config.navigate;
  savePreferences = config.savePreferences;
  renderPanel = config.renderPanel;
  currentActiveSide = config.currentActiveSide;
  detectedDrives = config.detectedDrives;

  settingsBackdrop = config.settingsBackdrop;
  settingsContent = config.settingsContent;
  directorySetMenu = config.directorySetMenu;
}

/**
 * Returns the label for the specified directory set.
 * @param {Object} set
 * @returns {string}
 */
export function directorySetLabel(set) {
  if (set.name?.trim()) return set.name.trim();
  if (set.type === "pair")
    return `${bookmarkLabel(set.leftPath)} ↔ ${bookmarkLabel(set.rightPath)}`;
  return bookmarkLabel(set.path);
}

/**
 * Returns the label for the specified bookmark.
 * @param {string} directory
 * @returns {string}
 */
function bookmarkLabel(directory = "") {
  return directory.split(/[\\/]/).filter(Boolean).at(-1) || directory;
}

/**
 * Returns the details for the specified directory set.
 * @param {Object} set
 * @returns {Array<Array<string>>}
 */
export function directorySetDetails(set) {
  if (set.type === "pair")
    return [
      ["Left", set.leftPath],
      ["Right", set.rightPath],
    ];
  const target =
    set.openIn === "left"
      ? "Left"
      : set.openIn === "right"
        ? "Right"
        : "Active";
  return [[target, set.path]];
}

/**
 * Returns the directory sets in the order specified by the user's preferences.
 * @returns {Array<{set: Object, index: number}>}
 */
export function orderedDirectorySets() {
  const prefs = preferences();
  const items = prefs.directorySets.map((set, index) => ({ set, index }));
  if (prefs.directorySetSort === "alphabetical") {
    items.sort((a, b) =>
      directorySetLabel(a.set).localeCompare(
        directorySetLabel(b.set),
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    );
  }
  return items;
}

/**
 * Opens the specified directory set in the appropriate panel.
 * @param {Object} set
 * @param {string} activePanel
 * @returns {Promise}
 */
export async function openDirectorySet(set, activePanel) {
  if (set.type === "pair")
    return Promise.all([
      navigate("left", set.leftPath),
      navigate("right", set.rightPath),
    ]);
  const target =
    set.openIn === "left" || set.openIn === "right" ? set.openIn : activePanel;
  return navigate(target, set.path);
}

/**
 * Closes the directory set menu and resets the active side.
 */
export function closeDirectorySetMenu() {
  directorySetMenu.hidden = true;
  if (directorySetMenuSide) {
    getPanelElement(directorySetMenuSide)
      .querySelector('[data-action="directory-sets"]')
      ?.setAttribute("aria-expanded", "false");
  }
  directorySetMenuSide = null;
}

/**
 * Shows the directory set menu for the specified side.
 * @param {string} side
 * @param {*} button
 * @param {*} currentActiveSide
 * @returns
 */
export function showDirectorySetMenu(side, target, currentActiveSide) {
  // Safely resolve the actual <button> element whether passed an Event or a DOM node
  const el =
    target instanceof Event ? target.currentTarget || target.target : target;
  const buttonEl = el?.closest ? el.closest("button") || el : el;

  if (!buttonEl || typeof buttonEl.getBoundingClientRect !== "function") return;

  if (!directorySetMenu.hidden && directorySetMenuSide === side) {
    closeDirectorySetMenu();
    return;
  }
  closeDirectorySetMenu();
  directorySetMenuSide = side;
  setActiveSide(side);
  getPanelElement("left").classList.toggle("is-active", side === "left");
  getPanelElement("right").classList.toggle("is-active", side === "right");
  buttonEl.setAttribute("aria-expanded", "true");

  const orderedSets = orderedDirectorySets();
  directorySetMenu.innerHTML = orderedSets.length
    ? orderedSets
        .map(
          ({ set, index }) =>
            `<button role="menuitem" data-menu-directory-set="${index}"><strong>${escapeHtml(directorySetLabel(set))}</strong><span class="directory-set-locations">${directorySetDetails(
              set,
            )
              .map(
                ([label, directory]) =>
                  `<span class="directory-set-location-label">${escapeHtml(label)}</span><span class="directory-set-location-path">${escapeHtml(directory || "")}</span>`,
              )
              .join("")}</span></button>`,
        )
        .join("")
    : '<div class="directory-set-menu-empty">No directory sets saved.</div>';

  // Unhide first so the browser can accurately measure offsetWidth/height
  directorySetMenu.hidden = false;

  const bounds = buttonEl.getBoundingClientRect();
  const menuWidth = directorySetMenu.offsetWidth;
  const menuHeight = directorySetMenu.offsetHeight;

  // Align the right edge of the pop-up menu with the right edge of the button
  const left = Math.max(
    8,
    Math.min(bounds.right - menuWidth, innerWidth - menuWidth - 8),
  );

  const below = bounds.bottom + 6;
  const top =
    below + menuHeight <= innerHeight - 8
      ? below
      : Math.max(8, bounds.top - menuHeight - 6);

  directorySetMenu.style.left = `${left}px`;
  directorySetMenu.style.top = `${top}px`;
}

/**
 * Renders the directory sets in the settings overlay.
 * @returns {void}
 */
export function renderDirectorySets() {
  const prefs = preferences();
  if (directorySetDraft) {
    const draft = directorySetDraft;
    const isPair = draft.type === "pair";
    settingsContent.innerHTML = `<h2>${draft.index === null ? "New directory set" : "Edit directory set"}</h2><p class="settings-description">Save one location or a left/right directory pair.</p><label class="directory-set-field"><span>Name <small>(optional)</small></span><input data-set-field="name" value="${escapeHtml(draft.name || "")}" placeholder="For example, Project files"></label><label class="directory-set-field"><span>Set type</span><select data-set-field="type"><option value="single" ${!isPair ? "selected" : ""}>Single directory</option><option value="pair" ${isPair ? "selected" : ""}>Directory pair</option></select></label>${isPair ? `<div class="directory-set-field"><span>Left panel directory</span><div class="directory-path-input"><input data-set-field="leftPath" value="${escapeHtml(draft.leftPath || "")}" placeholder="Choose a folder"><button data-browse-field="leftPath">Browse…</button><button data-use-panel="left" title="Use current left panel folder">Use left</button></div></div><div class="directory-set-field"><span>Right panel directory</span><div class="directory-path-input"><input data-set-field="rightPath" value="${escapeHtml(draft.rightPath || "")}" placeholder="Choose a folder"><button data-browse-field="rightPath">Browse…</button><button data-use-panel="right" title="Use current right panel folder">Use right</button></div></div><p class="settings-hint">Opening a pair places its left and right directories in their matching panels.</p>` : `<div class="directory-set-field"><span>Directory</span><div class="directory-path-input"><input data-set-field="path" value="${escapeHtml(draft.path || "")}" placeholder="Choose a folder"><button data-browse-field="path">Browse…</button><button data-use-panel="left" title="Use current left panel folder">Use left</button><button data-use-panel="right" title="Use current right panel folder">Use right</button></div></div><label class="directory-set-field"><span>Open in panel</span><select data-set-field="openIn"><option value="active" ${draft.openIn === "active" ? "selected" : ""}>Active panel</option><option value="left" ${draft.openIn === "left" ? "selected" : ""}>Left panel</option><option value="right" ${draft.openIn === "right" ? "selected" : ""}>Right panel</option></select></label>`}<div class="directory-set-form-actions"><button class="settings-secondary" data-cancel-set>Back</button><button class="settings-primary" data-save-set>Save directory set</button></div>`;
    return;
  }
  const items = orderedDirectorySets()
    .map(({ set, index }) => {
      const description =
        set.type === "pair"
          ? `Left: ${set.leftPath} · Right: ${set.rightPath}`
          : `${set.path} · Opens in ${set.openIn === "active" ? "active panel" : `${set.openIn} panel`}`;
      return `<div class="directory-set-row" draggable="${prefs.directorySetSort === "manual"}" data-sortable-set="${index}"><div class="directory-set-summary"><strong>${escapeHtml(directorySetLabel(set))}</strong><small>${escapeHtml(description)}</small></div><button class="directory-set-open" data-open-set="${index}">Open</button><button class="bookmark-remove" data-edit-set="${index}" aria-label="Edit directory set" title="Edit">✎</button><button class="bookmark-remove" data-remove-set="${index}" aria-label="Remove directory set" title="Remove">×</button></div>`;
    })
    .join("");
  settingsContent.innerHTML = `<h2>Directory Sets</h2><p class="settings-description">Save a single location or a left/right pair, then open it in your preferred panel arrangement.</p><label class="setting-field directory-set-sort-field"><span>Sort directory sets</span><select data-preference="directorySetSort"><option value="manual" ${prefs.directorySetSort === "manual" ? "selected" : ""}>Manual (drag to reorder)</option><option value="alphabetical" ${prefs.directorySetSort === "alphabetical" ? "selected" : ""}>Alphabetically by title</option></select></label><button class="settings-primary" data-new-set>New directory set</button><div class="directory-set-list">${items || '<p class="settings-empty">No directory sets yet.</p>'}</div>`;
}

/**
 * Renders the settings category currently selected in the settings overlay.
 */
export function renderSettingsCategory() {
  const prefs = preferences();
  document
    .querySelectorAll(".settings-category")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        button.dataset.category === settingsCategory,
      ),
    );
  if (settingsCategory === "files") {
    settingsContent.innerHTML = `<h2>Files &amp; Folders</h2><p class="settings-description">Choose which items appear and how they are arranged.</p><label class="setting-option"><span><strong>Show hidden files</strong><small>Include dot-prefixed files and folders in the panels.</small></span><input type="checkbox" data-preference="showHidden" ${prefs.showHidden ? "checked" : ""}></label><label class="setting-option"><span><strong>Group folders before files</strong><small>Keep folders at the top of each panel.</small></span><input type="checkbox" data-preference="groupFolders" ${prefs.groupFolders ? "checked" : ""}></label><label class="setting-option"><span><strong>Confirm before deleting</strong><small>When confirmation is disabled, items are moved to the Recycle Bin without a prompt.</small></span><input type="checkbox" data-preference="confirmDelete" ${prefs.confirmDelete ? "checked" : ""}></label>`;
  } else if (settingsCategory === "date-time") {
    settingsContent.innerHTML = `<h2>Date &amp; Time</h2><p class="settings-description">Choose how modification dates and times appear in the panels.</p><label class="setting-field"><span>Date format</span><select data-preference="dateFormat"><option value="us" ${prefs.dateFormat === "us" ? "selected" : ""}>MM/DD/YYYY (American)</option><option value="eu" ${prefs.dateFormat === "eu" ? "selected" : ""}>DD/MM/YYYY (European)</option><option value="iso-dash" ${prefs.dateFormat === "iso-dash" ? "selected" : ""}>YYYY-MM-DD</option><option value="iso-slash" ${prefs.dateFormat === "iso-slash" ? "selected" : ""}>YYYY/MM/DD</option></select></label><label class="setting-field date-time-field"><span>Time format</span><select data-preference="timeFormat"><option value="12h" ${prefs.timeFormat === "12h" ? "selected" : ""}>12-hour with AM/PM</option><option value="24h" ${prefs.timeFormat === "24h" ? "selected" : ""}>24-hour, no leading zero</option><option value="24h-padded" ${prefs.timeFormat === "24h-padded" ? "selected" : ""}>24-hour, leading zero</option></select></label>`;
  } else if (settingsCategory === "theme") {
    settingsContent.innerHTML = `<h2>Theme</h2><p class="settings-description">Choose the appearance used by the file manager.</p><label class="setting-field"><span>Color theme</span><select data-preference="theme"><option value="system" ${prefs.theme === "system" ? "selected" : ""}>System</option><option value="light" ${prefs.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${prefs.theme === "dark" ? "selected" : ""}>Dark</option></select></label>`;
  } else if (settingsCategory === "thumbnails") {
    settingsContent.innerHTML = `<h2>Thumbnails</h2><p class="settings-description">Choose where generated image previews are stored, or clear the saved previews.</p><div class="thumbnail-cache-field"><label for="thumbnail-cache-path">Cache folder</label><div class="directory-path-input"><input id="thumbnail-cache-path" data-preference="thumbnailCachePath" value="${escapeHtml(prefs.thumbnailCachePath)}" placeholder="Default location"><button data-cache-browse>Browse…</button></div><p class="settings-hint">Leave blank to use the default cache folder: <span id="thumbnail-cache-default-path">Loading…</span></p></div><div class="thumbnail-cache-actions"><button class="settings-secondary" data-cache-default>Use default folder</button><button class="settings-primary" data-clear-thumbnail-cache>Clear thumbnail cache</button></div><p class="settings-hint" id="thumbnail-cache-status" role="status"></p>`;
    window.fileManager
      .thumbnailCacheDefaultPath()
      .then((directory) => {
        defaultThumbnailCachePath = directory;
        const label = settingsContent.querySelector(
          "#thumbnail-cache-default-path",
        );
        if (label && settingsCategory === "thumbnails")
          label.textContent = directory;
      })
      .catch(() => {
        const label = settingsContent.querySelector(
          "#thumbnail-cache-default-path",
        );
        if (label && settingsCategory === "thumbnails")
          label.textContent = "Unavailable";
      });
  } else if (settingsCategory === "directory-sets") renderDirectorySets();
}

/**
 * Opens the settings overlay and focuses the close button.
 */
export function openSettings() {
  settingsCategory = "files";
  renderSettingsCategory();
  settingsBackdrop.hidden = false;
  document.querySelector("#settings-close").focus();
}

/**
 * Closes the settings overlay and returns focus to the settings button.
 */
export function closeSettings() {
  settingsBackdrop.hidden = true;
  document.querySelector("#settings-button").focus();
}

/**
 * Switches the active category in the settings overlay.
 * @param {string} category - The category to switch to.
 */
export function switchCategory(category) {
  settingsCategory = category;
  renderSettingsCategory();
}
