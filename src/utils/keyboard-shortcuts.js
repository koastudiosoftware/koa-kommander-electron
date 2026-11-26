export const keyboardShortcutDefinitions = [
  { id: "cut", label: "Cut", defaults: ["Ctrl+X"] },
  { id: "copy", label: "Copy", defaults: ["Ctrl+C"] },
  { id: "paste", label: "Paste", defaults: ["Ctrl+V"] },
  { id: "delete", label: "Delete", defaults: ["Delete"] },
  { id: "refresh", label: "Refresh", defaults: ["F5"] },
  { id: "switchPanel", label: "Switch panel", defaults: ["Tab"] },
  { id: "previousItem", label: "Navigate to previous item", defaults: ["ArrowUp"] },
  { id: "nextItem", label: "Navigate to next item", defaults: ["ArrowDown"] },
  { id: "previousHistory", label: "Navigate to previous item in history", defaults: ["Alt+ArrowLeft"] },
  { id: "nextHistory", label: "Navigate to next item in history", defaults: ["Alt+ArrowRight"] },
  { id: "parentDirectory", label: "Navigate up one directory", defaults: ["Alt+ArrowUp"] },
  { id: "selectAdjacent", label: "Select adjacent items", defaults: ["Shift+ArrowUp", "Shift+ArrowDown"] },
  { id: "rename", label: "Rename", defaults: ["F2"] },
  { id: "newFolder", label: "New folder", defaults: ["Ctrl+N"] },
  { id: "undo", label: "Undo", defaults: ["Ctrl+Z"], note: "Undo is not implemented yet." },
  { id: "selectAll", label: "Select all", defaults: ["Ctrl+A"] },
];

export function defaultKeyboardShortcuts() {
  return Object.fromEntries(
    keyboardShortcutDefinitions.map(({ id, defaults }) => [id, [...defaults]]),
  );
}

function canonicalKey(key) {
  if (key === " ") return "Space";
  return ({
    Up: "ArrowUp",
    Down: "ArrowDown",
    Left: "ArrowLeft",
    Right: "ArrowRight",
  })[key] || key;
}

export function normalizeKeyboardShortcuts(value) {
  const defaults = defaultKeyboardShortcuts();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  for (const { id, defaults: fallback } of keyboardShortcutDefinitions) {
    const supplied = value[id];
    if (Array.isArray(supplied)) {
      defaults[id] = fallback.map((binding, index) =>
        typeof supplied[index] === "string" && supplied[index]
          ? supplied[index]
          : binding,
      );
    }
  }
  return defaults;
}

function keyLabel(key) {
  if (key === "ArrowUp") return "Up";
  if (key === "ArrowDown") return "Down";
  if (key === "ArrowLeft") return "Left";
  if (key === "ArrowRight") return "Right";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

export function formatShortcut(binding) {
  return String(binding || "").split("+").map(keyLabel).join("+");
}

export function shortcutFromEvent(event) {
  const key = canonicalKey(event.key);
  if (!key || ["Control", "Alt", "Shift", "Meta"].includes(key)) return null;
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push("Ctrl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return [...modifiers, key].join("+");
}

export function shortcutMatches(event, binding) {
  if (!binding) return false;
  const parts = String(binding).split("+");
  const key = parts.pop();
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  const actualKey = canonicalKey(event.key).toLowerCase();
  const expectedKey = canonicalKey(key).toLowerCase();
  return actualKey === expectedKey
    && Boolean(event.ctrlKey || event.metaKey) === modifiers.has("ctrl")
    && Boolean(event.altKey) === modifiers.has("alt")
    && Boolean(event.shiftKey) === modifiers.has("shift");
}
