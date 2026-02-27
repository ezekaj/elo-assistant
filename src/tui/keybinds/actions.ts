/**
 * Keybinding Actions
 *
 * Executors for keybinding actions.
 */

import type { KeyAction, KeybindContext } from "./types.js";

/**
 * Action context - dependencies needed to execute actions
 *
 * This interface defines all the callbacks and state accessors
 * needed to execute keybinding actions.
 */
export interface ActionContext {
  // Editor/input state
  editor: {
    getText: () => string;
    setText: (text: string) => void;
    clear: () => void;
    getCursor: () => number;
    setCursor: (pos: number) => void;
    insert: (text: string) => void;
    delete: (start: number, end: number) => void;
  };

  // Command history
  history: {
    prev: () => string | undefined;
    next: () => string | undefined;
    search: (query: string) => string | undefined;
  };

  // Autocomplete state
  autocomplete: {
    isActive: () => boolean;
    next: () => void;
    prev: () => void;
    cancel: () => void;
    accept: () => void;
    trigger: () => void;
  };

  // Session management
  sessions: {
    new: () => void;
    next: () => void;
    prev: () => void;
    switch: (key?: string) => void;
  };

  // Vim mode
  vim: {
    isEnabled: () => boolean;
    enable: () => void;
    disable: () => void;
    toggle: () => void;
    getMode: () => "normal" | "insert" | "visual";
    setMode: (mode: "normal" | "insert" | "visual") => void;
  };

  // TUI control
  tui: {
    clear: () => void;
    refresh: () => void;
    toggleVerbose: () => void;
    toggleReasoning: () => void;
    toggleHelp: () => void;
    quit: () => void;
    setContext: (context: KeybindContext) => void;
  };

  // Clipboard (if available)
  clipboard: {
    copy: () => void;
    paste: () => Promise<string | undefined>;
  };

  // Core actions
  submit: () => void;
  abort: () => void;

  // Logging
  log: {
    system: (message: string) => void;
    error: (message: string) => void;
  };
}

/**
 * Execute a keybinding action
 *
 * @param action The action to execute
 * @param ctx The action context with all necessary callbacks
 * @returns true if action was handled, false otherwise
 */
export function executeAction(action: KeyAction, ctx: ActionContext): boolean {
  switch (action) {
    // =========================================================================
    // INPUT CONTROL
    // =========================================================================

    case "submit":
      ctx.submit();
      return true;

    case "abort":
      ctx.abort();
      return true;

    case "clear-line":
      ctx.editor.clear();
      return true;

    case "clear-screen":
      ctx.tui.clear();
      return true;

    case "quit":
      // Only quit if line is empty
      if (ctx.editor.getText().length === 0) {
        ctx.tui.quit();
        return true;
      }
      return false;

    // =========================================================================
    // HISTORY
    // =========================================================================

    case "history-prev": {
      const text = ctx.history.prev();
      if (text !== undefined) {
        ctx.editor.setText(text);
        ctx.editor.setCursor(text.length);
      }
      return true;
    }

    case "history-next": {
      const text = ctx.history.next();
      if (text !== undefined) {
        ctx.editor.setText(text);
        ctx.editor.setCursor(text.length);
      } else {
        ctx.editor.clear();
      }
      return true;
    }

    case "history-search": {
      const text = ctx.editor.getText();
      const result = ctx.history.search(text);
      if (result !== undefined) {
        ctx.editor.setText(result);
        ctx.editor.setCursor(result.length);
      }
      return true;
    }

    // =========================================================================
    // CURSOR MOVEMENT
    // =========================================================================

    case "cursor-left": {
      const pos = ctx.editor.getCursor();
      if (pos > 0) {
        ctx.editor.setCursor(pos - 1);
      }
      return true;
    }

    case "cursor-right": {
      const pos = ctx.editor.getCursor();
      const text = ctx.editor.getText();
      if (pos < text.length) {
        ctx.editor.setCursor(pos + 1);
      }
      return true;
    }

    case "cursor-start":
      ctx.editor.setCursor(0);
      return true;

    case "cursor-end": {
      const text = ctx.editor.getText();
      ctx.editor.setCursor(text.length);
      return true;
    }

    case "cursor-word-left": {
      const text = ctx.editor.getText();
      const pos = ctx.editor.getCursor();
      const newPos = findWordBoundary(text, pos, "left");
      ctx.editor.setCursor(newPos);
      return true;
    }

    case "cursor-word-right": {
      const text = ctx.editor.getText();
      const pos = ctx.editor.getCursor();
      const newPos = findWordBoundary(text, pos, "right");
      ctx.editor.setCursor(newPos);
      return true;
    }

    // =========================================================================
    // EDITING
    // =========================================================================

    case "delete-char": {
      const text = ctx.editor.getText();
      const pos = ctx.editor.getCursor();
      if (pos < text.length) {
        ctx.editor.delete(pos, pos + 1);
      }
      return true;
    }

    case "delete-word": {
      const text = ctx.editor.getText();
      const pos = ctx.editor.getCursor();
      const wordStart = findWordBoundary(text, pos, "left");
      ctx.editor.delete(wordStart, pos);
      ctx.editor.setCursor(wordStart);
      return true;
    }

    case "delete-line":
      ctx.editor.clear();
      return true;

    case "yank-line": {
      const text = ctx.editor.getText();
      // Copy to internal yank buffer (not system clipboard)
      // This is a no-op for now - would need a yank buffer system
      return true;
    }

    case "undo":
      // Not implemented yet - would need undo stack
      return false;

    case "redo":
      // Not implemented yet - would need undo stack
      return false;

    // =========================================================================
    // AUTOCOMPLETE
    // =========================================================================

    case "autocomplete-trigger":
      ctx.autocomplete.trigger();
      return true;

    case "autocomplete-next":
      if (ctx.autocomplete.isActive()) {
        ctx.autocomplete.next();
      }
      return true;

    case "autocomplete-prev":
      if (ctx.autocomplete.isActive()) {
        ctx.autocomplete.prev();
      }
      return true;

    case "autocomplete-cancel":
      if (ctx.autocomplete.isActive()) {
        ctx.autocomplete.cancel();
      }
      return true;

    case "autocomplete-accept":
      if (ctx.autocomplete.isActive()) {
        ctx.autocomplete.accept();
      }
      return true;

    // =========================================================================
    // VIM MODE
    // =========================================================================

    case "vim-enable":
      ctx.vim.enable();
      ctx.log.system("✅ Vim mode ENABLED");
      return true;

    case "vim-disable":
      ctx.vim.disable();
      ctx.log.system("✅ Vim mode DISABLED. Using standard keyboard bindings.");
      return true;

    case "vim-toggle":
      if (ctx.vim.isEnabled()) {
        ctx.vim.disable();
        ctx.log.system("✅ Vim mode DISABLED. Using standard keyboard bindings.");
      } else {
        ctx.vim.enable();
        ctx.log.system("✅ Vim mode ENABLED");
      }
      return true;

    case "vim-normal-mode":
      ctx.vim.setMode("normal");
      ctx.tui.setContext("vim-normal");
      return true;

    case "vim-insert-mode":
      ctx.vim.setMode("insert");
      ctx.tui.setContext("vim-insert");
      return true;

    case "vim-visual-mode":
      ctx.vim.setMode("visual");
      ctx.tui.setContext("vim-visual");
      return true;

    // =========================================================================
    // SESSIONS
    // =========================================================================

    case "session-new":
      ctx.sessions.new();
      return true;

    case "session-next":
      ctx.sessions.next();
      return true;

    case "session-prev":
      ctx.sessions.prev();
      return true;

    case "session-switch":
      ctx.sessions.switch();
      return true;

    // =========================================================================
    // TUI CONTROL
    // =========================================================================

    case "toggle-verbose":
      ctx.tui.toggleVerbose();
      return true;

    case "toggle-reasoning":
      ctx.tui.toggleReasoning();
      return true;

    case "toggle-help":
      ctx.tui.toggleHelp();
      return true;

    case "refresh":
      ctx.tui.refresh();
      return true;

    // =========================================================================
    // CLIPBOARD
    // =========================================================================

    case "copy":
      ctx.clipboard.copy();
      return true;

    case "paste":
      ctx.clipboard.paste().then((text) => {
        if (text) {
          ctx.editor.insert(text);
        }
      });
      return true;

    case "select-all": {
      const text = ctx.editor.getText();
      ctx.editor.setCursor(0);
      // Would need selection support
      return true;
    }

    // =========================================================================
    // UNKNOWN
    // =========================================================================

    default:
      return false;
  }
}

/**
 * Find word boundary in text
 *
 * @param text The text to search
 * @param pos Current position
 * @param direction 'left' or 'right'
 * @returns New position at word boundary
 */
function findWordBoundary(text: string, pos: number, direction: "left" | "right"): number {
  if (direction === "left") {
    // Skip whitespace
    while (pos > 0 && isWhitespace(text[pos - 1])) {
      pos--;
    }
    // Skip word characters
    while (pos > 0 && isWordChar(text[pos - 1])) {
      pos--;
    }
    return pos;
  } else {
    // Skip word characters
    while (pos < text.length && isWordChar(text[pos])) {
      pos++;
    }
    // Skip whitespace
    while (pos < text.length && isWhitespace(text[pos])) {
      pos++;
    }
    return pos;
  }
}

/**
 * Check if character is a word character
 */
function isWordChar(char: string): boolean {
  return /\w/.test(char);
}

/**
 * Check if character is whitespace
 */
function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

/**
 * Check if an action requires the input field to be focused
 */
export function requiresInputContext(action: KeyAction): boolean {
  const inputActions: KeyAction[] = [
    "submit",
    "clear-line",
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
    "paste",
  ];

  return inputActions.includes(action);
}

/**
 * Get human-readable description for an action
 */
export function getActionDescription(action: KeyAction): string {
  const descriptions: Record<KeyAction, string> = {
    submit: "Send message",
    abort: "Cancel/abort operation",
    "clear-line": "Clear input line",
    "clear-screen": "Clear screen",
    "history-prev": "Previous history item",
    "history-next": "Next history item",
    "history-search": "Search history",
    "cursor-left": "Move cursor left",
    "cursor-right": "Move cursor right",
    "cursor-start": "Move to line start",
    "cursor-end": "Move to line end",
    "cursor-word-left": "Move word left",
    "cursor-word-right": "Move word right",
    "delete-char": "Delete character",
    "delete-word": "Delete word",
    "delete-line": "Delete line",
    "yank-line": "Yank (copy) line",
    undo: "Undo",
    redo: "Redo",
    "autocomplete-trigger": "Trigger autocomplete",
    "autocomplete-next": "Next suggestion",
    "autocomplete-prev": "Previous suggestion",
    "autocomplete-cancel": "Cancel autocomplete",
    "autocomplete-accept": "Accept suggestion",
    "vim-enable": "Enable vim mode",
    "vim-disable": "Disable vim mode",
    "vim-toggle": "Toggle vim mode",
    "vim-normal-mode": "Vim normal mode",
    "vim-insert-mode": "Vim insert mode",
    "vim-visual-mode": "Vim visual mode",
    "session-new": "New session",
    "session-next": "Next session",
    "session-prev": "Previous session",
    "session-switch": "Switch session",
    "toggle-verbose": "Toggle verbose mode",
    "toggle-reasoning": "Toggle reasoning mode",
    "toggle-help": "Toggle help",
    refresh: "Refresh display",
    quit: "Quit",
    copy: "Copy",
    paste: "Paste",
    "select-all": "Select all",
  };

  return descriptions[action] ?? action;
}
