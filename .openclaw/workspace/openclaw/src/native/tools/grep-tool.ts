/**
 * Grep Tool using Native Ripgrep Module
 *
 * Provides fast text search using ripgrep with automatic fallback.
 * Integrates with OpenClaw's tool system.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { RipgrepOptions, RipgrepResult } from "../types.js";
import { jsonResult } from "../../tools/common.js";
import { search as ripgrepSearch, searchFiles as ripgrepSearchFiles } from "../ripgrep/index.js";

/**
 * Create grep tool using native ripgrep module
 */
export function createGrepTool(): AgentTool {
  return {
    name: "grep",
    description: "Search file contents for patterns using ripgrep (fast grep alternative)",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file path to search in",
        },
        glob: {
          type: "string",
          description: "Glob pattern to filter files (e.g., '*.ts', 'src/**/*.js')",
        },
        ignore: {
          type: "string",
          description: "Glob pattern for files to ignore",
        },
        caseInsensitive: {
          type: "boolean",
          description: "Perform case-insensitive search",
          default: false,
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return",
          default: 100,
        },
        maxDepth: {
          type: "number",
          description: "Maximum directory depth to search",
        },
        filesWithMatches: {
          type: "boolean",
          description: "Only return file names with matches (no content)",
          default: false,
        },
      },
      required: ["pattern", "path"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const pattern = params.pattern as string;
        const path = params.path as string;

        if (!pattern || !pattern.trim()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: pattern is required",
              },
            ],
          };
        }

        if (!path || !path.trim()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: path is required",
              },
            ],
          };
        }

        const options: RipgrepOptions = {
          pattern: pattern.trim(),
          path: path.trim(),
          glob: params.glob as string | undefined,
          ignore: params.ignore as string | undefined,
          caseInsensitive: Boolean(params.caseInsensitive),
          maxResults: (params.maxResults as number) ?? 100,
          maxDepth: params.maxDepth as number | undefined,
          filesWithMatches: Boolean(params.filesWithMatches),
        };

        let result: RipgrepResult;

        if (options.filesWithMatches) {
          const files = await ripgrepSearchFiles(options);
          result = {
            matches: files.map((f) => ({
              path: f,
              line: 0,
              column: 0,
              text: "",
            })),
            filesSearched: files.length,
            totalMatches: files.length,
            truncated: false,
            elapsedMs: 0,
          };
        } else {
          result = await ripgrepSearch(options);
        }

        // Format output
        const output: string[] = [];

        if (result.totalMatches === 0) {
          output.push(`No matches found for pattern "${options.pattern}"`);
        } else {
          output.push(
            `Found ${result.totalMatches} match${result.totalMatches !== 1 ? "es" : ""} in ${result.filesSearched} file${result.filesSearched !== 1 ? "s" : ""} (${result.elapsedMs}ms)`,
          );
          output.push("");

          // Group by file
          const byFile = new Map<string, typeof result.matches>();
          for (const match of result.matches) {
            if (!byFile.has(match.path)) {
              byFile.set(match.path, []);
            }
            byFile.get(match.path)!.push(match);
          }

          for (const [filePath, matches] of byFile) {
            output.push(`\u001b[36m${filePath}\u001b[0m:`);
            for (const match of matches) {
              const lineNum = String(match.line).padStart(4, " ");
              output.push(`  ${lineNum}: ${match.text}`);
            }
            output.push("");
          }
        }

        if (result.truncated) {
          output.push(`\n[Results truncated at ${options.maxResults} matches]`);
        }

        return jsonResult({
          matches: result.matches,
          totalMatches: result.totalMatches,
          filesSearched: result.filesSearched,
          elapsedMs: result.elapsedMs,
          truncated: result.truncated,
          summary: output.join("\n"),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error searching: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Create rglob tool (search files by glob pattern)
 */
export function createRglobTool(): AgentTool {
  return {
    name: "rglob",
    description: "Find files matching a glob pattern using fast file search",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match (e.g., '**/*.ts', 'src/**/*.test.ts')",
        },
        path: {
          type: "string",
          description: "Root directory to search in",
          default: ".",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return",
          default: 100,
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden files and directories",
          default: false,
        },
      },
      required: ["pattern"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const pattern = (params.pattern as string)?.trim();
        const path = ((params.path as string) ?? ".").trim();
        const maxResults = (params.maxResults as number) ?? 100;
        const includeHidden = Boolean(params.includeHidden);

        if (!pattern) {
          return {
            content: [
              {
                type: "text",
                text: "Error: pattern is required",
              },
            ],
          };
        }

        // Use ripgrep to find files matching the pattern
        const result = await ripgrepSearch({
          pattern: ".*",
          path,
          glob: pattern,
          filesWithMatches: true,
          maxResults,
        });

        const files = [...new Set(result.matches.map((m) => m.path))];

        return jsonResult({
          files,
          totalFound: files.length,
          elapsedMs: result.elapsedMs,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error finding files: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Grep tool instance (lazy loaded)
 */
export const grepTool: AgentTool = createGrepTool();

/**
 * Rglob tool instance (lazy loaded)
 */
export const rglobTool: AgentTool = createRglobTool();
