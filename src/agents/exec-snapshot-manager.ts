/**
 * Snapshot Manager for Exec Tool
 *
 * Checkpoint sandbox state before risky operations.
 * Enables rollback on failure.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";

export interface Snapshot {
  id: string;
  createdAt: number;
  workdir: string;
  description?: string;
  fileCount: number;
  sizeBytes: number;
}

interface SnapshotFile {
  relativePath: string;
  hash: string;
}

interface SnapshotIndex {
  snapshots: Array<Snapshot & { files: SnapshotFile[] }>;
}

const DEFAULT_SNAPSHOT_DIR = `${process.env.HOME}/.openclaw/snapshots`;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const IGNORED_DIRS = new Set(["node_modules", ".git", ".cache", "__pycache__", "dist", "build"]);
const IGNORED_EXTENSIONS = new Set([".log", ".tmp", ".swp", ".swo"]);

export class SnapshotManager {
  private snapshotDir: string;
  private index: SnapshotIndex = { snapshots: [] };

  constructor(snapshotDir: string = DEFAULT_SNAPSHOT_DIR) {
    this.snapshotDir = snapshotDir;
    this.ensureDir(this.snapshotDir);
    this.loadIndex();
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private loadIndex(): void {
    const indexPath = join(this.snapshotDir, "index.json");
    if (existsSync(indexPath)) {
      try {
        this.index = JSON.parse(readFileSync(indexPath, "utf8"));
      } catch {
        this.index = { snapshots: [] };
      }
    }
  }

  private saveIndex(): void {
    const indexPath = join(this.snapshotDir, "index.json");
    writeFileSync(indexPath, JSON.stringify(this.index, null, 2));
  }

  private hashContent(content: Buffer): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  private shouldIgnore(name: string, isDir: boolean): boolean {
    if (name.startsWith(".")) return true;
    if (isDir && IGNORED_DIRS.has(name)) return true;
    if (!isDir) {
      const ext = name.slice(name.lastIndexOf("."));
      if (IGNORED_EXTENSIONS.has(ext)) return true;
    }
    return false;
  }

  private scanDir(
    dir: string,
    prefix = "",
  ): Array<{ relativePath: string; content: Buffer; hash: string }> {
    const files: Array<{ relativePath: string; content: Buffer; hash: string }> = [];

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (this.shouldIgnore(entry.name, entry.isDirectory())) continue;

        const fullPath = join(dir, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          files.push(...this.scanDir(fullPath, relativePath));
        } else if (entry.isFile()) {
          try {
            const stat = statSync(fullPath);
            if (stat.size > MAX_FILE_SIZE) continue; // Skip large files

            const content = readFileSync(fullPath);
            files.push({
              relativePath,
              content,
              hash: this.hashContent(content),
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }

    return files;
  }

  /**
   * Create a snapshot of the working directory
   */
  create(workdir: string, description?: string): Snapshot {
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const snapDir = join(this.snapshotDir, id);
    this.ensureDir(snapDir);

    const scannedFiles = this.scanDir(workdir);
    const files: SnapshotFile[] = [];
    let sizeBytes = 0;

    for (const { relativePath, content, hash } of scannedFiles) {
      const destPath = join(snapDir, relativePath);
      const destDir = dirname(destPath);

      this.ensureDir(destDir);
      writeFileSync(destPath, content);

      files.push({ relativePath, hash });
      sizeBytes += content.length;
    }

    const snapshot: Snapshot & { files: SnapshotFile[] } = {
      id,
      createdAt: Date.now(),
      workdir,
      description,
      fileCount: files.length,
      sizeBytes,
      files,
    };

    this.index.snapshots.push(snapshot);
    this.saveIndex();

    return {
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      workdir: snapshot.workdir,
      description: snapshot.description,
      fileCount: snapshot.fileCount,
      sizeBytes: snapshot.sizeBytes,
    };
  }

  /**
   * Restore a snapshot
   */
  restore(snapshotId: string): boolean {
    const snapEntry = this.index.snapshots.find((s) => s.id === snapshotId);
    if (!snapEntry) return false;

    const snapDir = join(this.snapshotDir, snapshotId);
    if (!existsSync(snapDir)) return false;

    for (const { relativePath } of snapEntry.files) {
      const srcPath = join(snapDir, relativePath);
      const destPath = join(snapEntry.workdir, relativePath);
      const destDir = dirname(destPath);

      try {
        this.ensureDir(destDir);
        const content = readFileSync(srcPath);
        writeFileSync(destPath, content);
      } catch {
        // Skip failed restores
      }
    }

    return true;
  }

  /**
   * List all snapshots
   */
  list(): Snapshot[] {
    return this.index.snapshots.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      workdir: s.workdir,
      description: s.description,
      fileCount: s.fileCount,
      sizeBytes: s.sizeBytes,
    }));
  }

  /**
   * Get a specific snapshot
   */
  get(snapshotId: string): Snapshot | null {
    const snap = this.index.snapshots.find((s) => s.id === snapshotId);
    if (!snap) return null;

    return {
      id: snap.id,
      createdAt: snap.createdAt,
      workdir: snap.workdir,
      description: snap.description,
      fileCount: snap.fileCount,
      sizeBytes: snap.sizeBytes,
    };
  }

  /**
   * Delete a snapshot
   */
  delete(snapshotId: string): boolean {
    const idx = this.index.snapshots.findIndex((s) => s.id === snapshotId);
    if (idx === -1) return false;

    const snapDir = join(this.snapshotDir, snapshotId);
    try {
      if (existsSync(snapDir)) {
        rmSync(snapDir, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }

    this.index.snapshots.splice(idx, 1);
    this.saveIndex();
    return true;
  }

  /**
   * Clean up old snapshots (keep last N)
   */
  cleanup(keepLast = 10): number {
    const sorted = [...this.index.snapshots].sort((a, b) => b.createdAt - a.createdAt);
    const toDelete = sorted.slice(keepLast);

    for (const snap of toDelete) {
      this.delete(snap.id);
    }

    return toDelete.length;
  }
}

// Singleton instance
let snapshotManagerInstance: SnapshotManager | null = null;

export function getSnapshotManager(snapshotDir?: string): SnapshotManager {
  if (!snapshotManagerInstance) {
    snapshotManagerInstance = new SnapshotManager(snapshotDir);
  }
  return snapshotManagerInstance;
}

export function resetSnapshotManager(): void {
  snapshotManagerInstance = null;
}
