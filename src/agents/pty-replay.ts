/**
 * PTY Replay Buffer
 *
 * Circular buffer for PTY session output that enables:
 *
 * 1. Session replay for debugging
 * 2. Scrollback buffer for detached sessions
 * 3. Output audit trail
 * 4. Memory-efficient storage with configurable limits
 */

export interface ReplayEntry {
  timestamp: number;
  type: "stdout" | "stdin" | "resize" | "exit";
  data: string;
  metadata?: Record<string, unknown>;
}

export interface ReplayBufferConfig {
  /** Maximum number of entries to keep */
  maxEntries: number;
  /** Maximum total bytes to store (approximate) */
  maxBytes: number;
  /** Include timestamps in entries */
  includeTimestamps: boolean;
  /** Include input (stdin) in buffer */
  captureInput: boolean;
}

const DEFAULT_CONFIG: ReplayBufferConfig = {
  maxEntries: 10000,
  maxBytes: 5 * 1024 * 1024, // 5MB
  includeTimestamps: true,
  captureInput: false, // Don't capture input by default (security)
};

/**
 * PTY Replay Buffer
 *
 * Memory-efficient circular buffer for PTY session history.
 * Automatically evicts old entries when limits are reached.
 */
export class PtyReplayBuffer {
  private config: ReplayBufferConfig;
  private entries: ReplayEntry[] = [];
  private currentBytes = 0;
  private startIndex = 0; // For circular buffer
  private totalEntriesWritten = 0;
  private sessionStartTime: number;

  constructor(config: Partial<ReplayBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionStartTime = Date.now();
  }

  /**
   * Record output from PTY
   */
  recordOutput(data: string): void {
    this.addEntry({
      timestamp: this.config.includeTimestamps ? Date.now() : 0,
      type: "stdout",
      data,
    });
  }

  /**
   * Record input to PTY (if enabled)
   */
  recordInput(data: string): void {
    if (!this.config.captureInput) {
      return;
    }

    // Sanitize potential secrets from input
    const sanitized = this.sanitizeInput(data);

    this.addEntry({
      timestamp: this.config.includeTimestamps ? Date.now() : 0,
      type: "stdin",
      data: sanitized,
    });
  }

  /**
   * Record a resize event
   */
  recordResize(cols: number, rows: number): void {
    this.addEntry({
      timestamp: this.config.includeTimestamps ? Date.now() : 0,
      type: "resize",
      data: `${cols}x${rows}`,
      metadata: { cols, rows },
    });
  }

  /**
   * Record process exit
   */
  recordExit(exitCode: number | null, signal: string | number | null): void {
    this.addEntry({
      timestamp: this.config.includeTimestamps ? Date.now() : 0,
      type: "exit",
      data: signal ? `signal:${signal}` : `code:${exitCode}`,
      metadata: { exitCode, signal },
    });
  }

  /**
   * Add an entry to the buffer
   */
  private addEntry(entry: ReplayEntry): void {
    const entrySize = this.estimateSize(entry);

    // Evict old entries if needed
    while (
      (this.entries.length >= this.config.maxEntries ||
        this.currentBytes + entrySize > this.config.maxBytes) &&
      this.entries.length > 0
    ) {
      const removed = this.entries.shift();
      if (removed) {
        this.currentBytes -= this.estimateSize(removed);
      }
    }

    this.entries.push(entry);
    this.currentBytes += entrySize;
    this.totalEntriesWritten++;
  }

  /**
   * Estimate size of an entry in bytes
   */
  private estimateSize(entry: ReplayEntry): number {
    // Rough estimate: data length + overhead for metadata
    return entry.data.length + 50 + (entry.metadata ? JSON.stringify(entry.metadata).length : 0);
  }

  /**
   * Sanitize input to remove potential secrets
   */
  private sanitizeInput(data: string): string {
    // Replace potential password input with asterisks
    // This is a heuristic - not perfect but helps
    if (data.includes("\n") || data.includes("\r")) {
      return data;
    }

    // Single character input is likely normal typing
    if (data.length === 1) {
      return data;
    }

    // Multi-character input without newline might be pasted password
    // Redact it if it looks like it could be sensitive
    if (data.length > 8 && !data.includes(" ")) {
      return "[REDACTED]";
    }

    return data;
  }

  /**
   * Get all entries
   */
  getAll(): ReplayEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries since a timestamp
   */
  getSince(timestamp: number): ReplayEntry[] {
    return this.entries.filter((e) => e.timestamp >= timestamp);
  }

  /**
   * Get last N entries
   */
  getLast(count: number): ReplayEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Get output-only entries (for replay)
   */
  getOutputOnly(): string[] {
    return this.entries.filter((e) => e.type === "stdout").map((e) => e.data);
  }

  /**
   * Replay buffer as a single string (for debugging)
   */
  replayAsString(): string {
    return this.entries
      .filter((e) => e.type === "stdout")
      .map((e) => e.data)
      .join("");
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    entryCount: number;
    totalBytes: number;
    totalEntriesWritten: number;
    entriesEvicted: number;
    sessionDurationMs: number;
    oldestEntry: number | null;
    newestEntry: number | null;
    entriesByType: Record<string, number>;
  } {
    const entriesByType: Record<string, number> = {};
    for (const entry of this.entries) {
      entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
    }

    return {
      entryCount: this.entries.length,
      totalBytes: this.currentBytes,
      totalEntriesWritten: this.totalEntriesWritten,
      entriesEvicted: this.totalEntriesWritten - this.entries.length,
      sessionDurationMs: Date.now() - this.sessionStartTime,
      oldestEntry: this.entries.length > 0 ? this.entries[0].timestamp : null,
      newestEntry: this.entries.length > 0 ? this.entries.at(-1)!.timestamp : null,
      entriesByType,
    };
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.entries = [];
    this.currentBytes = 0;
    this.startIndex = 0;
  }

  /**
   * Export buffer for serialization
   */
  export(): {
    config: ReplayBufferConfig;
    entries: ReplayEntry[];
    stats: ReturnType<PtyReplayBuffer["getStats"]>;
  } {
    return {
      config: this.config,
      entries: this.getAll(),
      stats: this.getStats(),
    };
  }

  /**
   * Import buffer from serialized data
   */
  static import(data: {
    config?: Partial<ReplayBufferConfig>;
    entries: ReplayEntry[];
  }): PtyReplayBuffer {
    const buffer = new PtyReplayBuffer(data.config);
    for (const entry of data.entries) {
      buffer.addEntry(entry);
    }
    return buffer;
  }
}

/**
 * Create a replay buffer with minimal memory usage
 */
export function createMinimalBuffer(): PtyReplayBuffer {
  return new PtyReplayBuffer({
    maxEntries: 1000,
    maxBytes: 512 * 1024, // 512KB
    includeTimestamps: false,
    captureInput: false,
  });
}

/**
 * Create a replay buffer for debugging (captures more)
 */
export function createDebugBuffer(): PtyReplayBuffer {
  return new PtyReplayBuffer({
    maxEntries: 50000,
    maxBytes: 20 * 1024 * 1024, // 20MB
    includeTimestamps: true,
    captureInput: true,
  });
}
