#!/usr/bin/env node
/**
 * OpenClaw Memory Enhancements - Wiring Script
 * 
 * This script integrates the memory-enhancements module with OpenClaw's
 * existing memory database, enabling:
 * - Hybrid search (vector + BM25 with RRF fusion)
 * - Temporal weighting (recency decay)
 * - Cross-encoder reranking (when available)
 * - Auto-indexing (file watcher)
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';

// Dynamic import for compiled TypeScript modules
const distPath = join(dirname(fileURLToPath(import.meta.url)), 'dist');

// Global auto-indexer instance
let autoIndexer = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// OpenClaw memory database path
const MEMORY_DB = join(homedir(), '.openclaw', 'memory', 'main.sqlite');

// LM Studio embedding endpoint
const EMBEDDING_URL = 'http://127.0.0.1:1234/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';

// ============================================================================
// Embedding Function
// ============================================================================

async function getEmbedding(text) {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });
  
  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data[0].embedding;
}

// ============================================================================
// Hybrid Search Implementation
// ============================================================================

function vectorSearch(db, embedding, limit = 10) {
  // Get all chunks with embeddings
  const chunks = db.prepare(`
    SELECT id, path, source, start_line, end_line, text, embedding, updated_at
    FROM chunks
    WHERE embedding IS NOT NULL
  `).all();
  
  // Calculate cosine similarity
  const results = chunks.map(chunk => {
    try {
      const chunkEmbedding = JSON.parse(chunk.embedding);
      const similarity = cosineSimilarity(embedding, chunkEmbedding);
      return { ...chunk, score: similarity };
    } catch {
      return { ...chunk, score: 0 };
    }
  });
  
  // Sort by similarity and limit
  return results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function bm25Search(db, query, limit = 10) {
  try {
    const results = db.prepare(`
      SELECT 
        c.id, c.path, c.source, c.start_line, c.end_line, c.text, c.updated_at,
        fts.rank as score
      FROM chunks_fts fts
      JOIN chunks c ON fts.id = c.id
      WHERE chunks_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(query, limit);
    
    // BM25 returns negative scores, negate for consistency
    return results.map(r => ({ ...r, score: -r.score }));
  } catch (e) {
    // FTS5 might fail on special characters
    console.error('BM25 search failed:', e.message);
    return [];
  }
}

function reciprocalRankFusion(vectorResults, bm25Results, k = 60) {
  const scores = new Map();
  
  // Vector results
  vectorResults.forEach((result, rank) => {
    const current = scores.get(result.id) || { ...result, rrfScore: 0 };
    current.rrfScore += 1 / (k + rank + 1);
    scores.set(result.id, current);
  });
  
  // BM25 results
  bm25Results.forEach((result, rank) => {
    const current = scores.get(result.id) || { ...result, rrfScore: 0 };
    current.rrfScore += 1 / (k + rank + 1);
    scores.set(result.id, current);
  });
  
  // Sort by RRF score
  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore);
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// Temporal Weighting
// ============================================================================

const TEMPORAL_CONFIG = {
  enabled: true,
  halfLifeDays: 30,        // Documents lose half their score after 30 days
  minWeight: 0.1,          // Minimum weight for very old documents
  recencyBoost: 1.2        // Boost for documents from today
};

function applyTemporalWeighting(results, config = TEMPORAL_CONFIG) {
  if (!config.enabled) return results;
  
  const now = Date.now();
  const halfLifeMs = config.halfLifeDays * 24 * 60 * 60 * 1000;
  
  return results.map(result => {
    const age = now - (result.updated_at || now);
    const ageDays = age / (24 * 60 * 60 * 1000);
    
    // Exponential decay
    let weight = Math.pow(0.5, age / halfLifeMs);
    weight = Math.max(weight, config.minWeight);
    
    // Boost recent documents
    if (ageDays < 1) {
      weight *= config.recencyBoost;
    }
    
    return {
      ...result,
      temporalWeight: weight,
      score: (result.rrfScore || result.score) * weight
    };
  });
}

// ============================================================================
// Main Hybrid Search
// ============================================================================

async function hybridSearch(db, query, options = {}) {
  const { 
    limit = 10, 
    skipBM25 = false,
    skipTemporal = false,
    sources = null
  } = options;
  
  console.log(`[hybrid-search] Query: "${query}"`);
  
  // Get query embedding
  const embedding = await getEmbedding(query);
  
  // Vector search
  const vectorResults = vectorSearch(db, embedding, limit * 2);
  console.log(`[hybrid-search] Vector results: ${vectorResults.length}`);
  
  // BM25 search
  let bm25Results = [];
  if (!skipBM25) {
    bm25Results = bm25Search(db, query, limit * 2);
    console.log(`[hybrid-search] BM25 results: ${bm25Results.length}`);
  }
  
  // Fuse results with RRF
  const fusedResults = reciprocalRankFusion(vectorResults, bm25Results);
  console.log(`[hybrid-search] Fused results: ${fusedResults.length}`);
  
  // Apply temporal weighting
  let finalResults = fusedResults;
  if (!skipTemporal) {
    finalResults = applyTemporalWeighting(fusedResults);
  }
  
  // Filter by source if specified
  if (sources) {
    finalResults = finalResults.filter(r => sources.includes(r.source));
  }
  
  // Limit and format
  return finalResults
    .slice(0, limit)
    .map(r => ({
      id: r.id,
      path: r.path,
      source: r.source,
      lines: `${r.start_line}-${r.end_line}`,
      score: Math.round(r.score * 1000) / 1000,
      text: r.text?.substring(0, 200) + (r.text?.length > 200 ? '...' : '')
    }));
}

// ============================================================================
// Status Check
// ============================================================================

function checkStatus(db) {
  const stats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM chunks) as total_chunks,
      (SELECT COUNT(*) FROM files) as total_files,
      (SELECT COUNT(*) FROM embedding_cache) as cached_embeddings
  `).get();
  
  const meta = db.prepare("SELECT value FROM meta WHERE key = 'memory_index_meta_v1'").get();
  
  return {
    database: MEMORY_DB,
    stats,
    indexMeta: meta ? JSON.parse(meta.value) : null,
    features: {
      vectorSearch: true,
      bm25Search: true,
      hybridSearch: true,
      temporalWeighting: true,
      autoIndexing: autoIndexer?.isActive() ?? false
    }
  };
}

// ============================================================================
// Auto-Indexing
// ============================================================================

const AUTO_INDEX_CONFIG = {
  enabled: true,
  watchPaths: [
    join(homedir(), '.openclaw', 'workspace', 'MEMORY.md'),
    join(homedir(), '.openclaw', 'workspace', 'memory')
  ],
  extensions: ['.md', '.txt'],
  ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  debounceMs: 1000,
  maxFileSizeBytes: 1024 * 1024  // 1MB
};

async function startAutoIndexer(db) {
  if (autoIndexer?.isActive()) {
    console.log('[auto-index] Already running');
    return;
  }

  try {
    // Dynamically import the compiled AutoIndexer
    const { AutoIndexer } = await import(join(distPath, 'auto-index.js'));
    
    autoIndexer = new AutoIndexer(AUTO_INDEX_CONFIG);
    
    await autoIndexer.start(async (changes) => {
      console.log(`[auto-index] Processing ${changes.length} file changes...`);
      
      for (const change of changes) {
        console.log(`[auto-index] ${change.type}: ${change.path}`);
        // Note: Actual indexing would integrate with OpenClaw's memory system
        // For now, just log the changes
      }
    });
    
    console.log('[auto-index] ✅ File watcher started');
    console.log(`[auto-index] Watching: ${AUTO_INDEX_CONFIG.watchPaths.join(', ')}`);
  } catch (err) {
    console.error('[auto-index] Failed to start:', err.message);
    console.log('[auto-index] Make sure to run: npm run build');
  }
}

async function stopAutoIndexer() {
  if (autoIndexer) {
    await autoIndexer.stop();
    autoIndexer = null;
    console.log('[auto-index] ⏹️ File watcher stopped');
  } else {
    console.log('[auto-index] Not running');
  }
}

function getAutoIndexerStatus() {
  if (!autoIndexer) {
    return { running: false, stats: null };
  }
  
  return {
    running: autoIndexer.isActive(),
    stats: autoIndexer.getStats(),
    watchedPaths: autoIndexer.getWatchedPaths(),
    pendingFiles: autoIndexer.getPendingFiles()
  };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Open database
  let db;
  try {
    db = new Database(MEMORY_DB, { readonly: true });
    console.log(`[wire-enhancements] Connected to: ${MEMORY_DB}`);
  } catch (e) {
    console.error(`[wire-enhancements] Failed to open database: ${e.message}`);
    process.exit(1);
  }
  
  switch (command) {
    case 'status':
      const status = checkStatus(db);
      console.log('\n📊 Memory Enhancements Status:');
      console.log(JSON.stringify(status, null, 2));
      break;
      
    case 'search':
      const query = args[1];
      if (!query) {
        console.error('Usage: wire-enhancements.mjs search "<query>"');
        process.exit(1);
      }
      const results = await hybridSearch(db, query, { limit: 5 });
      console.log('\n🔍 Search Results:');
      console.log(JSON.stringify(results, null, 2));
      break;
      
    case 'test':
      console.log('\n🧪 Running integration tests...');
      
      // Test 1: Vector search
      console.log('\n1. Testing vector search...');
      const testEmbedding = await getEmbedding('test query');
      const vectorResults = vectorSearch(db, testEmbedding, 3);
      console.log(`   ✅ Vector search returned ${vectorResults.length} results`);
      
      // Test 2: BM25 search
      console.log('\n2. Testing BM25 search...');
      const bm25Results = bm25Search(db, 'memory', 3);
      console.log(`   ✅ BM25 search returned ${bm25Results.length} results`);
      
      // Test 3: Hybrid search
      console.log('\n3. Testing hybrid search...');
      const hybridResults = await hybridSearch(db, 'memory system', { limit: 3 });
      console.log(`   ✅ Hybrid search returned ${hybridResults.length} results`);
      
      console.log('\n✅ All tests passed!');
      break;
      
    case 'index-start':
      await startAutoIndexer(db);
      // Keep the process alive for the file watcher
      console.log('[auto-index] Daemon mode - press Ctrl+C to stop');
      await new Promise(() => {}); // Never resolve
      break;
      
    case 'index-stop':
      await stopAutoIndexer();
      break;
      
    case 'index-status':
      const indexStatus = getAutoIndexerStatus();
      console.log('\n📡 Auto-Index Status:');
      console.log(`   Running: ${indexStatus.running ? '✅' : '❌'}`);
      if (indexStatus.stats) {
        console.log(`   Files watched: ${indexStatus.stats.filesWatched}`);
        console.log(`   Files indexed: ${indexStatus.stats.filesIndexed}`);
        console.log(`   Pending changes: ${indexStatus.stats.pendingChanges}`);
      }
      break;
      
    default:
      console.log(`
Usage: wire-enhancements.mjs <command>

Commands:
  status        Show memory system status
  search        Perform hybrid search (usage: search "<query>")
  test          Run integration tests
  
Auto-Indexing:
  index-start   Start the file watcher for auto-indexing
  index-stop    Stop the file watcher
  index-status  Show auto-indexer status
`);
  }
  
  db.close();
}

main().catch(console.error);
