# Issue Found: Two Compaction Systems with Mismatched Data

## The Problem

Your briefing shows **134 compactions with 0 tokens saved**, but OpenClaw shows actual token-based compactions. This is because **two different compaction systems** are running:

## System A: Answer-Based Compaction (13-Answer Rule)
- **File:** `answer-briefing-tracker.ts`
- **Trigger:** Every 13 answers (configurable)
- **Purpose:** Maintain context by summarizing every 13 responses
- **Data recorded:**
  ```typescript
  {
    sessionKey: "...",
    agentId: "main",
    timestamp: 1234567890,
    tokensBefore: 0,  // ← NOT AVAILABLE
    tokensAfter: 0,   // ← NOT AVAILABLE
    messagesCompacted: 0, // ← NOT AVAILABLE
    summary: "Answer #8"
  }
  ```
- **Result:** Counted as compaction, but `totalTokensSaved = 0`

## System B: Token-Based Compaction (Overflow)
- **File:** `pi-embedded-runner/compact.ts`
- **Trigger:** When context window approaches limit
- **Purpose:** Prevent token overflow by summarizing old messages
- **Data available:** Real `tokensBefore` and `tokensAfter` values
- **Result:** Actual token savings

## The Mismatch

From your briefing file (`briefing-2026-02-22.json`):

```json
{
  "totalCompactions": 134,
  "totalTokensSaved": 0,
  "sessions": [
    {
      "sessionKey": "agent:main:main",
      "agentId": "main",
      "compactionCount": 114,
      "summary": "Answer #8"  // ← From answer-based system
    }
  ]
}
```

The 114 compactions for main session are from the **13-answer rule**, but they're being recorded with:
- `tokensBefore: 0`
- `tokensAfter: 0`

So the calculation `totalTokensSaved += event.tokensBefore - event.tokensAfter` gives:
- `0 + (0 - 0) + (0 - 0) + ... = 0`

## Why This Happens

In `compaction-briefing-integration.ts`:

```typescript
const compactionEvent: CompactionEvent = {
  sessionKey,
  agentId,
  timestamp: evt.ts,
  tokensBefore: 0, // Not available in current event  ← PROBLEM
  tokensAfter: 0,  // Not available in current event  ← PROBLEM
  messagesCompacted: 0, // Not available in current event  ← PROBLEM
};
```

The compaction event listener doesn't have access to the actual token data when recording compactions from the answer-based system.

## Root Cause

The **compaction-briefing-integration** listens for "compaction" stream events, but:
1. The answer-based system (13-answer rule) emits compaction events without token data
2. The token-based system (overflow) also emits compaction events, likely WITH token data
3. But the briefing is aggregating both, and the answer-based ones are diluting the token savings

## Solution Options

### Option 1: Skip Compactions Without Token Data
Only record compactions that have actual token data:

```typescript
// In compaction-briefing.ts recordCompaction()
export async function recordCompaction(
  event: CompactionEvent,
  compactedContent: string,
  config?: CompactionBriefingConfig,
): Promise<void> {
  // Skip compactions without token data
  if (event.tokensBefore === 0 && event.tokensAfter === 0) {
    log.debug('Skipping compaction without token data');
    return;
  }

  const briefing = loadDailyBriefing(config);
  // ... rest of function
}
```

### Option 2: Separate Tracking for Answer-Based Compactions
Track answer-based compactions separately:

```typescript
interface DailyBriefing {
  // ... existing fields
  answerCompactions?: number;  // New field for answer-based
}

// In narrative
function generateDailyNarrative(briefing: DailyBriefing): string {
  const parts: string[] = [];

  // Header
  parts.push(`Daily Briefing - ${briefing.date}`);
  parts.push(`${briefing.totalCompactions} compaction(s)`);
  if (briefing.answerCompactions) {
    parts.push(`(${briefing.answerCompactions} answer-based, ${briefing.totalCompactions - briefing.answerCompactions} token-based)`);
  }
  parts.push(`${briefing.totalTokensSaved.toLocaleString()} tokens saved\n`);

  // ... rest of function
}
```

### Option 3: Get Token Data From Session Manager
Query the session for actual token counts when recording answer-based compactions:

```typescript
// In compaction-briefing-integration.ts
async function recordCompactionAsync(event: CompactionEvent): Promise<void> {
  try {
    // Try to get actual token counts from session
    const session = sessionManager?.getSession(event.sessionKey);
    const actualTokensBefore = session?.tokensUsed || 0;

    const compactionEvent: CompactionEvent = {
      ...event,
      tokensBefore: actualTokensBefore,
      tokensAfter: actualTokensBefore * 0.1,  // Estimate: 90% reduction
      messagesCompacted: 13,  // Known: 13 answers
    };

    await recordCompaction(compactionEvent, summary, config);
  } catch (error) {
    log.error(`Failed to record compaction: ${error}`);
  }
}
```

## Current Impact

- **Briefing shows:** 134 compactions, 0 tokens saved
- **Reality:** Some compactions saved tokens, but can't see them
- **Confusion:** Can't tell which compactions are saving tokens vs. just summarizing answers

## Recommendation

**Option 1** is the cleanest solution: skip compactions without token data from the `totalTokensSaved` calculation. This way:
- Answer-based compactions are still tracked in `totalCompactions`
- Only token-based compactions contribute to `totalTokensSaved`
- Briefing becomes more accurate

Would you like me to implement this fix?
