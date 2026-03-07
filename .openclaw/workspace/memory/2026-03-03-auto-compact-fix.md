# Auto-Compact Fix - 2026-03-03

## Problem
Auto-compact was NOT triggering after 13 answers in TUI/gateway sessions.

## Root Cause
The "answer" event emitted when assistant messages complete was missing the `sessionKey` field:
- Event only included `runId` (a new UUID per run)
- Answer-briefing-tracker fell back to `evt.sessionKey || evt.runId`
- Since `sessionKey` was undefined, it tracked counts per-runId, not per-session
- Counts never accumulated to trigger auto-compact at 13 answers

## Solution
Three-line fix to pass `sessionKey` through the event emission chain:

### 1. Add to params interface
**File**: `src/agents/pi-embedded-subscribe.types.ts`
```typescript
export type SubscribeEmbeddedPiSessionParams = {
  session: AgentSession;
  runId: string;
  sessionKey?: string;  // ← ADDED
  // ...
}
```

### 2. Pass from attempt.ts
**File**: `src/agents/pi-embedded-runner/run/attempt.ts`
```typescript
const subscription = subscribeEmbeddedPiSession({
  session: activeSession,
  runId: params.runId,
  sessionKey: params.sessionKey,  // ← ADDED
  // ...
});
```

### 3. Include in event emission
**File**: `src/agents/pi-embedded-subscribe.handlers.messages.ts`
```typescript
emitAgentEvent({
  runId: ctx.params.runId,
  sessionKey: ctx.params.sessionKey,  // ← ADDED
  stream: "answer",
  data: { text: cleanedText, timestamp: Date.now() },
});
```

## Flow After Fix
1. Agent runs → `runEmbeddedPiAgent` receives `sessionKey`
2. Passed to `subscribeEmbeddedPiSession` via params
3. Available in handlers via `ctx.params.sessionKey`
4. Emitted with "answer" event explicitly
5. Answer-briefing-tracker receives `evt.sessionKey` (no fallback needed)
6. Counts accumulate per-sessionKey → auto-compact triggers at 13 answers ✅

## Files Changed
- `src/agents/pi-embedded-subscribe.types.ts` (1 line)
- `src/agents/pi-embedded-runner/run/attempt.ts` (1 line)
- `src/agents/pi-embedded-subscribe.handlers.messages.ts` (1 line)

## Testing
- Build: ✅ Compiled successfully
- Verification: ✅ All checks passed
- Next: Monitor for auto-compact triggers in real sessions

## Impact
- TUI sessions: Auto-compact will now trigger after 13 answers
- Gateway sessions: Auto-compact will now trigger after 13 answers
- Answer briefings: Properly tracked per-session
- Context management: Prevents token overflow

## Related
- Auto-compact system: `answer-briefing-tracker.ts` (counts answers)
- Compaction trigger: After 13 answers (configurable)
- SQLite optimization: Already completed (WAL + 256MB cache)
