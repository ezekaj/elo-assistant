#!/usr/bin/env node
/**
 * OpenClaw Memory Enhancements - Integration Test
 * 
 * Demonstrates the enhanced search features using the same database as OpenClaw.
 * Run with: node test-enhanced-search.mjs
 */

import Database from 'better-sqlite3';
import { expandPath } from './dist/config.js';

// Import enhanced features
import {
  hybridSearch,
  applyTemporalWeighting,
  rerank,
  DEFAULT_CONFIG,
} from './dist/index.js';

// ============================================================================
// Configuration
// ============================================================================

const DB_PATH = expandPath('~/.openclaw/memory/main.sqlite');
const LM_STUDIO_URL = 'http://127.0.0.1:1234/v1';
const EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';

// ============================================================================
// Embedding Function (uses LM Studio)
// ============================================================================

async function getEmbedding(text) {
  const response = await fetch(`${LM_STUDIO_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer lm-studio',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ============================================================================
// Test Functions
// ============================================================================

async function testBasicSearch(db, query) {
  console.log('\n📌 Basic Search (Vector only)');
  console.log('─'.repeat(50));
  
  const embedding = await getEmbedding(query);
  const results = await hybridSearch(db, embedding, query, 5, {
    vectorWeight: 1.0,
    bm25Weight: 0.0,
  });

  console.log(`Query: "${query}"`);
  console.log(`Results: ${results.length}`);
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. [${r.score.toFixed(3)}] ${r.path}:${r.start_line}`);
    console.log(`   ${r.text.substring(0, 100)}...`);
  });
}

async function testHybridSearch(db, query) {
  console.log('\n📌 Hybrid Search (Vector + BM25)');
  console.log('─'.repeat(50));
  
  const embedding = await getEmbedding(query);
  const results = await hybridSearch(db, embedding, query, 5, {
    vectorWeight: 0.6,
    bm25Weight: 0.4,
  });

  console.log(`Query: "${query}"`);
  console.log(`Results: ${results.length}`);
  
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. [${r.score.toFixed(3)}] ${r.path}:${r.start_line}`);
    console.log(`   ${r.text.substring(0, 100)}...`);
  });
}

async function testTemporalWeighting(db, query) {
  console.log('\n📌 With Temporal Weighting');
  console.log('─'.repeat(50));
  
  const embedding = await getEmbedding(query);
  const results = await hybridSearch(db, embedding, query, 10);
  
  // Apply temporal weighting
  const weighted = applyTemporalWeighting(results, {
    enabled: true,
    decayProfile: 'moderate',
    minWeight: 0.3,
  });

  console.log(`Query: "${query}"`);
  console.log(`Top 5 after temporal boost:`);
  
  weighted.slice(0, 5).forEach((r, i) => {
    const age = r.created_at 
      ? Math.floor((Date.now() - r.created_at) / (1000 * 60 * 60 * 24))
      : 'N/A';
    console.log(`\n${i + 1}. [${r.score.toFixed(3)}] ${r.path} (age: ${age} days)`);
    console.log(`   ${r.text.substring(0, 80)}...`);
  });
}

async function testReranking(db, query) {
  console.log('\n📌 With Reranking (LLM-based)');
  console.log('─'.repeat(50));
  
  const embedding = await getEmbedding(query);
  const candidates = await hybridSearch(db, embedding, query, 20);
  
  // Apply reranking
  const reranked = await rerank(query, candidates, {
    enabled: true,
    provider: 'llm',
    candidateCount: 20,
    finalCount: 5,
  });

  console.log(`Query: "${query}"`);
  console.log(`Top 5 after reranking:`);
  
  reranked.slice(0, 5).forEach((r, i) => {
    console.log(`\n${i + 1}. [${r.score.toFixed(3)}] ${r.path}:${r.start_line}`);
    console.log(`   ${r.text.substring(0, 80)}...`);
  });
}

async function testFullPipeline(db, query) {
  console.log('\n📌 FULL PIPELINE (Hybrid + Temporal + Rerank)');
  console.log('─'.repeat(50));
  
  const embedding = await getEmbedding(query);
  
  // Step 1: Hybrid search
  const hybrid = await hybridSearch(db, embedding, query, 20);
  console.log(`Step 1 - Hybrid search: ${hybrid.length} candidates`);
  
  // Step 2: Temporal weighting
  const temporal = applyTemporalWeighting(hybrid, {
    enabled: true,
    decayProfile: 'moderate',
    minWeight: 0.3,
  });
  console.log(`Step 2 - Temporal weighted`);
  
  // Step 3: Reranking
  const final = await rerank(query, temporal, {
    enabled: true,
    provider: 'llm',
    candidateCount: 20,
    finalCount: 5,
  });
  console.log(`Step 3 - Reranked: ${final.length} results`);
  
  console.log('\n🏆 Final Results:');
  final.forEach((r, i) => {
    console.log(`\n${i + 1}. [${r.score.toFixed(3)}] ${r.path}:${r.start_line}`);
    console.log(`   ${r.text.substring(0, 100)}...`);
  });
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🧠 OpenClaw Memory Enhancements - Integration Test');
  console.log('='.repeat(50));
  console.log(`Database: ${DB_PATH}`);
  console.log(`LM Studio: ${LM_STUDIO_URL}`);
  
  // Open database
  const db = new Database(DB_PATH, { readonly: true });
  
  // Test queries
  const queries = [
    'dental clinic competitor analysis',
    'vector database',
    'memory embeddings',
  ];
  
  const query = queries[0]; // Use first query for demo
  
  try {
    await testBasicSearch(db, query);
    await testHybridSearch(db, query);
    await testTemporalWeighting(db, query);
    // await testReranking(db, query); // Requires LLM
    // await testFullPipeline(db, query); // Requires LLM
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('fetch failed')) {
      console.error('\n💡 Make sure LM Studio is running on port 1234');
    }
  }
  
  db.close();
  console.log('\n✅ Test complete');
}

main().catch(console.error);
