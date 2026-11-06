import { getPanelElement } from "../utils/panel-helpers.js";

export function bindPanel(side, callbacks) {
  const panelEl = getPanelElement(side);
  if (!panelEl) return;

  const listContainer = panelEl.querySelector(".file-list-container");
  if (!listContainer) return;

  // Example click handler passing data back to your controller
  listContainer.addEventListener("click", (event) => {
    const row = event.target.closest(".file-item");
    if (!row) return;

    const entryId = row.dataset.id;
    if (callbacks.onSelectItem) {
      callbacks.onSelectItem(side, entryId);
    }
  });
}
