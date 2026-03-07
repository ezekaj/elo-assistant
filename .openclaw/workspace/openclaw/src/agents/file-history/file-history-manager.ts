/**
 * File History Manager
 *
 * Manages file checkpointing and history.
 * Matches Claude Code's profile checkpoint system.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  FileState,
  FileSnapshot,
  FileHistoryState,
  FileCheckpointingConfig,
  RewindResult,
  SnapshotDiff,
  CheckpointOptions,
} from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { DEFAULT_CHECKPOINTING_CONFIG } from "./types.js";

const log = createSubsystemLogger("file-history");

/**
 * File History Manager Class
 */
export class FileHistoryManager {
  private state: FileHistoryState;
  private config: FileCheckpointingConfig;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, config?: Partial<FileCheckpointingConfig>) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.config = { ...DEFAULT_CHECKPOINTING_CONFIG, ...config };
    this.state = {
      trackedFiles: new Set(),
      snapshots: [],
      snapshotSequence: 0,
      maxSnapshots: this.config.maxSnapshots,
    };
    log.debug(`File history manager initialized for ${this.workspaceRoot}`);
  }

  /**
   * Enable or disable file checkpointing
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    log.debug(`File checkpointing ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if file checkpointing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Track a file for checkpointing
   */
  trackFile(filePath: string): void {
    const absolutePath = path.resolve(filePath);

    // Check if file should be tracked
    if (!this.shouldTrackFile(absolutePath)) {
      return;
    }

    this.state.trackedFiles.add(absolutePath);
    log.debug(`Tracking file: ${absolutePath}`);
  }

  /**
   * Stop tracking a file
   */
  untrackFile(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    this.state.trackedFiles.delete(absolutePath);
    log.debug(`Untracking file: ${absolutePath}`);
  }

  /**
   * Check if a file should be tracked
   */
  private shouldTrackFile(filePath: string): boolean {
    // Check if enabled
    if (!this.config.enabled) {
      return false;
    }

    const relativePath = path.relative(this.workspaceRoot, filePath);
    const ext = path.extname(filePath).toLowerCase();
    const dirParts = relativePath.split(path.sep);

    // Check excluded directories
    for (const part of dirParts) {
      if (this.config.excludedDirectories.includes(part)) {
        return false;
      }
    }

    // Check file extension
    if (!this.config.trackedExtensions.includes(ext)) {
      return false;
    }

    // Check file size
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > this.config.maxFileSize) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  /**
   * Get current state of a file
   */
  private getFileState(filePath: string): FileState | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const stats = fs.statSync(filePath);

      return {
        path: filePath,
        content,
        hash: this.hashContent(content),
        size: stats.size,
        modified: stats.mtimeMs,
      };
    } catch (error) {
      log.debug(`Failed to get file state for ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Hash file content
   */
  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Create a snapshot of tracked files
   */
  async createSnapshot(
    messageId: string,
    options?: CheckpointOptions,
  ): Promise<FileSnapshot | null> {
    if (!this.config.enabled) {
      log.debug("File checkpointing is disabled");
      return null;
    }

    const files = new Map<string, FileState>();

    // Capture state of all tracked files
    for (const filePath of this.state.trackedFiles) {
      const fileState = this.getFileState(filePath);
      if (fileState) {
        files.set(filePath, fileState);
      }
    }

    // Skip if no files and not forced
    if (files.size === 0 && !options?.force) {
      log.debug("No files to snapshot");
      return null;
    }

    // Create snapshot
    this.state.snapshotSequence++;
    const snapshot: FileSnapshot = {
      id: `snapshot-${Date.now()}-${this.state.snapshotSequence}`,
      messageId,
      timestamp: Date.now(),
      sequence: this.state.snapshotSequence,
      files,
      name: options?.name,
      description: options?.description,
    };

    // Add to history
    this.state.snapshots.push(snapshot);

    // Enforce max snapshots
    if (this.state.snapshots.length > this.state.maxSnapshots) {
      const removed = this.state.snapshots.shift();
      if (removed) {
        log.debug(`Removed old snapshot: ${removed.id}`);
      }
    }

    log.info(`Created snapshot ${snapshot.id} with ${files.size} files`);
    return snapshot;
  }

  /**
   * Find snapshot by message ID
   */
  findSnapshotByMessageId(messageId: string): FileSnapshot | undefined {
    return this.state.snapshots.findLast((s) => s.messageId === messageId);
  }

  /**
   * Find snapshot by name
   */
  findSnapshotByName(name: string): FileSnapshot | undefined {
    return this.state.snapshots.findLast((s) => s.name === name);
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): FileSnapshot | undefined {
    return this.state.snapshots.find((s) => s.id === snapshotId);
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): FileSnapshot[] {
    return [...this.state.snapshots];
  }

  /**
   * Get snapshot count
   */
  getSnapshotCount(): number {
    return this.state.snapshots.length;
  }

  /**
   * Rewind files to a snapshot state
   */
  async rewindToSnapshot(snapshotIdOrMessageId: string): Promise<RewindResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        restoredFiles: [],
        failedFiles: [],
        error: "File checkpointing is disabled",
      };
    }

    // Find snapshot
    let snapshot = this.getSnapshot(snapshotIdOrMessageId);
    if (!snapshot) {
      snapshot = this.findSnapshotByMessageId(snapshotIdOrMessageId);
    }
    if (!snapshot) {
      snapshot = this.findSnapshotByName(snapshotIdOrMessageId);
    }

    if (!snapshot) {
      return {
        success: false,
        restoredFiles: [],
        failedFiles: [],
        error: `Snapshot not found: ${snapshotIdOrMessageId}`,
      };
    }

    log.info(`Rewinding to snapshot ${snapshot.id}`);

    const restoredFiles: string[] = [];
    const failedFiles: string[] = [];

    // Restore each file
    for (const [filePath, fileState] of snapshot.files) {
      try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write file content
        fs.writeFileSync(filePath, fileState.content, "utf-8");
        restoredFiles.push(filePath);
        log.debug(`Restored file: ${filePath}`);
      } catch (error) {
        failedFiles.push(filePath);
        log.error(`Failed to restore file ${filePath}: ${error}`);
      }
    }

    const success = failedFiles.length === 0;
    log.info(
      `Rewind ${success ? "successful" : "partial"}: ${restoredFiles.length} restored, ${failedFiles.length} failed`,
    );

    return {
      success,
      snapshot,
      restoredFiles,
      failedFiles,
    };
  }

  /**
   * Compare two snapshots
   */
  compareSnapshots(fromId: string, toId: string): SnapshotDiff | null {
    const fromSnapshot = this.getSnapshot(fromId);
    const toSnapshot = this.getSnapshot(toId);

    if (!fromSnapshot || !toSnapshot) {
      return null;
    }

    const added: string[] = [];
    const removed: string[] = [];
    const modified: Array<{ path: string; oldHash: string; newHash: string }> = [];

    const fromPaths = new Set(fromSnapshot.files.keys());
    const toPaths = new Set(toSnapshot.files.keys());

    // Find added files
    for (const toPath of toPaths) {
      if (!fromPaths.has(toPath)) {
        added.push(toPath);
      }
    }

    // Find removed files
    for (const fromPath of fromPaths) {
      if (!toPaths.has(fromPath)) {
        removed.push(fromPath);
      }
    }

    // Find modified files
    for (const [path, fromState] of fromSnapshot.files) {
      const toState = toSnapshot.files.get(path);
      if (toState && fromState.hash !== toState.hash) {
        modified.push({
          path,
          oldHash: fromState.hash,
          newHash: toState.hash,
        });
      }
    }

    return {
      fromSnapshot: fromId,
      toSnapshot: toId,
      added,
      removed,
      modified,
    };
  }

  /**
   * Get diff from current state to snapshot
   */
  getCurrentDiff(snapshotId: string): SnapshotDiff | null {
    const snapshot = this.getSnapshot(snapshotId);
    if (!snapshot) {
      return null;
    }

    const added: string[] = [];
    const removed: string[] = [];
    const modified: Array<{ path: string; oldHash: string; newHash: string }> = [];

    // Check current state of tracked files
    for (const [filePath, oldState] of snapshot.files) {
      const currentState = this.getFileState(filePath);

      if (!currentState) {
        removed.push(filePath);
      } else if (oldState.hash !== currentState.hash) {
        modified.push({
          path: filePath,
          oldHash: oldState.hash,
          newHash: currentState.hash,
        });
      }
    }

    // Check for new files
    for (const filePath of this.state.trackedFiles) {
      if (!snapshot.files.has(filePath)) {
        added.push(filePath);
      }
    }

    return {
      fromSnapshot: snapshotId,
      toSnapshot: "current",
      added,
      removed,
      modified,
    };
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.state.snapshots = [];
    this.state.snapshotSequence = 0;
    log.info("Cleared all file history snapshots");
  }

  /**
   * Get history state
   */
  getState(): FileHistoryState {
    return {
      trackedFiles: new Set(this.state.trackedFiles),
      snapshots: [...this.state.snapshots],
      snapshotSequence: this.state.snapshotSequence,
      maxSnapshots: this.state.maxSnapshots,
    };
  }
}

/**
 * Create file history manager instance
 */
export function createFileHistoryManager(
  workspaceRoot: string,
  config?: Partial<FileCheckpointingConfig>,
): FileHistoryManager {
  return new FileHistoryManager(workspaceRoot, config);
}
