/**
 * File History Types
 *
 * Defines types for file checkpointing and history management.
 * Matches Claude Code's profile checkpoint system.
 */

/**
 * File state at a point in time
 */
export interface FileState {
  /** Absolute file path */
  path: string;
  /** File content at snapshot time */
  content: string;
  /** SHA256 hash of content */
  hash: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: number;
}

/**
 * Snapshot of files at a point in time
 */
export interface FileSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** Associated message ID */
  messageId: string;
  /** Snapshot creation timestamp */
  timestamp: number;
  /** Snapshot sequence number */
  sequence: number;
  /** Files in this snapshot */
  files: Map<string, FileState>;
  /** Optional checkpoint name */
  name?: string;
  /** Optional description */
  description?: string;
}

/**
 * File history state
 */
export interface FileHistoryState {
  /** Currently tracked files */
  trackedFiles: Set<string>;
  /** Array of snapshots */
  snapshots: FileSnapshot[];
  /** Current snapshot sequence */
  snapshotSequence: number;
  /** Maximum snapshots to keep */
  maxSnapshots: number;
}

/**
 * File checkpointing configuration
 */
export interface FileCheckpointingConfig {
  /** Enable file checkpointing */
  enabled: boolean;
  /** Maximum snapshots to keep (default: 100) */
  maxSnapshots: number;
  /** File extensions to track */
  trackedExtensions: string[];
  /** Directories to exclude */
  excludedDirectories: string[];
  /** Maximum file size to track (bytes) */
  maxFileSize: number;
}

/**
 * Rewind result
 */
export interface RewindResult {
  /** Success status */
  success: boolean;
  /** Snapshot that was restored */
  snapshot?: FileSnapshot;
  /** Files that were restored */
  restoredFiles: string[];
  /** Files that failed to restore */
  failedFiles: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Diff between two snapshots
 */
export interface SnapshotDiff {
  /** From snapshot ID */
  fromSnapshot: string;
  /** To snapshot ID */
  toSnapshot: string;
  /** Added files */
  added: string[];
  /** Removed files */
  removed: string[];
  /** Modified files */
  modified: Array<{
    path: string;
    oldHash: string;
    newHash: string;
  }>;
}

/**
 * Checkpoint creation options
 */
export interface CheckpointOptions {
  /** Optional checkpoint name */
  name?: string;
  /** Optional description */
  description?: string;
  /** Force creation even if no changes */
  force?: boolean;
}

// Default configuration
export const DEFAULT_CHECKPOINTING_CONFIG: FileCheckpointingConfig = {
  enabled: true,
  maxSnapshots: 100,
  trackedExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".pyi",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".kt",
    ".scala",
    ".md",
    ".markdown",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".html",
    ".css",
    ".scss",
    ".less",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".sql",
    ".txt",
    ".xml",
    ".ini",
    ".cfg",
    ".conf",
    ".env",
    ".env.example",
    ".gitignore",
    ".dockerignore",
    "Dockerfile",
    "Makefile",
    "Cargo.toml",
    "package.json",
  ],
  excludedDirectories: [
    "node_modules",
    "__pycache__",
    ".git",
    ".svn",
    "dist",
    "build",
    "target",
    "vendor",
    ".venv",
    "venv",
    "env",
    ".env",
    "coverage",
    ".nyc_output",
    "tmp",
    "temp",
    ".cache",
  ],
  maxFileSize: 10 * 1024 * 1024, // 10MB
};
