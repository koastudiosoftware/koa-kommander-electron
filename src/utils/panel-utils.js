/**
 * Returns the SVG icon for a given action name.
 * @param {string} name - The name of the action
 * @returns {string} The SVG icon HTML
 */
export const actionIcon = (name) => {
  const paths = {
    sets: 'material-icons_folder_special.svg',
    "new-folder": 'material-icons_create_new_folder.svg',
    up: 'material-icons_arrow_upward.svg',
    refresh: 'material-icons_refresh.svg',
    left: 'material-icons_keyboard_arrow_left.svg',
    right: 'material-icons_keyboard_arrow_right.svg',
    copy: 'material-icons_file_copy.svg',
    cut: 'material-icons_content_cut.svg',
    paste: 'material-icons_content_paste.svg',
    rename: 'material-icons_drive_file_rename_outline.svg',
    delete: 'material-icons_delete.svg',
  };
  return `<img class="svg-icon" src="./assets/${paths[name]}" alt="" aria-hidden="true" draggable="false">`;
};

/**
 * Generates the HTML attributes for a file or folder entry based on its state and
 * position.
 * @param {*} entry
 * @param {Object} panels
 * @param {string} side
 * @param {number} index
 * @param {boolean} tile
 * @returns
 */
export function entryAttributes(entry, panels, side, index, tile = false) {
  const selected = panels[side].selected.has(entry.path);
  return `${tile ? 'class="icon-tile' : 'class="file-row'} ${selected ? "selected" : ""}" data-entry="${index}" draggable="true" tabindex="0"`;
}

/**
 * Escapes HTML characters in a string.
 * @param {string} text - The string to escape
 * @returns {string} The escaped string
 */
export function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

/**
 * Formats a date into a human-readable string.
 * @param {string} iso - The ISO date string
 * @param {Object} preferences - User preferences for date and time format
 * @param {string} preferences.dateFormat - The date format ("us", "eu", "iso-dash", "iso-slash")
 * @param {string} preferences.timeFormat - The time format ("12h", "24h", "24h-padded")
 * @returns {string} The formatted date string
 */
export function formatDate(iso, preferences = { dateFormat: "us", timeFormat: "12h" }) {
  if (!iso) return "—";
  const date = new Date(iso);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateText =
    {
      us: `${month}/${day}/${year}`,
      eu: `${day}/${month}/${year}`,
      "iso-dash": `${year}-${month}-${day}`,
      "iso-slash": `${year}/${month}/${day}`,
    }[preferences.dateFormat] || `${month}/${day}/${year}`;
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  let timeText;
  if (preferences.timeFormat === "24h") timeText = `${hours}:${minutes}`;
  else if (preferences.timeFormat === "24h-padded")
    timeText = `${String(hours).padStart(2, "0")}:${minutes}`;
  else timeText = `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
  return `${dateText} ${timeText}`;
}

/**
 * Formats a file size into a human-readable string.
 * @param {number} size - The size in bytes
 * @param {boolean} directory - Whether the entry is a directory
 * @returns {string} The formatted size string
 */
export function formatSize(size, directory) {
  if (directory) return "—";
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const n = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  return `${(size / 1024 ** n).toFixed(n === 0 ? 0 : 1)} ${units[n]}`;
}

/**
 * Retrieves the DOM container element for the specified panel side.
 * @param {string} side - Either "left" or "right"
 * @returns {HTMLElement|null} The panel DOM element
 */
export function getPanelElement(side) {
  return document.querySelector(`#panel-${side}`);
}

/**
 * Returns the appropriate grid icon based on the view type.
 * @param {string} type - The view type ("details" or "grid")
 * @returns {string} The HTML for the grid icon
 */
export function gridIcon(type) {
  return type === "details"
    ? '<img class="svg-icon" src="./assets/bootstrap-list-task.svg" alt="" aria-hidden="true" draggable="false">'
    : '<img class="svg-icon" src="./assets/material-icons_grid_view.svg" alt="" aria-hidden="true" draggable="false">';
}

/**
 * Returns the appropriate icon based on the entry kind.
 * @param {string} name - The kind of the entry
 * @returns {string} The HTML for the icon
 */
export const icon = (name) => {
  const filename = {
    folder: 'material-icons_folder.svg',
    file: 'material-icons_insert_drive_file.svg',
    image: 'material-icons_image.svg',
  };
  return `<img class="svg-icon" src="./assets/${filename[name] || filename.file}" alt="" aria-hidden="true" draggable="false">`;
};

/**
 * A set of common image file extensions for quick lookup.
 */
export const imageExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "heic",
]);

/**
 * Determines the kind of an entry based on its properties.
 * @param {*} entry
 * @returns {string} The kind of the entry
 */
export function kind(entry) {
  if (entry.isDirectory) return "folder";
  const ext = entry.name.split(".").pop().toLowerCase();
  if (imageExtensions.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (
    [
      "js",
      "ts",
      "json",
      "html",
      "css",
      "py",
      "md",
      "yaml",
      "yml",
      "sh",
      "bat",
    ].includes(ext)
  )
    return "code";
  if (["zip", "7z", "rar", "tar", "gz"].includes(ext)) return "archive";
  return "file";
}

/**
 * Splits a full path into its constituent parts.
 * @param {string} fullPath - The full path to split
 * @returns {Array<{label: string, path: string}>} The array of path parts
 */
export function pathParts(fullPath) {
  const parsedRoot =
    fullPath.match(/^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+|\/)/)?.[0] || "";
  const rest = fullPath.slice(parsedRoot.length).split(/[\\/]/).filter(Boolean);
  let current = parsedRoot;
  const result = [
    { label: parsedRoot || fullPath, path: parsedRoot || fullPath },
  ];
  for (const part of rest) {
    current = current
      ? `${current.replace(/[\\/]$/, "")}${fullPath.includes("\\") ? "\\" : "/"}${part}`
      : part;
    result.push({ label: part, path: current });
  }
  return result;
}

/**
 * Sets the status message in the UI.
 * @param {string} message - The message to display
 */
export function setStatus(message) {
  const status = document.querySelector("#status-message");
  if (status) {
    status.textContent = message;
  }
}

/**
 * Displays a toast message in the UI.
 * @param {string} message - The message to display
 */
export function toast(message) {
  let toastTimer;
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 2400);
}
