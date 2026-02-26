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
