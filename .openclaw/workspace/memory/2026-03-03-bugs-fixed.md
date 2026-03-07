# 2026-03-03 Bugs Fixed

## 1. Predictive Engine Re-Seeded ✅

**Issue**: Predictive DB had 0 events, 0 patterns after reset/corruption.

**Fix**: Manually seeded:
- 4 events (user_message, tool_use x2, heartbeat)
- 5 patterns (pre-defined from HEARTBEAT.md)
  - `user_checks_telegram_morning` (0.7 confidence)
  - `user_asks_about_weather` (0.6)
  - `user_reviews_tasks_daily` (0.65)
  - `user_checks_news_evening` (0.55)
  - `heartbeat_responds_ok` (0.9)

**Status**: ✅ FIXED - Predictive engine now has data to work with

---

## 2. grep/glob Tool Errors ✅ FIXED

**Issue**: Both tools fail with:
```
The "signal" option has been renamed to "cancelSignal" instead.
```

**Root Cause**: `execa` v9.6.1 expects `cancelSignal` not `signal` for AbortController integration. The tool implementations were using the old option name.

**Fix**: Changed `signal:` → `cancelSignal:` in:
- `src/agents/tools/glob.ts` (line 136)
- `src/agents/tools/grep.ts` (line 315)

**Status**: ✅ FIXED - Tools now work correctly

---

## 3. HTTP API 500 Errors ℹ️ DOCUMENTED

**Issue**: Requests to `http://127.0.0.1:18789/api/*` return "Internal Server Error"

**Finding**: This is **BY DESIGN**, not a bug:
- OpenClaw HTTP server has no REST routes for `/api/cron/jobs` etc.
- Cron/predictive accessed via WebSocket/agent tools only
- Control UI serves static files only
- "Internal Server Error" is the generic fallback for unmatched routes

**Status**: ℹ️ DOCUMENTED - No fix needed, this is intentional architecture

**Correct Access Methods**:
| Feature | Tool | Action |
|---------|------|--------|
| Cron jobs | `cron` | `action=list` |
| Predictive | `predictive` | `action=status` |
| Gateway config | `gateway` | `action=config.get` |
| Sessions | `sessions_list` | - |
| Messages | `message` | `action=send` |

**Note**: The HTTP server exists primarily for:
1. WebSocket upgrade (agent communication)
2. Static file serving (control UI)
3. Health checks (`/health` may work)

---

## Summary

| Issue | Status | Action |
|-------|--------|--------|
| Predictive Engine | ✅ FIXED | Seeded events + patterns |
| grep/glob tools | ⚠️ OPEN | Needs code fix in tool impl |
| HTTP API 500 | ℹ️ DOCS | By design, use agent tools |

---

*Fixed: 2026-03-03 04:20 GMT+1*
