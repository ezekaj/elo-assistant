import { Type } from "@sinclair/typebox";
import { execa } from "execa";
import * as fs from "fs";
import * as path from "path";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam, readBooleanParam } from "./common.js";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const DEFAULT_GLOB_LIMIT = 100;
const DEFAULT_GLOB_OFFSET = 0;

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
// CLAUDE_CODE_GLOB_HIDDEN: Include hidden files (default: "true")
// CLAUDE_CODE_GLOB_NO_IGNORE: Don't respect .gitignore etc (default: "true")
const DEFAULT_INCLUDE_HIDDEN = isTruthy(process.env.CLAUDE_CODE_GLOB_HIDDEN, true);
const DEFAULT_RESPECT_IGNORE = !isTruthy(process.env.CLAUDE_CODE_GLOB_NO_IGNORE, true);

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const GlobSchema = Type.Object({
  pattern: Type.String({
    description: "The glob pattern to match files against (e.g., '**/*.ts', 'src/**/*.tsx')",
  }),
  path: Type.Optional(
    Type.String({
      description:
        "The directory to search in. If not specified, the current working directory will be used.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return (default: 100)",
      default: DEFAULT_GLOB_LIMIT,
      minimum: 1,
    }),
  ),
  offset: Type.Optional(
    Type.Number({
      description: "Pagination offset for results (default: 0)",
      default: DEFAULT_GLOB_OFFSET,
      minimum: 0,
    }),
  ),
  includeHidden: Type.Optional(
    Type.Boolean({
      description:
        "Include hidden files and directories (default: from CLAUDE_CODE_GLOB_HIDDEN env or true)",
      default: DEFAULT_INCLUDE_HIDDEN,
    }),
  ),
  respectIgnore: Type.Optional(
    Type.Boolean({
      description:
        "Respect .gitignore and other ignore files (default: from CLAUDE_CODE_GLOB_NO_IGNORE env or false)",
      default: DEFAULT_RESPECT_IGNORE,
    }),
  ),
});

const GlobOutputSchema = Type.Object({
  durationMs: Type.Number({
    description: "Time taken to execute the search in milliseconds",
  }),
  numFiles: Type.Number({
    description: "Total number of files found",
  }),
  filenames: Type.Array(Type.String(), {
    description: "Array of file paths that match the pattern",
  }),
  truncated: Type.Boolean({
    description: "Whether results were truncated (limited to max results)",
  }),
});

// ============================================================================
// GLOB IMPLEMENTATION (matching Claude Code's tCB function)
// ============================================================================

/**
 * Execute ripgrep to find files matching glob pattern
 * Matches Claude Code's tCB function (line 404576)
 */
async function executeGlob(
  pattern: string,
  baseDir: string,
  options: {
    limit: number;
    offset: number;
    includeHidden: boolean;
    respectIgnore: boolean;
  },
  abortSignal?: AbortSignal,
): Promise<{ files: string[]; truncated: boolean }> {
  const startTime = Date.now();

  // Build ripgrep command (matching Claude Code line 404596)
  const args = [
    "--files", // List files only (no content search)
    "--glob",
    pattern, // Glob pattern
    "--sort=modified", // Sort by modification time (newest first)
  ];

  // Add --hidden flag if includeHidden is true (default: true in Claude Code)
  if (options.includeHidden) {
    args.push("--hidden");
  }

  // Add --no-ignore flag if respectIgnore is false (default: false in Claude Code)
  if (!options.respectIgnore) {
    args.push("--no-ignore");
  }

  // Execute ripgrep
  const { stdout, stderr } = await execa("rg", args, {
    cwd: baseDir,
    stdin: "ignore", // Don't wait for stdin - ripgrep doesn't need it
    signal: abortSignal,
    reject: false,
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer
  });

  // Parse results (one file per line)
  const allFiles = stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((file) => {
      // Convert to absolute path if relative
      return path.isAbsolute(file) ? file : path.join(baseDir, file);
    });

  // Apply pagination (matching Claude Code line 404604)
  const hasMore = allFiles.length > options.offset + options.limit;
  const paginatedFiles = allFiles.slice(options.offset, options.offset + options.limit);

  return {
    files: paginatedFiles,
    truncated: hasMore,
  };
}

// ============================================================================
// GLOB TOOL IMPLEMENTATION
// ============================================================================

export function createGlobTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Glob",
    name: "glob",
    description:
      'Fast file pattern matching tool that works with any codebase size. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted by modification time. Use this tool when you need to find files by name patterns. When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead. You can call multiple tools in a single response.',
    parameters: GlobSchema,
    outputSchema: GlobOutputSchema,
    // @ts-expect-error - inputParamAliases is supported at runtime by the agent framework
    inputParamAliases: {
      directory: "path",
      dir: "path",
      maxResults: "limit",
      skip: "offset",
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async description(params: Record<string, unknown>) {
      const pattern = (params.pattern as string) || "*";
      const searchPath = (params.path as string) || "current directory";
      return `Finding files matching "${pattern}" in ${searchPath}`;
    },

    userFacingName() {
      return "Find Files";
    },

    /**
     * VALIDATION (matching Claude Code lines 283384-283416)
     */
    async validateInput(params: Record<string, unknown>) {
      const pattern = params.pattern as string;
      const searchPath = params.path as string | undefined;

      // Validate pattern
      if (!pattern || typeof pattern !== "string") {
        return {
          result: false,
          message: "pattern is required and must be a string",
          errorCode: 1,
        };
      }

      // Validate path if provided
      if (searchPath) {
        const resolvedPath = path.resolve(searchPath);

        // Check if path exists
        if (!fs.existsSync(resolvedPath)) {
          return {
            result: false,
            message: `Directory does not exist: ${searchPath}`,
            errorCode: 2,
          };
        }

        // Check if path is a directory
        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory()) {
          return {
            result: false,
            message: `Path is not a directory: ${searchPath}`,
            errorCode: 3,
          };
        }
      }

      // Validate limit
      const limit = params.limit as number | undefined;
      if (limit !== undefined && (limit < 1 || limit > 10000)) {
        return {
          result: false,
          message: "limit must be between 1 and 10000",
          errorCode: 4,
        };
      }

      // Validate offset
      const offset = params.offset as number | undefined;
      if (offset !== undefined && offset < 0) {
        return {
          result: false,
          message: "offset must be non-negative",
          errorCode: 5,
        };
      }

      return { result: true };
    },

    // execute method for compatibility with pi-tool-definition-adapter
    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const args = params as Record<string, unknown>;
      return this.call(args, {
        abortController: signal ? ({ signal } as any) : undefined,
      });
    },

    /**
     * CALL (matching Claude Code lines 283425-283445)
     */
    async call(params: Record<string, unknown>, context: any) {
      const startTime = Date.now();

      // Extract parameters with defaults
      const pattern = readStringParam(params, "pattern", { required: true });
      const searchPath = readStringParam(params, "path");
      const limit = readNumberParam(params, "limit") ?? DEFAULT_GLOB_LIMIT;
      const offset = readNumberParam(params, "offset") ?? DEFAULT_GLOB_OFFSET;
      const includeHidden = readBooleanParam(params, "includeHidden") ?? true;
      const respectIgnore = readBooleanParam(params, "respectIgnore") ?? false;

      // Resolve base directory
      const baseDir = searchPath ? path.resolve(searchPath) : process.cwd();

      try {
        // Execute glob search
        const result = await executeGlob(
          pattern,
          baseDir,
          {
            limit,
            offset,
            includeHidden,
            respectIgnore,
          },
          (context as any)?.abortController?.signal,
        );

        const durationMs = Date.now() - startTime;

        // Return structured output (matching Claude Code output schema)
        return jsonResult({
          durationMs,
          numFiles: result.files.length,
          filenames: result.files,
          truncated: result.truncated,
        });
      } catch (error: any) {
        // Handle ripgrep not found
        if (error.code === "ENOENT" && error.path === "rg") {
          return jsonResult({
            success: false,
            error:
              "ripgrep (rg) is not installed. Please install it: https://github.com/BurntSushi/ripgrep#installation",
            errorCode: 100,
          });
        }

        // Handle abort
        if (error.name === "AbortError") {
          return jsonResult({
            success: false,
            error: "Glob search was cancelled",
            errorCode: 101,
          });
        }

        // Handle other errors
        return jsonResult({
          success: false,
          error: `Glob search failed: ${error.message}`,
          errorCode: 102,
        });
      }
    },

    /**
     * OUTPUT FORMATTING (matching Claude Code lines 283453-283465)
     */
    async mapToolResultToToolResultBlockParam(result: any, toolUseId: string) {
      if (!result.filenames || result.filenames.length === 0) {
        return {
          tool_use_id: toolUseId,
          type: "tool_result",
          content: "No files found",
        };
      }

      // Format output as newline-separated file list
      const lines = [...result.filenames];

      // Add truncation notice if needed
      if (result.truncated) {
        lines.push("(Results are truncated. Consider using a more specific path or pattern.)");
      }

      return {
        tool_use_id: toolUseId,
        type: "tool_result",
        content: lines.join("\n"),
      };
    },
  };
}

// ============================================================================
// EXPORT HELPER FUNCTIONS FOR TESTING
// ============================================================================

export { executeGlob, DEFAULT_GLOB_LIMIT, DEFAULT_GLOB_OFFSET };
