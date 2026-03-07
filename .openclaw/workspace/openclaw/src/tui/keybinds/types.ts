/**
 * Keybinding System - Type Definitions
 *
 * Universal keybinding support for OpenClaw TUI.
 * Handles German QWERTZ, US QWERTY, and other layouts.
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Keyboard modifiers
 */
export type KeyModifier = "ctrl" | "alt" | "shift" | "meta" | "none";

/**
 * All available keybinding actions
 */
export type KeyAction =
  // Input control
  | "submit"
  | "abort"
  | "clear-line"
  | "clear-screen"

  // History
  | "history-prev"
  | "history-next"
  | "history-search"

  // Cursor movement
  | "cursor-left"
  | "cursor-right"
  | "cursor-start"
  | "cursor-end"
  | "cursor-word-left"
  | "cursor-word-right"

  // Editing
  | "delete-char"
  | "delete-word"
  | "delete-line"
  | "yank-line"
  | "undo"
  | "redo"

  // Autocomplete
  | "autocomplete-trigger"
  | "autocomplete-next"
  | "autocomplete-prev"
  | "autocomplete-cancel"
  | "autocomplete-accept"

  // Vim mode
  | "vim-enable"
  | "vim-disable"
  | "vim-toggle"
  | "vim-normal-mode"
  | "vim-insert-mode"
  | "vim-visual-mode"

  // Sessions
  | "session-new"
  | "session-next"
  | "session-prev"
  | "session-switch"

  // TUI control
  | "toggle-verbose"
  | "toggle-reasoning"
  | "toggle-help"
  | "refresh"
  | "quit"

  // Misc
  | "copy"
  | "paste"
  | "select-all";

/**
 * A single keybinding
 */
export interface KeyBinding {
  /** Unique identifier for this binding */
  id: string;

  /** The key (e.g., "c", "enter", "escape", "space") */
  key: string;

  /** Key modifiers */
  modifiers: KeyModifier[];

  /** Action to perform */
  action: KeyAction;

  /** Human-readable description */
  description: string;

  /** Context where this binding is active */
  context?: KeybindContext;

  /** Is this binding enabled? */
  enabled?: boolean;

  /** Priority (higher = checked first) */
  priority?: number;
}

/**
 * Context where keybindings are active
 */
export type KeybindContext =
  | "global" // Always active
  | "input" // Only when typing in input
  | "autocomplete" // Only when autocomplete is open
  | "vim-normal" // Vim normal mode
  | "vim-insert" // Vim insert mode
  | "vim-visual" // Vim visual mode
  | "browser"; // When browser is focused

/**
 * A keybinding profile
 */
export interface KeybindProfile {
  /** Profile name */
  name: string;

  /** Profile description */
  description: string;

  /** Bindings in this profile */
  bindings: KeyBinding[];

  /** Is this a built-in profile? */
  builtin?: boolean;
}

/**
 * Full keybinding configuration
 */
export interface KeybindConfig {
  /** Active profile name */
  activeProfile: string;

  /** Custom bindings (override profile) */
  customBindings: Record<string, KeyBinding>;

  /** Disabled binding IDs */
  disabledBindings: string[];

  /** All available profiles */
  profiles: Record<string, KeybindProfile>;
}

/**
 * Parsed key event
 */
export interface ParsedKeyEvent {
  key: string;
  modifiers: KeyModifier[];
  raw: string;
  sequence: string[];
}

/**
 * Keybinding conflict
 */
export interface KeybindConflict {
  binding1: KeyBinding;
  binding2: KeyBinding;
  reason: "same-keys" | "overlapping-context";
}

/**
 * Keybinding change event
 */
export interface KeybindChangeEvent {
  type: "add" | "remove" | "update" | "profile-change";
  binding?: KeyBinding;
  oldProfile?: string;
  newProfile?: string;
}

/**
 * Keyboard layout type
 */
export type KeyboardLayout = "us" | "de" | "uk" | "fr" | "other";

/**
 * Platform type
 */
export type Platform = "darwin" | "linux" | "win32" | "other";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Special keys mapping (escape sequences to names)
 */
export const SPECIAL_KEYS: Record<string, string> = {
  "\x1b": "escape",
  "\r": "enter",
  "\n": "enter",
  "\x7f": "backspace",
  "\x08": "backspace",
  "\t": "tab",
  " ": "space",
};

/**
 * Modifier order for canonical key representation
 */
export const MODIFIER_ORDER: Record<string, number> = {
  ctrl: 1,
  alt: 2,
  shift: 3,
  meta: 4,
  none: 99,
};

/**
 * Terminal escape sequence prefixes
 */
export const ESCAPE_PREFIXES = {
  CSI: "\x1b[",
  SS3: "\x1bO",
  ESC: "\x1b",
};

export const DEFAULT_CONTEXT: KeybindContext = "global";

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if string is a valid KeyAction
 */
export function isKeyAction(value: string): value is KeyAction {
  const actions: KeyAction[] = [
    "submit",
    "abort",
    "clear-line",
    "clear-screen",
    "history-prev",
    "history-next",
    "history-search",
    "cursor-left",
    "cursor-right",
    "cursor-start",
    "cursor-end",
    "cursor-word-left",
    "cursor-word-right",
    "delete-char",
    "delete-word",
    "delete-line",
    "yank-line",
    "undo",
    "redo",
    "autocomplete-trigger",
    "autocomplete-next",
    "autocomplete-prev",
    "autocomplete-cancel",
    "autocomplete-accept",
    "vim-enable",
    "vim-disable",
    "vim-toggle",
    "vim-normal-mode",
    "vim-insert-mode",
    "vim-visual-mode",
    "session-new",
    "session-next",
    "session-prev",
    "session-switch",
    "toggle-verbose",
    "toggle-reasoning",
    "toggle-help",
    "refresh",
    "quit",
    "copy",
    "paste",
    "select-all",
  ];
  return actions.includes(value as KeyAction);
}

/**
 * Check if string is a valid KeyModifier
 */
export function isKeyModifier(value: string): value is KeyModifier {
  return ["ctrl", "alt", "shift", "meta", "none"].includes(value);
}

/**
 * Check if string is a valid KeybindContext
 */
export function isKeybindContext(value: string): value is KeybindContext {
  return [
    "global",
    "input",
    "autocomplete",
    "vim-normal",
    "vim-insert",
    "vim-visual",
    "browser",
  ].includes(value);
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

/**
 * Detect current platform
 */
export function detectPlatform(): Platform {
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  return "other";
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return detectPlatform() === "darwin";
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return detectPlatform() === "win32";
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return detectPlatform() === "linux";
}

// ============================================================================
// KEYBOARD LAYOUT DETECTION
// ============================================================================

/**
 * Detect keyboard layout from environment
 * Note: This is a best-effort detection
 */
export function detectKeyboardLayout(): KeyboardLayout {
  const lang = process.env.LANG || process.env.LC_ALL || "";
  const layout = process.env.XKB_DEFAULT_LAYOUT || "";

  if (lang.includes("de_DE") || layout.includes("de")) {
    return "de";
  }
  if (lang.includes("en_GB") || lang.includes("uk")) {
    return "uk";
  }
  if (lang.includes("fr_FR") || layout.includes("fr")) {
    return "fr";
  }
  if (lang.includes("en_US") || layout === "" || layout.includes("us")) {
    return "us";
  }

  return "other";
}

/**
 * Check if German keyboard layout
 */
export function isGermanKeyboard(): boolean {
  return detectKeyboardLayout() === "de";
}

// ============================================================================
// BINDING UTILITIES
// ============================================================================

/**
 * Create a canonical binding key string
 * Format: "ctrl+alt+shift+key" (modifiers sorted)
 */
export function bindingKey(key: string, modifiers: KeyModifier[]): string {
  const mods = modifiers
    .filter((m) => m !== "none")
    .sort((a, b) => (MODIFIER_ORDER[a] ?? 99) - (MODIFIER_ORDER[b] ?? 99));

  const normalizedKey = key.toLowerCase();
  return mods.length > 0 ? `${mods.join("+")}+${normalizedKey}` : normalizedKey;
}

/**
 * Parse a binding key string into components
 */
export function parseBinding(str: string): { key: string; modifiers: KeyModifier[] } | null {
  if (!str || str.length === 0) return null;

  const parts = str.toLowerCase().split("+");

  // Handle single key (no modifiers)
  if (parts.length === 1) {
    return { key: parts[0], modifiers: [] };
  }

  // Extract key (last part) and modifiers
  const key = parts.pop()!;
  if (!key) return null;

  const modifiers: KeyModifier[] = [];

  for (const part of parts) {
    // Normalize modifier names
    const normalized = part.trim();
    if (normalized === "ctrl" || normalized === "control") {
      if (!modifiers.includes("ctrl")) modifiers.push("ctrl");
    } else if (normalized === "alt" || normalized === "option" || normalized === "meta") {
      if (!modifiers.includes("alt")) modifiers.push("alt");
    } else if (normalized === "shift") {
      if (!modifiers.includes("shift")) modifiers.push("shift");
    } else if (
      normalized === "meta" ||
      normalized === "cmd" ||
      normalized === "command" ||
      normalized === "super"
    ) {
      if (!modifiers.includes("meta")) modifiers.push("meta");
    }
    // Unknown modifier - ignore
  }

  return { key, modifiers };
}

/**
 * Format a binding for display
 */
export function formatBinding(binding: KeyBinding): string {
  const mods = binding.modifiers
    .filter((m) => m !== "none")
    .sort((a, b) => (MODIFIER_ORDER[a] ?? 99) - (MODIFIER_ORDER[b] ?? 99))
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1));

  const keyDisplay = formatKeyDisplay(binding.key);

  return mods.length > 0 ? `${mods.join("+")}+${keyDisplay}` : keyDisplay;
}

/**
 * Format a single key for display
 */
function formatKeyDisplay(key: string): string {
  const displayNames: Record<string, string> = {
    escape: "Esc",
    enter: "Enter",
    backspace: "Backspace",
    tab: "Tab",
    space: "Space",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    home: "Home",
    end: "End",
    pageup: "PgUp",
    pagedown: "PgDn",
    insert: "Ins",
    delete: "Del",
  };

  if (displayNames[key]) {
    return displayNames[key];
  }

  // F keys
  if (key.match(/^f\d+$/)) {
    return key.toUpperCase();
  }

  // Single letter/number
  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
}

/**
 * Calculate priority for a binding
 * Higher priority = checked first
 */
export function calculatePriority(binding: KeyBinding): number {
  // Base priority from binding
  let priority = binding.priority ?? 50;

  // Boost for specific context
  if (binding.context && binding.context !== "global") {
    priority += 10;
  }

  // Boost for modifiers (more specific = higher priority)
  priority += binding.modifiers.filter((m) => m !== "none").length * 5;

  return priority;
}
