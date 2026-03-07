/**
 * OpenClaw Memory Enhancements - Database Schema Extensions
 *
 * Extends the OpenClaw memory database with temporal tracking,
 * rerank caching, and FTS5 indexing for hybrid search.
 */
import type Database from "better-sqlite3";
import type { SchemaVersion } from "./types.js";
/**
 * Get current schema version from database
 */
export declare function getSchemaVersion(db: Database.Database): number;
/**
 * Check if schema migrations are needed
 */
export declare function needsMigration(db: Database.Database): boolean;
/**
 * Run schema migrations
 */
export declare function runMigrations(db: Database.Database): SchemaVersion;
/**
 * Populate FTS index from existing chunks
 *
 * Run this after initial migration or if FTS gets out of sync.
 */
export declare function populateFtsIndex(db: Database.Database): number;
/**
 * Optimize FTS index
 *
 * Call periodically to improve search performance.
 */
export declare function optimizeFtsIndex(db: Database.Database): void;
/**
 * Rebuild FTS index from scratch
 *
 * Use when index becomes corrupted.
 */
export declare function rebuildFtsIndex(db: Database.Database): void;
/**
 * Check FTS index integrity
 */
export declare function checkFtsIntegrity(db: Database.Database): boolean;
/**
 * Backfill created_at from updated_at for existing records
 */
export declare function backfillCreatedAt(db: Database.Database): number;
/**
 * Update access timestamp for a chunk
 */
export declare function updateChunkAccess(db: Database.Database, chunkId: string): void;
/**
 * Batch update access for multiple chunks
 */
export declare function batchUpdateAccess(db: Database.Database, chunkIds: string[]): void;
/**
 * Get cached rerank score
 */
export declare function getCachedRerankScore(db: Database.Database, queryHash: string, chunkId: string, maxAgeMs?: number): number | null;
/**
 * Store rerank score in cache
 */
export declare function cacheRerankScore(db: Database.Database, queryHash: string, chunkId: string, score: number, model: string): void;
/**
 * Batch cache rerank scores
 */
export declare function batchCacheRerankScores(db: Database.Database, queryHash: string, scores: Array<{
    chunkId: string;
    score: number;
}>, model: string): void;
/**
 * Clean up old cache entries
 */
export declare function cleanRerankCache(db: Database.Database, maxAgeMs?: number): number;
/**
 * Log a memory search for analytics
 */
export declare function logMemoryAccess(db: Database.Database, queryText: string, queryHash: string, resultCount: number, durationMs: number, searchType: "vector" | "bm25" | "hybrid"): void;
/**
 * Get search statistics
 */
export declare function getSearchStats(db: Database.Database, sinceMs?: number): {
    totalSearches: number;
    avgDurationMs: number;
    avgResultCount: number;
    searchesByType: Record<string, number>;
};
/**
 * Prune old access logs
 */
export declare function pruneAccessLogs(db: Database.Database, maxAgeMs?: number): number;
/**
 * Check database health and statistics
 */
export declare function getDatabaseStats(db: Database.Database): {
    schemaVersion: number;
    chunkCount: number;
    ftsCount: number;
    rerankCacheCount: number;
    accessLogCount: number;
    dbSizeBytes: number;
};
/**
 * Verify FTS is in sync with chunks
 */
export declare function verifyFtsSync(db: Database.Database): {
    inSync: boolean;
    chunkCount: number;
    ftsCount: number;
    missing: number;
};
/**
 * Run VACUUM to reclaim space
 */
export declare function vacuumDatabase(db: Database.Database): void;
/**
 * Run integrity check
 */
export declare function checkIntegrity(db: Database.Database): boolean;
//# sourceMappingURL=schema.d.ts.map