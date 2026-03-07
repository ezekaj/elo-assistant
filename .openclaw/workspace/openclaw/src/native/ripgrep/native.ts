/**
 * Ripgrep N-API Native Bindings
 *
 * This module provides native bindings to ripgrep via N-API.
 * If the native module is not available, it will fall back to the JS implementation.
 *
 * To build the native module:
 * 1. Ensure Rust and cargo are installed
 * 2. Run: cargo build --release -p ripgrep-napi
 * 3. The .node file will be in target/release/
 */

import type { RipgrepNative } from "./types.js";
import { logWarn } from "../../logger.js";

let nativeModule: RipgrepNative | null = null;
let loadAttempted = false;

/**
 * Try to load the native ripgrep module using dynamic import
 */
async function loadNativeModule(): Promise<RipgrepNative | null> {
  if (loadAttempted) {
    return nativeModule;
  }
  loadAttempted = true;

  try {
    // Try to load the native module using dynamic import
    // In production, this would load from a pre-built binary
    // For now, return null to use the fallback implementation
    logWarn("[Ripgrep] Native module not available (stub implementation)");
    return null;
  } catch (err) {
    // Native module not available, will use fallback
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[Ripgrep] Native module not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Get the native module or null if not available
 */
export async function getNativeModule(): Promise<RipgrepNative | null> {
  return await loadNativeModule();
}

/**
 * Native implementation of ripgrep search
 */
export async function searchNative(
  options: Parameters<RipgrepNative["search"]>[0],
): Promise<ReturnType<RipgrepNative["search"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native ripgrep module not available");
  }
  return await native.search(options);
}

/**
 * Native implementation of ripgrep searchFiles
 */
export async function searchFilesNative(
  options: Parameters<RipgrepNative["searchFiles"]>[0],
): Promise<ReturnType<RipgrepNative["searchFiles"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native ripgrep module not available");
  }
  return await native.searchFiles(options);
}

/**
 * Get native ripgrep version
 */
export function getVersionNative(): string {
  const native = nativeModule;
  if (!native) {
    throw new Error("Native ripgrep module not available");
  }
  return native.version();
}
