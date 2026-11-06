import {
  actionIcon,
  entryAttributes,
  escapeHtml,
  formatDate,
  formatSize,
  getPanelElement,
  gridIcon,
  icon,
  kind,
  pathParts,
} from "../utils/panel-utils.js";

/**
 * Renders the drive buttons for the specified side.
 * @param {Array} detectedDrives - The list of detected drives.
 * @param {string} side - The side of the panel to render drive buttons for.
 * @param {Object} panels - The panels object containing panel data.
 * @returns {string} - The HTML string for the rendered drive buttons.
 */
export function renderDriveButtons(detectedDrives, side, panels) {
  console.log(`Rendering drive buttons for side: ${side}, path: ${panels[side].path}`);
  return detectedDrives
    .map((drive) => {
      console.log(`Rendering drive button for drive: ${drive.name}, path: ${drive.path}`);
      const isCurrent = panels[side].path
        ?.toLowerCase()
        .startsWith(drive.path.toLowerCase());
      const title = `${drive.name}${drive.label ? ` — ${drive.label}` : ""}${drive.canEject ? " (Removable)" : ""}`;
      return `<button class="toolbar-button drive-button ${isCurrent ? "active" : ""}" data-drive-button="${escapeHtml(drive.path)}" aria-label="Open ${escapeHtml(drive.name)}${drive.label ? `, ${escapeHtml(drive.label)}` : ""}" aria-pressed="${Boolean(isCurrent)}" title="${escapeHtml(title)}">${escapeHtml(drive.name)}</button>`;
    })
    .join("");
}

/**
 * Renders the panel for the specified side.
 * @param {string} side - The side of the panel to render.
 * @param {Object} panels - The panels object containing panel data.
 * @param {string} currentActiveSide - The currently active side.
 * @param {Array} detectedDrives - The list of detected drives.
 * @param {Object} preferences - The user preferences.
 * @param {Object} param5 - Additional parameters.
 * @returns {number} - The thumbnail generation counter.
 * @returns
 */
export function renderPanel(
  side,
  panels,
  currentActiveSide,
  detectedDrives,
  preferences,
  { loadThumbnails = true } = {},
) {
  const panel = panels[side];
  console.log(`Rendering panel for side: ${side}, path: ${panel.path}, view: ${panel.view}`);
  const panelEl = getPanelElement(side);
  const thumbnailGeneration = ++panel.thumbnailGeneration;

  if (!panelEl) return;

  panelEl.classList.toggle("is-active", currentActiveSide === side);
  panelEl.innerHTML = `${panelChrome(side, panels, detectedDrives)}${renderEntries(side, panels, preferences)}<div class="panel-bottom">${panelStatus(panel)}</div>`;

  if (panel.view === "icons") {
    applyThumbnailSize(panel);
    if (loadThumbnails) loadThumbnailImages(side, thumbnailGeneration);
  }

  // Return the generation counter if needed by callers
  return thumbnailGeneration;
}

/**
 * Renders the entries for the specified side.
 * @param {string} side - The side of the panel to render entries for.
 * @param {Object} panels - The panels object containing panel data.
 * @param {Object} preferences - The user preferences.
 * @returns {string} - The HTML string for the rendered entries.
 */
function renderEntries(side, panels, preferences) {
  const panel = panels[side];
  console.log(`Rendering entries for side: ${side}, path: ${panel.path}, view: ${panel.view}`);
  if (panel.view === "details") {
    const visibleEntries = panel.entries.filter(
      (entry) => preferences.showHidden || !entry.name.startsWith("."),
    );
    const sortedEntries = [...visibleEntries].sort((a, b) => {
      let comparison = 0;
      if (preferences.groupFolders && a.isDirectory !== b.isDirectory)
        return a.isDirectory ? -1 : 1;
      if (panel.sortBy === "name")
        comparison = a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      else if (panel.sortBy === "size")
        comparison = (a.size || 0) - (b.size || 0);
      else
        comparison =
          new Date(a.modified || 0).getTime() -
          new Date(b.modified || 0).getTime();
      return comparison * (panel.sortDirection === "asc" ? 1 : -1);
    });
    const rows = sortedEntries
      .map((entry) => {
        const index = panel.entries.indexOf(entry);
        return `<tr ${entryAttributes(entry, panels, side, index)}><td><div class="name-cell"><span class="file-icon ${kind(entry)}">${icon(kind(entry))}</span><span class="search-result-label"><span class="file-name" title="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</span>${panel.searchRoot ? `<span class="search-result-location">${escapeHtml(searchLocation(entry, panel))}</span>` : ""}</span></div></td><td>${formatSize(entry.size, entry.isDirectory)}</td><td class="date-cell">${formatDate(entry.modified, preferences)}</td></tr>`;
      })
      .join("");
    const colgroup = panel.columns
      .map((width) => `<col style="width:${width}%">`)
      .join("");
    const heading = (key, label, boundary = null) =>
      `<th><button class="column-sort" data-sort="${key}">${label}${panel.sortBy === key ? `<span class="sort-arrow" aria-label="sorted ${panel.sortDirection === "asc" ? "ascending" : "descending"}">${panel.sortDirection === "asc" ? "▲" : "▼"}</span>` : ""}</button>${boundary === null ? "" : `<span class="column-grip" data-column-boundary="${boundary}" title="Resize ${label} column" aria-label="Resize ${label} column"></span>`}</th>`;
    const emptyState = visibleEntries.length
      ? ""
      : `<div class="empty-state">${icon("folder")}<strong>${panel.searchRoot ? "No matches found" : panel.entries.length ? "No visible items" : "This folder is empty"}</strong><span>${panel.searchRoot ? `Search: ${escapeHtml(document.querySelector("#search-query").value)}` : panel.entries.length ? "Hidden items are not shown" : "Drop files here to add them"}</span></div>`;
    return `<div class="file-area"><table class="file-list" style="--name-width:${panel.columns[0]}%;--size-width:${panel.columns[1]}%;--date-width:${panel.columns[2]}%"><colgroup>${colgroup}</colgroup><thead><tr>${heading("name", "Name", 0)}${heading("size", "Size", 1)}${heading("modified", "Date modified")}</tr></thead><tbody>${rows}</tbody></table>${emptyState}</div>`;
  }
  const tileSize = panel.iconSize + 48;
  const visibleEntries = panel.entries.filter(
    (entry) => preferences.showHidden || !entry.name.startsWith("."),
  );
  const orderedEntries = [...visibleEntries].sort((a, b) => {
    if (preferences.groupFolders && a.isDirectory !== b.isDirectory)
      return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  const tiles = orderedEntries
    .map(
      (entry) =>
        `<div ${entryAttributes(entry, panels, side, panel.entries.indexOf(entry), true)} style="width:${tileSize}px;height:${tileSize}px"><div class="tile-visual ${kind(entry)}" style="width:${panel.iconSize}px;height:${panel.iconSize}px">${icon(kind(entry))}</div><div class="tile-name" title="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}${panel.searchRoot ? `<span class="search-result-location">${escapeHtml(searchLocation(entry, panel))}</span>` : ""}</div></div>`,
    )
    .join("");
  return `<div class="file-area"><div class="icon-grid" style="--tile-width:${tileSize}px">${tiles}</div>${visibleEntries.length ? "" : '<div class="empty-state">' + icon("folder") + `<strong>${panel.searchRoot ? "No matches found" : "This folder is empty"}</strong><span>${panel.searchRoot ? "Try another name or pattern" : "Drop files here to add them"}</span>` + "</div>"}</div>`;
}

/**
 * Renders the chrome for the specified panel side.
 * @param {string} side - The side of the panel to render chrome for.
 * @param {Object} panels - The panels object containing panel data.
 * @param {Array} detectedDrives - The list of detected drives.
 * @returns {string} - The HTML string for the rendered panel chrome.
 */
function panelChrome(side, panels, detectedDrives) {
  const panel = panels[side];
  console.log(`Rendering panel chrome for side: ${side}, path: ${panel.path}, view: ${panel.view}`);
  const parts = panel.path ? pathParts(panel.path) : [];
  const crumbs = parts
    .map((part, index) => {
      const label =
        index === 0 && /^[A-Za-z]:\\$/.test(part.label)
          ? part.label.slice(0, 2)
          : part.label;
      return `<span class="crumb" data-crumb="${index}">${escapeHtml(label)}</span>${index < parts.length - 1 ? '<span class="crumb-sep">›</span>' : ""}`;
    })
    .join("");
  return `<div class="panel-top">
    <div class="pathbar"><button class="path-home" data-action="home" title="Go to Home folder" aria-label="Go to Home folder">⌂</button>${crumbs}</div>
    </div>
    <div class="toolbar">
        <button class="toolbar-button icon-only" data-action="up" aria-label="Go up one folder" title="Go up one folder">${actionIcon("up")}</button>
        <button class="toolbar-button icon-only" data-action="refresh" aria-label="Refresh" title="Refresh">${actionIcon("refresh")}</button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <span class="drive-button-group" data-drive-buttons>${renderDriveButtons(detectedDrives, side, panels)}</span>
        <span class="toolbar-spacer"></span>
        ${panel.view === "icons" ? `<label class="size-control" title="Thumbnail size"><span data-size-value>${panel.iconSize}</span><input type="range" min="32" max="160" step="8" value="${panel.iconSize}" data-action="icon-size" aria-label="Thumbnail size"></label>` : ""}
        <div class="view-group" role="group" aria-label="Panel view">
            <button class="view-button ${panel.view === "details" ? "active" : ""}" data-view="details" title="Details" aria-label="Details view" aria-pressed="${panel.view === "details"}">${gridIcon("details")}</button>
            <button class="view-button ${panel.view === "icons" ? "active" : ""}" data-view="icons" title="Thumbnails" aria-label="Thumbnail view" aria-pressed="${panel.view === "icons"}">${gridIcon("icons")}</button>
        </div>
        <button class="toolbar-button directory-set-trigger" data-action="directory-sets" aria-label="Open a saved directory set" aria-expanded="false" title="Directory sets">${actionIcon("sets")}<span>Sets</span></button>
        <button class="toolbar-button icon-only" data-action="match-other" aria-label="${side === "left" ? "Match right panel folder" : "Match left panel folder"}" title="${side === "left" ? "Go to right panel folder" : "Go to left panel folder"}">${actionIcon(side === "left" ? "left" : "right")}</button>
    </div>`;
}

/**
 * Renders the status bar for the specified panel.
 * @param {Object} panel
 * @returns {string} HTML string representing the panel status, including selected count and total size of selected files.
 */
function panelStatus(panel) {
  console.log(`Rendering panel status for path: ${panel.path}, selected count: ${panel.selected.size}`);
  const selectedCount = panel.selected.size;
  const selectedFiles = panel.entries.filter(
    (entry) => panel.selected.has(entry.path) && !entry.isDirectory,
  );
  const fileBytes = selectedFiles.reduce(
    (sum, entry) => sum + (entry.size || 0),
    0,
  );
  return `<strong>${selectedCount || panel.entries.length}</strong>&nbsp;${selectedCount ? "selected" : panel.searchRoot ? "matches" : "items"}<span class="bottom-spacer"></span>${selectedCount && selectedFiles.length ? `<span class="panel-selection-size">${formatSize(fileBytes, false)}</span>` : ""}`;
}
