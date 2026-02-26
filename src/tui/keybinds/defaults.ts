/**
 * Default Keybinding Profiles
 *
 * Predefined profiles for different editing styles.
 */

import type { KeyBinding, KeybindProfile, KeyAction } from "./types.js";

// ============================================================================
// DEFAULT PROFILE (Standard bindings)
// ============================================================================

export const DEFAULT_BINDINGS: KeyBinding[] = [
  // ---- Input ----
  { key: "enter", modifiers: [], action: "submit", description: "Send message", context: "input" },
  {
    key: "enter",
    modifiers: ["shift"],
    action: "submit-alt",
    description: "Send with newlines",
    context: "input",
  },
  {
    key: "enter",
    modifiers: ["alt"],
    action: "submit-alt",
    description: "Send with newlines",
    context: "input",
  },

  // ---- Abort/Cancel ----
  { key: "c", modifiers: ["ctrl"], action: "abort", description: "Abort/Cancel", context: "input" },
  {
    key: "escape",
    modifiers: [],
    action: "abort",
    description: "Cancel/Escape",
    context: "always",
  },
  {
    key: "d",
    modifiers: ["ctrl"],
    action: "delete-line",
    description: "Delete line (when empty)",
    context: "input",
  },

  // ---- History ----
  {
    key: "up",
    modifiers: [],
    action: "history-up",
    description: "Previous command",
    context: "input",
  },
  {
    key: "down",
    modifiers: [],
    action: "history-down",
    description: "Next command",
    context: "input",
  },
  {
    key: "p",
    modifiers: ["ctrl"],
    action: "history-up",
    description: "Previous command",
    context: "input",
  },
  {
    key: "n",
    modifiers: ["ctrl"],
    action: "history-down",
    description: "Next command",
    context: "input",
  },
  {
    key: "r",
    modifiers: ["ctrl"],
    action: "history-search",
    description: "Search history",
    context: "input",
  },

  // ---- Cursor Movement ----
  { key: "left", modifiers: [], action: "cursor-left", description: "Move left", context: "input" },
  {
    key: "right",
    modifiers: [],
    action: "cursor-right",
    description: "Move right",
    context: "input",
  },
  {
    key: "home",
    modifiers: [],
    action: "cursor-start",
    description: "Start of line",
    context: "input",
  },
  { key: "end", modifiers: [], action: "cursor-end", description: "End of line", context: "input" },
  {
    key: "a",
    modifiers: ["ctrl"],
    action: "cursor-start",
    description: "Start of line",
    context: "input",
  },
  {
    key: "e",
    modifiers: ["ctrl"],
    action: "cursor-end",
    description: "End of line",
    context: "input",
  },
  {
    key: "b",
    modifiers: ["ctrl"],
    action: "cursor-left",
    description: "Move left",
    context: "input",
  },
  {
    key: "f",
    modifiers: ["ctrl"],
    action: "cursor-right",
    description: "Move right",
    context: "input",
  },
  {
    key: "b",
    modifiers: ["alt"],
    action: "word-back",
    description: "Back one word",
    context: "input",
  },
  {
    key: "f",
    modifiers: ["alt"],
    action: "word-forward",
    description: "Forward one word",
    context: "input",
  },

  // ---- Editing ----
  {
    key: "backspace",
    modifiers: ["alt"],
    action: "delete-word",
    description: "Delete word",
    context: "input",
  },
  {
    key: "w",
    modifiers: ["ctrl"],
    action: "delete-word",
    description: "Delete word",
    context: "input",
  },
  {
    key: "k",
    modifiers: ["ctrl"],
    action: "delete-to-end",
    description: "Delete to end",
    context: "input",
  },
  {
    key: "u",
    modifiers: ["ctrl"],
    action: "delete-to-start",
    description: "Delete to start",
    context: "input",
  },
  {
    key: "t",
    modifiers: ["ctrl"],
    action: "transpose",
    description: "Swap characters",
    context: "input",
  },
  {
    key: "y",
    modifiers: ["ctrl"],
    action: "yank",
    description: "Paste last killed",
    context: "input",
  },

  // ---- Autocomplete ----
  {
    key: "tab",
    modifiers: [],
    action: "autocomplete",
    description: "Autocomplete",
    context: "input",
  },
  {
    key: "tab",
    modifiers: ["shift"],
    action: "autocomplete-prev",
    description: "Previous suggestion",
    context: "autocomplete",
  },
  {
    key: "escape",
    modifiers: [],
    action: "autocomplete-cancel",
    description: "Cancel autocomplete",
    context: "autocomplete",
  },

  // ---- Sessions ----
  {
    key: "n",
    modifiers: ["ctrl"],
    action: "new-session",
    description: "New session",
    context: "always",
  },
  {
    key: "o",
    modifiers: ["ctrl"],
    action: "switch-session",
    description: "Switch session",
    context: "always",
  },
  {
    key: "w",
    modifiers: ["ctrl"],
    action: "close-session",
    description: "Close session",
    context: "always",
  },

  // ---- Navigation ----
  {
    key: "l",
    modifiers: ["ctrl"],
    action: "focus-output",
    description: "Focus output",
    context: "always",
  },
  {
    key: "i",
    modifiers: ["ctrl"],
    action: "focus-input",
    description: "Focus input",
    context: "always",
  },
  {
    key: "pageup",
    modifiers: [],
    action: "scroll-up",
    description: "Scroll up",
    context: "output",
  },
  {
    key: "pagedown",
    modifiers: [],
    action: "scroll-down",
    description: "Scroll down",
    context: "output",
  },
  {
    key: "up",
    modifiers: ["ctrl"],
    action: "scroll-up",
    description: "Scroll up",
    context: "output",
  },
  {
    key: "down",
    modifiers: ["ctrl"],
    action: "scroll-down",
    description: "Scroll down",
    context: "output",
  },

  // ---- Tools & Actions ----
  {
    key: "s",
    modifiers: ["ctrl"],
    action: "show-status",
    description: "Show status",
    context: "always",
  },
  {
    key: "h",
    modifiers: ["ctrl"],
    action: "show-help",
    description: "Show help",
    context: "always",
  },
  {
    key: "/",
    modifiers: ["ctrl"],
    action: "show-commands",
    description: "Show commands",
    context: "always",
  },
  {
    key: "g",
    modifiers: ["ctrl"],
    action: "show-status",
    description: "Show status/Go to",
    context: "always",
  },
  {
    key: "t",
    modifiers: ["ctrl"],
    action: "switch-session",
    description: "Switch session",
    context: "always",
  },
  {
    key: "p",
    modifiers: ["ctrl"],
    action: "switch-session",
    description: "Switch session",
    context: "always",
  },

  // ---- Vim Toggle ----
  {
    key: "escape",
    modifiers: ["ctrl"],
    action: "toggle-vim",
    description: "Toggle vim mode",
    context: "always",
  },
];

// ============================================================================
// VIM PROFILE (Vim-style bindings)
// ============================================================================

export const VIM_BINDINGS: KeyBinding[] = [
  // Extend default
  ...DEFAULT_BINDINGS,

  // Vim-specific overrides
  // Note: Vim mode handles h/j/k/l internally, these are for when vim is off
];

// ============================================================================
// EMACS PROFILE (Emacs-style bindings)
// ============================================================================

export const EMACS_BINDINGS: KeyBinding[] = [
  // Input
  { key: "enter", modifiers: [], action: "submit", description: "Send message", context: "input" },
  {
    key: "enter",
    modifiers: ["ctrl"],
    action: "submit-alt",
    description: "Newline",
    context: "input",
  },

  // Abort
  {
    key: "g",
    modifiers: ["ctrl"],
    action: "abort",
    description: "Abort/Cancel",
    context: "always",
  },
  {
    key: "c",
    modifiers: ["ctrl"],
    action: "abort",
    description: "Abort",
    context: "always",
    protected: true,
  },

  // History (Emacs style uses M-p/M-n)
  {
    key: "p",
    modifiers: ["alt"],
    action: "history-up",
    description: "Previous command",
    context: "input",
  },
  {
    key: "n",
    modifiers: ["alt"],
    action: "history-down",
    description: "Next command",
    context: "input",
  },
  {
    key: "r",
    modifiers: ["alt"],
    action: "history-search",
    description: "Search history",
    context: "input",
  },

  // Cursor (Emacs style)
  {
    key: "b",
    modifiers: ["ctrl"],
    action: "cursor-left",
    description: "Backward char",
    context: "input",
  },
  {
    key: "f",
    modifiers: ["ctrl"],
    action: "cursor-right",
    description: "Forward char",
    context: "input",
  },
  {
    key: "a",
    modifiers: ["ctrl"],
    action: "cursor-start",
    description: "Start of line",
    context: "input",
  },
  {
    key: "e",
    modifiers: ["ctrl"],
    action: "cursor-end",
    description: "End of line",
    context: "input",
  },
  {
    key: "b",
    modifiers: ["alt"],
    action: "word-back",
    description: "Backward word",
    context: "input",
  },
  {
    key: "f",
    modifiers: ["alt"],
    action: "word-forward",
    description: "Forward word",
    context: "input",
  },
  {
    key: "m",
    modifiers: ["alt"],
    action: "cursor-start",
    description: "First non-whitespace",
    context: "input",
  },

  // Editing (Emacs style)
  {
    key: "d",
    modifiers: ["ctrl"],
    action: "delete-to-end",
    description: "Delete char",
    context: "input",
  },
  {
    key: "d",
    modifiers: ["alt"],
    action: "delete-word",
    description: "Delete word",
    context: "input",
  },
  {
    key: "k",
    modifiers: ["ctrl"],
    action: "delete-to-end",
    description: "Kill line",
    context: "input",
  },
  {
    key: "u",
    modifiers: ["ctrl"],
    action: "delete-to-start",
    description: "Kill to start",
    context: "input",
  },
  {
    key: "w",
    modifiers: ["alt"],
    action: "delete-word",
    description: "Kill word",
    context: "input",
  },
  {
    key: "t",
    modifiers: ["ctrl"],
    action: "transpose",
    description: "Transpose chars",
    context: "input",
  },
  { key: "y", modifiers: ["ctrl"], action: "yank", description: "Yank", context: "input" },

  // Navigation
  {
    key: "v",
    modifiers: ["alt"],
    action: "scroll-down",
    description: "Page down",
    context: "output",
  },
  { key: "v", modifiers: ["ctrl"], action: "scroll-up", description: "Page up", context: "output" },
  {
    key: "<",
    modifiers: ["alt"],
    action: "scroll-top",
    description: "Scroll to top",
    context: "output",
  },
  {
    key: ">",
    modifiers: ["alt"],
    action: "scroll-bottom",
    description: "Scroll to bottom",
    context: "output",
  },

  // Sessions
  {
    key: "n",
    modifiers: ["alt"],
    action: "new-session",
    description: "New session",
    context: "always",
  },
  {
    key: "o",
    modifiers: ["alt"],
    action: "switch-session",
    description: "Switch session",
    context: "always",
  },

  // Help
  { key: "h", modifiers: ["ctrl"], action: "show-help", description: "Help", context: "always" },
];

// ============================================================================
// PROFILES
// ============================================================================

export const PROFILES: Record<string, KeybindProfile> = {
  default: {
    name: "default",
    description: "Standard keybindings (Ctrl+C, Ctrl+D, arrows, etc.)",
    bindings: DEFAULT_BINDINGS,
  },

  vim: {
    name: "vim",
    description: "Vim-style keybindings with enhanced navigation",
    extends: "default",
    bindings: VIM_BINDINGS,
  },

  emacs: {
    name: "emacs",
    description: "Emacs-style keybindings (Ctrl+A/E/F/B, Alt+M, etc.)",
    bindings: EMACS_BINDINGS,
  },
};

// ============================================================================
// ACTION DESCRIPTIONS
// ============================================================================

export const ACTION_DESCRIPTIONS: Record<KeyAction, string> = {
  submit: "Send message",
  "submit-alt": "Send with newlines preserved",
  abort: "Cancel current operation",
  clear: "Clear input field",
  "delete-line": "Delete current line",

  "history-up": "Previous command in history",
  "history-down": "Next command in history",
  "history-search": "Search command history",

  "cursor-left": "Move cursor left",
  "cursor-right": "Move cursor right",
  "cursor-start": "Move to start of line",
  "cursor-end": "Move to end of line",
  "word-back": "Move back one word",
  "word-forward": "Move forward one word",

  "delete-word": "Delete word",
  "delete-to-end": "Delete to end of line",
  "delete-to-start": "Delete to start of line",
  transpose: "Transpose characters",
  yank: "Paste last killed text",

  autocomplete: "Trigger autocomplete",
  "autocomplete-next": "Next autocomplete suggestion",
  "autocomplete-prev": "Previous autocomplete suggestion",
  "autocomplete-cancel": "Cancel autocomplete",

  "new-session": "Create new session",
  "switch-session": "Switch to another session",
  "close-session": "Close current session",

  "focus-input": "Focus input field",
  "focus-output": "Focus output area",
  "scroll-up": "Scroll output up",
  "scroll-down": "Scroll output down",
  "scroll-top": "Scroll to top",
  "scroll-bottom": "Scroll to bottom",

  "toggle-verbose": "Toggle verbose mode",
  "toggle-reasoning": "Toggle reasoning mode",
  "toggle-vim": "Toggle vim mode",
  "show-status": "Show session status",
  "show-help": "Show help",
  "show-commands": "Show available commands",

  copy: "Copy selection",
  paste: "Paste from clipboard",
  "select-all": "Select all",
  undo: "Undo last action",
  redo: "Redo last action",
};
