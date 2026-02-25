/**
 * Color Diff Module Types
 */

import type { HighlightOptions, DiffHighlightOptions, HighlightResult } from "../types.js";

/**
 * Native color diff module interface (N-API bindings from Rust Syntect)
 */
export interface ColorDiffNative {
  /**
   * Highlight source code with syntax highlighting
   */
  highlight(options: HighlightOptions): Promise<HighlightResult>;
  /**
   * Highlight a unified diff with colored changes
   */
  highlightDiff(options: DiffHighlightOptions): Promise<HighlightResult>;
  /**
   * List available themes
   */
  listThemes(): Promise<string[]>;
  /**
   * List available languages
   */
  listLanguages(): Promise<string[]>;
  /**
   * Detect language from filename
   */
  detectLanguage(filename: string): Promise<string | null>;
}

/**
 * Color diff module interface (unified)
 */
export interface ColorDiffModule {
  /**
   * Highlight source code with syntax highlighting
   */
  highlight(options: HighlightOptions): Promise<HighlightResult>;
  /**
   * Highlight a unified diff with colored changes
   */
  highlightDiff(options: DiffHighlightOptions): Promise<HighlightResult>;
  /**
   * List available themes
   */
  listThemes(): Promise<string[]>;
  /**
   * List available languages
   */
  listLanguages(): Promise<string[]>;
  /**
   * Detect language from filename
   */
  detectLanguage(filename: string): Promise<string | null>;
  /**
   * Check if module is available
   */
  isAvailable(): boolean;
}

/**
 * ANSI color codes for terminal output
 */
export const ANSI_COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Bright foreground colors
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const;

/**
 * Diff line types
 */
export type DiffLineType = "context" | "add" | "remove" | "header" | "meta";
