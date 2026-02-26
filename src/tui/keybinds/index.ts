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
 *
 * // Register a handler
 * manager.on('abort', (event) => {
 *   console.log('Aborted!');
 *   return true;
 * });
 * ```
 */

// Types
export type {
  KeyModifier,
  KeyAction,
  KeyBinding,
  CompiledBinding,
  KeybindProfile,
  KeybindConfig,
  KeybindEvent,
  KeybindHandler,
} from "./types.js";

export { bindingKey, parseBinding, formatBinding, calculatePriority } from "./types.js";

// Defaults
export {
  DEFAULT_BINDINGS,
  VIM_BINDINGS,
  EMACS_BINDINGS,
  PROFILES,
  ACTION_DESCRIPTIONS,
} from "./defaults.js";

// Manager
export { KeybindingManager, getKeybindManager, resetKeybindManager } from "./manager.js";

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
