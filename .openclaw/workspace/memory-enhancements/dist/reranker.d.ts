/**
 * OpenClaw Memory Enhancements - Cross-Encoder Reranking
 *
 * Two-stage retrieval: fast hybrid search followed by precise cross-encoder reranking.
 * Supports LM Studio local inference, Cohere API, and custom providers.
 */
import type { SearchResult, RerankConfig, RerankProvider } from "./types.js";
/**
 * Clear expired cache entries
 */
export declare function cleanupCache(): number;
/**
 * Clear all cache entries
 */
export declare function clearCache(): void;
/**
 * Rerank search results using the configured provider
 *
 * @param query - Search query
 * @param results - Search results to rerank
 * @param config - Reranking configuration
 * @returns Reranked search results sorted by rerank score
 */
export declare function rerank(query: string, results: SearchResult[], config?: RerankConfig): Promise<SearchResult[]>;
/**
 * Rerank with score blending
 *
 * Combines the original hybrid search score with the rerank score.
 *
 * @param query - Search query
 * @param results - Search results to rerank
 * @param config - Reranking configuration
 * @param originalWeight - Weight for original score (0-1)
 * @param rerankWeight - Weight for rerank score (0-1)
 */
export declare function rerankWithBlending(query: string, results: SearchResult[], config?: RerankConfig, originalWeight?: number, rerankWeight?: number): Promise<SearchResult[]>;
/**
 * Check if the reranking service is available
 */
export declare function checkRerankService(config?: RerankConfig): Promise<boolean>;
/**
 * Get reranking statistics
 */
export declare function getRerankStats(): {
    cacheSize: number;
    cacheHitRate: number;
};
/**
 * Create a rerank config for a specific provider
 */
export declare function createRerankConfig(provider: RerankProvider, options?: Partial<RerankConfig>): RerankConfig;
/**
 * Score a single query-passage pair
 *
 * Useful for debugging or one-off scoring.
 */
export declare function scorePassage(query: string, passage: string, config?: RerankConfig): Promise<number>;
//# sourceMappingURL=reranker.d.ts.map