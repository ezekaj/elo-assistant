/**
 * File Index Rust N-API Bindings Stub
 *
 * This module provides native bindings to a Rust-based file indexer.
 * The Rust implementation would use libraries like:
 * - ignore (for .gitignore-aware traversal)
 * - fuzzy-matcher (for fuzzy search)
 * - napi-rs (for Node.js bindings)
 *
 * To build the native module:
 * 1. Ensure Rust and cargo are installed
 * 2. Run: cargo build --release -p file-index-napi
 * 3. The .node file will be in target/release/
 */

import type { FileIndexNative } from "./types.js";
import { logWarn } from "../../logger.js";

let nativeModule: FileIndexNative | null = null;
let loadAttempted = false;

/**
 * Try to load the native file index module using dynamic import
 */
async function loadNativeModule(): Promise<FileIndexNative | null> {
  if (loadAttempted) {
    return nativeModule;
  }
  loadAttempted = true;

  try {
    // Native module would be loaded here in production
    // For now, return null to trigger fallback
    logWarn("[FileIndex] Native module not available (stub implementation)");
    return null;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[FileIndex] Native module not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Get the native module or null if not available
 */
export async function getNativeModule(): Promise<FileIndexNative | null> {
  return await loadNativeModule();
}

/**
 * Native implementation of buildIndex
 */
export async function buildIndexNative(
  options: Parameters<FileIndexNative["buildIndex"]>[0],
): Promise<ReturnType<FileIndexNative["buildIndex"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native file index module not available");
  }
  return await native.buildIndex(options);
}

/**
 * Native implementation of search
 */
export async function searchNative(
  options: Parameters<FileIndexNative["search"]>[0],
): Promise<ReturnType<FileIndexNative["search"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native file index module not available");
  }
  return await native.search(options);
}

/**
 * Native implementation of getAllEntries
 */
export async function getAllEntriesNative(): Promise<ReturnType<FileIndexNative["getAllEntries"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native file index module not available");
  }
  return await native.getAllEntries();
}

/**
 * Native implementation of clear
 */
export function clearNative(): void {
  const native = nativeModule;
  if (!native) {
    throw new Error("Native file index module not available");
  }
  native.clear();
}

/**
 * Native implementation of getStats
 */
export async function getStatsNative(): Promise<ReturnType<FileIndexNative["getStats"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native file index module not available");
  }
  return await native.getStats();
}
