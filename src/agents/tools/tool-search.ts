/**
 * Tool Search Tools
 *
 * Implements Claude Code's tool search capability:
 * - tool_search_tool_regex_20251119
 * - tool_search_tool_bm25_20251119
 *
 * Enables searching through hundreds/thousands of tools
 * with on-demand loading.
 */

import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import {
  ToolCatalog,
  getToolCatalog,
  toToolReference,
  createToolSearchResult,
} from "./tool-catalog.js";

// ============================================================================
// REGEX SEARCH TOOL
// ============================================================================

/**
 * Create regex-based tool search tool
 *
 * Matches Claude Code's tool_search_tool_regex_20251119
 */
export function createToolSearchRegexTool(catalog?: ToolCatalog): AnyAgentTool {
  const toolCatalog = catalog || getToolCatalog();

  return {
    name: "tool_search_tool_regex",
    description:
      'Search for tools by regex pattern. Use patterns like "weather", "get_.*_data", etc. Returns up to 5 matching tools.',
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Regex pattern to match tool names and descriptions (max 200 chars)",
        },
      },
      required: ["query"],
    },
    execute: async (_toolCallId, params) => {
      try {
        const query = readStringParam(params, "query", { required: true });

        // Validate pattern length
        if (query.length > 200) {
          return jsonResult({
            type: "tool_search_tool_result_error",
            error_code: "pattern_too_long",
            message: "Pattern exceeds 200 characters",
          });
        }

        // Search catalog
        const results = toolCatalog.search(query, {
          variant: "regex",
          limit: 5,
        });

        // Convert to references
        const references = results.map((r) => toToolReference(r, 0.8));

        return jsonResult(createToolSearchResult(references));
      } catch (error: any) {
        return jsonResult({
          type: "tool_search_tool_result_error",
          error_code: "invalid_pattern",
          message: error.message,
        });
      }
    },
  };
}

// ============================================================================
// BM25 SEARCH TOOL
// ============================================================================

/**
 * Create BM25-based tool search tool
 *
 * Matches Claude Code's tool_search_tool_bm25_20251119
 */
export function createToolSearchBM25Tool(catalog?: ToolCatalog): AnyAgentTool {
  const toolCatalog = catalog || getToolCatalog();

  return {
    name: "tool_search_tool_bm25",
    description:
      'Search for tools using natural language. Describe what you need in plain English (e.g., "tools for working with weather data"). Returns up to 5 matching tools.',
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language description of tools needed",
        },
      },
      required: ["query"],
    },
    execute: async (_toolCallId, params) => {
      try {
        const query = readStringParam(params, "query", { required: true });

        // Search catalog
        const results = toolCatalog.search(query, {
          variant: "bm25",
          limit: 5,
        });

        // Convert to references
        const references = results.map((r) => toToolReference(r, 0.7));

        return jsonResult(createToolSearchResult(references));
      } catch (error: any) {
        return jsonResult({
          type: "tool_search_tool_result_error",
          error_code: "search_failed",
          message: error.message,
        });
      }
    },
  };
}

// ============================================================================
// COMBINED SEARCH TOOL (Optional)
// ============================================================================

/**
 * Create combined tool search tool
 *
 * Automatically chooses regex or BM25 based on query
 */
export function createToolSearchTool(catalog?: ToolCatalog): AnyAgentTool {
  const toolCatalog = catalog || getToolCatalog();

  return {
    name: "tool_search",
    description:
      "Search for tools by name, description, or functionality. Use regex patterns or natural language. Returns up to 5 matching tools.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (regex pattern or natural language)",
        },
        variant: {
          type: "string",
          enum: ["regex", "bm25", "auto"],
          description: "Search variant (default: auto)",
        },
      },
      required: ["query"],
    },
    execute: async (_toolCallId, params) => {
      try {
        const query = readStringParam(params, "query", { required: true });
        const variantParam = readStringParam(params, "variant");

        // Auto-detect variant
        let variant: "regex" | "bm25" = "bm25";

        if (variantParam === "regex") {
          variant = "regex";
        } else if (variantParam === "bm25") {
          variant = "bm25";
        } else {
          // Auto-detect: if query looks like regex, use regex
          const regexIndicators = [".*", ".+", "[", "]", "\\", "^", "$"];
          if (regexIndicators.some((ind) => query.includes(ind))) {
            variant = "regex";
          }
        }

        // Search catalog
        const results = toolCatalog.search(query, {
          variant,
          limit: 5,
        });

        // Convert to references
        const references = results.map((r) => toToolReference(r, 0.75));

        return jsonResult(createToolSearchResult(references));
      } catch (error: any) {
        return jsonResult({
          type: "tool_search_tool_result_error",
          error_code: "search_failed",
          message: error.message,
        });
      }
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { createToolSearchRegexTool, createToolSearchBM25Tool, createToolSearchTool };
