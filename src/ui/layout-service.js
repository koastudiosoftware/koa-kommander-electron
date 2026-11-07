let workspaceElement, splitterElement;
let panelRatio = 0.5;
let persistLayoutCallback = null;

/**
 * Initializes the layout service with the workspace and splitter elements, sets the initial panel ratio, and attaches event listeners for resizing the panels.
 * @param {Object} config
 * @param {HTMLElement} config.workspaceElement
 * @param {HTMLElement} config.splitterElement
 * @param {number} [config.savedPanelRatio]
 * @param {Function} [config.persistLayout]
 */
export function initLayoutService(config) {
  workspaceElement = config.workspaceElement;
  splitterElement = config.splitterElement;
  persistLayoutCallback = config.persistLayout;

  panelRatio = Number.isFinite(config.savedPanelRatio) ? config.savedPanelRatio : 0.5;
  setPanelRatio(panelRatio);

  let resizingPointerId = null;

  splitterElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    splitterElement.focus({ preventScroll: true });
    event.preventDefault();
    resizingPointerId = event.pointerId;
    splitterElement.classList.add("is-dragging");
    splitterElement.setPointerCapture(event.pointerId);
  });

  splitterElement.addEventListener("pointermove", (event) => {
    if (resizingPointerId !== event.pointerId) return;
    const bounds = workspaceElement.getBoundingClientRect();
    const availableWidth = Math.max(
      1,
      bounds.width - splitterElement.offsetWidth,
    );
    const leftWidth =
      event.clientX - bounds.left - splitterElement.offsetWidth / 2;
    setPanelRatio(leftWidth / availableWidth);
  });

  const stopPanelResize = (event) => {
    if (resizingPointerId !== event.pointerId) return;
    resizingPointerId = null;
    splitterElement.classList.remove("is-dragging");
    if (splitterElement.hasPointerCapture(event.pointerId))
      splitterElement.releasePointerCapture(event.pointerId);
    if (persistLayoutCallback) persistLayoutCallback();
  };

  splitterElement.addEventListener("pointerup", stopPanelResize);
  splitterElement.addEventListener("pointercancel", stopPanelResize);
  splitterElement.addEventListener("pointercancel", stopPanelResize);
  splitterElement.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setPanelRatio(panelRatio + (event.key === "ArrowRight" ? 0.01 : -0.01));
      if (persistLayoutCallback) persistLayoutCallback();
    }
  });
}

/**
 * Sets the panel ratio, constraining it to a minimum of 240 pixels per panel.
 * @param {number} ratio
 * @returns {void}
 */
export function setPanelRatio(ratio) {
  if (!workspaceElement || !splitterElement) return;
  const availableWidth = Math.max(
    1,
    workspaceElement.clientWidth - splitterElement.offsetWidth,
  );
  const minimumRatio = Math.min(0.5, 240 / availableWidth);
  panelRatio = Math.max(minimumRatio, Math.min(1 - minimumRatio, ratio));
  workspaceElement.style.setProperty("--left-panel", `${panelRatio}fr`);
  workspaceElement.style.setProperty("--right-panel", `${1 - panelRatio}fr`);
  splitterElement.setAttribute(
    "aria-valuenow",
    String(Math.round(panelRatio * 100)),
  );
}

/**
 * Returns the current panel ratio.
 * @returns {number}
 */
export function getPanelRatio() {
  return panelRatio;
}
