/**
 * Tool Result Persistence Types
 *
 * Types for persisting large tool results to disk.
 * Extracted from Claude Code v2.1.50
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum result size before persisting (characters)
 * ~100KB as per Claude Code
 */
export const MAX_RESULT_SIZE_CHARS = 100_000;

/**
 * Preview size to show in context (characters)
 * ~10KB preview
 */
export const PREVIEW_SIZE_CHARS = 10_000;

/**
 * Characters per token estimate
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Tool results directory name
 */
export const TOOL_RESULTS_DIR = "tool-results";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool result persistence options
 */
export interface ToolResultPersistOptions {
  /** Maximum size before persisting (chars) */
  maxSizeChars?: number;
  /** Preview size to show (chars) */
  previewSizeChars?: number;
  /** Directory to store persisted results */
  outputDir?: string;
  /** Tool use ID for filename */
  toolUseId: string;
  /** Tool name for logging */
  toolName?: string;
}

/**
 * Result of persisting a tool result
 */
export interface ToolResultPersistResult {
  /** Filepath where result was saved */
  filepath: string;
  /** Original size in bytes */
  originalSize: number;
  /** Whether content is JSON */
  isJson: boolean;
  /** Preview of the content */
  preview: string;
  /** Whether there's more content beyond preview */
  hasMore: boolean;
}

/**
 * Persisted tool result info for telemetry
 */
export interface ToolResultPersistTelemetry {
  /** Tool name */
  toolName: string;
  /** Original size in bytes */
  originalSizeBytes: number;
  /** Persisted size in bytes (preview + filepath) */
  persistedSizeBytes: number;
  /** Estimated original tokens */
  estimatedOriginalTokens: number;
  /** Estimated persisted tokens */
  estimatedPersistedTokens: number;
}

/**
 * Error result when persistence fails
 */
export interface ToolResultPersistError {
  /** Error message */
  error: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if result is a successful persist result
 */
export function isPersistResult(
  result: ToolResultPersistResult | ToolResultPersistError,
): result is ToolResultPersistResult {
  return "filepath" in result;
}

/**
 * Check if result is an error
 */
export function isPersistError(
  result: ToolResultPersistResult | ToolResultPersistError,
): result is ToolResultPersistError {
  return "error" in result;
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format persisted result preview for context
 */
export function formatPersistedPreview(result: ToolResultPersistResult): string {
  const divider = "─".repeat(40);
  let output = `${divider}\n`;
  output += `Output too large (${formatSize(result.originalSize)}). `;
  output += `Full output saved to: ${result.filepath}\n\n`;
  output += `Preview (first ${formatSize(PREVIEW_SIZE_CHARS)}):\n`;
  output += result.preview;

  if (result.hasMore) {
    output += "\n...\n";
  }

  output += `\n${divider}\n`;
  output += `To read the full output, use: Read("${result.filepath}")\n`;
  output += divider;

  return output;
}
