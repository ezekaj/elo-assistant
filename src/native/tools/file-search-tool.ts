/**
 * File Search Tool using Native File Index Module
 *
 * Provides fast fuzzy file search with indexing.
 * Integrates with OpenClaw's tool system.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { jsonResult } from "../../tools/common.js";
import {
  buildIndex as buildFileIndex,
  searchIndex,
  getFileIndexModule,
} from "../file-index/index.js";

/**
 * Cache for built indices (root path -> built)
 */
const indexCache = new Map<string, boolean>();

/**
 * Create file search tool using native file index module
 */
export function createFileSearchTool(): AgentTool {
  return {
    name: "file_search",
    description: "Fuzzy search for files by name with fast indexing",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Fuzzy search query (e.g., 'usrconf' matches 'userConfig.ts')",
        },
        path: {
          type: "string",
          description: "Root directory to search in",
          default: ".",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return",
          default: 20,
        },
        extension: {
          type: "string",
          description: "Filter by file extension (e.g., '.ts', '.js')",
        },
        type: {
          type: "string",
          enum: ["file", "directory"],
          description: "Filter by type",
        },
        rebuildIndex: {
          type: "boolean",
          description: "Force rebuild the file index",
          default: false,
        },
      },
      required: ["query"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const query = (params.query as string)?.trim();
        const path = ((params.path as string) ?? ".").trim();
        const maxResults = (params.maxResults as number) ?? 20;
        const extension = params.extension as string | undefined;
        const type = params.type as "file" | "directory" | undefined;
        const rebuildIndex = Boolean(params.rebuildIndex);

        if (!query) {
          return {
            content: [
              {
                type: "text",
                text: "Error: query is required",
              },
            ],
          };
        }

        const module = await getFileIndexModule();
        const absolutePath = path.startsWith("/") ? path : `${process.cwd()}/${path}`;

        // Check if we need to build/rebuild index
        const needsIndex = rebuildIndex || !indexCache.get(absolutePath) || !module.isIndexed();

        if (needsIndex) {
          const buildResult = await buildFileIndex({
            root: absolutePath,
            maxDepth: 10,
            includeHidden: false,
          });
          indexCache.set(absolutePath, true);
        }

        // Search the index
        const result = await searchIndex({
          query,
          maxResults,
          extension: extension?.replace(/^\./, ""),
          type,
          minScore: 0.2,
        });

        // Format output
        const output: string[] = [];

        if (result.entries.length === 0) {
          output.push(`No files found matching "${query}"`);
        } else {
          output.push(
            `Found ${result.totalMatches} file${result.totalMatches !== 1 ? "s" : ""} matching "${query}" (${result.elapsedMs}ms)`,
          );
          output.push("");

          for (const entry of result.entries) {
            const typeIcon = entry.isDirectory ? "📁" : "📄";
            const sizeStr = entry.isDirectory ? "" : ` (${formatSize(entry.size)})`;
            const scoreStr = entry.score !== undefined ? ` [score: ${entry.score.toFixed(2)}]` : "";
            output.push(`${typeIcon} ${entry.path}${sizeStr}${scoreStr}`);
          }
        }

        return jsonResult({
          entries: result.entries,
          totalMatches: result.totalMatches,
          elapsedMs: result.elapsedMs,
          indexSize: result.indexSize,
          summary: output.join("\n"),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error searching files: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Create file index tool (build index for a directory)
 */
export function createFileIndexTool(): AgentTool {
  return {
    name: "file_index",
    description: "Build or rebuild the file index for fast fuzzy search",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Root directory to index",
          default: ".",
        },
        include: {
          type: "array",
          items: { type: "string" },
          description: "Glob patterns to include",
        },
        exclude: {
          type: "array",
          items: { type: "string" },
          description: "Glob patterns to exclude",
        },
        maxDepth: {
          type: "number",
          description: "Maximum directory depth",
          default: 10,
        },
      },
      required: [],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const path = ((params.path as string) ?? ".").trim();
        const include = params.include as string[] | undefined;
        const exclude = params.exclude as string[] | undefined;
        const maxDepth = (params.maxDepth as number) ?? 10;

        const absolutePath = path.startsWith("/") ? path : `${process.cwd()}/${path}`;

        const result = await buildFileIndex({
          root: absolutePath,
          include,
          exclude,
          maxDepth,
          includeHidden: false,
        });

        indexCache.set(absolutePath, true);

        return jsonResult({
          indexedFiles: result.indexedFiles,
          indexedDirs: result.indexedDirs,
          elapsedMs: result.elapsedMs,
          path: absolutePath,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error building index: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Format file size in human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * File search tool instance
 */
export const fileSearchTool: AgentTool = createFileSearchTool();

/**
 * File index tool instance
 */
export const fileIndexTool: AgentTool = createFileIndexTool();
