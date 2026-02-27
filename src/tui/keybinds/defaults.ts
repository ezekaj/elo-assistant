/**
 * Default Keybindings
 *
 * Default keybinding configuration matching current TUI behavior.
 */

import type { KeyBinding, KeybindProfile } from "./types.js";

/**
 * Default keybindings (current hardcoded behavior)
 */
export const DEFAULT_BINDINGS: KeyBinding[] = [
  // ============================================================================
  // INPUT CONTROL
  // ============================================================================

  {
    id: "submit",
    key: "enter",
    modifiers: [],
    action: "submit",
    description: "Send message",
    priority: 100,
    context: "input",
  },

  {
    id: "abort",
    key: "c",
    modifiers: ["ctrl"],
    action: "abort",
    description: "Cancel/abort operation",
    priority: 100,
  },

  {
    id: "clear-line",
    key: "u",
    modifiers: ["ctrl"],
    action: "clear-line",
    description: "Clear input line",
    priority: 50,
    context: "input",
  },

  {
    id: "clear-screen",
    key: "l",
    modifiers: ["ctrl"],
    action: "clear-screen",
    description: "Clear screen",
    priority: 50,
  },

  {
    id: "quit",
    key: "d",
    modifiers: ["ctrl"],
    action: "quit",
    description: "Exit (when line empty)",
    priority: 40,
    context: "input",
  },

  // ============================================================================
  // HISTORY
  // ============================================================================

  {
    id: "history-prev",
    key: "p",
    modifiers: ["ctrl"],
    action: "history-prev",
    description: "Previous history item",
    priority: 50,
    context: "input",
  },

  {
    id: "history-next",
    key: "n",
    modifiers: ["ctrl"],
    action: "history-next",
    description: "Next history item",
    priority: 50,
    context: "input",
  },

  {
    id: "history-up",
    key: "up",
    modifiers: [],
    action: "history-prev",
    description: "Previous history (arrow)",
    priority: 60,
    context: "input",
  },

  {
    id: "history-down",
    key: "down",
    modifiers: [],
    action: "history-next",
    description: "Next history (arrow)",
    priority: 60,
    context: "input",
  },

  // ============================================================================
  // CURSOR MOVEMENT
  // ============================================================================

  {
    id: "cursor-start",
    key: "a",
    modifiers: ["ctrl"],
    action: "cursor-start",
    description: "Move to line start",
    priority: 50,
    context: "input",
  },

  {
    id: "cursor-end",
    key: "e",
    modifiers: ["ctrl"],
    action: "cursor-end",
    description: "Move to line end",
    priority: 50,
    context: "input",
  },

  {
    id: "cursor-word-left",
    key: "b",
    modifiers: ["alt"],
    action: "cursor-word-left",
    description: "Move word left",
    priority: 50,
    context: "input",
  },

  {
    id: "cursor-word-right",
    key: "f",
    modifiers: ["alt"],
    action: "cursor-word-right",
    description: "Move word right",
    priority: 50,
    context: "input",
  },

  {
    id: "cursor-left",
    key: "left",
    modifiers: [],
    action: "cursor-left",
    description: "Move left",
    priority: 50,
    context: "input",
  },

  {
    id: "cursor-right",
    key: "right",
    modifiers: [],
    action: "cursor-right",
    description: "Move right",
    priority: 50,
    context: "input",
  },

  // ============================================================================
  // EDITING
  // ============================================================================

  {
    id: "delete-char",
    key: "d",
    modifiers: [],
    action: "delete-char",
    description: "Delete character",
    priority: 50,
    context: "input",
  },

  {
    id: "backspace",
    key: "backspace",
    modifiers: [],
    action: "delete-char",
    description: "Delete previous character",
    priority: 50,
    context: "input",
  },

  {
    id: "delete-word",
    key: "w",
    modifiers: ["ctrl"],
    action: "delete-word",
    description: "Delete previous word",
    priority: 50,
    context: "input",
  },

  {
    id: "delete-line",
    key: "k",
    modifiers: ["ctrl"],
    action: "delete-line",
    description: "Delete to end of line",
    priority: 50,
    context: "input",
  },

  // ============================================================================
  // AUTOCOMPLETE
  // ============================================================================

  {
    id: "autocomplete-next",
    key: "tab",
    modifiers: [],
    action: "autocomplete-next",
    description: "Next autocomplete suggestion",
    priority: 80,
    context: "autocomplete",
  },

  {
    id: "autocomplete-prev",
    key: "tab",
    modifiers: ["shift"],
    action: "autocomplete-prev",
    description: "Previous autocomplete suggestion",
    priority: 80,
    context: "autocomplete",
  },

  {
    id: "autocomplete-cancel",
    key: "escape",
    modifiers: [],
    action: "autocomplete-cancel",
    description: "Cancel autocomplete",
    priority: 90,
    context: "autocomplete",
  },

  {
    id: "autocomplete-accept",
    key: "enter",
    modifiers: [],
    action: "autocomplete-accept",
    description: "Accept suggestion",
    priority: 90,
    context: "autocomplete",
  },

  // ============================================================================
  // TUI CONTROL
  // ============================================================================

  {
    id: "toggle-help",
    key: "g",
    modifiers: ["ctrl"],
    action: "toggle-help",
    description: "Toggle help display",
    priority: 50,
  },

  {
    id: "refresh",
    key: "r",
    modifiers: ["ctrl"],
    action: "refresh",
    description: "Refresh display",
    priority: 50,
  },

  // ============================================================================
  // VIM MODE
  // ============================================================================

  {
    id: "vim-toggle",
    key: "escape",
    modifiers: [],
    action: "vim-toggle",
    description: "Toggle vim mode (when line empty)",
    priority: 30,
    context: "input",
  },

  // ============================================================================
  // SESSION MANAGEMENT (for future use)
  // ============================================================================

  {
    id: "session-prev",
    key: "o",
    modifiers: ["ctrl"],
    action: "session-prev",
    description: "Previous session",
    priority: 50,
  },

  {
    id: "session-next",
    key: "p",
    modifiers: ["ctrl"],
    action: "session-next",
    description: "Next session",
    priority: 50,
  },

  {
    id: "session-switch",
    key: "t",
    modifiers: ["ctrl"],
    action: "session-switch",
    description: "Switch session",
    priority: 50,
  },
];

/**
 * Default profile
 */
export const DEFAULT_PROFILE: KeybindProfile = {
  name: "default",
  description: "Default OpenClaw keybindings",
  builtin: true,
  bindings: DEFAULT_BINDINGS,
};

/**
 * Generate unique binding ID
 */
export function generateBindingId(action: string, key: string, modifiers: string[]): string {
  const modStr = modifiers.length > 0 ? modifiers.join("+") + "+" : "";
  const normalizedKey = key.toLowerCase();
  return `${action}:${modStr}${normalizedKey}`;
}

/**
 * Validate binding ID format
 */
export function isValidBindingId(id: string): boolean {
  return /^[\w-]+:(?:(?:ctrl|alt|shift|meta)\+)*[\w-]+$/.test(id);
}

/**
 * Create a keybinding from parts
 */
export function createBinding(
  action: string,
  key: string,
  modifiers: string[] = [],
  options: Partial<KeyBinding> = {},
): KeyBinding {
  return {
    id: generateBindingId(action, key, modifiers),
    key: key.toLowerCase(),
    modifiers: modifiers as any,
    action: action as any,
    description: options.description ?? action,
    priority: options.priority ?? 50,
    context: options.context,
    enabled: options.enabled ?? true,
    ...options,
  };
}

// ============================================================================
// ACTION DESCRIPTIONS
// ============================================================================

/**
 * Human-readable descriptions for all actions
 */
export const ACTION_DESCRIPTIONS: Record<string, string> = {
  // Input control
  submit: "Send message",
  abort: "Cancel/abort operation",
  "clear-line": "Clear input line",
  "clear-screen": "Clear screen",
  quit: "Exit application",

  // History
  "history-prev": "Previous history item",
  "history-next": "Next history item",
  "history-search": "Search history",

  // Cursor movement
  "cursor-left": "Move cursor left",
  "cursor-right": "Move cursor right",
  "cursor-start": "Move to line start",
  "cursor-end": "Move to line end",
  "cursor-word-left": "Move word left",
  "cursor-word-right": "Move word right",

  // Editing
  "delete-char": "Delete character",
  "delete-word": "Delete word",
  "delete-line": "Delete line",
  "yank-line": "Yank (copy) line",
  undo: "Undo",
  redo: "Redo",

  // Autocomplete
  "autocomplete-trigger": "Trigger autocomplete",
  "autocomplete-next": "Next suggestion",
  "autocomplete-prev": "Previous suggestion",
  "autocomplete-cancel": "Cancel autocomplete",
  "autocomplete-accept": "Accept suggestion",

  // Vim mode
  "vim-enable": "Enable vim mode",
  "vim-disable": "Disable vim mode",
  "vim-toggle": "Toggle vim mode",
  "vim-normal-mode": "Vim normal mode",
  "vim-insert-mode": "Vim insert mode",
  "vim-visual-mode": "Vim visual mode",

  // Sessions
  "session-new": "New session",
  "session-next": "Next session",
  "session-prev": "Previous session",
  "session-switch": "Switch session",

  // TUI control
  "toggle-verbose": "Toggle verbose mode",
  "toggle-reasoning": "Toggle reasoning mode",
  "toggle-help": "Toggle help",
  refresh: "Refresh display",

  // Misc
  copy: "Copy",
  paste: "Paste",
  "select-all": "Select all",
};

// ============================================================================
// PROFILES
// ============================================================================

/**
 * All built-in profiles
 */
export const PROFILES: Record<string, KeybindProfile> = {
  default: DEFAULT_PROFILE,

  // Vim profile - enhanced with vim-style navigation
  vim: {
    name: "vim",
    description: "Vim-style keybindings with enhanced navigation",
    builtin: true,
    bindings: [
      // Keep core bindings from default
      ...DEFAULT_BINDINGS.filter((b) =>
        [
          "submit",
          "abort",
          "clear-screen",
          "autocomplete-next",
          "autocomplete-prev",
          "autocomplete-cancel",
          "autocomplete-accept",
        ].includes(b.action),
      ),

      // Vim-specific cursor movement
      {
        id: "cursor-left-vim",
        key: "h",
        modifiers: [],
        action: "cursor-left",
        description: "Move left (vim)",
        priority: 80,
        context: "vim-normal",
      },
      {
        id: "cursor-down-vim",
        key: "j",
        modifiers: [],
        action: "history-next",
        description: "Next history (vim)",
        priority: 80,
        context: "vim-normal",
      },
      {
        id: "cursor-up-vim",
        key: "k",
        modifiers: [],
        action: "history-prev",
        description: "Previous history (vim)",
        priority: 80,
        context: "vim-normal",
      },
      {
        id: "cursor-right-vim",
        key: "l",
        modifiers: [],
        action: "cursor-right",
        description: "Move right (vim)",
        priority: 80,
        context: "vim-normal",
      },

      // Word movement
      {
        id: "word-forward",
        key: "w",
        modifiers: [],
        action: "cursor-word-right",
        description: "Word forward",
        priority: 80,
        context: "vim-normal",
      },
      {
        id: "word-back",
        key: "b",
        modifiers: [],
        action: "cursor-word-left",
        description: "Word back",
        priority: 80,
        context: "vim-normal",
      },

      // Insert mode
      {
        id: "insert-mode",
        key: "i",
        modifiers: [],
        action: "vim-insert-mode",
        description: "Enter insert mode",
        priority: 90,
        context: "vim-normal",
      },
      {
        id: "normal-mode",
        key: "escape",
        modifiers: [],
        action: "vim-normal-mode",
        description: "Normal mode",
        priority: 100,
        context: "vim-insert",
      },
    ],
  },

  // Emacs profile - Emacs-style editing
  emacs: {
    name: "emacs",
    description: "Emacs-style keybindings",
    builtin: true,
    bindings: [
      // Input control
      {
        id: "submit",
        key: "enter",
        modifiers: [],
        action: "submit",
        description: "Send message",
        priority: 100,
        context: "input",
      },
      {
        id: "abort",
        key: "g",
        modifiers: ["ctrl"],
        action: "abort",
        description: "Quit (C-g)",
        priority: 100,
      },

      // Cursor movement
      {
        id: "forward-char",
        key: "f",
        modifiers: ["ctrl"],
        action: "cursor-right",
        description: "Forward char (C-f)",
        priority: 80,
        context: "input",
      },
      {
        id: "backward-char",
        key: "b",
        modifiers: ["ctrl"],
        action: "cursor-left",
        description: "Backward char (C-b)",
        priority: 80,
        context: "input",
      },
      {
        id: "forward-word",
        key: "f",
        modifiers: ["alt"],
        action: "cursor-word-right",
        description: "Forward word (M-f)",
        priority: 80,
        context: "input",
      },
      {
        id: "backward-word",
        key: "b",
        modifiers: ["alt"],
        action: "cursor-word-left",
        description: "Backward word (M-b)",
        priority: 80,
        context: "input",
      },
      {
        id: "line-start",
        key: "a",
        modifiers: ["ctrl"],
        action: "cursor-start",
        description: "Line start (C-a)",
        priority: 80,
        context: "input",
      },
      {
        id: "line-end",
        key: "e",
        modifiers: ["ctrl"],
        action: "cursor-end",
        description: "Line end (C-e)",
        priority: 80,
        context: "input",
      },

      // Editing
      {
        id: "delete-char",
        key: "d",
        modifiers: ["ctrl"],
        action: "delete-char",
        description: "Delete char (C-d)",
        priority: 80,
        context: "input",
      },
      {
        id: "kill-word",
        key: "d",
        modifiers: ["alt"],
        action: "delete-word",
        description: "Kill word (M-d)",
        priority: 80,
        context: "input",
      },
      {
        id: "kill-line",
        key: "k",
        modifiers: ["ctrl"],
        action: "delete-line",
        description: "Kill line (C-k)",
        priority: 80,
        context: "input",
      },

      // History
      {
        id: "history-prev",
        key: "p",
        modifiers: ["ctrl"],
        action: "history-prev",
        description: "Previous history (C-p)",
        priority: 80,
        context: "input",
      },
      {
        id: "history-next",
        key: "n",
        modifiers: ["ctrl"],
        action: "history-next",
        description: "Next history (C-n)",
        priority: 80,
        context: "input",
      },

      // Misc
      {
        id: "refresh",
        key: "l",
        modifiers: ["ctrl"],
        action: "clear-screen",
        description: "Redraw (C-l)",
        priority: 50,
      },
      {
        id: "quit",
        key: "d",
        modifiers: ["ctrl"],
        action: "quit",
        description: "Exit (C-d)",
        priority: 40,
        context: "input",
      },
    ],
  },
};
