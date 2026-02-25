/**
 * Deferred Tool Wrapper
 *
 * Wraps tools for deferred loading.
 * Tools are loaded on-demand via tool search.
 */

import type { AnyAgentTool } from "./common.js";
import type { ToolCatalogEntry } from "./tool-catalog.js";

// ============================================================================
// TYPES
// ============================================================================

export interface DeferredToolMetadata {
  deferred: true;
  catalog_entry_id: string;
  placeholder: boolean;
}

// ============================================================================
// DEFERRED TOOL WRAPPER
// ============================================================================

/**
 * Create a deferred tool wrapper
 *
 * The tool appears in the tool list but cannot be executed
 * until it's expanded via tool search.
 */
export function createDeferredTool(entry: ToolCatalogEntry): AnyAgentTool {
  return {
    name: entry.name,
    description: entry.description + " (Use tool_search to load)",
    parameters: entry.definition.parameters,
    execute: async () => {
      throw new Error(
        `Tool "${entry.name}" is deferred. ` +
          "Use tool_search_tool_regex or tool_search_tool_bm25 to load it first.",
      );
    },
    metadata: {
      deferred: true,
      catalog_entry_id: entry.name,
      placeholder: true,
    } as DeferredToolMetadata,
  };
}

/**
 * Check if a tool is deferred
 */
export function isDeferredTool(tool: AnyAgentTool): boolean {
  return (tool.metadata as DeferredToolMetadata)?.deferred === true;
}

/**
 * Expand a deferred tool to its full definition
 */
export function expandDeferredTool(
  tool: AnyAgentTool,
  catalog: import("./tool-catalog.js").ToolCatalog,
): AnyAgentTool | null {
  const metadata = tool.metadata as DeferredToolMetadata;

  if (!metadata?.deferred) {
    // Not a deferred tool, return as-is
    return tool;
  }

  // Get full definition from catalog
  const entry = catalog.get(metadata.catalog_entry_id);

  if (!entry) {
    return null;
  }

  // Return full definition
  return {
    ...entry.definition,
    metadata: {
      ...entry.definition.metadata,
      expanded_from_deferred: true,
    },
  };
}

// ============================================================================
// TOOL LOADING STRATEGY
// ============================================================================

export interface ToolLoadingStrategy {
  /** Tools always loaded initially */
  eagerTools: string[];

  /** Tools loaded on-demand */
  deferredTools: string[];

  /** Maximum tools in context at once */
  maxContextTools: number;

  /** Cache TTL for loaded tools (ms) */
  cacheTTL: number;
}

/**
 * Default loading strategy
 *
 * Keeps context small by deferring most tools
 */
export const defaultToolLoadingStrategy: ToolLoadingStrategy = {
  eagerTools: [
    "message",
    "memory_search",
    "memory_get",
    "tool_search_tool_regex",
    "tool_search_tool_bm25",
  ],
  deferredTools: [], // All other tools
  maxContextTools: 50, // Optimal for accuracy
  cacheTTL: 300000, // 5 minutes
};

/**
 * Split tools into eager and deferred
 */
export function splitToolsByStrategy(
  tools: AnyAgentTool[],
  strategy: ToolLoadingStrategy,
): { eager: AnyAgentTool[]; deferred: AnyAgentTool[] } {
  const eager: AnyAgentTool[] = [];
  const deferred: AnyAgentTool[] = [];

  for (const tool of tools) {
    if (strategy.eagerTools.includes(tool.name)) {
      eager.push(tool);
    } else {
      deferred.push(tool);
    }
  }

  return { eager, deferred };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  createDeferredTool,
  isDeferredTool,
  expandDeferredTool,
  splitToolsByStrategy,
  defaultToolLoadingStrategy,
};

export type { DeferredToolMetadata, ToolLoadingStrategy };
