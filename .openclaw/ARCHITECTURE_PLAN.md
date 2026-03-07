# 📋 OPENCLAW ARCHITECTURE - COMPREHENSIVE PLAN

**Date:** 2026-02-24
**Goal:** Ensure all features are fully wired, synchronized, and bug-free

---

## 🎯 EXECUTIVE SUMMARY

This plan ensures all OpenClaw features are:
1. **Fully implemented** - All Claude Code parity features complete
2. **Properly wired** - All components connected and communicating
3. **Bug-free** - No errors, proper error handling
4. **Synchronized** - TUI, CLI, API all in sync

---

## 📊 CURRENT FEATURE STATUS

| Feature | Backend | TUI | CLI | API | Status |
|---------|---------|-----|-----|-----|--------|
| **JSON Schema Validation** | ✅ | N/A | ✅ | ✅ | ✅ Complete |
| **Sampling Tools Capability** | ✅ | N/A | ✅ | ✅ | ✅ Complete |
| **Tool Choice** | ✅ | ⚠️ | ✅ | ✅ | ⚠️ TUI Optional |
| **Effort Levels** | ✅ | ⚠️ | ✅ | ✅ | ⚠️ TUI Optional |
| **Task Tool** | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| **Glob Tool** | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| **Grep Tool** | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| **Notebook Tools** | ✅ | ✅ | ✅ | ✅ | ✅ Complete |
| **Web Fetch** | ✅ | ✅ | ✅ | ✅ | ✅ Complete |

**Legend:** ✅ Complete | ⚠️ Backend Ready, UI Optional

---

## 🔧 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                      OPENCLAW ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │     CLI      │    │     TUI      │    │  Gateway     │      │
│  │  (commander) │    │  (blessed)   │    │   (HTTP)     │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │  Agent Scope    │                          │
│                    │  (tool routing) │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│         ┌───────────────────┼───────────────────┐               │
│         │                   │                   │               │
│  ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼───────┐      │
│  │   Tools      │    │  Validation  │    │   MCP        │      │
│  │  (12 tools)  │    │  (Ajv)       │    │   Client     │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              CAPABILITY SYSTEM                            │   │
│  │  - sampling.tools                                         │   │
│  │  - elicitation (url/form)                                 │   │
│  │  - roots.list                                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              EFFORT LEVEL SYSTEM                          │   │
│  │  - low/medium/high/max                                    │   │
│  │  - Model-specific support                                 │   │
│  │  - Environment variable config                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 FILE STRUCTURE

### **Core Architecture Files:**

```
src/
├── agents/
│   ├── openclaw-tools.ts          # Tool registration
│   ├── tool-execution-validator.ts # Output validation
│   ├── tool-execution-wrapper.ts  # Execution wrapper
│   ├── effort-validator.ts        # Effort level validation
│   └── tools/
│       ├── common.ts              # Common tool utilities
│       ├── task.ts                # Task tool (6 sub-tools)
│       ├── glob.ts                # Glob tool
│       ├── grep.ts                # Grep tool
│       ├── notebook.ts            # Notebook tools (3 sub-tools)
│       └── web-fetch.ts           # Web fetch tool
│
├── config/
│   ├── env-vars.effort.ts         # Effort environment variables
│   ├── effort-validator.ts        # Effort validation logic
│   └── types.models.ts            # Model types with effort support
│
├── gateway/
│   ├── open-responses.schema.ts   # API schemas (tool choice, effort)
│   ├── tools-invoke-http.ts       # HTTP tool invocation
│   └── server-methods/
│       └── agent.ts               # Agent method handler
│
├── mcp/
│   ├── client.ts                  # MCP client with capabilities
│   ├── capabilities.ts            # Capability utilities
│   └── errors.ts                  # Capability errors
│
├── acp/
│   └── client.ts                  # ACP client with capabilities
│
├── cli/
│   └── program/
│       └── register.agent.ts      # CLI agent command with --effort
│
├── commands/
│   ├── agent.ts                   # Agent command execution
│   ├── agent-via-gateway.ts       # Gateway agent command
│   └── agent/
│       └── types.ts               # Agent command types
│
└── tui/
    ├── tui-session-actions.ts     # Session actions with thinking
    ├── tui-stream-assembler.ts    # Stream assembly with thinking
    └── gateway-chat.ts            # Gateway chat integration
```

---

## 🔌 INTEGRATION POINTS

### **1. Tool Execution Flow:**

```
CLI/TUI/Gateway
    ↓
Agent Command (commands/agent.ts)
    ↓
Effort Validation (config/effort-validator.ts)
    ↓
Tool Execution (agents/tool-execution-wrapper.ts)
    ↓
Output Validation (agents/tool-execution-validator.ts)
    ↓
Result Return
```

### **2. Capability Flow:**

```
MCP/ACP Client
    ↓
Declare Capabilities (sampling.tools, elicitation, roots)
    ↓
Server Receives Capabilities
    ↓
Validate Before Tool Usage
    ↓
Enable/Disable Features
```

### **3. Effort Level Flow:**

```
CLI: --effort high
TUI: /effort high (optional)
Env: OPENCLAW_EFFORT_LEVEL=high
Config: effortDefault: "high"
    ↓
Resolve Effort (config/effort-validator.ts)
    ↓
Validate Against Model
    ↓
Apply to Agent Execution
    ↓
Pass to Model API
```

---

## ✅ VERIFICATION CHECKLIST

### **Code Quality:**
- [ ] All TypeScript types defined
- [ ] All functions have JSDoc comments
- [ ] All errors properly handled
- [ ] All async operations have error handling
- [ ] No circular dependencies

### **Integration:**
- [ ] CLI → Agent → Tools wired
- [ ] TUI → Gateway → Tools wired
- [ ] API → Gateway → Tools wired
- [ ] Validation integrated everywhere
- [ ] Capabilities declared and validated

### **Features:**
- [ ] JSON Schema validation working
- [ ] Sampling tools capability working
- [ ] Tool choice modes working
- [ ] Effort levels working
- [ ] All 12 tools have output schemas
- [ ] All tools registered in TUI

### **Error Handling:**
- [ ] Invalid effort level handled
- [ ] Missing capability handled
- [ ] Schema validation errors handled
- [ ] Tool execution errors handled
- [ ] Network errors handled

### **Documentation:**
- [ ] All public APIs documented
- [ ] Architecture documented
- [ ] Usage examples provided
- [ ] Error messages clear

---

## 🔧 REQUIRED CHANGES

### **1. Add EAGAIN Retry for Ripgrep** (grep.ts)

**File:** `src/agents/tools/grep.ts`

Add retry logic for EAGAIN errors (matching Claude Code).

### **2. Add Effort Slash Command** (Optional - TUI)

**File:** `src/tui/commands.ts`

Add `/effort` slash command for TUI users.

### **3. Add Timeout Configuration** (grep.ts)

**File:** `src/agents/tools/grep.ts`

Add configurable timeout matching Claude Code (20s default, 60s WSL).

### **4. Add Capability Check Helper** (New File)

**File:** `src/agents/capability-check.ts`

Centralized capability checking utility.

### **5. Add Effort Level Display** (Optional - TUI)

**File:** `src/tui/tui-session-actions.ts`

Display current effort level in session info.

---

## 📝 IMPLEMENTATION PHASES

### **Phase 1: Core Fixes** (Critical)
1. Add EAGAIN retry for ripgrep
2. Add timeout configuration
3. Add capability check helper

### **Phase 2: TUI Enhancements** (Optional)
1. Add /effort slash command
2. Display effort level in session info
3. Add effort selector to model picker

### **Phase 3: Documentation** (Required)
1. Update README with effort levels
2. Add capability documentation
3. Add troubleshooting guide

### **Phase 4: Testing** (Required)
1. Test all effort levels
2. Test capability validation
3. Test error handling
4. Test TUI integration

---

## 🎯 SUCCESS CRITERIA

**Implementation is complete when:**

1. ✅ All features work end-to-end
2. ✅ No TypeScript errors
3. ✅ Build successful
4. ✅ All integration points verified
5. ✅ Error handling complete
6. ✅ Documentation complete
7. ✅ Tests pass

---

**Status:** Ready for implementation
