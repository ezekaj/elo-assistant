#!/usr/bin/env node
/**
 * Auto-Index CLI - Runs as a daemon for LaunchAgent
 */

import { AutoIndexer } from './auto-index.js';
import { DEFAULT_AUTO_INDEX_CONFIG } from './config.js';
import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOG_FILE = '/tmp/openclaw-autoindex.log';

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch (e) {
    console.error(line.trim());
  }
}

log('Auto-index daemon starting...');

// Configure watch paths
const config = {
  ...DEFAULT_AUTO_INDEX_CONFIG,
  watchPaths: [
    join(homedir(), '.openclaw', 'workspace', 'MEMORY.md'),
    join(homedir(), '.openclaw', 'workspace', 'memory'),
  ],
  extensions: ['.md'],
  debounceMs: 2000,
};

async function main() {
  const indexer = new AutoIndexer(config);
  
  // Callback when files change - just log for now
  // The actual indexing happens in the main gateway process
  const callback = async (changes) => {
    for (const change of changes) {
      log(`File ${change.type}: ${change.path}`);
    }
  };

  try {
    await indexer.start(callback);
    log('Auto-indexer started successfully');
    log(`Watching: ${config.watchPaths.join(', ')}`);
    
    // Keep process alive
    process.on('SIGTERM', async () => {
      log('Received SIGTERM, shutting down...');
      await indexer.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      log('Received SIGINT, shutting down...');
      await indexer.stop();
      process.exit(0);
    });
    
  } catch (error) {
    log(`Error starting auto-indexer: ${error.message}`);
    process.exit(1);
  }
}

main();
