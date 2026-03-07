/**
 * Ripgrep Pure JavaScript Fallback
 *
 * Uses child_process to call the ripgrep binary directly.
 * Falls back to grep if ripgrep is not available.
 */

import { spawn, exec } from "node:child_process";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import type { RipgrepOptions, RipgrepResult, RipgrepMatch } from "../types.js";
import type { RipgrepJsonOutput } from "./types.js";
import { logWarn, logInfo } from "../../logger.js";

const execAsync = promisify(exec);

/**
 * Cache for ripgrep binary path
 */
let ripgrepPathCache: string | null | undefined;

/**
 * Get the cached ripgrep path (for external access)
 */
export function getRipgrepPathCache(): string | null {
  return ripgrepPathCache ?? null;
}

/**
 * Find ripgrep binary in PATH
 */
export async function findRipgrepBinary(): Promise<string | null> {
  if (ripgrepPathCache !== undefined) {
    return ripgrepPathCache;
  }

  try {
    // Try common locations first
    const commonPaths = [
      "rg",
      "/usr/bin/rg",
      "/usr/local/bin/rg",
      "/opt/homebrew/bin/rg",
      process.env.LOCALAPPDATA
        ? join(process.env.LOCALAPPDATA, "Programs", "ripgrep", "rg.exe")
        : "",
    ].filter(Boolean);

    for (const path of commonPaths) {
      try {
        await execAsync(`${path} --version`, { timeout: 2000 });
        ripgrepPathCache = path;
        logInfo(`[Ripgrep] Found ripgrep at: ${path}`);
        return path;
      } catch {
        // Try next path
      }
    }

    ripgrepPathCache = null;
    logWarn("[Ripgrep] ripgrep binary not found, falling back to grep");
    return null;
  } catch (err) {
    ripgrepPathCache = null;
    return null;
  }
}

/**
 * Check if ripgrep is available
 */
export async function isRipgrepAvailable(): Promise<boolean> {
  const path = await findRipgrepBinary();
  return path !== null;
}

/**
 * Build ripgrep command arguments
 */
function buildRipgrepArgs(options: RipgrepOptions): string[] {
  const args: string[] = ["--json", "--no-heading", "--with-filename", "--line-number", "--column"];

  if (options.caseInsensitive) {
    args.push("-i");
  }

  if (options.glob) {
    args.push("--glob", options.glob);
  }

  if (options.ignore) {
    args.push("--ignore", options.ignore);
  }

  if (options.maxDepth !== undefined) {
    args.push("--max-depth", String(options.maxDepth));
  }

  if (options.filesWithMatches) {
    args.push("--files-with-matches");
  }

  if (options.beforeContext !== undefined && options.beforeContext > 0) {
    args.push("--before-context", String(options.beforeContext));
  }

  if (options.afterContext !== undefined && options.afterContext > 0) {
    args.push("--after-context", String(options.afterContext));
  }

  args.push(options.pattern);
  args.push(options.path);

  return args;
}

/**
 * Parse ripgrep JSON output
 */
function parseRipgrepOutput(output: string, basePath: string): RipgrepMatch[] {
  const matches: RipgrepMatch[] = [];
  const lines = output.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    try {
      const json = JSON.parse(line) as RipgrepJsonOutput;
      if (json.type === "match" && json.data) {
        const path = json.data.path?.text ?? "";
        const relativePath = relative(basePath, path) || path;

        const match: RipgrepMatch = {
          path: relativePath,
          line: json.data.line_number ?? 0,
          column: 0,
          text: json.data.lines?.text ?? "",
          submatches: json.data.submatches?.map((s) => ({
            start: s.start ?? 0,
            end: s.end ?? 0,
          })),
        };

        // Calculate column from first submatch or offset
        if (json.data.submatches && json.data.submatches.length > 0) {
          match.column = json.data.submatches[0].start ?? 0;
        } else if (json.data.absolute_offset !== undefined) {
          match.column = json.data.absolute_offset;
        }

        matches.push(match);
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return matches;
}

/**
 * Run ripgrep command and return output
 */
async function runRipgrep(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const rgPath = ripgrepPathCache ?? "rg";
    const proc = spawn(rgPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on("error", (err) => {
      resolve({ stdout, stderr, code: null });
    });
  });
}

/**
 * Fallback implementation using grep when ripgrep is not available
 */
async function searchWithGrep(options: RipgrepOptions): Promise<RipgrepResult> {
  const startTime = Date.now();

  try {
    const grepArgs: string[] = [];

    if (options.caseInsensitive) {
      grepArgs.push("-i");
    }

    if (options.lineNumbers !== false) {
      grepArgs.push("-n");
    }

    grepArgs.push("-r");
    grepArgs.push(options.pattern);
    grepArgs.push(options.path);

    const { stdout } = await execAsync(`grep ${grepArgs.join(" ")}`, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    const matches: RipgrepMatch[] = [];
    const lines = stdout.split("\n").filter((line) => line.trim());
    let filesSearched = 0;
    const seenFiles = new Set<string>();

    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length >= 3) {
        const path = parts[0];
        const lineNum = parseInt(parts[1], 10);
        const text = parts.slice(2).join(":");

        if (!seenFiles.has(path)) {
          seenFiles.add(path);
          filesSearched++;
        }

        matches.push({
          path: relative(options.path, path) || path,
          line: lineNum,
          column: 0,
          text: text.trim(),
        });
      }
    }

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
  } catch (err) {
    // grep failed, return empty result
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[Ripgrep] grep fallback failed: ${errorMsg}`);
    return {
      matches: [],
      filesSearched: 0,
      totalMatches: 0,
      truncated: false,
      elapsedMs: Date.now() - startTime,
    };
  }
}

/**
 * Fallback implementation of ripgrep search
 */
export async function searchFallback(options: RipgrepOptions): Promise<RipgrepResult> {
  const startTime = Date.now();

  try {
    const rgPath = await findRipgrepBinary();

    if (!rgPath) {
      // Fall back to grep
      return await searchWithGrep(options);
    }

    const args = buildRipgrepArgs(options);
    const { stdout, stderr, code } = await runRipgrep(args);

    if (code !== 0 && code !== 1) {
      // ripgrep error (code 1 means no matches, which is OK)
      logWarn(`[Ripgrep] Command failed with code ${code}: ${stderr}`);
    }

    const matches = parseRipgrepOutput(stdout, options.path);

    // Apply maxResults limit
    let truncated = false;
    if (options.maxResults !== undefined && matches.length > options.maxResults) {
      matches.splice(options.maxResults);
      truncated = true;
    }

    // Count unique files
    const uniqueFiles = new Set(matches.map((m) => m.path));

    return {
      matches,
      filesSearched: uniqueFiles.size,
      totalMatches: matches.length,
      truncated,
      elapsedMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[Ripgrep] Search failed: ${errorMsg}`);

    return {
      matches: [],
      filesSearched: 0,
      totalMatches: 0,
      truncated: false,
      elapsedMs: Date.now() - startTime,
    };
  }
}

/**
 * Fallback implementation of searchFiles
 */
export async function searchFilesFallback(
  options: Omit<RipgrepOptions, "filesWithMatches">,
): Promise<string[]> {
  const result = await searchFallback({ ...options, filesWithMatches: true });
  return [...new Set(result.matches.map((m) => m.path))];
}

/**
 * Get ripgrep version from binary
 */
export async function getVersionFallback(): Promise<string> {
  const rgPath = await findRipgrepBinary();
  if (!rgPath) {
    return "fallback (no ripgrep)";
  }

  try {
    const { stdout } = await execAsync(`${rgPath} --version`, { timeout: 2000 });
    const firstLine = stdout.split("\n")[0];
    return firstLine || "unknown";
  } catch {
    return "fallback";
  }
}
