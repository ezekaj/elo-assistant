# Data Flow: Briefings and Neuro-Memory

## ❌ NO - Briefings do NOT go to Neuro-Memory

They are **PARALLEL, INDEPENDENT systems** that serve different purposes.

---

## Current Architecture

```
USER MESSAGE ("Help me with...")
       │
       ▼
┌──────────────────────────────────────┐
│         OPENCLAW GATEWAY             │
│                                      │
│  Agent processes message             │
│  ↓                                   │
│  Event Emitted (answer, tool, etc.)  │
│         │                    │       │
│         │ (1)                │ (2)   │
│         ▼                    ▼       │
│  ┌──────────────┐    ┌──────────────┐│
│  │  Event Mesh  │    │  Compaction  ││
│  │  - Checks if │    │  Briefing    ││
│  │    memorable │    │  - Listens   ││
│  │              │    │    for       ││
│  │              │    │    compaction││
│  └──────┬───────┘    └──────┬───────┘│
│         │                   │        │
│         │ (3) If memorable  │ (4)    │
│         ▼                   │        │
│  ┌──────────────────┐       │        │
│  │ Neuro-Memory MCP │       │        │
│  │ - Bayesian       │       │        │
│  │   surprise       │       │        │
│  │ - ChromaDB       │       │        │
│  └──────────────────┘       │        │
│                             │        │
└─────────────────────────────┼────────┘
                              │
                              ▼
                     ┌─────────────────┐
                     │ Briefing JSON   │
                     │ File            │
                     └─────────────────┘
```

---

## Two Parallel Flows

### Flow 1: Compaction Briefing (Original OpenClaw)

```
User Message → Agent → Compaction Event → JSON File
```

**Purpose:** Track token compression for context management

**What happens:**
1. Agent compacts conversation history
2. Compaction-briefing system listens for compaction events
3. Generates summary of what was compacted
4. Saves to `~/.openclaw/briefings/briefing-YYYY-MM-DD.json`

**What gets stored:**
- Session key
- Number of messages compacted
- Tokens saved
- Brief summary text

**Usage:**
- Agent reads briefing to restore context after restart
- Not sent to neuro-memory

---

### Flow 2: Neuro-Memory (Your Integration)

```
User Message → Agent → Event → Event Mesh → ChromaDB
```

**Purpose:** Long-term episodic memory with surprise detection

**What happens:**
1. Agent generates answer or uses a tool
2. Event emitted to Event Mesh
3. Event Mesh checks if event is "memorable"
4. If memorable → sends to Neuro-Memory MCP
5. Neuro-Memory computes Bayesian surprise
6. If novel → stores in ChromaDB

**What gets stored:**
- Full event text
- Surprise score
- Timestamp
- Metadata (type, source)
- Vector embedding

**Usage:**
- Retrieved by similarity when relevant
- Helps agent remember surprising/novel events

---

## Key Differences

| Aspect | Compaction Briefing | Neuro-Memory |
|--------|-------------------|--------------|
| **Trigger** | Compaction events only | ALL memorable events |
| **Storage** | JSON file | ChromaDB vector DB |
| **Content** | Summary | Full event text |
| **Purpose** | Context restoration | Episodic memory |
| **Retrieval** | Agent reads file | Similarity search |
| **Goes to other?** | ❌ No | ❌ No |

---

## What Events Go to Neuro-Memory?

From `event-mesh.ts`:

```typescript
// Memorable events (default - excludes noisy types)
const memorableTypes = ["answer", "tool_call", "tool_result", ...];

// NOT memorable (excluded)
const noisyTypes = [
  "heartbeat",
  "ping", 
  "status.check",
  "metrics.tick",
];
```

**Stored in Neuro-Memory:**
- ✅ `answer` - Agent responses
- ✅ `tool_call` - Tool usage
- ✅ `tool_result` - Tool outputs
- ✅ Most other events

**NOT stored:**
- ❌ `compaction` events (they go to briefing only)
- ❌ `heartbeat` (too frequent)
- ❌ `ping` (noise)

---

## Summary

**Briefings and Neuro-Memory are SEPARATE:**

1. **Compaction Briefing** → JSON file for context
2. **Neuro-Memory** → ChromaDB for episodic memory
3. **No data flows between them**
4. **They complement each other** but don't intersect

If you want briefings to ALSO go to neuro-memory, you would need to:
- Add code to emit a "compaction_summary" event
- Ensure it's in the `memorableTypes` list
- The event would then flow: Compaction → Event Mesh → Neuro-Memory

But currently, this is **not implemented** - they remain parallel systems.
