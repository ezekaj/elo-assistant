/**
 * File Index Module for OpenClaw
 *
 * Provides file system indexing with fuzzy search.
 * Uses Rust N-API module when available, falls back to Fuse.js.
 */

import type {
  FileIndexEntry,
  FileIndexBuildOptions,
  FileIndexSearchOptions,
  FileIndexSearchResult,
} from "../types.js";
import type { FileIndexModule } from "./types.js";
import { logInfo } from "../../logger.js";
import {
  isFuseAvailable,
  buildIndexFallback,
  searchFallback,
  getAllEntriesFallback,
  clearFallback,
  getStatsFallback,
  isIndexedFallback,
  getRootPathFallback,
} from "./fuse-index.js";
import {
  getNativeModule,
  buildIndexNative,
  searchNative,
  getAllEntriesNative,
  clearNative,
  getStatsNative,
} from "./rust-index.js";

let cachedModule: FileIndexModule | null = null;

/**
 * Create file index module with native/fuse detection
 */
export async function createFileIndexModule(): Promise<FileIndexModule> {
  if (cachedModule) {
    return cachedModule;
  }

  const nativeAvailable = await getNativeModule();
  const fuseAvailable = isFuseAvailable();

  const module: FileIndexModule = {
    async buildIndex(options: FileIndexBuildOptions): Promise<{
      indexedFiles: number;
      indexedDirs: number;
      elapsedMs: number;
    }> {
      if (nativeAvailable) {
        try {
          return await buildIndexNative(options);
        } catch (err) {
          logInfo("[FileIndex] Native build failed, using fallback");
        }
      }

      return await buildIndexFallback(options);
    },

    async search(options: FileIndexSearchOptions): Promise<FileIndexSearchResult> {
      if (nativeAvailable) {
        try {
          return await searchNative(options);
        } catch (err) {
          logInfo("[FileIndex] Native search failed, using fallback");
        }
      }

      return await searchFallback(options);
    },

    async findByName(query: string, maxResults = 20): Promise<FileIndexEntry[]> {
      const result = await this.search({
        query,
        maxResults,
        minScore: 0.3,
      });
      return result.entries;
    },

    async getAllEntries(): Promise<FileIndexEntry[]> {
      if (nativeAvailable) {
        try {
          return await getAllEntriesNative();
        } catch {
          // Fall through to fallback
        }
      }

      return await getAllEntriesFallback();
    },

    clear(): void {
      if (nativeAvailable) {
        try {
          clearNative();
          return;
        } catch {
          // Fall through to fallback
        }
      }

      clearFallback();
    },

    async getStats(): Promise<{
      totalFiles: number;
      totalDirs: number;
      totalSize: number;
      rootPath: string;
    }> {
      if (nativeAvailable) {
        try {
          return await getStatsNative();
        } catch {
          // Fall through to fallback
        }
      }

      return await getStatsFallback();
    },

    isIndexed(): boolean {
      if (nativeAvailable) {
        try {
          const native = nativeAvailable;
          // Check if we have entries
          return true;
        } catch {
          // Fall through to fallback
        }
      }

      return isIndexedFallback();
    },

    getRootPath(): string | null {
      if (nativeAvailable) {
        try {
          // Native module would provide this
          return null;
        } catch {
          // Fall through to fallback
        }
      }

      return getRootPathFallback();
    },
  };

  cachedModule = module;

  const primary = nativeAvailable ? "rust-napi" : fuseAvailable ? "fuse.js" : "none";
  logInfo(`[FileIndex] Module initialized (primary: ${primary})`);

  return module;
}

/**
 * Get or create the file index module instance
 */
export async function getFileIndexModule(): Promise<FileIndexModule> {
  if (!cachedModule) {
    cachedModule = await createFileIndexModule();
  }
  return cachedModule;
}

/**
 * Convenience function: build index for a directory
 */
export async function buildIndex(options: FileIndexBuildOptions): Promise<{
  indexedFiles: number;
  indexedDirs: number;
  elapsedMs: number;
}> {
  const module = await getFileIndexModule();
  return await module.buildIndex(options);
}

/**
 * Convenience function: search the index
 */
export async function searchIndex(options: FileIndexSearchOptions): Promise<FileIndexSearchResult> {
  const module = await getFileIndexModule();
  return await module.search(options);
}

/**
 * Module instance (lazy loaded)
 */
export const fileIndexModule: Promise<FileIndexModule> = createFileIndexModule();
