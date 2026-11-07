const LAYOUT_KEY = "koa-layout";
const SETTINGS_KEY = "koa-settings";

/**
 * Loads the layout data from local storage.
 * @param {Object} [defaultLayout]
 * @returns {Object}
 */
export function loadLayout(defaultLayout = {}) {
  try {
    const data = JSON.parse(localStorage.getItem(LAYOUT_KEY));
    return data && typeof data === "object" ? data : defaultLayout;
  } catch {
    return defaultLayout;
  }
}

/**
 * Saves the layout data to local storage.
 * @param {Object} layoutData
 * @returns {void}
 */
export function saveLayout(layoutData) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutData));
  } catch {
    /* Keep usable when storage is unavailable */
  }
}

/**
 * Loads the settings data from local storage.
 * @param {Object} [defaultPreferences]
 * @returns {Object}
 */
export function loadPreferences(defaultPreferences = {}) {
  try {
    const data = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return data && typeof data === "object" ? data : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

/**
 * Saves the settings data to local storage.
 * @param {Object} preferences
 * @returns {void}
 */
export function savePreferences(preferences) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    /* Keep usable when storage is unavailable */
  }
}

/**
 * Persists the preferences and applies the theme.
 * @param {Object} preferences
 */
export function persistPreferences(preferences) {
  savePreferences(preferences);
  document.documentElement.dataset.theme = preferences.theme;
}