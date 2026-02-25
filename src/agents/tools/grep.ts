import { Type } from "@sinclair/typebox";
import { execa } from "execa";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readBooleanParam, readNumberParam } from "./common.js";

const EXCLUDE_DIRS = [".git", ".svn", ".hg", ".bzr"];

// ============================================================================
// RIPGREP TIMEOUT CONFIGURATION
// Matches Claude Code: 20s default, 60s for WSL
// ============================================================================

function isWSL(): boolean {
  return (
    process.platform === "linux" &&
    (process.env.WSL_DISTRO_NAME !== undefined ||
      process.env.WSL_INTEROP !== undefined ||
      require("os").release().toLowerCase().includes("microsoft"))
  );
}

const RIPGREP_TIMEOUT_MS = isWSL() ? 60000 : 20000;

// ============================================================================
// ENVIRONMENT VARIABLE HELPERS
// ============================================================================

function isTruthy(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const lower = value.toLowerCase().trim();
  return lower === "true" || lower === "1" || lower === "yes";
}

// Environment variable defaults (matching Claude Code)
// CLAUDE_CODE_GREP_HIDDEN: Include hidden files (default: "true")
// CLAUDE_CODE_GREP_NO_IGNORE: Don't respect .gitignore etc (default: "true")
const DEFAULT_GREP_HIDDEN = isTruthy(process.env.CLAUDE_CODE_GREP_HIDDEN, true);
const DEFAULT_GREP_NO_IGNORE = isTruthy(process.env.CLAUDE_CODE_GREP_NO_IGNORE, true);

const GrepSchema = Type.Object({
  pattern: Type.String({
    description: "Regular expression pattern to search for (uses ripgrep syntax)",
  }),
  path: Type.Optional(
    Type.String({
      description: "File or directory to search in (defaults to current working directory)",
    }),
  ),
  glob: Type.Optional(
    Type.String({
      description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
    }),
  ),
  output_mode: Type.Optional(
    Type.Union(
      [Type.Literal("content"), Type.Literal("files_with_matches"), Type.Literal("count")],
      {
        description:
          'Output mode: "content" shows matching lines, "files_with_matches" shows file paths, "count" shows match counts',
        default: "files_with_matches",
      },
    ),
  ),
  "-B": Type.Optional(
    Type.Number({
      description: "Number of lines to show before each match (requires output_mode: content)",
    }),
  ),
  "-A": Type.Optional(
    Type.Number({
      description: "Number of lines to show after each match",
    }),
  ),
  "-C": Type.Optional(
    Type.Number({
      description: "Number of lines to show before and after each match (context)",
    }),
  ),
  context: Type.Optional(
    Type.Number({
      description: "Alias for -C (context lines)",
    }),
  ),
  "-n": Type.Optional(
    Type.Boolean({
      description: "Show line numbers (default: true for content mode)",
      default: true,
    }),
  ),
  "-i": Type.Optional(
    Type.Boolean({
      description: "Case insensitive search",
    }),
  ),
  type: Type.Optional(
    Type.String({
      description: "File type to search (js, py, rust, go, java, etc.)",
    }),
  ),
  head_limit: Type.Optional(
    Type.Number({
      description: "Limit output to first N results (0 = unlimited)",
      default: 0,
    }),
  ),
  offset: Type.Optional(
    Type.Number({
      description: "Skip first N results before applying head_limit",
      default: 0,
    }),
  ),
  multiline: Type.Optional(
    Type.Boolean({
      description: "Enable multiline mode where . matches newlines",
      default: false,
    }),
  ),
});

// ============================================================================
// GREP OUTPUT SCHEMA
// ============================================================================

const GrepOutputSchema = Type.Object({
  mode: Type.Union([
    Type.Literal("content"),
    Type.Literal("files_with_matches"),
    Type.Literal("count"),
  ]),
  numFiles: Type.Number(),
  filenames: Type.Optional(Type.Array(Type.String())),
  content: Type.Optional(Type.String()),
  numLines: Type.Optional(Type.Number()),
  numMatches: Type.Optional(Type.Number()),
  appliedLimit: Type.Optional(Type.Number()),
  appliedOffset: Type.Optional(Type.Number()),
});

type GrepOutputMode = "content" | "files_with_matches" | "count";

function formatPathForDisplay(filePath: string, cwd: string): string {
  if (filePath.startsWith(cwd)) {
    return filePath.substring(cwd.length + 1);
  }
  return filePath;
}

function sliceWithLimit<T>(arr: T[], limit: number, offset: number): T[] {
  if (limit <= 0) return arr.slice(offset);
  return arr.slice(offset, offset + limit);
}

export function createGrepTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Search",
    name: "grep",
    description: "Search for text patterns using ripgrep (fast, respects .gitignore)",
    parameters: GrepSchema,
    outputSchema: GrepOutputSchema,
    // @ts-expect-error - inputParamAliases is supported at runtime by the agent framework
    inputParamAliases: {
      c: "-C",
      C: "-C",
      b: "-B",
      B: "-B",
      a: "-A",
      A: "-A",
      n: "-n",
      i: "-i",
      include: "glob",
      regex: "pattern",
      search: "pattern",
      directory: "path",
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async description(params: Record<string, unknown>) {
      const pattern = (params.pattern as string) || "pattern";
      const path = params.path as string;
      if (path) {
        return `Searching for "${pattern}" in ${path}`;
      }
      return `Searching for "${pattern}"`;
    },

    userFacingName() {
      return "Search";
    },

    async validateInput({ path }: { path?: string }) {
      if (path) {
        const fs = await import("fs");
        const pathModule = await import("path");
        const resolved = path.startsWith("/") ? path : pathModule.join(process.cwd(), path);
        if (!fs.existsSync(resolved)) {
          return {
            result: false,
            message: `Path does not exist: ${path}. Current directory: ${process.cwd()}`,
            errorCode: 1,
          };
        }
      }
      return { result: true };
    },

    // execute method for compatibility with pi-tool-definition-adapter
    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const args = params as Record<string, unknown>;
      return this.call(args, {
        abortController: signal ? ({ signal } as AbortController) : undefined,
        getAppState: async () => ({}),
      });
    },

    async call(
      args: Record<string, unknown>,
      {
        abortController,
        getAppState,
      }: { abortController?: AbortController; getAppState: () => Promise<any> },
    ) {
      const params = args as Record<string, unknown>;
      const pattern = readStringParam(params, "pattern", { required: true });
      const path = readStringParam(params, "path");
      const glob = readStringParam(params, "glob");
      const type = readStringParam(params, "type");
      const outputMode = (params.output_mode as GrepOutputMode) || "files_with_matches";
      const before = readNumberParam(params, "-B");
      const after = readNumberParam(params, "-A");
      const context = readNumberParam(params, "-C") || readNumberParam(params, "context");
      const lineNumbers = readBooleanParam(params, "-n") ?? true;
      const caseInsensitive = readBooleanParam(params, "-i") ?? false;
      const headLimit = readNumberParam(params, "head_limit") || 0;
      const offset = readNumberParam(params, "offset") || 0;
      const multiline = readBooleanParam(params, "multiline") ?? false;

      const cwd = path ? path : process.cwd();
      const rgArgs: string[] = [];

      // Add --hidden flag based on environment variable (default: true)
      if (DEFAULT_GREP_HIDDEN) {
        rgArgs.push("--hidden");
      }

      // Exclude common VCS directories (unless NO_IGNORE is set)
      if (!DEFAULT_GREP_NO_IGNORE) {
        for (const dir of EXCLUDE_DIRS) {
          rgArgs.push("--glob", `!${dir}`);
        }
      }

      rgArgs.push("--max-columns", "500");

      if (multiline) {
        rgArgs.push("-U", "--multiline-dotall");
      }

      if (caseInsensitive) {
        rgArgs.push("-i");
      }

      if (outputMode === "files_with_matches") {
        rgArgs.push("-l");
      } else if (outputMode === "count") {
        rgArgs.push("-c");
      }

      if (lineNumbers && outputMode === "content") {
        rgArgs.push("-n");
      }

      // Context lines
      if (outputMode === "content") {
        if (context !== undefined) {
          rgArgs.push("-C", context.toString());
        } else {
          if (before !== undefined) rgArgs.push("-B", before.toString());
          if (after !== undefined) rgArgs.push("-A", after.toString());
        }
      }

      // Handle patterns starting with dash
      if (String(pattern).startsWith("-")) {
        rgArgs.push("-e", String(pattern));
      } else {
        rgArgs.push(String(pattern));
      }

      if (type) {
        rgArgs.push("--type", type);
      }

      // Glob patterns
      if (glob) {
        const patterns = String(glob)
          .split(/\s+/)
          .flatMap((p) => (p.includes("{") ? [p] : p.split(",")));
        for (const p of patterns.filter(Boolean)) {
          rgArgs.push("--glob", p);
        }
      }

      // Apply permission exclusions from config
      const state = await getAppState();
      const exclusions = config?.tools?.grep?.excludePaths || [];
      for (const excl of exclusions) {
        const pattern = excl.startsWith("/") ? `!${excl}` : `!**/${excl}`;
        rgArgs.push("--glob", pattern);
      }

      // Execute ripgrep with EAGAIN retry logic (matches Claude Code)
      let execResult: { stdout: string; stderr: string; exitCode: number };
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount < maxRetries) {
        try {
          const rgExecResult = await execa("rg", rgArgs, {
            cwd,
            stdin: "ignore", // Don't wait for stdin - ripgrep doesn't need it
            signal: abortController?.signal,
            reject: false,
            maxBuffer: 50 * 1024 * 1024, // 50MB
            timeout: RIPGREP_TIMEOUT_MS,
          });

          execResult = {
            stdout: rgExecResult.stdout,
            stderr: rgExecResult.stderr,
            exitCode: rgExecResult.exitCode,
          };

          // Check for EAGAIN error (resource temporarily unavailable)
          // Retry with single-threaded mode (-j 1)
          if (
            execResult.stderr?.includes("EAGAIN") ||
            execResult.stderr?.includes("resource temporarily unavailable")
          ) {
            if (retryCount < maxRetries - 1) {
              console.warn("rg EAGAIN error detected, retrying with single-threaded mode (-j 1)");
              rgArgs.push("-j", "1");
              retryCount++;
              continue;
            }
          }

          break;
        } catch (error: any) {
          // Handle timeout errors
          if (error.code === "ETIMEDOUT" || error.timedOut) {
            throw new Error(
              `Ripgrep search timed out after ${RIPGREP_TIMEOUT_MS / 1000} seconds. ` +
                `Try searching a more specific path or pattern.`,
            );
          }
          // Handle abort
          if (error.signal === "SIGTERM" || error.signal === "SIGINT") {
            throw new Error("Ripgrep search was cancelled");
          }
          throw error;
        }
      }

      const { stdout, stderr, exitCode } = execResult;

      // Handle errors
      if (exitCode !== 0 && exitCode !== 1) {
        // 1 = no matches (not an error)
        throw new Error(`grep failed: ${stderr || "unknown error"}`);
      }

      // Process results based on output mode
      if (outputMode === "content") {
        const lines = stdout.split("\n").filter(Boolean);
        const formatted = lines.map((line) => {
          const colonIndex = line.indexOf(":");
          if (colonIndex > 0) {
            const filePath = line.substring(0, colonIndex);
            const rest = line.substring(colonIndex);
            return `${formatPathForDisplay(filePath, cwd)}${rest}`;
          }
          return line;
        });

        const sliced = sliceWithLimit(formatted, headLimit, offset);

        return jsonResult({
          mode: "content",
          numFiles: 0,
          filenames: [],
          content: sliced.join("\n"),
          numLines: sliced.length,
          ...(headLimit > 0 && { appliedLimit: headLimit }),
          ...(offset > 0 && { appliedOffset: offset }),
        });
      }

      if (outputMode === "count") {
        const lines = stdout.split("\n").filter(Boolean);
        const sliced = sliceWithLimit(lines, headLimit, offset);

        let totalMatches = 0;
        let fileCount = 0;
        for (const line of sliced) {
          const lastColon = line.lastIndexOf(":");
          if (lastColon > 0) {
            const count = parseInt(line.substring(lastColon + 1), 10);
            if (!isNaN(count)) {
              totalMatches += count;
              fileCount++;
            }
          }
        }

        return jsonResult({
          mode: "count",
          numFiles: fileCount,
          filenames: [],
          content: sliced.join("\n"),
          numMatches: totalMatches,
          ...(headLimit > 0 && { appliedLimit: headLimit }),
          ...(offset > 0 && { appliedOffset: offset }),
        });
      }

      // files_with_matches mode - sort by modification time
      const files = stdout.split("\n").filter(Boolean);
      const fs = await import("fs");
      const pathModule = await import("path");

      const sorted = await Promise.all(
        files.map(async (f) => {
          try {
            const fullPath = pathModule.isAbsolute(f) ? f : pathModule.join(cwd, f);
            const stat = await fs.promises.stat(fullPath);
            return [f, stat.mtimeMs || 0] as [string, number];
          } catch {
            return [f, 0] as [string, number];
          }
        }),
      );

      sorted.sort((a, b) => b[1] - a[1]); // Most recent first
      const slicedResult = sliceWithLimit(
        sorted.map((f) => f[0]),
        headLimit,
        offset,
      ).map((f) => formatPathForDisplay(f, cwd));

      return jsonResult({
        mode: "files_with_matches",
        filenames: slicedResult,
        numFiles: slicedResult.length,
        ...(headLimit > 0 && { appliedLimit: headLimit }),
        ...(offset > 0 && { appliedOffset: offset }),
      });
    },
  };
}

// Helper functions for parameter reading (mimic Claude Code's common.ts)
function readNumberParam(params: Record<string, unknown>, key: string): number | undefined {
  if (!(key in params)) return undefined;
  const val = params[key];
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
