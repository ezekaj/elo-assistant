/**
 * Color Diff Syntect N-API Bindings Stub
 *
 * This module provides native bindings to Syntect (Rust syntax highlighting library).
 * Syntect provides fast, high-quality syntax highlighting using Sublime Text themes.
 *
 * To build the native module:
 * 1. Ensure Rust and cargo are installed
 * 2. Run: cargo build --release -p syntect-napi
 * 3. The .node file will be in target/release/
 */

import type { ColorDiffNative } from "./types.js";
import { logWarn } from "../../logger.js";

let nativeModule: ColorDiffNative | null = null;
let loadAttempted = false;

/**
 * Try to load the native color diff module using dynamic import
 */
async function loadNativeModule(): Promise<ColorDiffNative | null> {
  if (loadAttempted) {
    return nativeModule;
  }
  loadAttempted = true;

  try {
    // Native module would be loaded here in production
    // For now, return null to trigger fallback
    logWarn("[ColorDiff] Native module not available (stub implementation)");
    return null;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[ColorDiff] Native module not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Get the native module or null if not available
 */
export async function getNativeModule(): Promise<ColorDiffNative | null> {
  return await loadNativeModule();
}

/**
 * Native implementation of highlight
 */
export async function highlightNative(
  options: Parameters<ColorDiffNative["highlight"]>[0],
): Promise<ReturnType<ColorDiffNative["highlight"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native color diff module not available");
  }
  return await native.highlight(options);
}

/**
 * Native implementation of highlightDiff
 */
export async function highlightDiffNative(
  options: Parameters<ColorDiffNative["highlightDiff"]>[0],
): Promise<ReturnType<ColorDiffNative["highlightDiff"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native color diff module not available");
  }
  return await native.highlightDiff(options);
}

/**
 * Native implementation of listThemes
 */
export async function listThemesNative(): Promise<ReturnType<ColorDiffNative["listThemes"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native color diff module not available");
  }
  return await native.listThemes();
}

/**
 * Native implementation of listLanguages
 */
export async function listLanguagesNative(): Promise<ReturnType<ColorDiffNative["listLanguages"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native color diff module not available");
  }
  return await native.listLanguages();
}

/**
 * Native implementation of detectLanguage
 */
export async function detectLanguageNative(
  filename: string,
): Promise<ReturnType<ColorDiffNative["detectLanguage"]>> {
  const native = await getNativeModule();
  if (!native) {
    throw new Error("Native color diff module not available");
  }
  return await native.detectLanguage(filename);
}
