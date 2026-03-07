/**
 * OpenClaw Memory Enhancements - Integration
 *
 * Main integration point connecting all enhancement modules.
 */

import type Database from "better-sqlite3";
import { hybridSearch } from "./hybrid-search.js";
import { applyTemporalWeighting } from "./temporal.js";
import { rerank } from "./reranker.js";
import { AutoIndexer, createAutoIndexer } from "./auto-index.js";
import { runMigrations } from "./schema.js";
import type {
  EnhancedSearchConfig,
  SearchResult,
} from "./types.js";
import { DEFAULT_CONFIG } from "./config.js";

// ============================================================================
// Types
// ============================================================================

export interface MemoryEnhancements {
  search(query: string, options?: Partial<SearchOptions>): Promise<SearchResult[]>;
  indexFile(path: string): Promise<void>;
  startIndexer(): void;
  stopIndexer(): void;
  updateConfig(config: Partial<EnhancedSearchConfig>): void;
  getConfig(): EnhancedSearchConfig;
}

export interface SearchOptions {
  limit?: number;
  sources?: string[];
  skipRerank?: boolean;
  skipTemporal?: boolean;
  minScore?: number;
}

// ============================================================================
// Main Integration Class
// ============================================================================

export class OpenClawMemoryEnhancements implements MemoryEnhancements {
  private db: Database.Database;
  private config: EnhancedSearchConfig;
  private indexer?: AutoIndexer;
  private getEmbedding: (text: string) => Promise<number[]>;

  constructor(
    db: Database.Database,
    getEmbedding: (text: string) => Promise<number[]>,
    config?: Partial<EnhancedSearchConfig>
  ) {
    this.db = db;
    this.getEmbedding = getEmbedding;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Apply schema extensions
    runMigrations(this.db);
  }

  // --------------------------------------------------------------------------
  // Enhanced Search
  // --------------------------------------------------------------------------

  async search(
    query: string,
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      sources,
      skipRerank = false,
      skipTemporal = false,
      minScore = 0,
    } = options;

    // Step 1: Get query embedding
    const queryEmbedding = await this.getEmbedding(query);

    // Step 2: Hybrid search (vector + BM25 with RRF fusion)
    const candidateLimit = this.config.rerank.enabled && !skipRerank
      ? this.config.rerank.candidateCount
      : limit;

    const hybridResults = hybridSearch(this.db, {
      query,
      queryEmbedding,
      limit: candidateLimit,
      sources,
    });

    // Step 3: Apply temporal weighting
    let weightedResults = hybridResults;
    if (this.config.temporal.enabled && !skipTemporal) {
      weightedResults = applyTemporalWeighting(
        hybridResults,
        this.config.temporal
      );
    }

    // Step 4: Rerank (optional)
    let finalResults = weightedResults;
    if (this.config.rerank.enabled && !skipRerank) {
      finalResults = await rerank(
        query,
        weightedResults,
        this.config.rerank
      );
    }

    // Step 5: Filter and limit results
    return finalResults
      .filter(r => r.score >= minScore)
      .slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // Indexing
  // --------------------------------------------------------------------------

  async indexFile(path: string): Promise<void> {
    // This would integrate with OpenClaw's existing indexer
    console.log(`[memory-enhancements] Manual index requested for: ${path}`);
  }

  startIndexer(): void {
    if (this.indexer) {
      console.warn("[memory-enhancements] Indexer already running");
      return;
    }

    if (!this.config.autoIndex.enabled) {
      console.warn("[memory-enhancements] Auto-index is disabled in config");
      return;
    }

    createAutoIndexer(
      async (changes) => {
        // Process file changes using the embedding function
        for (const change of changes) {
          if (change.type === "unlink") continue;
          console.log(`[memory-enhancements] Indexing: ${change.path}`);
        }
      },
      this.config.autoIndex
    ).then(indexer => {
      this.indexer = indexer;
      console.log("[memory-enhancements] Auto-indexer started");
    }).catch(err => {
      console.error("[memory-enhancements] Failed to start indexer:", err);
    });
  }

  stopIndexer(): void {
    if (this.indexer) {
      this.indexer.stop();
      this.indexer = undefined;
      console.log("[memory-enhancements] Auto-indexer stopped");
    }
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  updateConfig(config: Partial<EnhancedSearchConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart indexer if config changed
    if (config.autoIndex && this.indexer) {
      this.stopIndexer();
      if (config.autoIndex.enabled) {
        this.startIndexer();
      }
    }
  }

  getConfig(): EnhancedSearchConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMemoryEnhancements(
  db: Database.Database,
  getEmbedding: (text: string) => Promise<number[]>,
  config?: Partial<EnhancedSearchConfig>
): MemoryEnhancements {
  return new OpenClawMemoryEnhancements(db, getEmbedding, config);
}

// ============================================================================
// Export
// ============================================================================

export default OpenClawMemoryEnhancements;
