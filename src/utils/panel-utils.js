
/**
 * Retrieves the DOM container element for the specified panel side.
 * @param {string} side - Either "left" or "right"
 * @returns {HTMLElement|null} The panel DOM element
 */
export function getPanelElement(side) {
    return document.querySelector(`#panel-${side}`);
}
