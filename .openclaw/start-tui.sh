#!/bin/bash
# OpenClaw TUI Clean Startup
# This script cleans up stale processes/files and starts both gateway and TUI

set -e

echo "=== OpenClaw TUI Clean Startup ==="

# 1. Check if gateway is already running
echo "[1/6] Checking for gateway..."
if lsof -ti:18789 > /dev/null 2>&1; then
    echo "  Gateway already running on port 18789"
    GATEWAY_RUNNING=true
else
    echo "  No gateway running, will start one"
    GATEWAY_RUNNING=false
fi

# 2. Clean stale lock files and temp JSON files
echo "[2/6] Cleaning stale files..."
rm -f /tmp/openclaw-*.lock 2>/dev/null || true
rm -f /tmp/openclaw-telegram-*.json /tmp/openclaw-telegram-*.json.*.tmp 2>/dev/null || true
rm -f /tmp/openclaw-sessions.json.*.tmp 2>/dev/null || true
echo "  Cleaned temp files"

# 3. Clean WAL files
echo "[3/6] Cleaning WAL files..."
rm -f ~/.openclaw/*.db-shm ~/.openclaw/*.db-wal 2>/dev/null || true
rm -f ~/.openclaw/*/*.sqlite-shm ~/.openclaw/*/*.sqlite-wal 2>/dev/null || true

# 4. Reset heartbeat state
echo "[4/6] Resetting heartbeat state..."
sqlite3 ~/.openclaw/heartbeat-v2.db "UPDATE heartbeat_state SET last_result='ok', last_message='clean_start', consecutive_failures=0;" 2>/dev/null || true

# 5. Start gateway if not already running
if [ "$GATEWAY_RUNNING" = false ]; then
    echo "[5/6] Starting OpenCLaw gateway..."
    cd ~/.openclaw/workspace/openclaw
    node scripts/run-node.mjs gateway &
    GATEWAY_PID=$!
    sleep 8

    # Check if gateway started successfully
    if ! kill -0 $GATEWAY_PID 2>/dev/null; then
        echo "ERROR: Gateway failed to start!"
        exit 1
    fi
    echo "  Gateway started (PID: $GATEWAY_PID)"
else
    echo "[5/6] Gateway already running, skipping start"
fi

# 6. Start TUI
echo "[6/6] Starting OpenCLaw TUI..."
echo ""
cd ~/.openclaw/workspace/openclaw
exec node scripts/run-node.mjs tui
