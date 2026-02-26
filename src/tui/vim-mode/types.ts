/**
 * Vim Mode Types
 *
 * Defines the different modes in Vim editing
 */

/**
 * Vim editor mode
 * - INSERT: Normal text input
 * - NORMAL: Command/navigation mode
 * - VISUAL: Text selection mode
 */
export type VimMode = "INSERT" | "NORMAL" | "VISUAL";

/**
 * Vim state interface
 */
export interface VimState {
  /** Is Vim mode enabled */
  enabled: boolean;

  /** Current mode */
  currentMode: VimMode;

  /** Pending operator (d, y, c, etc.) */
  pendingOperator?: string;

  /** Last command for repeat (.) */
  lastCommand?: string;
}

/**
 * Vim cursor position
 */
export interface VimCursor {
  line: number;
  column: number;
}

/**
 * Vim text range for visual mode
 */
export interface VimRange {
  start: VimCursor;
  end: VimCursor;
}

/**
 * Vim operation result
 */
export interface VimOperationResult {
  success: boolean;
  mode?: VimMode;
  cursor?: VimCursor;
  text?: string;
}

/**
 * Vim configuration
 */
export interface VimConfig {
  enabled: boolean;
  useRelativeNumbers?: boolean;
  tabStop?: number;
  expandTab?: boolean;
}

// Mode constants
export const VIM_MODES = {
  INSERT: "INSERT" as VimMode,
  NORMAL: "NORMAL" as VimMode,
  VISUAL: "VISUAL" as VimMode,
};

// Default config
export const DEFAULT_VIM_CONFIG: VimConfig = {
  enabled: false,
  useRelativeNumbers: false,
  tabStop: 2,
  expandTab: true,
};
