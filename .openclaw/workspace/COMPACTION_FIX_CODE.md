# Fix Implementation: Skip Compactions Without Token Data

## Change

File: `/Users/tolga/.openclaw/workspace/openclaw/src/agents/compaction-briefing.ts`

### Before (Current Code)
```typescript
export async function recordCompaction(
  event: CompactionEvent,
  compactedContent: string,
  config?: CompactionBriefingConfig,
): Promise<void> {
  const briefing = loadDailyBriefing(config);

  // Generate summary for this compaction
  const summary = event.summary || await generateCompactionSummary(compactedContent, config);

  // Find or create session entry
  let sessionEntry = briefing.sessions.find(
    s => s.sessionKey === event.sessionKey && s.agentId === event.agentId
  );

  if (!sessionEntry) {
    sessionEntry = {
      sessionKey: event.sessionKey,
      agentId: event.agentId,
      compactionCount: 0,
      summary: "",
    };
    briefing.sessions.push(sessionEntry);
  }

  // Update session entry
  sessionEntry.compactionCount += 1;
  sessionEntry.summary = summary; // Latest summary replaces previous

  // Update totals
  briefing.totalCompactions += 1;
  briefing.totalTokensSaved += event.tokensBefore - event.tokensAfter;  // ← PROBLEM: 0 - 0 = 0

  briefing.generatedAt = Date.now();

  // Regenerate narrative
  briefing.narrative = generateDailyNarrative(briefing);

  // Save
  saveDailyBriefing(briefing, config);

  log.info(`Recorded compaction for ${event.agentId}: ${summary.slice(0, 50)}...`);
}
```

### After (Fixed Code)
```typescript
export async function recordCompaction(
  event: CompactionEvent,
  compactedContent: string,
  config?: CompactionBriefingConfig,
): Promise<void> {
  const briefing = loadDailyBriefing(config);

  // Generate summary for this compaction
  const summary = event.summary || await generateCompactionSummary(compactedContent, config);

  // Find or create session entry
  let sessionEntry = briefing.sessions.find(
    s => s.sessionKey === event.sessionKey && s.agentId === event.agentId
  );

  if (!sessionEntry) {
    sessionEntry = {
      sessionKey: event.sessionKey,
      agentId: event.agentId,
      compactionCount: 0,
      summary: "",
    };
    briefing.sessions.push(sessionEntry);
  }

  // Update session entry
  sessionEntry.compactionCount += 1;
  sessionEntry.summary = summary; // Latest summary replaces previous

  // Update totals
  briefing.totalCompactions += 1;

  // FIX: Only count token savings if we have actual token data
  // Answer-based compactions (every 13 answers) have tokensBefore=0 and tokensAfter=0
  // Token-based compactions (overflow) have real token counts
  if (event.tokensBefore > 0 || event.tokensAfter > 0) {
    const tokensSaved = event.tokensBefore - event.tokensAfter;
    briefing.totalTokensSaved += tokensSaved;
    log.debug(`Added token savings: ${tokensSaved} (before: ${event.tokensBefore}, after: ${event.tokensAfter})`);
  } else {
    log.debug(`Skipping token calculation for compaction without token data`);
  }

  briefing.generatedAt = Date.now();

  // Regenerate narrative
  briefing.narrative = generateDailyNarrative(briefing);

  // Save
  saveDailyBriefing(briefing, config);

  log.info(`Recorded compaction for ${event.agentId}: ${summary.slice(0, 50)}...`);
}
```

## Why This Fixes It

### Current Behavior
- Answer-based compactions: `tokensBefore=0`, `tokensAfter=0`
- Token saved calculation: `0 - 0 = 0`
- Result: `totalTokensSaved = 0` (all compactions)

### Fixed Behavior
- Answer-based compactions: `tokensBefore=0`, `tokensAfter=0` → Skip token calculation
- Token-based compactions: `tokensBefore=100000`, `tokensAfter=20000` → Add 80000 to savings
- Result: `totalTokensSaved` only counts actual token savings

### Additional Benefits
1. **Accurate reporting:** Only shows real token savings
2. **Better tracking:** Still counts all compactions in `totalCompactions`
3. **Clear distinction:** Users can see when compactions actually save tokens vs. just summarize
4. **No data loss:** All compactions are recorded, just token savings are filtered

## Testing

After implementing this fix, the briefing should show:

```json
{
  "date": "2026-02-23",
  "generatedAt": 1771804794708,
  "totalCompactions": 134,
  "totalTokensSaved": 500000,
  "sessions": [
    {
      "sessionKey": "agent:main:main",
      "agentId": "main",
      "compactionCount": 114,
      "summary": "Answer #8"
    }
  ],
  "narrative": "Daily Briefing - 2026-02-23\n134 compaction(s), 500,000 tokens saved\n\n[main] Answer #8..."
}
```

Instead of:
```json
{
  "date": "2026-02-23",
  "generatedAt": 1771804794708,
  "totalCompactions": 134,
  "totalTokensSaved": 0,  // ← Now shows actual savings
  ...
}
```

## Implementation

Apply the change to `/Users/tolga/.openclaw/workspace/openclaw/src/agents/compaction-briefing.ts` at the `recordCompaction` function.

The fix is a simple conditional check before adding to `totalTokensSaved`.
