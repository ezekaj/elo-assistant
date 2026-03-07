/**
 * OpenClaw Memory Enhancements - Hybrid Search with RRF Fusion
 *
 * Combines vector search and BM25 search using Reciprocal Rank Fusion.
 */
import type Database from "better-sqlite3";
import type { SearchRowResult, SearchResult, HybridSearchConfig, RRFResult } from "./types.js";
/**
 * Perform vector similarity search using sqlite-vec
 *
 * @param db - SQLite database connection
 * @param queryEmbedding - Query embedding vector
 * @param limit - Maximum number of results
 * @param sources - Optional source filter
 * @returns Array of search results with cosine similarity scores
 */
export declare function searchVector(db: Database.Database, queryEmbedding: number[], limit: number, sources?: string[]): SearchRowResult[];
/**
 * Fallback in-memory cosine similarity search
 * Used when sqlite-vec is not available
 */
export declare function searchVectorFallback(db: Database.Database, queryEmbedding: number[], limit: number, sources?: string[]): SearchRowResult[];
/**
 * Merge results using Reciprocal Rank Fusion
 *
 * RRF Score = Σ 1/(k + rank_i)
 *
 * where k is a constant (typically 60) and rank_i is the rank in each result list
 *
 * @param vectorResults - Results from vector search
 * @param bm25Results - Results from BM25 search
 * @param config - Hybrid search configuration
 * @returns Merged and scored results
 */
export declare function mergeWithRRF(vectorResults: SearchRowResult[], bm25Results: SearchRowResult[], config?: HybridSearchConfig): RRFResult[];
/**
 * Alternative weighted linear combination merge
 * Simpler than RRF but can be effective
 */
export declare function mergeWeightedLinear(vectorResults: SearchRowResult[], bm25Results: SearchRowResult[], vectorWeight?: number, bm25Weight?: number): Map<string, {
    score: number;
    vectorScore?: number;
    bm25Score?: number;
}>;
export interface HybridSearchOptions {
    query: string;
    queryEmbedding: number[];
    limit: number;
    sources?: string[];
    config?: Partial<HybridSearchConfig>;
    useVecFallback?: boolean;
}
/**
 * Perform hybrid search combining vector and BM25
 *
 * @param db - SQLite database connection
 * @param options - Search options
 * @returns Combined search results
 */
export declare function hybridSearch(db: Database.Database, options: HybridSearchOptions): SearchResult[];
/**
 * Check if sqlite-vec extension is available
 */
export declare function checkVectorExtension(db: Database.Database): boolean;
/**
 * Get hybrid search statistics
 */
export declare function getHybridStats(db: Database.Database): {
    vectorCount: number;
    ftsCount: number;
    overlapPct: number;
} | null;
//# sourceMappingURL=hybrid-search.d.ts.map