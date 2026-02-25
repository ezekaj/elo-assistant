/**
 * Color Diff Module for OpenClaw
 *
 * Provides syntax highlighting and colored diffs.
 * Uses Rust Syntect when available, falls back to Highlight.js.
 */

import type { HighlightOptions, DiffHighlightOptions, HighlightResult } from "../types.js";
import type { ColorDiffModule } from "./types.js";
import { logInfo } from "../../logger.js";
import {
  isHighlightJsAvailable,
  highlightCode,
  highlightDiff,
  listThemesFallback,
  listLanguagesFallback,
  detectLanguageFromFilename,
  getVersion,
} from "./highlight.js";
import {
  getNativeModule,
  highlightNative,
  highlightDiffNative,
  listThemesNative,
  listLanguagesNative,
  detectLanguageNative,
} from "./syntect.js";

let cachedModule: ColorDiffModule | null = null;

/**
 * Create color diff module with syntect/highlight.js detection
 */
export async function createColorDiffModule(): Promise<ColorDiffModule> {
  if (cachedModule) {
    return cachedModule;
  }

  const nativeAvailable = await getNativeModule();
  const highlightJsAvailable = isHighlightJsAvailable();

  const module: ColorDiffModule = {
    async highlight(options: HighlightOptions): Promise<HighlightResult> {
      if (nativeAvailable) {
        try {
          return await highlightNative(options);
        } catch (err) {
          logInfo("[ColorDiff] Native highlight failed, using fallback");
        }
      }

      return await highlightCode(options);
    },

    async highlightDiff(options: DiffHighlightOptions): Promise<HighlightResult> {
      if (nativeAvailable) {
        try {
          return await highlightDiffNative(options);
        } catch (err) {
          logInfo("[ColorDiff] Native diff highlight failed, using fallback");
        }
      }

      return await highlightDiff(options);
    },

    async listThemes(): Promise<string[]> {
      if (nativeAvailable) {
        try {
          return await listThemesNative();
        } catch {
          // Fall through to fallback
        }
      }

      return listThemesFallback();
    },

    async listLanguages(): Promise<string[]> {
      if (nativeAvailable) {
        try {
          return await listLanguagesNative();
        } catch {
          // Fall through to fallback
        }
      }

      return listLanguagesFallback();
    },

    async detectLanguage(filename: string): Promise<string | null> {
      if (nativeAvailable) {
        try {
          return await detectLanguageNative(filename);
        } catch {
          // Fall through to fallback
        }
      }

      return detectLanguageFromFilename(filename);
    },

    isAvailable(): boolean {
      return nativeAvailable !== null || highlightJsAvailable;
    },
  };

  cachedModule = module;

  const primary = nativeAvailable ? "syntect" : highlightJsAvailable ? "highlight.js" : "none";
  logInfo(`[ColorDiff] Module initialized (primary: ${primary})`);

  return module;
}

/**
 * Get or create the color diff module instance
 */
export async function getColorDiffModule(): Promise<ColorDiffModule> {
  if (!cachedModule) {
    cachedModule = await createColorDiffModule();
  }
  return cachedModule;
}

/**
 * Convenience function: highlight source code
 */
export async function highlightCode(options: HighlightOptions): Promise<HighlightResult> {
  const module = await getColorDiffModule();
  return await module.highlight(options);
}

/**
 * Convenience function: highlight a diff
 */
export async function highlightDiff(options: DiffHighlightOptions): Promise<HighlightResult> {
  const module = await getColorDiffModule();
  return await module.highlightDiff(options);
}

/**
 * Module instance (lazy loaded)
 */
export const colorDiffModule: Promise<ColorDiffModule> = createColorDiffModule();

// Re-export ANSI colors for convenience
export { ANSI_COLORS } from "./types.js";
