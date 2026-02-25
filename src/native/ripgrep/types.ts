/**
 * Ripgrep Native Module Types
 */

import type { RipgrepOptions, RipgrepResult, RipgrepMatch } from "../types.js";

/**
 * Native ripgrep module interface (N-API bindings)
 */
export interface RipgrepNative {
  /**
   * Search for pattern in files
   */
  search(options: RipgrepOptions): Promise<RipgrepResult>;
  /**
   * Search and return files with matches only
   */
  searchFiles(options: Omit<RipgrepOptions, "filesWithMatches">): Promise<string[]>;
  /**
   * Get ripgrep version
   */
  version(): string;
}

/**
 * Ripgrep module interface (unified)
 */
export interface RipgrepModule {
  /**
   * Search for pattern in files
   */
  search(options: RipgrepOptions): Promise<RipgrepResult>;
  /**
   * Search and return files with matches only
   */
  searchFiles(options: Omit<RipgrepOptions, "filesWithMatches">): Promise<string[]>;
  /**
   * Get ripgrep version
   */
  version(): string;
  /**
   * Check if ripgrep binary is available
   */
  isAvailable(): Promise<boolean>;
  /**
   * Get the path to ripgrep binary
   */
  getBinaryPath(): string | null;
}

/**
 * JSON output from ripgrep --json mode
 */
export interface RipgrepJsonOutput {
  data: {
    path?: {
      text?: string;
    };
    line_number?: number;
    absolute_offset?: number;
    submatches?: Array<{
      match?: {
        text?: string;
      };
      start?: number;
      end?: number;
    }>;
    lines?: {
      text?: string;
    };
  };
  type: "match" | "begin" | "end" | "context" | "summary";
}
