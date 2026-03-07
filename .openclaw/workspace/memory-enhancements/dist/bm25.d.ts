/**
 * OpenClaw Memory Enhancements - BM25 Search
 *
 * Enhanced BM25 implementation using SQLite FTS5 with proper scoring.
 */
import type Database from "better-sqlite3";
import type { SearchRowResult } from "./types.js";
/**
 * Tokenize a query string for FTS5
 * Handles special characters and produces quoted terms
 */
export declare function tokenizeQuery(query: string): string;
/**
 * Build an FTS5 match expression with phrase support
 */
export declare function buildFtsQuery(query: string): string;
/**
 * Build source filter clause for SQL queries
 */
export declare function buildSourceFilter(sources?: string[]): {
    clause: string;
    params: string[];
};
/**
 * Perform BM25 search using FTS5
 *
 * @param db - SQLite database connection
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @param sources - Optional source filter
 * @returns Array of search results with BM25 scores
 */
export declare function searchBM25(db: Database.Database, query: string, limit: number, sources?: string[]): SearchRowResult[];
/**
 * Get BM25 score for a specific document given a query
 * Useful for reranking scenarios
 */
export declare function getBM25Score(db: Database.Database, query: string, chunkId: string): number | null;
/**
 * Check if FTS5 index exists and is populated
 */
export declare function checkFtsIndex(db: Database.Database): {
    exists: boolean;
    count: number;
};
/**
 * Rebuild FTS5 index from chunks table
 * Useful after direct chunk modifications
 */
export declare function rebuildFtsIndex(db: Database.Database): void;
/**
 * Get term frequencies for a query
 * Useful for debugging and understanding search behavior
 */
export declare function getTermStats(db: Database.Database, query: string): Map<string, {
    docFreq: number;
    totalFreq: number;
}>;
//# sourceMappingURL=bm25.d.ts.map