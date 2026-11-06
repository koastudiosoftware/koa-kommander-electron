export class PanelModel {
  constructor(side, savedState = {}) {
    this.side = side;
    this.path = null;
    this.entries = [];
    this.selected = new Set();

    // Restore layout settings with safe fallbacks
    this.view = savedState.view === "icons" ? "icons" : "details";
    this.iconSize = Number.isFinite(savedState.iconSize)
      ? Math.max(32, Math.min(160, 32 + Math.round((savedState.iconSize - 32) / 8) * 8))
      : 48;
    this.columns = Array.isArray(savedState.columns) && savedState.columns.length === 3
      ? savedState.columns
      : [58, 17, 25];

    this.sortBy = "name";
    this.sortDirection = "asc";
    this.history = [];
    this.historyIndex = -1;
    this.searchId = null;
    this.searchRoot = null;

    // Runtime properties if you prefer keeping them tracked on the model
    this.watchPath = null;
    this.thumbnailGeneration = 0;
  }
}
