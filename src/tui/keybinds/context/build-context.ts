/**
 * ActionContext Builder
 *
 * Factory for creating ActionContext instances that wire together
 * all the adapters needed for keybinding actions.
 */

import type { Editor, TUI } from "@mariozechner/pi-tui";
import type { ActionContext } from "../actions.js";
import type { KeybindingManager } from "../manager.js";
import type { KeybindContext } from "../types.js";
import { getClipboardAdapter } from "./clipboard-adapter.js";
import { EditorAdapter } from "./editor-adapter.js";
import { TUIAdapter, type ChatLog, type GatewayClient } from "./tui-adapter.js";

/**
 * Vim mode state accessor.
 */
export interface VimModeState {
  isEnabled: () => boolean;
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  getMode: () => "NORMAL" | "INSERT" | "VISUAL";
  setMode: (mode: "NORMAL" | "INSERT" | "VISUAL") => void;
}

/**
 * Options for building ActionContext.
 */
export interface BuildContextOptions {
  /** The Editor component */
  editor: Editor;
  /** The TUI instance */
  tui: TUI;
  /** The chat log for messages */
  chatLog: ChatLog;
  /** The gateway client for API calls */
  client: GatewayClient;
  /** Get current session key */
  getSessionKey: () => string;
  /** Refresh session info after changes */
  refreshSessionInfo: () => Promise<void>;
  /** Keybinding manager for context updates */
  keybindManager: KeybindingManager;
  /** Vim mode state */
  vimState: VimModeState;
  /** Get current verbose level */
  getVerboseLevel: () => string;
  /** Get current reasoning level */
  getReasoningLevel: () => string;
  /** Session management callbacks */
  sessionCallbacks: {
    setSession: (key: string) => void;
    openSessionSelector: () => void;
  };
  /** Selector callbacks */
  selectors?: {
    openModelSelector?: () => void;
    openAgentSelector?: () => void;
  };
  /** Help callback */
  showHelp?: () => void;
  helpTextGenerator?: () => string;
  /** Abort callback */
  abortActive: () => void;
  /** Quit callback */
  onQuit: () => void;
}

/**
 * Build an ActionContext from the given options.
 *
 * This creates a fully-wired ActionContext that connects the keybinding
 * system to all the TUI components.
 */
export function buildActionContext(options: BuildContextOptions): ActionContext {
  const {
    editor: piTuiEditor,
    tui,
    chatLog,
    client,
    getSessionKey,
    refreshSessionInfo,
    keybindManager,
    vimState,
    getVerboseLevel,
    getReasoningLevel,
    sessionCallbacks,
    selectors,
    showHelp,
    helpTextGenerator,
    abortActive,
    onQuit,
  } = options;

  // Create adapters
  const editorAdapter = new EditorAdapter(piTuiEditor);
  const clipboardAdapter = getClipboardAdapter();
  const tuiAdapter = new TUIAdapter({
    tui,
    chatLog,
    client,
    getSessionKey,
    refreshSessionInfo,
    getVerboseLevel,
    getReasoningLevel,
    openModelSelector: selectors?.openModelSelector,
    openAgentSelector: selectors?.openAgentSelector,
    openSessionSelector: sessionCallbacks.openSessionSelector,
    setSession: sessionCallbacks.setSession,
    showHelp,
    helpTextGenerator,
    abortActive,
    onQuit,
  });

  // Build the ActionContext
  const context: ActionContext = {
    // Editor/input state
    editor: {
      getText: () => editorAdapter.getText(),
      setText: (text) => editorAdapter.setText(text),
      clear: () => editorAdapter.clear(),
      getCursor: () => editorAdapter.getCursorOffset(),
      setCursor: (pos) => editorAdapter.setCursorOffset(pos),
      insert: (text) => editorAdapter.insert(text),
      delete: (start, end) => editorAdapter.delete(start, end),
    },

    // Command history
    history: {
      prev: () => editorAdapter.historyPrev(),
      next: () => editorAdapter.historyNext(),
      search: (query) => editorAdapter.historySearch(query),
    },

    // Autocomplete state
    autocomplete: {
      isActive: () => editorAdapter.isAutocompleteActive(),
      next: () => editorAdapter.autocompleteNext(),
      prev: () => editorAdapter.autocompletePrev(),
      cancel: () => editorAdapter.autocompleteCancel(),
      accept: () => editorAdapter.autocompleteAccept(),
      trigger: () => {
        // Autocomplete is triggered by typing; no programmatic trigger available
      },
    },

    // Session management
    sessions: {
      new: () => tuiAdapter.newSession(),
      next: () => tuiAdapter.nextSession(),
      prev: () => tuiAdapter.prevSession(),
      switch: (key) => tuiAdapter.switchSession(key),
    },

    // Vim mode
    vim: {
      isEnabled: () => vimState.isEnabled(),
      enable: () => {
        vimState.enable();
        tuiAdapter.logSystem("✅ Vim mode ENABLED");
      },
      disable: () => {
        vimState.disable();
        tuiAdapter.logSystem("✅ Vim mode DISABLED. Using standard keyboard bindings.");
      },
      toggle: () => vimState.toggle(),
      getMode: () => {
        const mode = vimState.getMode();
        return mode === "NORMAL" ? "normal" : mode === "VISUAL" ? "visual" : "insert";
      },
      setMode: (mode) => {
        vimState.setMode(mode === "normal" ? "NORMAL" : mode === "visual" ? "VISUAL" : "INSERT");
        // Update keybinding context
        const ctx: KeybindContext =
          mode === "normal" ? "vim-normal" : mode === "visual" ? "vim-visual" : "vim-insert";
        keybindManager.setContext(ctx);
      },
    },

    // TUI control
    tui: {
      clear: () => tuiAdapter.clear(),
      refresh: () => tuiAdapter.refresh(),
      toggleVerbose: () => tuiAdapter.toggleVerbose(),
      toggleReasoning: () => tuiAdapter.toggleReasoning(),
      toggleHelp: () => tuiAdapter.toggleHelp(),
      quit: () => tuiAdapter.quit(),
      setContext: (ctx) => keybindManager.setContext(ctx),
    },

    // Clipboard
    clipboard: {
      copy: () => {
        const text = editorAdapter.getText();
        clipboardAdapter.copy(text);
      },
      paste: () => clipboardAdapter.paste(),
    },

    // Core actions
    submit: () => editorAdapter.submit(),
    abort: () => tuiAdapter.abort(),

    // Logging
    log: {
      system: (msg) => tuiAdapter.logSystem(msg),
      error: (msg) => tuiAdapter.logError(msg),
    },
  };

  return context;
}

/**
 * Create a minimal ActionContext for testing.
 */
export function createMockActionContext(overrides: Partial<ActionContext> = {}): ActionContext {
  const mockEditor = {
    getText: () => "",
    setText: () => {},
    clear: () => {},
    getCursor: () => 0,
    setCursor: () => {},
    insert: () => {},
    delete: () => {},
  };

  const mockHistory = {
    prev: () => undefined,
    next: () => undefined,
    search: () => undefined,
  };

  const mockAutocomplete = {
    isActive: () => false,
    next: () => {},
    prev: () => {},
    cancel: () => {},
    accept: () => {},
    trigger: () => {},
  };

  const mockSessions = {
    new: () => {},
    next: () => {},
    prev: () => {},
    switch: () => {},
  };

  const mockVim = {
    isEnabled: () => false,
    enable: () => {},
    disable: () => {},
    toggle: () => {},
    getMode: () => "insert" as const,
    setMode: () => {},
  };

  const mockTui = {
    clear: () => {},
    refresh: () => {},
    toggleVerbose: () => {},
    toggleReasoning: () => {},
    toggleHelp: () => {},
    quit: () => {},
    setContext: () => {},
  };

  const mockClipboard = {
    copy: () => {},
    paste: async () => undefined,
  };

  const mockLog = {
    system: () => {},
    error: () => {},
  };

  return {
    editor: { ...mockEditor, ...overrides.editor },
    history: { ...mockHistory, ...overrides.history },
    autocomplete: { ...mockAutocomplete, ...overrides.autocomplete },
    sessions: { ...mockSessions, ...overrides.sessions },
    vim: { ...mockVim, ...overrides.vim },
    tui: { ...mockTui, ...overrides.tui },
    clipboard: { ...mockClipboard, ...overrides.clipboard },
    submit: overrides.submit ?? (() => {}),
    abort: overrides.abort ?? (() => {}),
    log: { ...mockLog, ...overrides.log },
  };
}
