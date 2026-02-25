/**
 * Ripgrep Module for OpenClaw
 *
 * Provides fast text search using ripgrep with automatic fallback
 * to grep when ripgrep is not available.
 */

import type { RipgrepOptions, RipgrepResult } from "../types.js";
import type { RipgrepModule } from "./types.js";
import { logInfo, logWarn } from "../../logger.js";
import {
  findRipgrepBinary,
  isRipgrepAvailable,
  searchFallback,
  searchFilesFallback,
  getVersionFallback,
} from "./fallback.js";
import { getNativeModule, searchNative, searchFilesNative, getVersionNative } from "./native.js";

let cachedModule: RipgrepModule | null = null;

/**
 * Create ripgrep module with native/fallback detection
 */
export async function createRipgrepModule(): Promise<RipgrepModule> {
  if (cachedModule) {
    return cachedModule;
  }

  // Check for native module first
  const nativeAvailable = await getNativeModule();
  const ripgrepAvailable = await isRipgrepAvailable();

  const module: RipgrepModule = {
    async search(options: RipgrepOptions): Promise<RipgrepResult> {
      // Try native first, then fallback to binary, then pure JS
      if (nativeAvailable) {
        try {
          return await searchNative(options);
        } catch (err) {
          logWarn("[Ripgrep] Native search failed, using fallback");
        }
      }

      if (ripgrepAvailable) {
        return await searchFallback(options);
      }

      // Last resort: pure JS search (very slow, for small directories only)
      return await searchPureJS(options);
    },

    async searchFiles(options: Omit<RipgrepOptions, "filesWithMatches">): Promise<string[]> {
      if (nativeAvailable) {
        try {
          return await searchFilesNative(options);
        } catch (err) {
          logWarn("[Ripgrep] Native searchFiles failed, using fallback");
        }
      }

      return await searchFilesFallback(options);
    },

    version(): string {
      if (nativeAvailable) {
        try {
          return getVersionNative();
        } catch {
          // Fall through to fallback
        }
      }

      if (ripgrepAvailable) {
        return "binary (via child_process)";
      }

      return "pure-js";
    },

    async isAvailable(): Promise<boolean> {
      return nativeAvailable !== null || ripgrepAvailable;
    },

    getBinaryPath(): string | null {
      return getRipgrepPathCache();
    },
  };

  cachedModule = module;

  const nativeStatus = nativeAvailable ? "native" : "no native";
  const binaryStatus = ripgrepAvailable ? "binary" : "no binary";
  logInfo(`[Ripgrep] Module initialized (${nativeStatus}, ${binaryStatus})`);

  return module;
}

/**
 * Get or create the ripgrep module instance
 */
export async function getRipgrepModule(): Promise<RipgrepModule> {
  if (!cachedModule) {
    cachedModule = await createRipgrepModule();
  }
  return cachedModule;
}

/**
 * Convenience function: search for pattern
 */
export async function search(options: RipgrepOptions): Promise<RipgrepResult> {
  const module = await getRipgrepModule();
  return await module.search(options);
}

/**
 * Convenience function: search for files matching pattern
 */
export async function searchFiles(
  options: Omit<RipgrepOptions, "filesWithMatches">,
): Promise<string[]> {
  const module = await getRipgrepModule();
  return await module.searchFiles(options);
}

/**
 * Module instance (lazy loaded)
 */
export const ripgrepModule: Promise<RipgrepModule> = createRipgrepModule();

// Re-export ripgrepPathCache for external access
export { getRipgrepPathCache } from "./fallback.js";

/**
 * Pure JavaScript search fallback (last resort)
 * Very slow, only suitable for small directories
 */
async function searchPureJS(options: RipgrepOptions): Promise<RipgrepResult> {
  const startTime = Date.now();
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const matches: RipgrepMatch[] = [];
  let filesSearched = 0;
  const pattern = options.caseInsensitive
    ? new RegExp(options.pattern, "i")
    : new RegExp(options.pattern);

  async function searchDir(dirPath: string, depth: number): Promise<void> {
    if (options.maxDepth !== undefined && depth > options.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip hidden files unless requested
        if (!options.includeHidden && entry.name.startsWith(".")) {
          continue;
        }

        // Check glob pattern
        if (options.glob) {
          const globRegex = globToRegex(options.glob);
          if (!globRegex.test(entry.name)) {
            continue;
          }
        }

        if (entry.isDirectory()) {
          await searchDir(fullPath, depth + 1);
        } else if (entry.isFile()) {
          filesSearched++;

          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const match = pattern.exec(line);

              if (match) {
                matches.push({
                  path: path.relative(options.path, fullPath) || fullPath,
                  line: i + 1,
                  column: match.index,
                  text: line,
                  submatches: [
                    {
                      start: match.index,
                      end: match.index + match[0].length,
                    },
                  ],
                });

                // Check max results
                if (options.maxResults && matches.length >= options.maxResults) {
                  return;
                }
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  await searchDir(options.path, 0);

  // Apply maxResults limit
  let truncated = false;
  if (options.maxResults !== undefined && matches.length > options.maxResults) {
    matches.splice(options.maxResults);
    truncated = true;
  }

  return {
    matches,
    filesSearched,
    totalMatches: matches.length,
    truncated,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Convert glob pattern to regex
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
