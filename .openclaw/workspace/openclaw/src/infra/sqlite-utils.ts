/**
 * SQLite Performance Optimization Utilities
 * 
 * Applies recommended performance settings for better concurrent access
 * and reduced I/O overhead.
 */

import type { DatabaseSync } from "node:sqlite";

export interface SqliteOptimizationOptions {
  /** Enable WAL mode for concurrent reads/writes (default: true) */
  walMode?: boolean;
  /** Cache size in KB, negative = KB (default: -262144 = 256MB) */
  cacheSize?: number;
  /** Memory-mapped I/O size in KB (default: 268435456 = 256GB) */
  mmapSize?: number;
  /** Synchronous mode: 0=OFF, 1=NORMAL, 2=FULL (default: 1) */
  synchronous?: number;
  /** Temp store: 0=DEFAULT, 1=FILE, 2=MEMORY (default: 2) */
  tempStore?: number;
  /** Busy timeout in ms (default: 5000) */
  busyTimeout?: number;
}

const DEFAULT_OPTIONS: Required<SqliteOptimizationOptions> = {
  walMode: true,
  cacheSize: -262144, // 256MB
  mmapSize: 268435456, // 256GB max
  synchronous: 1, // NORMAL
  tempStore: 2, // MEMORY
  busyTimeout: 5000,
};

/**
 * Apply performance optimizations to a SQLite database connection.
 * Should be called immediately after opening each database connection.
 * 
 * @param db - The DatabaseSync instance to optimize
 * @param options - Optional customization of optimization settings
 * @returns true if optimizations applied successfully
 */
export function optimizeDatabase(
  db: DatabaseSync,
  options: SqliteOptimizationOptions = {}
): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const pragmas: string[] = [];

    if (opts.walMode) {
      pragmas.push(`PRAGMA journal_mode = WAL`);
    }

    pragmas.push(
      `PRAGMA cache_size = ${opts.cacheSize}`,
      `PRAGMA mmap_size = ${opts.mmapSize}`,
      `PRAGMA synchronous = ${opts.synchronous}`,
      `PRAGMA temp_store = ${opts.tempStore}`,
      `PRAGMA busy_timeout = ${opts.busyTimeout}`
    );

    for (const pragma of pragmas) {
      try {
        db.exec(pragma);
      } catch (error) {
        // Log but continue - some pragmas might not be supported
        console.warn(`[sqlite-utils] Failed to apply ${pragma}:`, error);
      }
    }

    return true;
  } catch (error) {
    console.error("[sqlite-utils] Failed to optimize database:", error);
    return false;
  }
}

/**
 * Get the current SQLite optimization settings for debugging.
 * 
 * @param db - The DatabaseSync instance to check
 * @returns Object with current pragma values
 */
export function getDatabaseSettings(db: DatabaseSync): Record<string, unknown> {
  try {
    const settings: Record<string, unknown> = {};

    for (const pragma of [
      "journal_mode",
      "cache_size",
      "mmap_size",
      "synchronous",
      "temp_store",
      "busy_timeout",
    ]) {
      try {
        const result = db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown>;
        settings[pragma] = Object.values(result)[0];
      } catch {
        settings[pragma] = "error";
      }
    }

    return settings;
  } catch (error) {
    return { error: String(error) };
  }
}
