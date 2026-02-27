/**
 * Keybinding System
 *
 * Customizable keybindings for the OpenClaw TUI.
 *
 * @example
 * ```typescript
 * import { getKeybindManager } from './keybinds';
 *
 * const manager = getKeybindManager();
 *
 * // Check if input matches an action
 * if (manager.matches(data, 'submit')) {
 *   handleSubmit();
 * }
 * ```
 */

// Types
export type {
  KeyModifier,
  KeyAction,
  KeyBinding,
  KeybindProfile,
  KeybindConfig,
  KeybindContext,
  ParsedKeyEvent,
  KeybindConflict,
  KeybindChangeEvent,
  KeyboardLayout,
  Platform,
} from "./types.js";

export {
  bindingKey,
  parseBinding,
  formatBinding,
  calculatePriority,
  SPECIAL_KEYS,
  MODIFIER_ORDER,
  isKeyAction,
  isKeyModifier,
  isKeybindContext,
  isMacOS,
  isGermanKeyboard,
} from "./types.js";

// Defaults
export {
  DEFAULT_BINDINGS,
  DEFAULT_PROFILE,
  PROFILES,
  ACTION_DESCRIPTIONS,
  generateBindingId,
  isValidBindingId,
  createBinding,
} from "./defaults.js";

// Manager
export {
  KeybindingManager,
  getKeybindingManager,
  resetKeybindingManager,
  createKeybindingManager,
} from "./manager.js";

// Parser
export { KeyParser, keyParser, parseKey } from "./parser.js";

// Actions
export type { ActionContext } from "./actions.js";
export { executeAction, requiresInputContext, getActionDescription } from "./actions.js";

// Config
export {
  getKeybindConfigPath,
  DEFAULT_KEYBIND_CONFIG,
  loadKeybindConfig,
  loadKeybinds,
  saveKeybindConfig,
  saveKeybinds,
  getKeybindConfigSchema,
  QUICK_SETUPS,
} from "./config.js";

// Context (adapters and builders)
export {
  EditorAdapter,
  type CursorPosition,
  type HistoryEntry,
  TUIAdapter,
  type ChatLog,
  type GatewayClient,
  type TUIAdapterOptions,
  ClipboardAdapter,
  getClipboardAdapter,
  buildActionContext,
  createMockActionContext,
  type VimModeState,
  type BuildContextOptions,
} from "./context/index.js";
