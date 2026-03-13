# Hybrid Integration Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPACTION EVENT                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              compaction-briefing.ts                         │
│  1. Generate summary                                        │
│  2. Save to JSON file (~/.openclaw/briefings/)             │
│  3. Emit 'compaction_summary' event ───────────────┐       │
└─────────────────────────────────────────────────────┼───────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  event-mesh.ts                              │
│  1. Receive compaction_summary event                        │
│  2. Check if memorable (config.memorableTypes)             │
│  3. Convert to text                                         │
│  4. Call neuroMemory.storeMemory() ────────────────┐       │
└─────────────────────────────────────────────────────┼───────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────┐
│              neuro-memory-bridge.ts                         │
│  1. Send to MCP server via stdio                            │
│  2. Python stores in ChromaDB                               │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Config Schema Update
**File:** `src/config/zod-schema.agent-defaults.ts`
**Change:** Add `briefingToNeuroMemory` option to `neuroMemory` config

### Step 2: Compaction-Briefing Integration
**File:** `src/agents/compaction-briefing.ts`
**Changes:**
- Add event emitter parameter
- After saving JSON, emit `compaction_summary` event
- Include: summary, topics, sessionId, timestamp

### Step 3: Event-Mesh Handler
**File:** `src/agents/event-mesh.ts`
**Changes:**
- Add `compaction_summary` to memorableTypes default list
- Ensure eventToText() handles compaction_summary events
- No changes needed to storeToNeuroMemory() - it's generic

### Step 4: Neuro-Memory-Bridge
**File:** `src/agents/neuro-memory-bridge.ts`
**Changes:** NONE - already supports generic memory storage

### Step 5: MCP Server
**File:** `mcp_server.py` (neuro-memory-agent)
**Changes:** NONE - already handles generic text storage

## Data Flow

### Compaction Event Structure:
```typescript
{
  type: "compaction_summary",
  source: "compaction-briefing",
  timestamp: number,
  data: {
    sessionKey: string,
    agentId: string,
    summary: string,        // LLM-generated or extracted
    topics?: string[],      // Key themes
    tokensSaved?: number,
    messagesCompacted?: number
  }
}
```

### Storage in ChromaDB:
```python
{
  "content": {
    "text": "Compaction: User and agent discussed X. Key decisions: Y.",
    "metadata": {
      "type": "compaction_summary",
      "sessionKey": "agent:main:main",
      "topics": ["feature", "bugfix"],
      "tokensSaved": 5000
    }
  },
  "surprise": 0.65,  // Bayesian surprise score
  "timestamp": "2026-02-24T08:00:00Z"
}
```

## Configuration

### Enable Integration:
```json
{
  "memory": {
    "neuroMemory": {
      "enabled": true,
      "agentPath": "/Users/tolga/Desktop/neuro-memory-agent",
      "memorableTypes": ["answer", "tool_call", "compaction_summary"],
      "surpriseThreshold": 0.3
    }
  }
}
```

## Testing Checklist

- [ ] Compaction event emitted
- [ ] Event received by event-mesh
- [ ] Neuro-memory stores briefing
- [ ] Retrieval includes briefings
- [ ] JSON file still created (parallel)
- [ ] No errors in logs
- [ ] Token efficiency improved

## Rollback Plan

If issues occur:
1. Set `briefingToNeuroMemory: false` in config
2. Systems continue working in parallel mode
3. No data loss - JSON files always created
