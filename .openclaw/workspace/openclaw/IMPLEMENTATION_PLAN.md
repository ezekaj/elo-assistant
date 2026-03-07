# Implementation Plan: 3 Features from Claude Code

## Overview

Implementing 3 genuinely useful features for OpenClaw messaging gateway.

---

## Feature 1: Tool Result Persistence

### Purpose

Persist large tool results to disk instead of keeping in context.

### Files to Create/Modify

1. `src/agents/tools/tool-result-persist.ts` - Core persistence logic
2. `src/agents/tools/tool-result-persist.types.ts` - Types
3. `src/agents/tool-executor.ts` - Integration point

### Key Implementation Details

```typescript
// From Claude Code:
- Max result size: ~100KB before persisting
- Save to: .claude/tool-results/{tool_use_id}.json
- Replace content with: preview + file path
- Track: originalSize, persistedSize, estimatedTokens
```

---

## Feature 2: Conversation Summarization

### Purpose

Auto-summarize old conversation parts to save context.

### Files to Create/Modify

1. `src/agents/conversation-summarizer.ts` - Core summarization
2. `src/agents/conversation-summarizer.types.ts` - Types
3. `src/agents/compaction-orchestrator.ts` - Integration

### Key Implementation Details

```typescript
// From Claude Code:
- Delta summarization: incremental updates
- Full summarization: when context fills
- Summary format: Task Overview, Current State, Discoveries, Next Steps
- Uses small model for summarization
```

---

## Feature 3: Streaming Events

### Purpose

Standardized streaming events for SDK integration.

### Files to Create/Modify

1. `src/agents/streaming-events.ts` - Event types and emitter
2. `src/agents/streaming-events.types.ts` - Types
3. `src/agents/api-client.ts` - Integration

### Key Implementation Details

```typescript
// From Claude Code:
Event types:
- stream_event
  - content_block_start
  - content_block_delta
  - content_block_stop
  - message_start
  - message_delta
  - message_stop
```

---

## Implementation Order

1. **Tool Result Persistence** (easiest, high value)
2. **Streaming Events** (medium, foundation for others)
3. **Conversation Summarization** (complex, depends on streaming)

---

## Success Criteria

- [ ] Tool results > 100KB automatically persisted
- [ ] Conversation summarization triggered on context threshold
- [ ] Streaming events emitted for all API responses
- [ ] All features work with any LLM provider
- [ ] Zero breaking changes to existing code
