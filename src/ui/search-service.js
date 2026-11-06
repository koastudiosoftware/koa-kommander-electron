import { setStatus, toast } from "../utils/panel-utils.js";

let panels, preferences, getActiveSide, navigate, renderPanel, bindPanel;
let searchForm, searchQuery, searchMode, searchCancel;
let searchDebounceTimer = null;
let searchRenderTimer = null;

/**
 * Initializes the search service.
 * @param {*} config
 */
export function initSearchService(config) {
  panels = config.panels;
  preferences = config.preferences;
  getActiveSide = config.getActiveSide;
  navigate = config.navigate;
  renderPanel = config.renderPanel;
  bindPanel = config.bindPanel;

  searchForm = config.searchForm || document.querySelector("#global-search");
  searchQuery = config.searchQuery || document.querySelector("#search-query");
  searchMode = config.searchMode || document.querySelector("#search-mode");
  searchCancel =
    config.searchCancel || document.querySelector("#search-cancel");

  window.fileManager.onSearchProgress(
    ({ searchId, scanned, matches, results = [] }) => {
      const side = ["left", "right"].find(
        (candidate) => panels[candidate].searchId === searchId,
      );
      if (!side) return;
      const panel = panels[side];
      panel.searchMatches.push(...results);
      const activeSide = getActiveSide();
      if (side === activeSide)
        setStatus(
          `Searching… ${scanned.toLocaleString()} checked · ${matches} matches`,
        );
      clearTimeout(searchRenderTimer);
      searchRenderTimer = setTimeout(() => {
        if (panel.searchId !== searchId) return;
        panel.entries = [...panel.searchMatches].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );
        renderPanel(side, { loadThumbnails: false });
        bindPanel(side);
      }, 120);
    },
  );

  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchDebounceTimer);
    runPanelSearch();
  });

  searchQuery?.addEventListener("input", () => {
    updateSearchControl();
    clearTimeout(searchDebounceTimer);
    if (searchQuery.value.trim()) {
      searchDebounceTimer = setTimeout(runPanelSearch, 250);
      return;
    }
    const activeSide = getActiveSide();
    const panel = panels[activeSide];
    if (panel.searchRoot) navigate(activeSide, panel.searchRoot);
  });

  searchQuery?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      const activeSide = getActiveSide();
      const panel = panels[activeSide];
      if (panel.searchId) window.fileManager.cancelSearch(panel.searchId);
      if (panel.searchRoot) navigate(activeSide, panel.searchRoot);
      searchQuery.value = "";
      updateSearchControl();
    }
  });

  searchCancel?.addEventListener("click", () => {
    const activeSide = getActiveSide();
    const panel = panels[activeSide];
    if (panel.searchId) window.fileManager.cancelSearch(panel.searchId);
    if (panel.searchRoot) navigate(activeSide, panel.searchRoot);
    searchQuery.value = "";
    updateSearchControl();
  });
}

/**
 * Updates the search control UI based on the current search state.
 * @returns
 */
export function updateSearchControl() {
  const activeSide = getActiveSide();
  if (!searchCancel || !searchQuery) return;
  searchCancel.hidden = !searchQuery.value;
  searchCancel.title = panels[activeSide].searchId
    ? "Cancel search"
    : "Clear search results";
  searchCancel.setAttribute("aria-label", searchCancel.title);
}

/**
 * Runs the search for the active panel.
 * @returns
 */
export async function runPanelSearch() {
  if (!searchQuery) return;
  const activeSide = getActiveSide();
  const side = activeSide;
  const panel = panels[side];
  const query = searchQuery.value.trim();
  if (!query || !panel.path) return;

  if (panel.searchId) window.fileManager.cancelSearch(panel.searchId);
  const searchId = crypto.randomUUID();
  const root = panel.path;
  panel.searchId = searchId;
  panel.searchRoot = root;
  panel.searchMatches = [];
  panel.selected.clear();
  updateSearchControl();
  setStatus("Searching file names…");
  renderPanel(side);
  bindPanel(side);

  try {
    const result = await window.fileManager.search({
      searchId,
      root,
      query,
      mode: searchMode ? searchMode.value : "normal",
    });
    if (panel.searchId !== searchId) return;
    panel.searchId = null;
    panel.searchRoot = root;
    clearTimeout(searchRenderTimer);
    panel.entries = result.results.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
    panel.selected.clear();
    updateSearchControl();
    renderPanel(side);
    bindPanel(side);
    setStatus(
      result.cancelled
        ? `Search cancelled · ${result.results.length} matches`
        : `Search complete · ${result.results.length} matches`,
    );
  } catch (error) {
    if (panel.searchId !== searchId) return;
    panel.searchId = null;
    panel.searchRoot = null;
    updateSearchControl();
    await navigate(side, root);
    toast(error.message);
  }
}

/**
 * Determines the location of a search result within the search hierarchy.
 * @param {*} entry
 * @param {*} panel
 * @returns
 */
export function searchLocation(entry, panel) {
  if (!panel.searchRoot) return "";
  const relative = entry.path
    .slice(panel.searchRoot.length)
    .replace(/^[\\/]+/, "")
    .split(/[\\/]/)
    .slice(0, -1)
    .join(" › ");
  return relative || ".";
}
