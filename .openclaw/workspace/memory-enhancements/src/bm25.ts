/**
 * OpenClaw Memory Enhancements - BM25 Search
 *
 * Enhanced BM25 implementation using SQLite FTS5 with proper scoring.
 */

import type Database from "better-sqlite3";
import type { SearchRowResult } from "./types.js";

// ============================================================================
// BM25 Constants
// ============================================================================

/** Default BM25 k1 parameter (term frequency saturation) */
const BM25_K1 = 1.2;

/** Default BM25 b parameter (document length normalization) */
const BM25_B = 0.75;

// ============================================================================
// Query Processing
// ============================================================================

/**
 * Tokenize a query string for FTS5
 * Handles special characters and produces quoted terms
 */
export function tokenizeQuery(query: string): string {
  // Split on non-alphanumeric characters
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "";
  }

  // Quote each token and join with AND
  return tokens.map((token) => `"${token}"`).join(" ");
}

/**
 * Build an FTS5 match expression with phrase support
 */
export function buildFtsQuery(query: string): string {
  const trimmed = query.trim();

  // Check for explicit phrase (quoted)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed; // Already a phrase query
  }

  // Check for operators
  if (/\bOR\b|\bAND\b|\bNOT\b/.test(trimmed)) {
    // Pass through operator queries as-is
    return trimmed;
  }

  return tokenizeQuery(trimmed);
}

// ============================================================================
// Source Filtering
// ============================================================================

/**
 * Build source filter clause for SQL queries
 */
export function buildSourceFilter(sources?: string[]): {
  clause: string;
  params: string[];
} {
  if (!sources || sources.length === 0) {
    return { clause: "", params: [] };
  }

  const placeholders = sources.map(() => "?").join(", ");
  return {
    clause: `AND source IN (${placeholders})`,
    params: sources,
  };
}

// ============================================================================
// BM25 Search Implementation
// ============================================================================

/**
 * Perform BM25 search using FTS5
 *
 * @param db - SQLite database connection
 * @param query - Search query string
 * @param limit - Maximum number of results
 * @param sources - Optional source filter
 * @returns Array of search results with BM25 scores
 */
export function searchBM25(
  db: Database.Database,
  query: string,
  limit: number,
  sources?: string[]
): SearchRowResult[] {
  const ftsQuery = buildFtsQuery(query);

  if (!ftsQuery) {
    return [];
  }

  const { clause: sourceClause, params: sourceParams } = buildSourceFilter(sources);

  // Use FTS5's built-in BM25 ranking
  // The bm25() function returns negative scores (lower is better)
  // We normalize to positive scores where higher is better
  const sql = `
    SELECT
      c.id,
      c.path,
      c.source,
      c.text,
      c.start_line,
      c.end_line,
      c.updated_at,
      c.created_at,
      -- Normalize BM25 score: bm25 returns negative values, lower is better
      -- Convert to 0-1 range where higher is better
      (1.0 / (1.0 + ABS(bm25(chunks_fts, ${BM25_K1}, ${BM25_B})))) as score
    FROM chunks_fts f
    INNER JOIN chunks c ON f.id = c.id
    WHERE chunks_fts MATCH ?
    ${sourceClause}
    ORDER BY bm25(chunks_fts) ASC
    LIMIT ?
  `;

  try {
    const stmt = db.prepare(sql);
    const results = stmt.all(ftsQuery, ...sourceParams, limit) as SearchRowResult[];
    return results;
  } catch (error) {
    // FTS5 query errors (e.g., syntax errors in query)
    console.error(`BM25 search error: ${error}`);
    return [];
  }
}

/**
 * Get BM25 score for a specific document given a query
 * Useful for reranking scenarios
 */
export function getBM25Score(
  db: Database.Database,
  query: string,
  chunkId: string
): number | null {
  const ftsQuery = buildFtsQuery(query);

  if (!ftsQuery) {
    return null;
  }

  const sql = `
    SELECT (1.0 / (1.0 + ABS(bm25(chunks_fts)))) as score
    FROM chunks_fts
    WHERE chunks_fts MATCH ? AND id = ?
  `;

  try {
    const stmt = db.prepare(sql);
    const result = stmt.get(ftsQuery, chunkId) as { score: number } | undefined;
    return result?.score ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if FTS5 index exists and is populated
 */
export function checkFtsIndex(db: Database.Database): {
  exists: boolean;
  count: number;
} {
  try {
    // Check if table exists
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
      )
      .get();

    if (!tableCheck) {
      return { exists: false, count: 0 };
    }

    // Count entries
    const countResult = db
      .prepare("SELECT COUNT(*) as count FROM chunks_fts")
      .get() as { count: number };

    return { exists: true, count: countResult.count };
  } catch {
    return { exists: false, count: 0 };
  }
}

/**
 * Rebuild FTS5 index from chunks table
 * Useful after direct chunk modifications
 */
export function rebuildFtsIndex(db: Database.Database): void {
  db.exec(`
    DELETE FROM chunks_fts;
    INSERT INTO chunks_fts (id, text, path, source, model, start_line, end_line)
    SELECT id, text, path, source, model, start_line, end_line FROM chunks;
  `);
}

/**
 * Get term frequencies for a query
 * Useful for debugging and understanding search behavior
 */
export function getTermStats(
  db: Database.Database,
  query: string
): Map<string, { docFreq: number; totalFreq: number }> {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);

  const stats = new Map<string, { docFreq: number; totalFreq: number }>();

  for (const token of tokens) {
    try {
      // Document frequency: how many documents contain this term
      const dfResult = db
        .prepare(
          `SELECT COUNT(*) as count FROM chunks_fts WHERE chunks_fts MATCH ?`
        )
        .get(`"${token}"`) as { count: number };

      stats.set(token, {
        docFreq: dfResult.count,
        totalFreq: dfResult.count, // FTS5 doesn't easily give total term frequency
      });
    } catch {
      stats.set(token, { docFreq: 0, totalFreq: 0 });
    }
  }

  return stats;
}
