# 🔍 PLUGIN HOOKS SYSTEM - DEEP RESEARCH REPORT

**Date:** 2026-02-24
**Source:** Claude Code v2.1.50 (447,173 lines)
**Analysis:** Complete hooks system architecture

---

## 📊 EXECUTIVE SUMMARY

Claude Code has an **extensive hooks system** with **18 event types** and **4 hook types**. Hooks can execute shell commands, run LLM evaluations, spawn agents, or call webhooks.

**Key Finding:** OpenClaw has ~40% of this functionality - missing matchers, configuration UI, and several hook types.

---

## 🎯 18 HOOK EVENT TYPES

### **Tool Events (6):**

| Event | Matcher | Purpose | Return Values |
|-------|---------|---------|---------------|
| **PreToolUse** | Tool name | Run before tool, can block | `permissionDecision`, `updatedInput`, `reason` |
| **PostToolUse** | Tool name | Run after successful tool | `additionalContext`, `updatedMCPToolOutput` |
| **PostToolUseFailure** | Tool name | Run after tool fails | `additionalContext` |
| **PermissionRequest** | Tool name | Run before permission prompt | `decision` (allow/deny/ask) |
| **Notification** | Notification type | Run on notifications | `additionalContext` |
| **Stop** | - | Run when Claude stops | `stopReason`, `suppressOutput` |

### **Session Events (4):**

| Event | Purpose | Return Values |
|-------|---------|---------------|
| **SessionStart** | When session starts | `additionalContext` |
| **SessionEnd** | When session ends | `reason` |
| **Setup** | Initial setup/maintenance | `additionalContext` |
| **ConfigChange** | When config changes | `additionalContext` |

### **Agent Events (4):**

| Event | Purpose | Return Values |
|-------|---------|---------------|
| **SubagentStart** | When subagent spawns | `additionalContext` |
| **SubagentStop** | When subagent stops | `additionalContext`, `last_assistant_message` |
| **TeammateIdle** | When teammate idle | `additionalContext` |
| **TaskCompleted** | When task completes | `additionalContext` |

### **Other Events (4):**

| Event | Purpose | Return Values |
|-------|---------|---------------|
| **UserPromptSubmit** | When user submits prompt | `additionalContext` (required) |
| **PreCompact** | Before compaction | `additionalContext` |
| **WorktreeCreate** | When worktree created | `additionalContext` |
| **WorktreeRemove** | When worktree removed | `additionalContext` |

---

## 🔧 4 HOOK TYPES

### **1. Command Hook** (Shell Command)

```json
{
  "type": "command",
  "command": "prettier --write $FILE",
  "timeout": 30,
  "async": false,
  "asyncTimeout": 60000
}
```

**Features:**
- ✅ Shell command execution
- ✅ Timeout configuration
- ✅ Async execution support
- ✅ stdin JSON input
- ✅ stdout/stderr capture
- ✅ Exit code handling

**Environment Variables:**
```bash
CLAUDE_PROJECT_DIR=/path/to/project
CLAUDE_PLUGIN_ROOT=/path/to/plugin
CLAUDE_ENV_FILE=/path/to/env  # SessionStart/Setup only
```

**stdin JSON Input:**
```json
{
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": { "file_path": "/path/to/file.txt", "content": "..." },
  "tool_response": { "success": true }  // PostToolUse only
}
```

---

### **2. Prompt Hook** (LLM Evaluation)

```json
{
  "type": "prompt",
  "prompt": "Is this safe? $ARGUMENTS",
  "model": "claude-sonnet-4-6",
  "timeout": 60
}
```

**Features:**
- ✅ LLM-based condition evaluation
- ✅ Only for tool events (PreToolUse, PostToolUse, PermissionRequest)
- ✅ JSON output validation
- ✅ Custom model selection

**stdin JSON:**
```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /tmp/*" },
  "arguments": "rm -rf /tmp/*"
}
```

**stdout JSON Output:**
```json
{
  "continue": true,
  "reason": "Command is safe",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "No dangerous patterns detected"
  }
}
```

---

### **3. Agent Hook** (Agentic Verifier)

```json
{
  "type": "agent",
  "prompt": "Verify tests pass: $ARGUMENTS",
  "tools": ["Bash", "Read", "Edit"],
  "maxTurns": 10,
  "timeout": 300
}
```

**Features:**
- ✅ Spawns subagent with tools
- ✅ Complex verification logic
- ✅ Only for tool events
- ✅ Structured output required

**Behavior:**
1. Spawns subagent with specified tools
2. Runs up to `maxTurns` (default: 10)
3. Expects structured JSON output
4. Returns decision to main agent

**Example Agent Hook:**
```json
{
  "PostToolUse": [{
    "matcher": { "tools": ["Write", "Edit"] },
    "hooks": [{
      "type": "agent",
      "prompt": "Run tests for the modified files. Report pass/fail.",
      "tools": ["Bash"],
      "maxTurns": 5
    }]
  }]
}
```

---

### **4. HTTP Hook** (Webhook) ⚠️

```json
{
  "type": "http",
  "url": "https://example.com/hook",
  "method": "POST",
  "headers": { "Authorization": "Bearer token" },
  "timeout": 30
}
```

**Status:** ⚠️ **NOT YET SUPPORTED** (code exists but disabled)

**Code Reference:**
```javascript
if (W.type === "http") {
  F(`Hooks: skipping HTTP hook ${W.url} — HTTP hooks are not yet supported`);
  return { /* skipped */ }
}
```

---

## 📋 HOOK MATCHER SYSTEM

### **Matcher Types:**

**1. Tool Matcher:**
```json
{
  "matcher": {
    "tools": ["BashTool", "WriteTool", "EditTool"]
  }
}
```

**2. Pattern Matcher:**
```json
{
  "matcher": {
    "pattern": "npm.*install"
  }
}
```

**3. File Pattern Matcher:**
```json
{
  "matcher": {
    "filePattern": "**/*.ts"
  }
}
```

**4. Combined Matcher:**
```json
{
  "matcher": {
    "tools": ["BashTool"],
    "pattern": "git.*commit",
    "filePattern": "**/*.json"
  }
}
```

### **Matcher Syntax:**

| Syntax | Meaning |
|--------|---------|
| `BashTool` | Exact tool name |
| `Bash` | Short tool name |
| `Write\|Edit` | Multiple tools (pipe-separated) |
| `npm.*` | Regex pattern |
| `**/*.ts` | Glob pattern |

---

## 📝 HOOK CONFIGURATION

### **Full Configuration Example:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": { "tools": ["BashTool"] },
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command' >> ~/.claude/bash-log.txt"
          }
        ]
      },
      {
        "matcher": { "tools": ["WriteTool", "EditTool"] },
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Does this file change introduce security issues? $ARGUMENTS",
            "model": "claude-sonnet-4-6"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_response.filePath // .tool_input.file_path' | xargs prettier --write 2>/dev/null || true"
          },
          {
            "type": "agent",
            "prompt": "Run tests for modified files",
            "tools": ["Bash"],
            "maxTurns": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "command",
            "command": "echo 'PreCompact triggered'"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started at $(date)' >> ~/.claude/session-log.txt"
          }
        ]
      }
    ]
  }
}
```

---

## 🔄 HOOK EXECUTION FLOW

### **PreToolUse Hook Flow:**

```
1. Tool call detected
   ↓
2. Match against hook matchers
   ↓
3. Execute matching hooks (sequential)
   ↓
4. Each hook can return:
   - permissionDecision: "allow" | "deny" | "ask"
   - updatedInput: Modified tool input
   - reason: Explanation
   ↓
5. Apply hook decisions:
   - If "deny": Block tool, show reason
   - If "allow": Proceed with (possibly modified) input
   - If "ask": Show permission prompt
   ↓
6. Execute tool (if allowed)
```

### **PostToolUse Hook Flow:**

```
1. Tool execution successful
   ↓
2. Match against hook matchers
   ↓
3. Execute matching hooks (sequential)
   ↓
4. Each hook can return:
   - additionalContext: Inject into model context
   - updatedMCPToolOutput: Modify tool output
   ↓
5. Continue with (possibly modified) result
```

### **PostToolUseFailure Hook Flow:**

```
1. Tool execution failed
   ↓
2. Match against hook matchers
   ↓
3. Execute matching hooks (sequential)
   ↓
4. Each hook can return:
   - additionalContext: Inject into model context
   ↓
5. Continue with error + additional context
```

---

## 📤 HOOK JSON OUTPUT SCHEMA

### **Universal Output:**

```typescript
{
  continue?: boolean;           // Stop execution if false
  suppressOutput?: boolean;     // Hide stdout from transcript
  stopReason?: string;          // Message when blocking
  systemMessage?: string;       // Display to user in UI
  reason?: string;              // Explanation for decision
  decision?: "approve" | "block"; // Deprecated for PreToolUse
  
  hookSpecificOutput: {
    hookEventName: string;      // Required: event type
    
    // PreToolUse specific
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    
    // UserPromptSubmit specific
    additionalContext: string;  // Required for this event
    
    // PostToolUse specific
    additionalContext?: string;
    updatedMCPToolOutput?: unknown;
    
    // Other events
    additionalContext?: string;
  }
}
```

### **Event-Specific Outputs:**

**PreToolUse:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "No dangerous patterns detected",
    "updatedInput": { "command": "safe-command" }
  }
}
```

**UserPromptSubmit:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "User has admin privileges for this project"
  }
}
```

**PostToolUse:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "File was formatted after writing",
    "updatedMCPToolOutput": { "filePath": "/path/to/file.ts", "formatted": true }
  }
}
```

---

## 🔌 OPENCLAW COMPARISON

### **What OpenClaw Has (✅):**

| Feature | Status |
|---------|--------|
| Basic hook registry | ✅ `src/plugins/hooks.ts` |
| `before_tool_call` hook | ✅ Implemented |
| `after_tool_call` hook | ✅ Implemented |
| `session_start` hook | ✅ Implemented |
| `session_end` hook | ✅ Implemented |
| Hook execution | ✅ Sequential execution |
| Error handling | ✅ Try/catch with logging |

### **What OpenClaw is Missing (❌):**

| Feature | Status | Impact |
|---------|--------|--------|
| **Hook Matchers** | ❌ Missing | HIGH |
| **18 Event Types** | ⚠️ 4/18 (22%) | HIGH |
| **4 Hook Types** | ⚠️ 1/4 (25%) | HIGH |
| **JSON Output Schema** | ❌ Missing | HIGH |
| **Permission Decision** | ❌ Missing | HIGH |
| **updatedInput** | ❌ Missing | MEDIUM |
| **additionalContext** | ❌ Missing | MEDIUM |
| **Async Hooks** | ❌ Missing | MEDIUM |
| **Prompt Hooks** | ❌ Missing | MEDIUM |
| **Agent Hooks** | ❌ Missing | MEDIUM |
| **HTTP Hooks** | ❌ Missing | LOW |
| **Hook Configuration UI** | ❌ Missing | MEDIUM |
| **Hook Hot Reload** | ❌ Missing | LOW |

**Overall Status:** ⚠️ **~25% Feature Complete**

---

## 🎯 IMPLEMENTATION RECOMMENDATIONS

### **Phase 1: Core Infrastructure (High Priority)**

1. **Add Hook Matchers** 🔴
   ```typescript
   interface HookMatcher {
     tools?: string[];      // Tool names to match
     pattern?: string;      // Regex pattern for input
     filePattern?: string;  // Glob pattern for files
   }
   ```

2. **Add More Event Types** 🔴
   ```typescript
   type HookEvent = 
     | 'PreToolUse'
     | 'PostToolUse'
     | 'PostToolUseFailure'
     | 'UserPromptSubmit'
     | 'PreCompact'
     | 'SubagentStart'
     | 'SubagentStop'
     | 'Stop';
   ```

3. **Add JSON Output Schema** 🔴
   ```typescript
   interface HookOutput {
     continue?: boolean;
     systemMessage?: string;
     hookSpecificOutput?: {
       hookEventName: string;
       permissionDecision?: 'allow' | 'deny' | 'ask';
       updatedInput?: Record<string, unknown>;
       additionalContext?: string;
     };
   }
   ```

### **Phase 2: Hook Types (Medium Priority)**

4. **Add Prompt Hooks** 🟡
   - LLM-based condition evaluation
   - JSON output validation
   - Model selection

5. **Add Agent Hooks** 🟡
   - Subagent spawning
   - Tool access
   - Structured output

6. **Add HTTP Hooks** 🟢
   - Webhook POST
   - Header configuration
   - Response handling

### **Phase 3: Configuration (Low Priority)**

7. **Hook Configuration UI** 🟢
   - Settings editor
   - Matcher builder
   - Test hooks

8. **Hook Hot Reload** 🟢
   - Watch config files
   - Reload on change
   - Validate syntax

---

## 📊 SUMMARY

### **Claude Code Hooks:**

| Aspect | Count |
|--------|-------|
| Event Types | 18 |
| Hook Types | 4 |
| Matcher Types | 4 |
| Output Fields | 10+ |

### **OpenClaw Hooks:**

| Aspect | Count |
|--------|-------|
| Event Types | 4 (22%) |
| Hook Types | 1 (25%) |
| Matcher Types | 0 (0%) |
| Output Fields | 0 (0%) |

### **Gap Analysis:**

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 HIGH | Hook Matchers | Medium | High |
| 🔴 HIGH | More Event Types | Low | High |
| 🔴 HIGH | JSON Output Schema | Medium | High |
| 🟡 MEDIUM | Prompt Hooks | High | Medium |
| 🟡 MEDIUM | Agent Hooks | High | Medium |
| 🟢 LOW | HTTP Hooks | Medium | Low |
| 🟢 LOW | Configuration UI | High | Low |

---

**Research Complete:** 2026-02-24
**Lines Analyzed:** 447,173
**OpenClaw Status:** ⚠️ 25% Feature Complete
**Recommended Starting Point:** Hook Matchers + More Event Types
