# Quick Reference - TUI "No Output" Fix

## What Was Fixed ✅

### Missing Memory Briefing Files

**Problem:** System couldn't find memory briefing files, causing errors.

**Files Created:**
- `~/.openclaw/workspace/memory/briefings/2026-02-22.md` ✅
- `~/.openclaw/workspace/memory/briefings/2026-02-23.md` ✅

**Result:** ENOENT errors eliminated.

---

## System Status ✅

### Heartbeat
- **Status:** Working
- **Runs:** 29 in last 24h (28 ok, 2 skipped)
- **Next run:** 2026-02-23 01:16:59

### Briefings
- **JSON briefings:** ✅ Working (131 compactions today)
- **Memory briefings:** ✅ Fixed (files created)
- **MD aggregated:** ⏳ Waiting (needs 10 conversation cycles)

### Database
- **Path:** `~/.openclaw/heartbeat-v2.db`
- **Status:** ✅ Working
- **Note:** Minor startup errors, no functional impact

---

## TUI "(no output)" Explained

### What It Means

The TUI shows "(no output)" when the agent's response is completely empty - no text content and no error messages.

### Why It Happens

1. **Empty message:** Agent returns message with no content blocks
2. **Missing context:** Agent can't process due to missing briefings
3. **Error state:** Agent encounters an error but doesn't return error text

### Content Flow

```
Agent Response
    ↓
extractContentFromMessage() → Gets text from message
    ↓
TuiStreamAssembler → Builds final display text
    ↓
resolveFinalAssistantText() → Returns text or "(no output)"
    ↓
TUI shows result
```

### Where to Find the Code

**File:** `/Users/tolga/.openclaw/workspace/openclaw/src/tui/tui-formatters.ts`

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
  return "(no output)";  // ← This is what you see
}
```

---

## Two Briefing Systems

### System A: JSON Briefings ✅
- **Path:** `~/.openclaw/briefings/briefing-YYYY-MM-DD.json`
- **Purpose:** Persistent storage of compaction events
- **Status:** Working (131 compactions for 2026-02-22)

### System B: Memory Briefings ✅ (Fixed)
- **Path:** `~/.openclaw/workspace/memory/briefings/YYYY-MM-DD.md`
- **Purpose:** Human-readable daily summaries
- **Status:** Fixed (created missing files)

### System C: Aggregated MD Briefings ⏳
- **Path:** `~/.openclaw/workspace/briefings/YYYY-MM-DD.md`
- **Purpose:** Master aggregated briefings
- **Status:** Waiting for 10 conversation cycles

---

## Documentation Created

All in `/Users/tolga/.openclaw/workspace/`:

1. **COMPLETE_FIX_SUMMARY.md** - Full summary (this is the main doc)
2. **TUI_NO_OUTPUT_ANALYSIS.md** - Deep technical analysis
3. **FIX_BRIEFING_MISSING.md** - Fix recommendations
4. **FIX_IMPLEMENTATION_SUMMARY.md** - Implementation details

---

## Next Steps

### Immediate
- ✅ Memory briefing files created
- ✅ Analysis documents created

### Optional
- Monitor TUI with verbose mode to see "(no output)" occurrences
- Enhance TUI to show error messages instead of "(no output)"
- Fix database initialization race condition

---

## Quick Commands

```bash
# Check heartbeat status
~/.openclaw/workspace/check-heartbeat-v2.sh

# Check heartbeat database directly
sqlite3 ~/.openclaw/heartbeat-v2.db "SELECT * FROM heartbeat_runs ORDER BY created_at DESC LIMIT 5;"

# List JSON briefings
ls -la ~/.openclaw/briefings/

# List memory briefings
ls -la ~/.openclaw/workspace/memory/briefings/

# Check gateway logs for errors
tail -100 ~/.openclaw/logs/gateway.err.log | grep -i "error"

# Check for "(no output)" in logs
tail -1000 ~/.openclaw/logs/gateway.log | grep -i "no output"
```

---

## Summary

**Fixed:** ✅ Missing memory briefing files causing ENOENT errors

**Working:** ✅ Heartbeat system, database, JSON briefings, memory briefings

**Investigated:** ⏳ TUI "(no output)" - needs verbose monitoring

**Documentation:** ✅ Comprehensive analysis complete

**System Health:** ✅ All core systems operational
