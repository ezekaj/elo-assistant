/**
 * File Index Fallback using Fuse.js
 *
 * Provides fuzzy file search when native Rust module is unavailable.
 * Uses Fuse.js for fuzzy matching.
 */

import { readdir, stat } from "node:fs/promises";
import { basename, extname, relative, join } from "node:path";
import type {
  FileIndexEntry,
  FileIndexBuildOptions,
  FileIndexSearchOptions,
  FileIndexSearchResult,
} from "../types.js";
import { logInfo, logWarn } from "../../logger.js";

let fuseModule: any | null = null;
let fuseAvailable: boolean | undefined;

// In-memory index storage
let indexedEntries: FileIndexEntry[] = [];
let indexedRoot: string | null = null;
let fuseInstance: any = null;

/**
 * Try to load Fuse.js module using dynamic import
 */
async function loadFuse(): Promise<any | null> {
  if (fuseModule !== null) {
    return fuseModule;
  }

  try {
    // Fuse.js exports as default in ESM
    const fuse = await import("fuse.js");
    fuseModule = fuse.default || fuse;
    fuseAvailable = true;
    logInfo("[FileIndex] Fuse.js loaded successfully");
    return fuseModule;
  } catch (err) {
    fuseModule = null;
    fuseAvailable = false;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[FileIndex] Fuse.js not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Check if Fuse.js is available
 */
export async function isFuseAvailable(): Promise<boolean> {
  if (fuseAvailable !== undefined) {
    return fuseAvailable;
  }
  return (await loadFuse()) !== null;
}

/**
 * Recursively scan a directory for files
 */
async function scanDirectory(
  root: string,
  currentDir: string,
  options: FileIndexBuildOptions,
  depth = 0,
): Promise<FileIndexEntry[]> {
  const entries: FileIndexEntry[] = [];

  // Check max depth
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return entries;
  }

  try {
    const items = await readdir(currentDir, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden files/dirs unless requested
      if (!options.includeHidden && item.name.startsWith(".")) {
        continue;
      }

      // Skip node_modules unless requested
      if (!options.includeNodeModules && item.name === "node_modules") {
        continue;
      }

      // Skip common excluded directories
      if (options.exclude?.some((pattern) => item.name.match(new RegExp(pattern)))) {
        continue;
      }

      const fullPath = join(currentDir, item.name);
      const relPath = relative(root, fullPath);

      if (item.isDirectory()) {
        // Add directory entry
        entries.push({
          path: relPath,
          name: item.name,
          isDirectory: true,
          size: 0,
          extension: "",
        });

        // Recurse into subdirectory
        const subEntries = await scanDirectory(root, fullPath, options, depth + 1);
        entries.push(...subEntries);
      } else if (item.isFile()) {
        // Get file stats
        try {
          const stats = await stat(fullPath);

          // Check file size limit
          if (options.maxFileSize && stats.size > options.maxFileSize) {
            continue;
          }

          // Check extension filter
          if (options.extensions?.length && !options.extensions.includes(extname(item.name))) {
            continue;
          }

          entries.push({
            path: relPath,
            name: item.name,
            isDirectory: false,
            size: stats.size,
            extension: extname(item.name),
          });
        } catch (err) {
          // Skip files we can't stat
        }
      }
    }
  } catch (err) {
    // Skip directories we can't read
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[FileIndex] Error scanning ${currentDir}: ${errorMsg}`);
  }

  return entries;
}

/**
 * Build index using Fuse.js
 */
export async function buildIndexFallback(options: FileIndexBuildOptions): Promise<{
  indexedFiles: number;
  indexedDirs: number;
  elapsedMs: number;
}> {
  const startTime = Date.now();

  const Fuse = await loadFuse();
  if (!Fuse) {
    throw new Error("Fuse.js not available");
  }

  // Scan directory
  const entries = await scanDirectory(options.root, options.root, options, 0);

  // Separate files and dirs
  const files = entries.filter((e) => !e.isDirectory);
  const dirs = entries.filter((e) => e.isDirectory);

  // Create Fuse.js index - Fuse is a constructor function
  fuseInstance = new Fuse(files, {
    keys: ["name", "path"],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: options.minQueryLength || 2,
  });

  // Store indexed data
  indexedEntries = entries;
  indexedRoot = options.root;

  const elapsedMs = Date.now() - startTime;

  logInfo(`[FileIndex] Indexed ${files.length} files and ${dirs.length} dirs in ${elapsedMs}ms`);

  return {
    indexedFiles: files.length,
    indexedDirs: dirs.length,
    elapsedMs,
  };
}

/**
 * Search index using Fuse.js
 */
export async function searchFallback(
  options: FileIndexSearchOptions,
): Promise<FileIndexSearchResult> {
  if (!fuseInstance) {
    throw new Error("Index not built. Call buildIndex first.");
  }

  const startTime = Date.now();

  const results = fuseInstance.search(options.query, {
    limit: options.maxResults || 20,
  });

  const entries: FileIndexEntry[] = results.map((r: any) => ({
    ...r.item,
    score: r.score || 0,
  }));

  return {
    entries,
    totalResults: entries.length,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Get all indexed entries
 */
export async function getAllEntriesFallback(): Promise<FileIndexEntry[]> {
  return indexedEntries;
}

/**
 * Clear the index
 */
export function clearFallback(): void {
  indexedEntries = [];
  indexedRoot = null;
  fuseInstance = null;
  logInfo("[FileIndex] Index cleared");
}

/**
 * Get index statistics
 */
export async function getStatsFallback(): Promise<{
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  rootPath: string;
}> {
  const files = indexedEntries.filter((e) => !e.isDirectory);
  const dirs = indexedEntries.filter((e) => e.isDirectory);
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  return {
    totalFiles: files.length,
    totalDirs: dirs.length,
    totalSize,
    rootPath: indexedRoot || "",
  };
}

/**
 * Check if index exists
 */
export function isIndexedFallback(): boolean {
  return fuseInstance !== null && indexedEntries.length > 0;
}

/**
 * Get the root path of the index
 */
export function getRootPathFallback(): string | null {
  return indexedRoot;
}
