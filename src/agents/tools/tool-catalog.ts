/**
 * Tool Catalog System
 *
 * Central registry for all tools with search capabilities.
 * Supports regex and BM25 search variants.
 * Enables deferred tool loading for large tool sets.
 *
 * Based on Claude Code's tool_search_tool_20251119
 */

import type { AnyAgentTool } from "./common.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ToolCatalogEntry {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  deferLoading?: boolean;
  definition: AnyAgentTool;
  searchMetadata: {
    keywords: string[];
    regexPattern?: string;
    searchableText: string;
  };
}

export interface ToolReference {
  type: "tool_reference";
  tool_name: string;
  metadata?: {
    description: string;
    category?: string;
    confidence?: number;
  };
}

export interface ToolSearchResult {
  type: "tool_search_tool_search_result";
  tool_references: ToolReference[];
}

export interface SearchOptions {
  variant?: "regex" | "bm25";
  limit?: number;
  minConfidence?: number;
}

// ============================================================================
// TOOL CATALOG
// ============================================================================

export class ToolCatalog {
  private entries = new Map<string, ToolCatalogEntry>();
  private searchIndex = new Map<string, string>(); // tool_name -> searchable_text

  /**
   * Register a tool in the catalog
   */
  register(entry: ToolCatalogEntry): void {
    this.entries.set(entry.name, entry);

    // Build searchable text
    const searchableText = [
      entry.name,
      entry.description,
      entry.category || "",
      ...(entry.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    this.searchIndex.set(entry.name, searchableText);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const deleted = this.entries.delete(name);
    this.searchIndex.delete(name);
    return deleted;
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolCatalogEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * Get all tools
   */
  getAll(): ToolCatalogEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get count of registered tools
   */
  getCount(): number {
    return this.entries.size;
  }

  /**
   * Search for tools
   */
  search(query: string, options?: SearchOptions): ToolCatalogEntry[] {
    const { variant = "regex", limit = 5, minConfidence = 0 } = options || {};

    let results: ToolCatalogEntry[];

    if (variant === "regex") {
      results = this.searchRegex(query);
    } else {
      results = this.searchBM25(query);
    }

    // Apply filters
    return results
      .filter((r) => {
        const confidence = this.calculateConfidence(r, query);
        return confidence >= minConfidence;
      })
      .slice(0, limit);
  }

  /**
   * Regex-based search
   */
  private searchRegex(pattern: string): ToolCatalogEntry[] {
    try {
      const regex = new RegExp(pattern, "i"); // Case-insensitive

      return this.getAll().filter((entry) => {
        const { searchMetadata } = entry;

        // Check name
        if (regex.test(entry.name)) return true;

        // Check description
        if (regex.test(entry.description)) return true;

        // Check keywords
        if (searchMetadata.keywords.some((k) => regex.test(k))) return true;

        // Check custom regex pattern
        if (searchMetadata.regexPattern && regex.test(searchMetadata.regexPattern)) return true;

        return false;
      });
    } catch {
      // Invalid regex, return empty
      return [];
    }
  }

  /**
   * BM25-based search (simplified implementation)
   * For production, use a proper BM25 library
   */
  private searchBM25(query: string): ToolCatalogEntry[] {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const scores = new Map<string, number>();

    // Score each document
    for (const [name, text] of this.searchIndex) {
      let score = 0;

      for (const term of queryTerms) {
        if (text.includes(term)) {
          score += 1;

          // Boost for name match
          if (name.toLowerCase().includes(term)) {
            score += 2;
          }
        }
      }

      if (score > 0) {
        scores.set(name, score);
      }
    }

    // Sort by score
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => this.get(name))
      .filter((e): e is ToolCatalogEntry => e !== undefined);

    return sorted;
  }

  /**
   * Calculate confidence score for a result
   */
  private calculateConfidence(entry: ToolCatalogEntry, query: string): number {
    const queryLower = query.toLowerCase();
    const nameLower = entry.name.toLowerCase();

    // Exact name match
    if (nameLower === queryLower) return 1.0;

    // Name contains query
    if (nameLower.includes(queryLower)) return 0.9;

    // Description contains query
    if (entry.description.toLowerCase().includes(queryLower)) return 0.7;

    // Keyword match
    if (entry.tags?.some((t) => t.toLowerCase() === queryLower)) return 0.8;

    return 0.5;
  }
}

// ============================================================================
// TOOL REFERENCE UTILS
// ============================================================================

/**
 * Convert catalog entry to tool reference
 */
export function toToolReference(entry: ToolCatalogEntry, confidence?: number): ToolReference {
  return {
    type: "tool_reference",
    tool_name: entry.name,
    metadata: {
      description: entry.description,
      category: entry.category,
      confidence: confidence ?? 0.5,
    },
  };
}

/**
 * Create tool search result
 */
export function createToolSearchResult(references: ToolReference[]): ToolSearchResult {
  return {
    type: "tool_search_tool_search_result",
    tool_references: references,
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalCatalog: ToolCatalog | null = null;

/**
 * Get or create global tool catalog
 */
export function getToolCatalog(): ToolCatalog {
  if (!globalCatalog) {
    globalCatalog = new ToolCatalog();
  }
  return globalCatalog;
}

/**
 * Reset global catalog (for testing)
 */
export function resetToolCatalog(): void {
  globalCatalog = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ToolCatalog, getToolCatalog, resetToolCatalog, toToolReference, createToolSearchResult };

export type { ToolCatalogEntry, ToolReference, ToolSearchResult, SearchOptions };
