/**
 * Vim Mode State Management
 *
 * Manages Vim mode state globally for the TUI.
 * Thread-safe singleton pattern.
 */

import type { VimState, VimMode, VimConfig } from "./types.js";
import { DEFAULT_VIM_CONFIG, VIM_MODES } from "./types.js";

/**
 * Global Vim state (singleton)
 */
const state: VimState = {
  enabled: false,
  currentMode: VIM_MODES.INSERT,
  pendingOperator: undefined,
  lastCommand: undefined,
};

/**
 * Vim configuration
 */
let config: VimConfig = { ...DEFAULT_VIM_CONFIG };

/**
 * Event listeners for mode changes
 */
type ModeChangeListener = (mode: VimMode) => void;
const modeChangeListeners: ModeChangeListener[] = [];

/**
 * Enable/disable Vim mode
 */
export function setVimModeEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    state.currentMode = VIM_MODES.INSERT;
    state.pendingOperator = undefined;
  }
  notifyModeChange(state.currentMode);
}

/**
 * Check if Vim mode is enabled
 */
export function isVimModeEnabled(): boolean {
  return state.enabled;
}

/**
 * Get current Vim mode
 */
export function getCurrentVimMode(): VimMode {
  return state.currentMode;
}

/**
 * Set current Vim mode
 */
export function setCurrentVimMode(mode: VimMode): void {
  if (!state.enabled && mode !== VIM_MODES.INSERT) {
    return; // Can't switch modes if Vim is disabled
  }
  state.currentMode = mode;
  notifyModeChange(mode);
}

/**
 * Toggle Vim mode on/off
 */
export function toggleVimMode(): boolean {
  state.enabled = !state.enabled;
  if (!state.enabled) {
    state.currentMode = VIM_MODES.INSERT;
    state.pendingOperator = undefined;
  }
  notifyModeChange(state.currentMode);
  return state.enabled;
}

/**
 * Toggle between INSERT and NORMAL modes
 */
export function toggleInsertNormalMode(): VimMode {
  if (!state.enabled) {
    return VIM_MODES.INSERT;
  }

  state.currentMode = state.currentMode === VIM_MODES.INSERT ? VIM_MODES.NORMAL : VIM_MODES.INSERT;

  state.pendingOperator = undefined;
  notifyModeChange(state.currentMode);
  return state.currentMode;
}

/**
 * Set pending operator (for d, y, c commands)
 */
export function setPendingOperator(operator: string | undefined): void {
  state.pendingOperator = operator;
}

/**
 * Get pending operator
 */
export function getPendingOperator(): string | undefined {
  return state.pendingOperator;
}

/**
 * Set last command (for . repeat)
 */
export function setLastCommand(command: string): void {
  state.lastCommand = command;
}

/**
 * Get last command
 */
export function getLastCommand(): string | undefined {
  return state.lastCommand;
}

/**
 * Get full Vim state
 */
export function getVimState(): VimState {
  return { ...state };
}

/**
 * Set Vim configuration
 */
export function setVimConfig(newConfig: Partial<VimConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get Vim configuration
 */
export function getVimConfig(): VimConfig {
  return { ...config };
}

/**
 * Add mode change listener
 */
export function onModeChange(listener: ModeChangeListener): () => void {
  modeChangeListeners.push(listener);
  return () => {
    const index = modeChangeListeners.indexOf(listener);
    if (index > -1) {
      modeChangeListeners.splice(index, 1);
    }
  };
}

/**
 * Notify listeners of mode change
 */
function notifyModeChange(mode: VimMode): void {
  for (const listener of modeChangeListeners) {
    try {
      listener(mode);
    } catch (error) {
      console.error("Vim mode listener error:", error);
    }
  }
}

/**
 * Reset Vim state (for new session)
 */
export function resetVimState(): void {
  state.enabled = false;
  state.currentMode = VIM_MODES.INSERT;
  state.pendingOperator = undefined;
  state.lastCommand = undefined;
  notifyModeChange(state.currentMode);
}
