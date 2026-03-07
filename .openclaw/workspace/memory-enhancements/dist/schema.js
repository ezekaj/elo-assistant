/**
 * OpenClaw Memory Enhancements - Database Schema Extensions
 *
 * Extends the OpenClaw memory database with temporal tracking,
 * rerank caching, and FTS5 indexing for hybrid search.
 */
// ============================================================================
// Schema Version
// ============================================================================
const CURRENT_SCHEMA_VERSION = 2;
const MIGRATIONS = {
    // Version 1: Initial schema extensions
    1: [
        // Add temporal tracking columns to chunks
        `ALTER TABLE chunks ADD COLUMN created_at INTEGER`,
        `ALTER TABLE chunks ADD COLUMN accessed_at INTEGER`,
        `ALTER TABLE chunks ADD COLUMN access_count INTEGER DEFAULT 0`,
        // Create indices for temporal queries
        `CREATE INDEX IF NOT EXISTS idx_chunks_updated_at ON chunks(updated_at)`,
        `CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source)`,
        // Create FTS5 table for BM25 search
        `CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      id UNINDEXED,
      text,
      path,
      source,
      model UNINDEXED,
      start_line UNINDEXED,
      end_line UNINDEXED,
      content='chunks',
      content_rowid='rowid',
      tokenize='porter unicode61'
    )`,
        // Create triggers to keep FTS in sync with chunks table
        `CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, id, text, path, source, model, start_line, end_line)
      VALUES (new.rowid, new.id, new.text, new.path, new.source, new.model, new.start_line, new.end_line);
    END`,
        `CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, id, text, path, source, model, start_line, end_line)
      VALUES('delete', old.rowid, old.id, old.text, old.path, old.source, old.model, old.start_line, old.end_line);
    END`,
        `CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, id, text, path, source, model, start_line, end_line)
      VALUES('delete', old.rowid, old.id, old.text, old.path, old.source, old.model, old.start_line, old.end_line);
      INSERT INTO chunks_fts(rowid, id, text, path, source, model, start_line, end_line)
      VALUES (new.rowid, new.id, new.text, new.path, new.source, new.model, new.start_line, new.end_line);
    END`,
        // Schema version tracking
        `CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
        `INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '1')`,
    ],
    // Version 2: Rerank cache and additional indices
    2: [
        // Rerank cache table
        `CREATE TABLE IF NOT EXISTS rerank_cache (
      query_hash TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      score REAL NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (query_hash, chunk_id)
    )`,
        // Index for cache cleanup
        `CREATE INDEX IF NOT EXISTS idx_rerank_cache_created_at ON rerank_cache(created_at)`,
        // Access log for analytics (optional)
        `CREATE TABLE IF NOT EXISTS memory_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_text TEXT NOT NULL,
      query_hash TEXT NOT NULL,
      result_count INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      search_type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
        `CREATE INDEX IF NOT EXISTS idx_access_log_created_at ON memory_access_log(created_at)`,
        // Update schema version
        `UPDATE schema_meta SET value = '2' WHERE key = 'version'`,
    ],
};
// ============================================================================
// Schema Management
// ============================================================================
/**
 * Get current schema version from database
 */
export function getSchemaVersion(db) {
    try {
        const result = db
            .prepare("SELECT value FROM schema_meta WHERE key = 'version'")
            .get();
        return result ? parseInt(result.value, 10) : 0;
    }
    catch {
        // Table doesn't exist
        return 0;
    }
}
/**
 * Check if schema migrations are needed
 */
export function needsMigration(db) {
    const current = getSchemaVersion(db);
    return current < CURRENT_SCHEMA_VERSION;
}
/**
 * Run schema migrations
 */
export function runMigrations(db) {
    const currentVersion = getSchemaVersion(db);
    const appliedMigrations = [];
    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
        return { version: currentVersion, migrations: [] };
    }
    // Run migrations in a transaction
    db.transaction(() => {
        for (let version = currentVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
            const migrations = MIGRATIONS[version];
            if (!migrations)
                continue;
            for (const sql of migrations) {
                try {
                    db.exec(sql);
                    appliedMigrations.push(sql.slice(0, 50) + "...");
                }
                catch (error) {
                    // Some migrations might fail if already applied (e.g., ALTER TABLE)
                    // Check if it's a "column already exists" or similar error
                    const errorMsg = error.message;
                    if (errorMsg.includes("duplicate column") ||
                        errorMsg.includes("already exists")) {
                        continue;
                    }
                    throw error;
                }
            }
        }
    })();
    return {
        version: CURRENT_SCHEMA_VERSION,
        migrations: appliedMigrations,
    };
}
// ============================================================================
// FTS Index Management
// ============================================================================
/**
 * Populate FTS index from existing chunks
 *
 * Run this after initial migration or if FTS gets out of sync.
 */
export function populateFtsIndex(db) {
    // First, clear any existing FTS data
    db.exec("DELETE FROM chunks_fts");
    // Populate from chunks table
    const result = db.exec(`
    INSERT INTO chunks_fts(rowid, id, text, path, source, model, start_line, end_line)
    SELECT rowid, id, text, path, source, model, start_line, end_line FROM chunks
  `);
    // Get count
    const count = db
        .prepare("SELECT COUNT(*) as count FROM chunks_fts")
        .get();
    return count.count;
}
/**
 * Optimize FTS index
 *
 * Call periodically to improve search performance.
 */
export function optimizeFtsIndex(db) {
    db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('optimize')");
}
/**
 * Rebuild FTS index from scratch
 *
 * Use when index becomes corrupted.
 */
export function rebuildFtsIndex(db) {
    db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')");
}
/**
 * Check FTS index integrity
 */
export function checkFtsIntegrity(db) {
    try {
        const result = db
            .prepare("INSERT INTO chunks_fts(chunks_fts) VALUES('integrity-check')")
            .run();
        return true;
    }
    catch {
        return false;
    }
}
// ============================================================================
// Temporal Column Updates
// ============================================================================
/**
 * Backfill created_at from updated_at for existing records
 */
export function backfillCreatedAt(db) {
    const result = db.prepare(`
    UPDATE chunks
    SET created_at = updated_at
    WHERE created_at IS NULL
  `).run();
    return result.changes;
}
/**
 * Update access timestamp for a chunk
 */
export function updateChunkAccess(db, chunkId) {
    db.prepare(`
    UPDATE chunks
    SET accessed_at = ?, access_count = COALESCE(access_count, 0) + 1
    WHERE id = ?
  `).run(Date.now(), chunkId);
}
/**
 * Batch update access for multiple chunks
 */
export function batchUpdateAccess(db, chunkIds) {
    const now = Date.now();
    const stmt = db.prepare(`
    UPDATE chunks
    SET accessed_at = ?, access_count = COALESCE(access_count, 0) + 1
    WHERE id = ?
  `);
    db.transaction(() => {
        for (const id of chunkIds) {
            stmt.run(now, id);
        }
    })();
}
// ============================================================================
// Rerank Cache Management
// ============================================================================
/**
 * Get cached rerank score
 */
export function getCachedRerankScore(db, queryHash, chunkId, maxAgeMs = 3600000 // 1 hour
) {
    const cutoff = Date.now() - maxAgeMs;
    const result = db
        .prepare(`
      SELECT score FROM rerank_cache
      WHERE query_hash = ? AND chunk_id = ? AND created_at > ?
    `)
        .get(queryHash, chunkId, cutoff);
    return result?.score ?? null;
}
/**
 * Store rerank score in cache
 */
export function cacheRerankScore(db, queryHash, chunkId, score, model) {
    db.prepare(`
    INSERT OR REPLACE INTO rerank_cache (query_hash, chunk_id, score, model, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(queryHash, chunkId, score, model, Date.now());
}
/**
 * Batch cache rerank scores
 */
export function batchCacheRerankScores(db, queryHash, scores, model) {
    const now = Date.now();
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO rerank_cache (query_hash, chunk_id, score, model, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
    db.transaction(() => {
        for (const { chunkId, score } of scores) {
            stmt.run(queryHash, chunkId, score, model, now);
        }
    })();
}
/**
 * Clean up old cache entries
 */
export function cleanRerankCache(db, maxAgeMs = 3600000) {
    const cutoff = Date.now() - maxAgeMs;
    const result = db.prepare(`
    DELETE FROM rerank_cache WHERE created_at < ?
  `).run(cutoff);
    return result.changes;
}
// ============================================================================
// Access Logging
// ============================================================================
/**
 * Log a memory search for analytics
 */
export function logMemoryAccess(db, queryText, queryHash, resultCount, durationMs, searchType) {
    db.prepare(`
    INSERT INTO memory_access_log (query_text, query_hash, result_count, duration_ms, search_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(queryText, queryHash, resultCount, durationMs, searchType, Date.now());
}
/**
 * Get search statistics
 */
export function getSearchStats(db, sinceMs = 86400000 // 24 hours
) {
    const cutoff = Date.now() - sinceMs;
    const totals = db
        .prepare(`
      SELECT
        COUNT(*) as total,
        AVG(duration_ms) as avg_duration,
        AVG(result_count) as avg_results
      FROM memory_access_log
      WHERE created_at > ?
    `)
        .get(cutoff);
    const byType = db
        .prepare(`
      SELECT search_type, COUNT(*) as count
      FROM memory_access_log
      WHERE created_at > ?
      GROUP BY search_type
    `)
        .all(cutoff);
    const searchesByType = {};
    for (const row of byType) {
        searchesByType[row.search_type] = row.count;
    }
    return {
        totalSearches: totals.total,
        avgDurationMs: totals.avg_duration || 0,
        avgResultCount: totals.avg_results || 0,
        searchesByType,
    };
}
/**
 * Prune old access logs
 */
export function pruneAccessLogs(db, maxAgeMs = 604800000 // 7 days
) {
    const cutoff = Date.now() - maxAgeMs;
    const result = db.prepare(`
    DELETE FROM memory_access_log WHERE created_at < ?
  `).run(cutoff);
    return result.changes;
}
// ============================================================================
// Database Health
// ============================================================================
/**
 * Check database health and statistics
 */
export function getDatabaseStats(db) {
    const schemaVersion = getSchemaVersion(db);
    const chunkCount = db.prepare("SELECT COUNT(*) as count FROM chunks").get().count;
    let ftsCount = 0;
    try {
        ftsCount = db.prepare("SELECT COUNT(*) as count FROM chunks_fts").get().count;
    }
    catch {
        // FTS table might not exist
    }
    let rerankCacheCount = 0;
    try {
        rerankCacheCount = db.prepare("SELECT COUNT(*) as count FROM rerank_cache").get().count;
    }
    catch {
        // Cache table might not exist
    }
    let accessLogCount = 0;
    try {
        accessLogCount = db.prepare("SELECT COUNT(*) as count FROM memory_access_log").get().count;
    }
    catch {
        // Log table might not exist
    }
    // Get database file size
    const pageCount = db.prepare("PRAGMA page_count").get().page_count;
    const pageSize = db.prepare("PRAGMA page_size").get().page_size;
    const dbSizeBytes = pageCount * pageSize;
    return {
        schemaVersion,
        chunkCount,
        ftsCount,
        rerankCacheCount,
        accessLogCount,
        dbSizeBytes,
    };
}
/**
 * Verify FTS is in sync with chunks
 */
export function verifyFtsSync(db) {
    const chunkCount = db.prepare("SELECT COUNT(*) as count FROM chunks").get().count;
    let ftsCount = 0;
    try {
        ftsCount = db.prepare("SELECT COUNT(*) as count FROM chunks_fts").get().count;
    }
    catch {
        return { inSync: false, chunkCount, ftsCount: 0, missing: chunkCount };
    }
    // Count chunks missing from FTS
    const missing = db.prepare(`
      SELECT COUNT(*) as count FROM chunks c
      WHERE NOT EXISTS (
        SELECT 1 FROM chunks_fts f WHERE f.id = c.id
      )
    `).get().count;
    return {
        inSync: missing === 0 && chunkCount === ftsCount,
        chunkCount,
        ftsCount,
        missing,
    };
}
/**
 * Run VACUUM to reclaim space
 */
export function vacuumDatabase(db) {
    db.exec("VACUUM");
}
/**
 * Run integrity check
 */
export function checkIntegrity(db) {
    const result = db.prepare("PRAGMA integrity_check").get();
    return result.integrity_check === "ok";
}
//# sourceMappingURL=schema.js.map