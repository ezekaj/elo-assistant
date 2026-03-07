#!/bin/bash
# SQLite Performance Optimizations for OpenClaw
# Run this after DB changes or periodically

set -e

echo "🔧 Optimizing SQLite databases..."

DBS=(
  "$HOME/.openclaw/predictive.db"
  "$HOME/.openclaw/heartbeat-v2.db"
  "$HOME/.openclaw/tool-analytics.db"
)

for db in "${DBS[@]}"; do
  if [ -f "$db" ]; then
    echo "  Optimizing: $db"
    sqlite3 "$db" "
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA cache_size=-64000;
      PRAGMA temp_store=MEMORY;
      PRAGMA mmap_size=268435456;
      PRAGMA page_size=4096;
      VACUUM;
      ANALYZE;
    " 2>/dev/null || echo "    ⚠️  Could not optimize $db"
  fi
done

echo "✅ Done!"
