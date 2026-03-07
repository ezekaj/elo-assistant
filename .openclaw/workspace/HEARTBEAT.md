# HEARTBEAT.md

## Current System Status (2026-03-02)

| Feature | Status | Details |
|---------|--------|---------|
| **Auto-Index** | ✅ RUNNING | LaunchAgent daemon (pid via `launchctl list \| grep autoindex`) |
| **Gateway** | ✅ RUNNING | Terminal session or LaunchAgent |
| **Heartbeat V2** | ✅ ACTIVE | 30min interval, SQLite persisted |
| **Predictive Engine** | ⚠️ INIT | Schema ready, 0 patterns (needs retraining) |
| **Event Mesh** | ✅ WIRED | Built-in AgentEventMesh |
| **Memory Hybrid Search** | ✅ WORKING | Vector + BM25 + RRF fusion |
| **Cron Jobs** | ⚠️ EMPTY | No scheduled jobs (add via `openclaw cron add`) |
| **LLM Briefing** | ✅ CONFIGURED | LM Studio endpoint |
| **Briefing Files** | ✅ WORKING | Writes to memory/briefings/YYYY-MM-DD.md |
| **Todo Tool** | ✅ WIRED | Session-scoped, tests passing |

## Quick Status Commands

```bash
# Auto-indexer status
launchctl list | grep autoindex

# Heartbeat V2 status
~/.openclaw/workspace/check-heartbeat-v2.sh

# Gateway status
pgrep -f "openclaw-gateway" && echo "RUNNING" || echo "NOT_RUNNING"

# Cron jobs (via gateway API)
curl -s http://127.0.0.1:18789/api/cron/jobs

# Predictive stats
sqlite3 ~/.openclaw/predictive.db "SELECT COUNT(*) FROM events;"
```

## LaunchAgents

Located at `~/Library/LaunchAgents/`:
- `ai.openclaw.autoindex.plist` - File watcher for memory indexing
- `ai.openclaw.gateway.plist` - Gateway daemon (optional, can run from terminal)

### Auto-Index Commands
```bash
# Check status
launchctl list | grep autoindex

# Stop
launchctl unload ~/Library/LaunchAgents/ai.openclaw.autoindex.plist

# Start
launchctl load ~/Library/LaunchAgents/ai.openclaw.autoindex.plist

# Logs
tail -f /tmp/openclaw-autoindex.log
```

### Gateway Commands
```bash
# Start (terminal)
openclaw gateway start

# Stop
openclaw gateway stop

# Status
openclaw gateway status
```

## Heartbeat V2

The scheduler runs in the gateway process. Status via direct DB query:

```bash
~/.openclaw/workspace/check-heartbeat-v2.sh

# Or directly:
sqlite3 ~/.openclaw/heartbeat-v2.db "SELECT agent_id, datetime(next_run_at/1000, 'unixepoch', 'localtime') FROM heartbeat_schedules;"
```

## Predictive Patterns

Pre-seeded patterns (require retraining if DB reset):
- `user_checks_telegram_morning` - morning communication pattern
- `user_asks_about_weather` - proactive weather checks
- `user_reviews_tasks_daily` - daily task review
- `user_checks_news_evening` - evening news pattern
- `heartbeat_responds_ok` - system heartbeat pattern

## Heartbeat Actions

On heartbeat, check:
1. System health (gateway running, no errors)
2. Cron jobs configured (warn if empty)
3. Memory system status
4. Predictive patterns (warn if 0 events)
5. Any failed tasks that need attention

If everything is healthy, reply: HEARTBEAT_OK
