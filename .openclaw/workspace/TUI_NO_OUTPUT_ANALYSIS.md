# TUI "No Output" Issue - Database & Briefing Connection Analysis

## Problem Statement

User reports seeing "(no output)" in the OpenClaw TUI when there should be content.

## Root Cause Analysis

### 1. The "(no output)" Message Source

**Location:** `/Users/tolga/.openclaw/workspace/openclaw/src/tui/tui-formatters.ts`

```typescript
export function resolveFinalAssistantText(params: {
  finalText?: string | null;
  streamedText?: string | null;
}) {
  const finalText = params.finalText ?? "";
  if (finalText.trim()) {
    return finalText;
  }
  const streamedText = params.streamedText ?? "";
  if (streamedText.trim()) {
    return streamedText;
  }
  return "(no output)";
}
```

This function is called when:
- Both `finalText` and `streamedText` are empty strings
- The TUI Stream Assembler cannot extract any content from the agent's message

### 2. Content Extraction Flow

The content extraction follows this path:

```
Agent Message → extractContentFromMessage() → TuiStreamAssembler → resolveFinalAssistantText()
```

**Key Functions:**
- `extractContentFromMessage()` - Extracts text blocks from message content
- `extractThinkingFromMessage()` - Extracts thinking blocks (optional)
- `composeThinkingAndContent()` - Combines thinking and content
- `TuiStreamAssembler.finalize()` - Finalizes the stream and calls `resolveFinalAssistantText()`

### 3. Possible Causes of Empty Content

#### A. Empty Message Content
The message object has no content blocks or all content blocks are empty.

#### B. Database Initialization Issues
**Evidence from logs:**
```
2026-02-21T23:36:17.306Z [openclaw] Unhandled promise rejection: Error: Database not initialized
2026-02-22T00:07:00.033Z [openclaw] Unhandled promise rejection: Error: Database not initialized
```

**Location:** `/Users/tolga/.openclaw/workspace/openclaw/src/infra/heartbeat-v2/state-manager.ts`

The heartbeat state manager throws "Database not initialized" when accessed before initialization.

**Impact:** If the database fails to initialize, it may cause:
- Heartbeat system failures
- Briefing generation issues
- Agent state management problems
- Potential cascading failures that affect message processing

#### C. Briefing System Issues

**Briefing System Architecture:**

1. **Briefing Files:** `~/.openclaw/briefings/briefing-YYYY-MM-DD.json`
2. **Memory Briefings:** `~/.openclaw/workspace/memory/briefings/YYYY-MM-DD.md`
3. **Briefing Tool:** Agents can read briefings via the `briefing` tool

**Current Status:**
```
~/.openclaw/briefings/
├── briefing-2026-02-20.json
├── briefing-2026-02-21.json
└── briefing-2026-02-22.json ✅ (latest)
```

**Evidence of Briefing Issues:**
```
2026-02-21T23:08:39.261Z [tools] read failed: ENOENT: no such file or directory,
access '/Users/tolga/.openclaw/workspace/memory/briefings/2026-02-22.md'
```

The briefing system is trying to read a memory briefing file that doesn't exist yet.

### 4. Database → Briefing → TUI Connection

```
Database (heartbeat-v2.db)
    ↓
Heartbeat State Manager
    ↓
Agent Session Management
    ↓
Compaction Events
    ↓
Briefing Generation
    ↓
Briefing Files (~/.openclaw/briefings/)
    ↓
Agent Reads Briefing via briefing tool
    ↓
Agent Processes Briefing
    ↓
Agent Generates Response
    ↓
TUI Displays Response
```

**Failure Points:**

1. **Database not initialized** → Heartbeat fails → Briefing generation may fail → Agent has incomplete context → Empty response

2. **Briefing file missing** → Agent tries to read non-existent briefing → Error handling may return empty content → "(no output)"

3. **Compaction issues** → No briefing generated → Agent has no context → Generates empty response

### 5. Current System Status

**Heartbeat Database:** ✅ Working
- Path: `~/.openclaw/heartbeat-v2.db`
- Recent runs showing "ok" status
- Schedule: 30-minute interval

**Briefing Files:** ✅ Being generated
- JSON briefings in `~/.openclaw/briefings/`
- Latest: `briefing-2026-02-22.json` (131 compactions)

**Memory Briefings:** ⚠️ Incomplete
- Only 2 files: `2026-02-18.md` and `2026-02-21.md`
- Missing: `2026-02-22.md`

**Cron Jobs:** ✅ Configured
- News digest: 6pm Europe/Berlin (enabled)
- Email check: every 15 min (disabled due to Telegram error)

## Recommended Actions

### Immediate Fix: Database Initialization

The "Database not initialized" errors suggest the heartbeat state manager is being accessed before initialization.

**Check:**
```bash
# Verify heartbeat database is accessible
sqlite3 ~/.openclaw/heartbeat-v2.db "SELECT COUNT(*) FROM heartbeat_runs;"

# Check heartbeat status via direct DB query
~/.openclaw/workspace/check-heartbeat-v2.sh
```

### Fix Missing Memory Briefings

The memory briefing files are not being generated properly.

**Investigate:**
```bash
# Check briefing generation logs
tail -100 ~/.openclaw/logs/gateway.log | grep -i "briefing"

# Verify briefing directory permissions
ls -la ~/.openclaw/workspace/memory/briefings/
```

### Debug TUI Output Issues

**Steps to reproduce and debug:**

1. **Enable verbose logging in TUI:**
   - Start TUI with verbose mode
   - Check gateway logs for message content

2. **Inspect message content:**
   - Look at the raw message object in logs
   - Check if content blocks are present

3. **Test content extraction:**
   - Run TUI with debug mode
   - Check if `extractContentFromMessage()` is being called correctly

### Potential Code Issues

**Issue 1: Empty Message Handling**
The TUI may not be handling certain message types correctly (e.g., error messages, tool-only responses).

**Issue 2: Briefing Tool Errors**
If the agent tries to read a briefing and encounters an error, it may return an empty response.

**Issue 3: Database Initialization Race Condition**
The heartbeat state manager may be accessed before `initialize()` completes.

## Connection Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ heartbeat-v2.db (SQLite)                                  │  │
│  │  - heartbeat_schedules                                    │  │
│  │  - heartbeat_runs                                         │  │
│  │  - heartbeat_state                                        │  │
│  │  - heartbeat_signals                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    HEARTBEAT SYSTEM                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ HeartbeatStateManager                                     │  │
│  │  - initialize() → Must be called first                    │  │
│  │  - getState()                                             │  │
│  │  - recordRun()                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BRIEFING SYSTEM                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Briefing Files (~/.openclaw/briefings/)                    │  │
│  │  - briefing-YYYY-MM-DD.json (generated by system)        │  │
│  │ Memory Briefings (~/.openclaw/workspace/memory/briefings/)│  │
│  │  - YYYY-MM-DD.md (generated by agents)                    │  │
│  │ Briefing Tool                                              │  │
│  │  - briefing tool for agents to read briefings            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT PROCESSING                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Agent Session                                              │  │
│  │  - Reads briefings via briefing tool                       │  │
│  │  - Processes context                                       │  │
│  │  - Generates response                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      TUI DISPLAY                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ TuiStreamAssembler                                        │  │
│  │  - ingestDelta() → Updates display during stream          │  │
│  │  - finalize() → Calls resolveFinalAssistantText()       │  │
│  │ resolveFinalAssistantText()                               │  │
│  │  - Returns content if present                              │  │
│  │  - Returns "(no output)" if both finalText and            │  │
│  │    streamedText are empty                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Next Steps

1. **Check gateway logs** for the specific interaction that shows "(no output)"
2. **Verify database initialization** - ensure heartbeat state manager is fully initialized before access
3. **Fix memory briefing generation** - ensure both JSON and MD briefings are created
4. **Test TUI with verbose mode** to see the raw message content
5. **Add better error handling** for cases where briefings are missing or database is not initialized

## Files Involved

- `/Users/tolga/.openclaw/workspace/openclaw/src/tui/tui-formatters.ts` - "(no output)" message
- `/Users/tolga/.openclaw/workspace/openclaw/src/tui/tui-stream-assembler.ts` - Stream processing
- `/Users/tolga/.openclaw/workspace/openclaw/src/tui/tui-event-handlers.ts` - Event handling
- `/Users/tolga/.openclaw/workspace/openclaw/src/infra/heartbeat-v2/state-manager.ts` - Database management
- `/Users/tolga/.openclaw/workspace/openclaw/src/agents/tools/briefing-tool.ts` - Briefing tool
- `/Users/tolga/.openclaw/workspace/openclaw/src/agents/compaction-briefing.ts` - Briefing generation
- `~/.openclaw/heartbeat-v2.db` - Heartbeat database
- `~/.openclaw/briefings/` - JSON briefing files
- `~/.openclaw/workspace/memory/briefings/` - Memory briefing files
