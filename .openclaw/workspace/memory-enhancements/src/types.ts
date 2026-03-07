/**
 * OpenClaw Memory Enhancements - Type Definitions
 */

import type Database from "better-sqlite3";

// ============================================================================
// Core Types
// ============================================================================

export interface ChunkRecord {
  id: string;
  path: string;
  source: string;
  start_line: number;
  end_line: number;
  hash: string;
  model: string;
  text: string;
  embedding: string; // JSON array of floats
  updated_at: number;
  created_at?: number;
  accessed_at?: number;
  access_count?: number;
}

export interface SearchResult {
  id: string;
  path: string;
  source: string;
  text: string;
  startLine: number;
  endLine: number;
  score: number;
  updatedAt: number;
  createdAt?: number;
  // Scoring breakdown
  vectorScore?: number;
  bm25Score?: number;
  temporalScore?: number;
  rerankScore?: number;
  rrfRank?: number;
}

export interface SearchRowResult {
  id: string;
  path: string;
  source: string;
  text: string;
  start_line: number;
  end_line: number;
  score: number;
  updated_at: number;
  created_at?: number;
}

// ============================================================================
// Hybrid Search Types
// ============================================================================

export interface HybridSearchConfig {
  /** Enable hybrid search (default: true) */
  enabled: boolean;
  /** Weight for vector search results (0-1, default: 0.6) */
  vectorWeight: number;
  /** Weight for BM25 search results (0-1, default: 0.4) */
  bm25Weight: number;
  /** RRF constant k (default: 60) */
  rrfK: number;
  /** Multiplier for candidate fetching (default: 4) */
  candidateMultiplier: number;
}

export interface RRFResult {
  id: string;
  score: number;
  vectorRank?: number;
  bm25Rank?: number;
}

// ============================================================================
// Auto-Index Types
// ============================================================================

export interface AutoIndexConfig {
  /** Enable auto-indexing (default: true) */
  enabled: boolean;
  /** Directories to watch */
  watchPaths: string[];
  /** Debounce interval in ms (default: 1500) */
  debounceMs: number;
  /** Glob patterns to ignore */
  ignorePatterns: string[];
  /** Maximum file size to index in bytes (default: 1MB) */
  maxFileSizeBytes: number;
  /** File extensions to index (default: ['.md']) */
  extensions: string[];
}

export interface FileChange {
  type: "add" | "change" | "unlink";
  path: string;
  timestamp: number;
}

export interface AutoIndexStats {
  filesWatched: number;
  filesIndexed: number;
  lastSyncTime?: number;
  pendingChanges: number;
}

export type AutoIndexEventHandler = (event: FileChange) => void | Promise<void>;

// ============================================================================
// Temporal Weighting Types
// ============================================================================

export type DecayProfile = "aggressive" | "moderate" | "gentle" | "none";

export interface TemporalConfig {
  /** Enable temporal weighting (default: true) */
  enabled: boolean;
  /** Decay profile preset */
  decayProfile: DecayProfile;
  /** Custom half-life in days (overrides profile) */
  customHalfLifeDays?: number;
  /** Minimum weight floor (default: 0.3) */
  minWeight: number;
  /** Reference date for age calculation (default: now) */
  referenceDate?: Date;
}

export interface DecayParams {
  /** Decay rate lambda */
  lambda: number;
  /** Half-life in days */
  halfLifeDays: number;
}

// ============================================================================
// Reranking Types
// ============================================================================

export type RerankProvider = "llm" | "cohere" | "local";

export interface RerankConfig {
  /** Enable reranking (default: true) */
  enabled: boolean;
  /** Reranking provider */
  provider: RerankProvider;
  /** Number of candidates to fetch for reranking */
  candidateCount: number;
  /** Number of results to return after reranking */
  finalCount: number;
  /** Model name for LLM-based reranking */
  model?: string;
  /** API endpoint for the reranker */
  apiEndpoint?: string;
  /** API key for external reranking services */
  apiKey?: string;
  /** Minimum rerank score to include */
  minScore?: number;
  /** Timeout for reranking in ms */
  timeoutMs?: number;
}

export interface RerankRequest {
  query: string;
  documents: string[];
}

export interface RerankResponse {
  scores: number[];
  model: string;
  cached?: boolean;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingConfig {
  provider: "openai" | "local" | "gemini" | "auto";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  dimensions?: number;
}

export interface EmbedRequest {
  text: string;
  model?: string;
}

export interface EmbedResponse {
  embedding: number[];
  model: string;
  dimensions: number;
}

// ============================================================================
// Combined Configuration
// ============================================================================

export interface EnhancedSearchConfig {
  hybrid: HybridSearchConfig;
  temporal: TemporalConfig;
  rerank: RerankConfig;
  autoIndex: AutoIndexConfig;
  embedding: EmbeddingConfig;
  query: QueryConfig;
}

export interface QueryConfig {
  /** Maximum results to return */
  maxResults: number;
  /** Minimum score threshold */
  minScore: number;
  /** Sources to search */
  sources?: string[];
}

// ============================================================================
// Database Types
// ============================================================================

export interface DatabaseContext {
  db: Database.Database;
  vectorEnabled: boolean;
  ftsEnabled: boolean;
}

export interface SchemaVersion {
  version: number;
  migrations: string[];
}

// ============================================================================
// Event Types
// ============================================================================

export interface SearchEvent {
  type: "search";
  query: string;
  resultCount: number;
  durationMs: number;
  stages: {
    vector?: number;
    bm25?: number;
    temporal?: number;
    rerank?: number;
  };
}

export interface IndexEvent {
  type: "index";
  filesProcessed: number;
  chunksCreated: number;
  durationMs: number;
}

export type MemoryEvent = SearchEvent | IndexEvent;
export type EventHandler = (event: MemoryEvent) => void;

// ============================================================================
// Error Types
// ============================================================================

export class MemoryEnhancementError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "MemoryEnhancementError";
  }
}

export class HybridSearchError extends MemoryEnhancementError {
  constructor(message: string, cause?: Error) {
    super(message, "HYBRID_SEARCH_ERROR", cause);
    this.name = "HybridSearchError";
  }
}

export class RerankError extends MemoryEnhancementError {
  constructor(message: string, cause?: Error) {
    super(message, "RERANK_ERROR", cause);
    this.name = "RerankError";
  }
}

export class AutoIndexError extends MemoryEnhancementError {
  constructor(message: string, cause?: Error) {
    super(message, "AUTO_INDEX_ERROR", cause);
    this.name = "AutoIndexError";
  }
}
