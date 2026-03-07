#!/bin/bash
# Heartbeat V2 Status Checker
# Directly queries the heartbeat database since CLI runs in separate process from gateway

DB="$HOME/.openclaw/heartbeat-v2.db"

echo ""
echo "📊 Heartbeat V2 Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "$DB" ]; then
    echo "❌ Database not found at $DB"
    echo "   Heartbeat V2 may not be initialized"
    exit 1
fi

echo ""
echo "📅 Schedules:"
sqlite3 "$DB" "SELECT 
    '  Agent: ' || agent_id,
    'Interval: ' || (interval_ms / 60000) || ' min',
    'State: ' || state,
    'Next run: ' || datetime(next_run_at/1000, 'unixepoch', 'localtime')
FROM heartbeat_schedules;" | column -t -s '|'

echo ""
echo "📈 Runs (last 24h):"
RUNS=$(sqlite3 "$DB" "SELECT COUNT(*) FROM heartbeat_runs WHERE started_at > (strftime('%s', 'now') - 86400) * 1000;")
echo "  Total: $RUNS"

if [ "$RUNS" -gt 0 ]; then
    echo ""
    echo "  Recent runs:"
    sqlite3 "$DB" "SELECT 
        '    ' || datetime(started_at/1000, 'unixepoch', 'localtime') || ' - ' || status || ' (' || duration_ms || 'ms)'
    FROM heartbeat_runs 
    ORDER BY started_at DESC LIMIT 5;"
fi

echo ""
echo "💾 State:"
sqlite3 "$DB" "SELECT 
    '  Agent: ' || agent_id,
    'Total runs: ' || total_runs,
    'Alerts: ' || alert_count,
    'Consec failures: ' || consecutive_failures
FROM heartbeat_state;" 2>/dev/null || echo "  No state records yet"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
