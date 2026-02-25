/**
 * Tool Result Persistence
 *
 * Persists large tool results to disk instead of keeping in context.
 * Extracted from Claude Code v2.1.50
 *
 * @example
 * ```typescript
 * const result = await persistToolResult(largeContent, {
 *   toolUseId: 'abc123',
 *   toolName: 'Bash'
 * });
 *
 * if (isPersistResult(result)) {
 *   // Replace content with preview + filepath
 *   content = formatPersistedPreview(result);
 * }
 * ```
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  ToolResultPersistOptions,
  ToolResultPersistResult,
  ToolResultPersistError,
  ToolResultPersistTelemetry,
} from "./tool-result-persist.types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  MAX_RESULT_SIZE_CHARS,
  PREVIEW_SIZE_CHARS,
  CHARS_PER_TOKEN,
  TOOL_RESULTS_DIR,
  isPersistResult,
  formatSize,
  formatPersistedPreview,
} from "./tool-result-persist.types.js";

const log = createSubsystemLogger("tool-result-persist");

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Get the tool results directory path
 */
export function getToolResultsDir(baseDir?: string): string {
  const cwd = baseDir || process.cwd();
  return join(cwd, ".openclaw", TOOL_RESULTS_DIR);
}

/**
 * Get the filepath for a persisted tool result
 */
export function getToolResultFilepath(toolUseId: string, baseDir?: string): string {
  const dir = getToolResultsDir(baseDir);
  return join(dir, `${toolUseId}.txt`);
}

/**
 * Create preview of content
 */
export function createPreview(
  content: string,
  maxSize: number = PREVIEW_SIZE_CHARS,
): { preview: string; hasMore: boolean } {
  if (content.length <= maxSize) {
    return { preview: content, hasMore: false };
  }

  // Try to cut at newline for cleaner preview
  const cutPoint = content.slice(0, maxSize).lastIndexOf("\n");
  const actualCut = cutPoint > maxSize * 0.8 ? cutPoint : maxSize;

  return {
    preview: content.slice(0, actualCut),
    hasMore: true,
  };
}

/**
 * Persist tool result to disk
 */
export async function persistToolResult(
  content: unknown,
  options: ToolResultPersistOptions,
): Promise<ToolResultPersistResult | ToolResultPersistError> {
  const {
    toolUseId,
    toolName = "unknown",
    maxSizeChars = MAX_RESULT_SIZE_CHARS,
    previewSizeChars = PREVIEW_SIZE_CHARS,
  } = options;

  // Check if content is array (multiple blocks)
  const isArray = Array.isArray(content);

  // Validate content type
  if (isArray) {
    const hasNonText = (content as any[]).some(
      (block) => typeof block === "object" && block !== null && block.type !== "text",
    );
    if (hasNonText) {
      return { error: "Cannot persist tool results containing non-text content" };
    }
  }

  // Serialize content
  const serialized = isArray ? JSON.stringify(content, null, 2) : String(content);

  // Check if we actually need to persist
  if (serialized.length <= maxSizeChars) {
    log.debug(
      `Tool result under threshold (${serialized.length} <= ${maxSizeChars}), not persisting`,
    );
    return {
      filepath: "",
      originalSize: serialized.length,
      isJson: isArray,
      preview: serialized,
      hasMore: false,
    };
  }

  // Ensure directory exists
  const outputDir = getToolResultsDir(options.outputDir);
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (err) {
    // Directory might already exist
  }

  // Get filepath
  const filepath = getToolResultFilepath(toolUseId, options.outputDir);

  // Check if already exists (idempotent)
  let alreadyExists = false;
  try {
    await stat(filepath);
    alreadyExists = true;
    log.debug(`Tool result already exists at ${filepath}`);
  } catch {
    // File doesn't exist, will create
  }

  // Write file if not exists
  if (!alreadyExists) {
    try {
      await writeFile(filepath, serialized, "utf-8");
      log.info(`Persisted tool result to ${filepath} (${formatSize(serialized.length)})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to persist tool result: ${errorMsg}`);
      return { error: errorMsg };
    }
  }

  // Create preview
  const { preview, hasMore } = createPreview(serialized, previewSizeChars);

  return {
    filepath,
    originalSize: serialized.length,
    isJson: isArray,
    preview,
    hasMore,
  };
}

/**
 * Process tool result and persist if needed
 * Returns the content to use (either original or formatted preview)
 */
export async function processToolResult(
  content: unknown,
  options: ToolResultPersistOptions,
): Promise<{
  content: unknown;
  persisted: boolean;
  telemetry?: ToolResultPersistTelemetry;
}> {
  const { toolName = "unknown", maxSizeChars = MAX_RESULT_SIZE_CHARS } = options;

  // Calculate content size
  const serialized = typeof content === "string" ? content : JSON.stringify(content);

  // Check if we need to persist
  if (serialized.length <= maxSizeChars) {
    return {
      content,
      persisted: false,
    };
  }

  // Persist
  const result = await persistToolResult(content, options);

  if (!isPersistResult(result) || !result.filepath) {
    // Persistence failed or not needed
    return {
      content,
      persisted: false,
    };
  }

  // Format preview for context
  const formattedPreview = formatPersistedPreview(result);

  // Create telemetry
  const telemetry: ToolResultPersistTelemetry = {
    toolName,
    originalSizeBytes: result.originalSize,
    persistedSizeBytes: formattedPreview.length,
    estimatedOriginalTokens: Math.ceil(result.originalSize / CHARS_PER_TOKEN),
    estimatedPersistedTokens: Math.ceil(formattedPreview.length / CHARS_PER_TOKEN),
  };

  log.info(
    `Tool result persisted: ${telemetry.estimatedOriginalTokens} → ${telemetry.estimatedPersistedTokens} tokens`,
  );

  return {
    content: formattedPreview,
    persisted: true,
    telemetry,
  };
}

// ============================================================================
// CLEANUP FUNCTIONS
// ============================================================================

/**
 * Clean up old persisted tool results
 */
export async function cleanupOldToolResults(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days
  baseDir?: string,
): Promise<{ cleaned: number; errors: number }> {
  const { readdir, unlink } = await import("node:fs/promises");
  const outputDir = getToolResultsDir(baseDir);

  let cleaned = 0;
  let errors = 0;

  try {
    const files = await readdir(outputDir);
    const now = Date.now();

    for (const file of files) {
      if (!file.endsWith(".txt")) continue;

      const filepath = join(outputDir, file);
      try {
        const stats = await stat(filepath);
        const age = now - stats.mtimeMs;

        if (age > maxAgeMs) {
          await unlink(filepath);
          cleaned++;
          log.debug(`Cleaned up old tool result: ${file}`);
        }
      } catch (err) {
        errors++;
        log.warn(`Failed to clean up ${file}: ${err}`);
      }
    }
  } catch (err) {
    log.warn(`Failed to read tool results directory: ${err}`);
  }

  if (cleaned > 0) {
    log.info(`Cleaned up ${cleaned} old tool results`);
  }

  return { cleaned, errors };
}
