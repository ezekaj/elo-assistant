# OpenClaw Deep Function Search Results

Generated: 2026-02-16

## 📊 Statistics
- **Total TypeScript Files**: 2,581
- **Total Exported Functions**: 3,585
- **Core Architecture Components**: 7 key classes

---

## 🏗️ Core Architecture (Classes/Managers)

### 1. **PredictiveEngine** (NEW - Development)
- Location: `src/agents/predictive-engine.ts`
- Purpose: Proactive AI intelligence based on 2026 research
- Features:
  - Anticipates user needs (GOD Model)
  - Knows "when" to intervene (Alpha-Service)
  - Pattern-based learning
  - MAPE-K continuous improvement loops
  - Privacy-preserving on-device learning

### 2. **AgentEventMesh** (NEW - Development)
- Location: `src/agents/event-mesh.ts`
- Purpose: Event-driven inter-agent communication
- Features:
  - Async pub/sub messaging
  - Event persistence
  - Type-safe event handling

### 3. **ToolAnalyticsManager** (NEW - Development)
- Location: `src/infra/tool-analytics.ts`
- Purpose: Tool execution monitoring
- Features:
  - Success rate tracking
  - Performance metrics
  - Error analysis
  - Usage insights

### 4. **CronService**
- Location: `src/cron/service.ts`
- Purpose: Scheduled job management

### 5. **ExecApprovalManager**
- Location: `src/gateway/exec-approval-manager.ts`
- Purpose: Command execution approval workflow

### 6. **NodeRegistry**
- Location: `src/gateway/node-registry.ts`
- Purpose: Node/device registration management

### 7. **MemoryIndexManager / QmdMemoryManager**
- Location: `src/memory/manager.ts`, `src/memory/qmd-manager.ts`
- Purpose: Vector/semantic memory search

---

## 🔧 Key Function Categories

### Agent & Session Management (41 functions)
- `createSessionSlug` - Session identifier generation
- `buildSubagentSystemPrompt` - Sub-agent prompts
- `createOpenClawTools` - Core tool factory
- `createSandboxedEditTool` / `createSandboxedReadTool` / `createSandboxedWriteTool` - Sandboxed file operations
- `createEmbeddedPiSessionEventHandler` - Pi device event handling
- `spawnSubagent` - Isolated agent spawning
- `resolveSessionKey` - Session key resolution

### Gateway & Protocol (11 functions)
- `attachGatewayWsConnectionHandler` - WebSocket connection handling
- `buildGatewaySnapshot` - System state snapshot
- `createGatewayPluginRequestHandler` - Plugin request routing
- `createGatewayHooksRequestHandler` - Hook system
- `getHealthCache` / `setBroadcastHealthUpdate` - Health monitoring

### Memory & Intelligence (26 functions)
- `bm25RankToScore` - BM25 relevance scoring
- `buildFtsQuery` - Full-text search query builder
- `chunkMarkdown` - Text chunking for embeddings
- `cosineSimilarity` - Vector similarity calculation
- `computeEmbeddingProviderKey` - Embedding model selection
- `ensureMemoryIndexSchema` - Memory index initialization
- `extractSessionText` - Session transcript extraction
- `mergeHybridResults` - Hybrid search result fusion
- `parseEmbedding` - Embedding deserialization

### Tools & Execution (40+ tools)
**Creation Functions:**
- `createAgentsListTool` - List available agents
- `createBrowserTool` - Browser automation
- `createCanvasTool` - UI canvas control
- `createCronTool` - Cron job management
- `createGatewayTool` - Gateway control
- `createMemorySearchTool` / `createMemoryGetTool` - Memory access
- `createMessageTool` - Channel messaging
- `createNodesTool` - Node management
- `createSessionsSpawnTool` - Sub-agent spawning
- `createSessionsSendTool` - Cross-session messaging
- `createTtsTool` - Text-to-speech
- `createWebSearchTool` / `createWebFetchTool` - Web access

**Execution Functions:**
- `trackToolExecution` - Execution monitoring
- `createActionGate` - Permission gating
- `createAgentToAgentPolicy` - Inter-agent communication policy
- `sanitizeToolResult` - Result sanitization
- `wrapToolWithBeforeToolCallHook` - Tool call interception

### Infrastructure (100+ functions)
- `startHeartbeatRunner` - Heartbeat system
- `upsertPresence` - Presence tracking
- `verifyDeviceSignature` - Device authentication
- `trackToolExecution` - Analytics
- `triggerOpenClawRestart` - System restart
- `startSshPortForward` - SSH tunneling
- `resolveLsofCommand` - Network diagnostics

---

## 🧠 Advanced AI Features

### Predictive Engine Capabilities:
- **Time-based predictions**: Calendar events, recurring tasks
- **Event-based predictions**: React to system events
- **Pattern-based predictions**: Learn user behavior
- **Context-based predictions**: Understand current state
- **Behavior-based predictions**: Anticipate actions

### Event Mesh System:
- Event types: `user.message`, `tool.executed`, `calendar.event`, `email.received`
- Persistent event queue (SQLite)
- Type-safe subscriptions
- Event filtering and routing

### Memory System:
- **Hybrid search**: BM25 + vector embeddings
- **Vector embeddings**: OpenAI, Gemini models supported
- **Semantic chunking**: Markdown-aware text splitting
- **Caching**: LRU cache with TTL
- **Multi-backend**: SQLite, QMD (Quantized Memory Database)

---

## 📂 Directory Structure (Key Components)

```
src/
├── agents/          # Agent orchestration (202 files)
│   ├── predictive-engine.ts     # NEW: Proactive intelligence
│   ├── event-mesh.ts            # NEW: Event system
│   ├── tools/                   # Tool implementations (67 files)
│   ├── memory-search.ts         # Memory search logic
│   └── sessions-spawn-tool.ts   # Sub-agent spawning
├── gateway/         # Gateway server (51 files)
│   └── server/      # WebSocket + HTTP server
├── memory/          # Vector search (27 files)
│   ├── manager.ts   # Memory index manager
│   ├── embeddings.ts # Embedding computation
│   └── hybrid.ts    # Hybrid search
├── infra/           # Infrastructure (31 files)
│   └── tool-analytics.ts        # NEW: Analytics
├── cron/            # Scheduled jobs
├── sessions/        # Session management
├── channels/        # Platform integrations (Discord, Telegram, etc.)
└── providers/       # AI model providers
```

---

## 🚀 Notable Advanced Functions

### Multi-Agent Coordination:
- `buildAgentToAgentAnnounceContext` - A2A messaging
- `createAgentToAgentPolicy` - Communication rules
- `resolveNodeIdFromList` - Node discovery

### Intelligent Features:
- `predictNextAction` - Predictive engine core
- `learnUserPattern` - Pattern learning
- `calculateConfidenceScore` - Prediction confidence
- `shouldTriggerProactiveAction` - Intervention logic

### Performance & Analytics:
- `trackToolExecution` - Real-time monitoring
- `computeBackoff` - Retry logic
- `createDedupeCache` - Deduplication
- `resolveCacheTtlMs` - Cache optimization

---

## 🔐 Security Functions

- `verifyDeviceSignature` - Device authentication
- `signDevicePayload` - Payload signing
- `authorizeGatewaySigusr1Restart` - Restart authorization
- `createExecApprovalForwarder` - Execution approval flow
- `sanitizeToolCallInputs` - Input sanitization
- `validateConfigPath` - Path validation

---

## 📈 Development Status

**Uncommitted New Features:**
1. ✅ Event Mesh (src/agents/event-mesh.ts)
2. ✅ Predictive Engine (src/agents/predictive-engine.ts)
3. ✅ Tool Analytics (src/infra/tool-analytics.ts)

**Status:** Ready for testing and commit

**Next Steps:**
1. Run unit tests
2. Integration testing
3. Performance profiling
4. Documentation update
5. Commit to main branch

---

## 🎯 Key Insights

1. **3,585 functions** across 2,581 files - very comprehensive
2. **Strong architecture** - Manager/Engine pattern
3. **Advanced AI** - Predictive, proactive capabilities
4. **Hybrid memory** - BM25 + vector search
5. **Event-driven** - Mesh system for async coordination
6. **Privacy-first** - On-device learning (GOD Model)
7. **Extensible** - Tool factory pattern
8. **Production-ready** - Analytics, monitoring, caching

This is a **highly sophisticated personal AI assistant framework** with cutting-edge 2026 research integrated (Alpha-Service, GOD Model, MAPE-K loops).
