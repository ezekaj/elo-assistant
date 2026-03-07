# OpenClaw Memory Enhancements Architecture

## Overview

This document describes the architecture for four memory enhancements:
1. **Hybrid Search** - Combined BM25 + Vector search with RRF fusion
2. **Auto-Index** - File system watcher for automatic indexing
3. **Temporal Weighting** - Recency-based score boosting
4. **Reranking** - Cross-encoder precision refinement

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Memory                          │
├─────────────────────────────────────────────────────────────────┤
│  Sources: MEMORY.md, memory/*.md                                │
│  Database: main.sqlite (sqlite-vec + FTS5)                      │
│  Embeddings: LM Studio (nomic-embed-text-v1.5, 768 dims)        │
└─────────────────────────────────────────────────────────────────┘
```

## Enhanced Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Enhanced Memory Pipeline                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │  Auto-Index  │────>│   Indexer    │────>│   Database   │    │
│  │  (Watcher)   │     │  (Chunker)   │     │  (SQLite)    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                                         │              │
│         │                                         │              │
│         v                                         v              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ File Watcher │     │  Embeddings  │     │ Vector Store │    │
│  │  (chokidar)  │     │ (LM Studio)  │     │ (sqlite-vec) │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│                                                   │              │
│                                                   v              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     HYBRID SEARCH                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Vector    │  │    BM25     │  │   Temporal      │   │  │
│  │  │   Search    │  │   Search    │  │   Weighting     │   │  │
│  │  │ (cosine)    │  │   (FTS5)    │  │   (decay)       │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘   │  │
│  │         │                │                   │            │  │
│  │         v                v                   v            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │           RRF Fusion + Temporal Boost              │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              v                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                       RERANKER                            │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │              Cross-Encoder Model                    │ │  │
│  │  │       (sentence-transformers/cross-encoder)         │ │  │
│  │  │     or LM Studio qwen2.5 for local inference        │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              v                                   │
│                      Final Ranked Results                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Hybrid Search (BM25 + Vector with RRF)

### Design

**Problem**: Pure vector search misses exact keyword matches; pure keyword search misses semantic similarity.

**Solution**: Reciprocal Rank Fusion (RRF) combines both ranking signals.

### Algorithm

```
RRF_score(d) = Σ 1/(k + rank_i(d))

where:
- d = document
- k = constant (typically 60)
- rank_i(d) = rank of document d in result list i
```

### Components

1. **VectorSearch**: Existing sqlite-vec cosine distance
2. **BM25Search**: Enhanced FTS5 with proper BM25 scoring
3. **RRFFusion**: Combines results with configurable k parameter

### Configuration

```typescript
interface HybridSearchConfig {
  enabled: boolean;
  vectorWeight: number;      // Weight for vector results (0-1)
  bm25Weight: number;        // Weight for BM25 results (0-1)
  rrfK: number;              // RRF constant (default: 60)
  candidateMultiplier: number; // Fetch N * limit candidates
}
```

---

## 2. Auto-Index (File Watcher)

### Design

**Problem**: Manual sync required to index new files.

**Solution**: Use chokidar to watch ~/.openclaw/workspace for .md file changes.

### Components

1. **FileWatcher**: Watches configured directories
2. **ChangeDetector**: Debounces changes, detects file hashes
3. **IncrementalIndexer**: Only processes changed files

### Events Handled

- `add`: New file created → index
- `change`: File modified → re-index
- `unlink`: File deleted → remove from index

### Configuration

```typescript
interface AutoIndexConfig {
  enabled: boolean;
  watchPaths: string[];       // Directories to watch
  debounceMs: number;         // Debounce interval (default: 1500)
  ignorePatterns: string[];   // Glob patterns to ignore
  maxFileSizeBytes: number;   // Skip files larger than this
}
```

---

## 3. Temporal Weighting

### Design

**Problem**: Old memories ranked equally with recent ones.

**Solution**: Apply exponential decay based on document age.

### Algorithm

```
temporal_score(d) = base_score(d) * decay_factor(d)

decay_factor(d) = (1 - minWeight) * e^(-λ * age_days) + minWeight

where:
- λ = decay rate (higher = faster decay)
- age_days = days since last update
- minWeight = minimum weight floor (prevents total decay)
```

### Decay Profiles

| Profile | Half-life | λ | Use Case |
|---------|-----------|---|----------|
| aggressive | 7 days | 0.099 | Fast-moving projects |
| moderate | 30 days | 0.023 | General use |
| gentle | 90 days | 0.0077 | Long-term reference |
| none | ∞ | 0 | Disable decay |

### Configuration

```typescript
interface TemporalConfig {
  enabled: boolean;
  decayProfile: 'aggressive' | 'moderate' | 'gentle' | 'none';
  customHalfLifeDays?: number;  // Override profile
  minWeight: number;            // Floor (default: 0.3)
  referenceDate?: Date;         // For testing
}
```

---

## 4. Reranking (Cross-Encoder)

### Design

**Problem**: Bi-encoder (embedding) search is fast but imprecise. Semantic nuances missed.

**Solution**: Two-stage retrieval with cross-encoder refinement.

### Architecture

```
Stage 1: Fast Retrieval (Hybrid Search)
    → Fetch top-K candidates (K = 20-50)

Stage 2: Precise Reranking (Cross-Encoder)
    → Score each (query, candidate) pair
    → Return top-N (N = 5-10)
```

### Cross-Encoder Options

1. **Local via LM Studio**: Use chat completion with scoring prompt
2. **Sentence Transformers**: ms-marco-MiniLM-L-6-v2 (lightweight)
3. **Cohere Rerank API**: High quality, external service

### Scoring Prompt (for LLM-based reranking)

```
Rate relevance of the passage to the query on scale 0-10.
Query: {query}
Passage: {passage}
Score (0-10):
```

### Configuration

```typescript
interface RerankConfig {
  enabled: boolean;
  provider: 'local' | 'cohere' | 'llm';
  candidateCount: number;      // How many to fetch before reranking
  finalCount: number;          // How many to return after reranking
  model?: string;              // Model for LLM-based reranking
  minScore?: number;           // Minimum rerank score to include
}
```

---

## Database Schema Extensions

```sql
-- Add temporal tracking to chunks
ALTER TABLE chunks ADD COLUMN created_at INTEGER;
ALTER TABLE chunks ADD COLUMN accessed_at INTEGER;
ALTER TABLE chunks ADD COLUMN access_count INTEGER DEFAULT 0;

-- Add rerank cache (optional)
CREATE TABLE IF NOT EXISTS rerank_cache (
  query_hash TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  score REAL NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (query_hash, chunk_id)
);

-- Index for temporal queries
CREATE INDEX IF NOT EXISTS idx_chunks_updated_at ON chunks(updated_at);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at);
```

---

## Integration Points

### Enhanced Search Flow

```typescript
async function enhancedSearch(query: string, config: EnhancedSearchConfig) {
  // 1. Hybrid retrieval
  const candidates = await hybridSearch(query, {
    limit: config.rerank.candidateCount,
    vectorWeight: config.hybrid.vectorWeight,
    bm25Weight: config.hybrid.bm25Weight,
  });

  // 2. Apply temporal weighting
  const temporalWeighted = applyTemporalWeighting(candidates, config.temporal);

  // 3. Rerank top candidates
  const reranked = config.rerank.enabled
    ? await rerank(query, temporalWeighted, config.rerank)
    : temporalWeighted;

  // 4. Return final results
  return reranked.slice(0, config.query.maxResults);
}
```

### Configuration Merge

```typescript
const defaultConfig: EnhancedSearchConfig = {
  hybrid: {
    enabled: true,
    vectorWeight: 0.6,
    bm25Weight: 0.4,
    rrfK: 60,
  },
  temporal: {
    enabled: true,
    decayProfile: 'moderate',
    minWeight: 0.3,
  },
  rerank: {
    enabled: true,
    provider: 'llm',
    candidateCount: 20,
    finalCount: 6,
  },
  autoIndex: {
    enabled: true,
    watchPaths: ['~/.openclaw/workspace'],
    debounceMs: 1500,
  },
};
```

---

## File Structure

```
memory-enhancements/
├── ARCHITECTURE.md          # This document
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts             # Main exports
│   ├── types.ts             # TypeScript interfaces
│   ├── config.ts            # Configuration handling
│   ├── hybrid-search.ts     # Hybrid search with RRF
│   ├── bm25.ts              # BM25 implementation
│   ├── temporal.ts          # Temporal weighting
│   ├── reranker.ts          # Cross-encoder reranking
│   ├── auto-index.ts        # File watcher
│   ├── schema.ts            # DB schema extensions
│   └── integration.ts       # Integration with OpenClaw
└── tests/
    └── *.test.ts            # Test files
```

---

## Performance Considerations

1. **Hybrid Search**: Parallel execution of vector + BM25
2. **Auto-Index**: Debounced, batched updates
3. **Temporal**: Computed at query time (no storage overhead)
4. **Reranking**: Cached results, batch scoring

## Dependencies

- `better-sqlite3`: SQLite driver
- `chokidar`: File watching
- `xxhash-wasm`: Fast hashing (optional, for cache keys)
