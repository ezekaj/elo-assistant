/**
 * OpenClaw Memory Enhancements - Hybrid Search with RRF Fusion
 *
 * Combines vector search and BM25 search using Reciprocal Rank Fusion.
 */

import type Database from "better-sqlite3";
import type {
  SearchRowResult,
  SearchResult,
  HybridSearchConfig,
  RRFResult,
} from "./types.js";
import { searchBM25, buildSourceFilter } from "./bm25.js";
import { DEFAULT_HYBRID_CONFIG } from "./config.js";

// ============================================================================
// Vector Search
// ============================================================================

/**
 * Perform vector similarity search using sqlite-vec
 *
 * @param db - SQLite database connection
 * @param queryEmbedding - Query embedding vector
 * @param limit - Maximum number of results
 * @param sources - Optional source filter
 * @returns Array of search results with cosine similarity scores
 */
export function searchVector(
  db: Database.Database,
  queryEmbedding: number[],
  limit: number,
  sources?: string[]
): SearchRowResult[] {
  const { clause: sourceClause, params: sourceParams } = buildSourceFilter(sources);

  // sqlite-vec uses vec_distance_cosine which returns distance (0 = identical, 2 = opposite)
  // Convert to similarity score: score = 1 - (distance / 2)
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
      (1.0 - (vec_distance_cosine(v.embedding, ?) / 2.0)) as score
    FROM chunks_vec v
    INNER JOIN chunks c ON v.id = c.id
    ${sourceClause ? `WHERE 1=1 ${sourceClause}` : ""}
    ORDER BY vec_distance_cosine(v.embedding, ?) ASC
    LIMIT ?
  `;

  try {
    const embeddingJson = JSON.stringify(queryEmbedding);
    const stmt = db.prepare(sql);

    const params = sourceClause
      ? [embeddingJson, ...sourceParams, embeddingJson, limit]
      : [embeddingJson, embeddingJson, limit];

    const results = stmt.all(...params) as SearchRowResult[];
    return results;
  } catch (error) {
    console.error(`Vector search error: ${error}`);
    return [];
  }
}

/**
 * Fallback in-memory cosine similarity search
 * Used when sqlite-vec is not available
 */
export function searchVectorFallback(
  db: Database.Database,
  queryEmbedding: number[],
  limit: number,
  sources?: string[]
): SearchRowResult[] {
  const { clause: sourceClause, params: sourceParams } = buildSourceFilter(sources);

  // Fetch all chunks with embeddings
  const sql = `
    SELECT
      id, path, source, text, start_line, end_line, updated_at, created_at, embedding
    FROM chunks
    ${sourceClause ? `WHERE 1=1 ${sourceClause}` : ""}
  `;

  type ChunkWithEmbedding = SearchRowResult & { embedding: string };

  const chunks = db.prepare(sql).all(...sourceParams) as ChunkWithEmbedding[];

  // Calculate cosine similarity for each chunk
  const results: SearchRowResult[] = [];
  for (const chunk of chunks) {
    try {
      const embedding = JSON.parse(chunk.embedding) as number[];
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      results.push({
        id: chunk.id,
        path: chunk.path,
        source: chunk.source,
        text: chunk.text,
        start_line: chunk.start_line,
        end_line: chunk.end_line,
        updated_at: chunk.updated_at,
        created_at: chunk.created_at,
        score: similarity,
      });
    } catch {
      // Skip chunks with invalid embeddings
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// ============================================================================
// Reciprocal Rank Fusion (RRF)
// ============================================================================

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
export function mergeWithRRF(
  vectorResults: SearchRowResult[],
  bm25Results: SearchRowResult[],
  config: HybridSearchConfig = DEFAULT_HYBRID_CONFIG
): RRFResult[] {
  const k = config.rrfK;
  const scores = new Map<string, RRFResult>();

  // Process vector results
  vectorResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = config.vectorWeight / (k + rank);

    const existing = scores.get(result.id);
    if (existing) {
      existing.score += rrfScore;
      existing.vectorRank = rank;
    } else {
      scores.set(result.id, {
        id: result.id,
        score: rrfScore,
        vectorRank: rank,
        bm25Rank: undefined,
      });
    }
  });

  // Process BM25 results
  bm25Results.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = config.bm25Weight / (k + rank);

    const existing = scores.get(result.id);
    if (existing) {
      existing.score += rrfScore;
      existing.bm25Rank = rank;
    } else {
      scores.set(result.id, {
        id: result.id,
        score: rrfScore,
        vectorRank: undefined,
        bm25Rank: rank,
      });
    }
  });

  // Sort by combined RRF score
  return Array.from(scores.values()).sort((a, b) => b.score - a.score);
}

/**
 * Alternative weighted linear combination merge
 * Simpler than RRF but can be effective
 */
export function mergeWeightedLinear(
  vectorResults: SearchRowResult[],
  bm25Results: SearchRowResult[],
  vectorWeight: number = 0.6,
  bm25Weight: number = 0.4
): Map<string, { score: number; vectorScore?: number; bm25Score?: number }> {
  const scores = new Map<string, { score: number; vectorScore?: number; bm25Score?: number }>();

  // Normalize vector scores to 0-1 range
  const maxVectorScore = Math.max(...vectorResults.map((r) => r.score), 1);
  const maxBm25Score = Math.max(...bm25Results.map((r) => r.score), 1);

  // Process vector results
  for (const result of vectorResults) {
    const normalizedScore = result.score / maxVectorScore;
    scores.set(result.id, {
      score: vectorWeight * normalizedScore,
      vectorScore: normalizedScore,
    });
  }

  // Process BM25 results
  for (const result of bm25Results) {
    const normalizedScore = result.score / maxBm25Score;
    const existing = scores.get(result.id);

    if (existing) {
      existing.score += bm25Weight * normalizedScore;
      existing.bm25Score = normalizedScore;
    } else {
      scores.set(result.id, {
        score: bm25Weight * normalizedScore,
        bm25Score: normalizedScore,
      });
    }
  }

  return scores;
}

// ============================================================================
// Hybrid Search
// ============================================================================

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
export function hybridSearch(
  db: Database.Database,
  options: HybridSearchOptions
): SearchResult[] {
  const config = { ...DEFAULT_HYBRID_CONFIG, ...options.config };

  if (!config.enabled) {
    // Fall back to vector-only search
    const vectorResults = options.useVecFallback
      ? searchVectorFallback(db, options.queryEmbedding, options.limit, options.sources)
      : searchVector(db, options.queryEmbedding, options.limit, options.sources);

    return vectorResults.map((r) => toSearchResult(r));
  }

  // Calculate candidate count
  const candidateCount = options.limit * config.candidateMultiplier;

  // Run both searches in parallel (conceptually - JS is single-threaded)
  const vectorResults = options.useVecFallback
    ? searchVectorFallback(db, options.queryEmbedding, candidateCount, options.sources)
    : searchVector(db, options.queryEmbedding, candidateCount, options.sources);

  const bm25Results = searchBM25(db, options.query, candidateCount, options.sources);

  // Merge using RRF
  const rrfResults = mergeWithRRF(vectorResults, bm25Results, config);

  // Build result lookup maps
  const vectorLookup = new Map(vectorResults.map((r) => [r.id, r]));
  const bm25Lookup = new Map(bm25Results.map((r) => [r.id, r]));

  // Convert to SearchResult with full data
  const results: SearchResult[] = [];

  for (const rrf of rrfResults.slice(0, options.limit)) {
    const vectorRow = vectorLookup.get(rrf.id);
    const bm25Row = bm25Lookup.get(rrf.id);
    const baseRow = vectorRow || bm25Row;

    if (!baseRow) continue;

    results.push({
      id: baseRow.id,
      path: baseRow.path,
      source: baseRow.source,
      text: baseRow.text,
      startLine: baseRow.start_line,
      endLine: baseRow.end_line,
      score: rrf.score,
      updatedAt: baseRow.updated_at,
      createdAt: baseRow.created_at,
      vectorScore: vectorRow?.score,
      bm25Score: bm25Row?.score,
      rrfRank: results.length + 1,
    });
  }

  return results;
}

/**
 * Convert SearchRowResult to SearchResult
 */
function toSearchResult(row: SearchRowResult): SearchResult {
  return {
    id: row.id,
    path: row.path,
    source: row.source,
    text: row.text,
    startLine: row.start_line,
    endLine: row.end_line,
    score: row.score,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

/**
 * Check if sqlite-vec extension is available
 */
export function checkVectorExtension(db: Database.Database): boolean {
  try {
    // Try to use a vec function
    db.prepare("SELECT vec_version()").get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get hybrid search statistics
 */
export function getHybridStats(
  db: Database.Database
): { vectorCount: number; ftsCount: number; overlapPct: number } | null {
  try {
    const vecCount = db
      .prepare("SELECT COUNT(*) as count FROM chunks_vec")
      .get() as { count: number };

    const ftsCount = db
      .prepare("SELECT COUNT(*) as count FROM chunks_fts")
      .get() as { count: number };

    // Calculate overlap (chunks in both indices)
    const overlap = db
      .prepare(`
        SELECT COUNT(*) as count
        FROM chunks_vec v
        INNER JOIN chunks_fts f ON v.id = f.id
      `)
      .get() as { count: number };

    const total = Math.max(vecCount.count, ftsCount.count);
    const overlapPct = total > 0 ? (overlap.count / total) * 100 : 0;

    return {
      vectorCount: vecCount.count,
      ftsCount: ftsCount.count,
      overlapPct,
    };
  } catch {
    return null;
  }
}
