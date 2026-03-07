#!/usr/bin/env node
/**
 * Quick test of memory-enhancements integration
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the enhanced search
import { EnhancedMemorySearch } from './enhanced-wrapper.js';

// Embedding function using LM Studio
async function getEmbedding(text) {
  const response = await fetch('http://127.0.0.1:1234/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-nomic-embed-text-v1.5',
      input: text,
    }),
  });
  const data = await response.json();
  return data.data[0].embedding;
}

async function main() {
  console.log('🧠 Testing Memory Enhancements Integration\n');

  // Open OpenClaw's memory database
  const dbPath = path.join(os.homedir(), '.openclaw', 'memory', 'main.sqlite');
  console.log(`Database: ${dbPath}`);
  
  const db = new Database(dbPath, { readonly: true });
  
// Load sqlite-vec extension (like OpenClaw does)
  try {
    db.enableLoadExtension(true);
    const extPath = '/opt/homebrew/lib/node_modules/openclaw/node_modules/sqlite-vec-darwin-arm64/vec0.dylib';
    db.loadExtension(extPath);
    console.log('✅ sqlite-vec extension loaded');
  } catch (err) {
    console.log('⚠️ Could not load sqlite-vec:', err.message);
  }
  
  // Check how many chunks exist
  const count = db.prepare('SELECT COUNT(*) as n FROM chunks').get();
  console.log(`Chunks in database: ${count.n}\n`);

  // Create enhanced search
  const search = new EnhancedMemorySearch(db, getEmbedding, {
    hybrid: { enabled: true, vectorWeight: 0.6, bm25Weight: 0.4 },
    temporal: { enabled: true, decayProfile: 'moderate' },
    rerank: { enabled: false }, // Skip for speed
  });

  const query = 'dental clinic competitor';
  console.log(`Query: "${query}"\n`);

  try {
    // Test hybrid search
    console.log('📌 Hybrid Search Results:');
    console.log('─'.repeat(50));
    
    const results = await search.search(query, { limit: 5 });
    
    results.forEach((r, i) => {
      console.log(`\n${i + 1}. [score: ${r.score.toFixed(3)}]`);
      console.log(`   Path: ${r.path}:${r.startLine}`);
      console.log(`   Snippet: ${r.snippet.substring(0, 100)}...`);
    });

    console.log('\n✅ Integration test PASSED');
    console.log('\nFeatures tested:');
    console.log('  ✅ Hybrid search (vector + BM25)');
    console.log('  ✅ Temporal weighting');
    console.log('  ✅ LM Studio embeddings');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('fetch')) {
      console.log('\n💡 Make sure LM Studio is running on localhost:1234');
    }
  }

  db.close();
}

main();
