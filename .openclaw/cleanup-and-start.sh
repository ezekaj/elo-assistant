#!/bin/bash
# OpenClaw Clean Startup Script (Gateway Only)
# Use this to start a clean gateway before using openclaw-tui

set -e

echo "=== OpenClaw Clean Startup (Gateway) ==="

# 1. Kill any stale processes
echo "[1/5] Checking for stale processes..."
STALE=$(pgrep -f "openclaw" | wc -l)
if [ "$STALE" -gt 0 ]; then
    echo "  Killing $STALE stale process(es)..."
    pkill -9 -f openclaw 2>/dev/null || true
    sleep 2
fi

# 2. Clean stale lock files and temp JSON files
echo "[2/5] Cleaning stale files..."
rm -f /tmp/openclaw-*.lock 2>/dev/null || true
rm -f /tmp/openclaw-telegram-*.json /tmp/openclaw-telegram-*.json.*.tmp 2>/dev/null || true
rm -f /tmp/openclaw-sessions.json.*.tmp 2>/dev/null || true
echo "  Cleaned temp files"

# 3. Clean WAL files
echo "[3/5] Cleaning WAL files..."
rm -f ~/.openclaw/*.db-shm ~/.openclaw/*.db-wal 2>/dev/null || true
rm -f ~/.openclaw/*/*.sqlite-shm ~/.openclaw/*/*.sqlite-wal 2>/dev/null || true

# 4. Reset heartbeat state
echo "[4/5] Resetting heartbeat state..."
sqlite3 ~/.openclaw/heartbeat-v2.db "UPDATE heartbeat_state SET last_result='ok', last_message='clean_start', consecutive_failures=0;" 2>/dev/null || true

# 5. Start gateway
echo "[5/5] Starting OpenCLaw gateway..."
cd ~/.openclaw/workspace/openclaw
node scripts/run-node.mjs gateway &
GATEWAY_PID=$!
echo "  Gateway started (PID: $GATEWAY_PID)"
echo ""
echo "Gateway is ready. You can now run 'openclaw-tui' in another terminal."
