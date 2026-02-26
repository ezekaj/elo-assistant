/**
 * Vim Mode System
 *
 * Provides Vim mode functionality for OpenClaw TUI.
 *
 * Features:
 * - Vim mode toggle (/vim command)
 * - INSERT and NORMAL modes
 * - Escape key toggles modes
 * - Full h,j,k,l movement
 * - Word navigation (w, b, e)
 * - Line movement (0, $, gg, G)
 * - Mode indicator in status bar
 * - Visual mode support
 * - Delete/yank operations
 *
 * @module vim-mode
 */

// Types
export * from "./types.js";

// State management
export {
  setVimModeEnabled,
  isVimModeEnabled,
  getCurrentVimMode,
  setCurrentVimMode,
  toggleVimMode,
  toggleInsertNormalMode,
  setPendingOperator,
  getPendingOperator,
  setLastCommand,
  getLastCommand,
  getVimState,
  setVimConfig,
  getVimConfig,
  onModeChange,
  resetVimState,
} from "./vim-state.js";

// Operations
export { VimOperations, createVimOperations } from "./vim-operations.js";

// Keybindings
export { VimKeybindingsHandler, createVimKeybindingsHandler } from "./vim-keybindings.js";

// Mode indicator
export {
  renderVimModeIndicator,
  renderCompactVimModeIndicator,
  getVimModeStatusText,
} from "../components/vim-mode-indicator.js";
