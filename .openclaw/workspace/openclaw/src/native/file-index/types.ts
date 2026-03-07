/**
 * File Index Module Types
 */

import type {
  FileIndexEntry,
  FileIndexBuildOptions,
  FileIndexSearchOptions,
  FileIndexSearchResult,
} from "../types.js";

/**
 * Native file index module interface (N-API bindings from Rust)
 */
export interface FileIndexNative {
  /**
   * Build index for a directory
   */
  buildIndex(options: FileIndexBuildOptions): Promise<{
    indexedFiles: number;
    indexedDirs: number;
    elapsedMs: number;
  }>;
  /**
   * Search the index with fuzzy matching
   */
  search(options: FileIndexSearchOptions): Promise<FileIndexSearchResult>;
  /**
   * Get all indexed entries
   */
  getAllEntries(): Promise<FileIndexEntry[]>;
  /**
   * Clear the index
   */
  clear(): void;
  /**
   * Get index statistics
   */
  getStats(): Promise<{
    totalFiles: number;
    totalDirs: number;
    totalSize: number;
    rootPath: string;
  }>;
}

/**
 * File index module interface (unified)
 */
export interface FileIndexModule {
  /**
   * Build index for a directory
   */
  buildIndex(options: FileIndexBuildOptions): Promise<{
    indexedFiles: number;
    indexedDirs: number;
    elapsedMs: number;
  }>;
  /**
   * Search the index with fuzzy matching
   */
  search(options: FileIndexSearchOptions): Promise<FileIndexSearchResult>;
  /**
   * Quick search by file name
   */
  findByName(query: string, maxResults?: number): Promise<FileIndexEntry[]>;
  /**
   * Get all indexed entries
   */
  getAllEntries(): Promise<FileIndexEntry[]>;
  /**
   * Clear the index
   */
  clear(): void;
  /**
   * Get index statistics
   */
  getStats(): Promise<{
    totalFiles: number;
    totalDirs: number;
    totalSize: number;
    rootPath: string;
  }>;
  /**
   * Check if index is built
   */
  isIndexed(): boolean;
  /**
   * Get the indexed root path
   */
  getRootPath(): string | null;
}

/**
 * Fuse.js options for fuzzy search
 */
export interface FuseOptions {
  /** Whether to sort results by score */
  shouldSort?: boolean;
  /** Whether to include score in results */
  includeScore?: boolean;
  /** Minimum score threshold (0-1) */
  threshold?: number;
  /** Maximum results to return */
  maxResults?: number;
  /** Keys to search */
  keys?: string[];
  /** Whether to use location-based scoring */
  location?: number;
  /** Pattern length affects location scoring */
  distance?: number;
  /** How much weight to give to location-based scoring */
  ignoreLocation?: boolean;
  /** Minimum characters for matching */
  minMatchCharLength?: number;
}
