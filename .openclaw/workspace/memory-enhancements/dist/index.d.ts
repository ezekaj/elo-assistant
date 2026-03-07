/**
 * OpenClaw Memory Enhancements
 *
 * Enhanced memory search with:
 * - Hybrid search (vector + BM25 with RRF)
 * - Temporal weighting (recency decay)
 * - Cross-encoder reranking
 * - Auto-indexing (file watcher)
 */
export { OpenClawMemoryEnhancements, createMemoryEnhancements } from "./integration.js";
export type { MemoryEnhancements, SearchOptions } from "./integration.js";
export { hybridSearch, searchVector, mergeWithRRF } from "./hybrid-search.js";
export { applyTemporalWeighting, calculateDecayFactor } from "./temporal.js";
export { rerank, rerankWithBlending } from "./reranker.js";
export { AutoIndexer, createAutoIndexer } from "./auto-index.js";
export { runMigrations, checkFtsIntegrity } from "./schema.js";
export type { EnhancedSearchConfig, SearchResult, SearchRowResult, HybridSearchConfig, TemporalConfig, RerankConfig, AutoIndexConfig, DecayProfile, RerankProvider, } from "./types.js";
export { DEFAULT_HYBRID_CONFIG, DEFAULT_TEMPORAL_CONFIG, DEFAULT_RERANK_CONFIG, DEFAULT_AUTO_INDEX_CONFIG, DEFAULT_CONFIG, } from "./config.js";
//# sourceMappingURL=index.d.ts.map