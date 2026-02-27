/**
 * Keybinding Context Module
 *
 * Provides adapters and builders for creating ActionContext instances
 * that connect the keybinding system to TUI components.
 */

// Editor adapter
export { EditorAdapter, type CursorPosition, type HistoryEntry } from "./editor-adapter.js";

// TUI adapter
export {
  TUIAdapter,
  type ChatLog,
  type GatewayClient,
  type TUIAdapterOptions,
} from "./tui-adapter.js";

// Clipboard adapter
export { ClipboardAdapter, getClipboardAdapter } from "./clipboard-adapter.js";

// Context builder
export {
  buildActionContext,
  createMockActionContext,
  type VimModeState,
  type BuildContextOptions,
} from "./build-context.js";
