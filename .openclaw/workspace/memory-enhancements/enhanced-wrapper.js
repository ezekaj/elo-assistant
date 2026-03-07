/**
 * OpenClaw Memory Enhancements - Wrapper
 * 
 * A drop-in enhancement for OpenClaw memory search.
 * Uses the same database but adds hybrid search, temporal weighting, and reranking.
 * 
 * Usage:
 *   import { EnhancedMemorySearch } from './enhanced-wrapper.js';
 *   const search = new EnhancedMemorySearch(db, getEmbeddingFn);
 *   const results = await search.search('query', { limit: 10 });
 */

import { hybridSearch } from './dist/hybrid-search.js';
import { applyTemporalWeighting } from './dist/temporal.js';
import { rerank } from './dist/reranker.js';
import { DEFAULT_CONFIG } from './dist/config.js';

export class EnhancedMemorySearch {
  constructor(db, getEmbedding, config = {}) {
    this.db = db;
    this.getEmbedding = getEmbedding;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enhanced search with hybrid + temporal + reranking
   */
  async search(query, options = {}) {
    const {
      limit = 10,
      sources,
      skipRerank = !this.config.rerank?.enabled,
      skipTemporal = !this.config.temporal?.enabled,
    } = options;

    // Step 1: Get embedding
    const embedding = await this.getEmbedding(query);

    // Step 2: Hybrid search
    const candidateLimit = this.config.rerank?.enabled && !skipRerank
      ? this.config.rerank.candidateCount
      : limit;

    const hybridResults = await hybridSearch(
      this.db,
      embedding,
      query,
      candidateLimit,
      sources
    );

    // Step 3: Temporal weighting
    let results = hybridResults;
    if (this.config.temporal?.enabled && !skipTemporal) {
      results = applyTemporalWeighting(results, this.config.temporal);
    }

    // Step 4: Reranking
    if (this.config.rerank?.enabled && !skipRerank) {
      results = await rerank(query, results, this.config.rerank);
    }

    // Step 5: Format and return
    return results.slice(0, limit).map(r => ({
      id: r.id,
      path: r.path,
      source: r.source,
      startLine: r.start_line,
      endLine: r.end_line,
      score: r.score,
      snippet: r.text?.substring(0, 200) || '',
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * Quick search without reranking (faster)
   */
  async quickSearch(query, limit = 10) {
    return this.search(query, { limit, skipRerank: true });
  }

  /**
   * Deep search with all enhancements (slower, more accurate)
   */
  async deepSearch(query, limit = 10) {
    return this.search(query, { limit, skipRerank: false, skipTemporal: false });
  }

  /**
   * Update configuration
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }
}

export default EnhancedMemorySearch;
