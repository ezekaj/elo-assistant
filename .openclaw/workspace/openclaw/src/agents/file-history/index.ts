/**
 * File History System
 *
 * Provides file checkpointing and history management.
 * Matches Claude Code's profile checkpoint system.
 *
 * Features:
 * - File tracking
 * - Snapshot creation
 * - Rewind to previous states
 * - Diff between snapshots
 *
 * @module file-history
 */

// Types
export * from "./types.js";

// Manager
export { FileHistoryManager, createFileHistoryManager } from "./file-history-manager.js";

// ============================================================================
// SINGLETON PATTERN
// ============================================================================

import { FileHistoryManager } from "./file-history-manager.js";

/** Singleton instances by workspace root */
const instances = new Map<string, FileHistoryManager>();

/**
 * Get or create a FileHistoryManager singleton for a workspace
 */
export function getFileHistoryManager(workspaceRoot: string): FileHistoryManager {
  const normalized = workspaceRoot.replace(/\/$/, "");
  let instance = instances.get(normalized);
  if (!instance) {
    instance = new FileHistoryManager(normalized);
    instances.set(normalized, instance);
  }
  return instance;
}
