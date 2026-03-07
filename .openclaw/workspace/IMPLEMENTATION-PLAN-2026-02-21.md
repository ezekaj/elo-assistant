# Deep Implementation Plan - 2026-02-21

## Executive Summary

Goal: Integrate all built-but-not-active systems into production OpenClaw instance.

**Status**: 5 major systems built but inactive. Time to activate.

---

## Phase 1: Memory Enhancements Integration (Priority: HIGH)

**Current State**: Module built (3,660 lines) at `memory-enhancements/`, not integrated.
**Target**: Hybrid search (BM25 + Vector), auto-indexing, temporal weighting, reranking.

### Tasks:
1. ✅ Module exists with dist/ build
2. ⏳ Create integration bridge to OpenClaw memory manager
3. ⏳ Test hybrid search with real queries
4. ⏳ Enable auto-index file watcher
5. ⏳ Add config options for enhancement features

### Files to create:
- `src/memory/enhanced-bridge.ts` - Integration layer

---

## Phase 2: PredictiveEngine Activation (Priority: HIGH)

**Current State**: Built at `src/agents/predictive-engine.ts`, not active.
**Target**: Proactive suggestions based on patterns.

### Tasks:
1. ✅ Engine built
2. ⏳ Hook into heartbeat system
3. ⏳ Add pattern learning from user activity
4. ⏳ Enable proactive predictions in responses
5. ⏳ Add `/predictions` command for debugging

### Integration points:
- Heartbeat runner → check predictions
- Briefing generator → include predictions
- Response flow → offer proactive suggestions

---

## Phase 3: EventMesh Production Integration (Priority: MEDIUM)

**Current State**: Production code at `src/agents/event-mesh-production/`, using simple EventEmitter.
**Target**: Replace with unified event mesh (in-memory mode initially).

### Tasks:
1. ✅ Production modules built
2. ⏳ Create adapter in `src/agents/event-mesh.ts`
3. ⏳ Test in-memory mode
4. ⏳ Add optional Docker Compose for full stack
5. ⏳ Update agents to use async events

### Approach:
- Start with in-memory (no Docker required)
- Add Docker option for scale

---

## Phase 4: Heartbeat V2 Integration (Priority: MEDIUM)

**Current State**: Built at `src/infra/heartbeat-v2/`, integration layer exists.
**Target**: Durable heartbeats with SQLite persistence.

### Tasks:
1. ✅ V2 system built with timing wheel
2. ✅ Integration layer created (`integration.ts`)
3. ⏳ Enable in gateway startup
4. ⏳ Test persistence across restarts
5. ⏳ Monitor with analytics

---

## Phase 5: Browser Automation (Priority: LOW)

**Current State**: Built at `src/browser/`, enabled in config but not actively used.
**Target**: Full Playwright automation available.

### Tasks:
1. ✅ Browser system built
2. ✅ Config enabled
3. ⏳ Test browser control via tools
4. ⏳ Add browser skill for common tasks
5. ⏳ Document usage patterns

---

## Phase 6: Additional Channels (Priority: LOW)

**Current State**: 15+ platforms supported, only Telegram active.
**Target**: Add Discord, Slack based on need.

### Tasks:
1. ⏳ Add Discord config if requested
2. ⏳ Add Slack config if requested
3. ⏳ Test multi-channel messaging

---

## Execution Order

```
1. Memory Enhancements  → Immediate value, low risk
2. PredictiveEngine     → High value, connects to memory
3. Heartbeat V2         → Infrastructure improvement
4. EventMesh            → Future-proofing
5. Browser              → Utility feature
6. Channels             → On-demand
```

---

## Success Metrics

- [ ] Memory search returns hybrid results (BM25 + vector)
- [ ] Predictive suggestions appear in briefings
- [ ] Heartbeats survive gateway restart
- [ ] Event mesh handles async agent coordination
- [ ] Browser automation works for web tasks

---

*Created: 2026-02-21 18:45*
*Executor: Main agent + subagents*
