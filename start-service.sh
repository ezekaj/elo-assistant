#!/bin/bash
# Neuro-Memory-Agent Background Service
# Run this ONCE to start neuro-memory as a persistent service

PID_FILE="/tmp/neuro-memory-mcp.pid"
LOG_FILE="/tmp/neuro-memory-agent.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "Neuro-memory-agent already running (PID $OLD_PID)"
        exit 0
    else
        echo "Cleaning up stale PID file"
        rm -f "$PID_FILE"
    fi
fi

# Start in background
cd /Users/tolga/Desktop/neuro-memory-agent
nohup /opt/homebrew/bin/python3 mcp_server.py > "$LOG_FILE" 2>&1 &
NEW_PID=$!

# Save PID
echo $NEW_PID > "$PID_FILE"

echo "✅ Neuro-memory-agent started (PID $NEW_PID)"
echo "📄 Log file: $LOG_FILE"
echo "📝 PID file: $PID_FILE"

# Keep script running to maintain the process
wait $NEW_PID
