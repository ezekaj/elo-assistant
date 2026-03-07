# 🚀 YOLO MODE - DEEP RESEARCH & IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Status:** ✅ **PARTIALLY IMPLEMENTED** (needs enhancement)

---

## 🎯 EXECUTIVE SUMMARY

**YOLO Mode** (You Only Live Once) is the **highest permission mode** that:
- ✅ Auto-approves ALL tool calls
- ✅ No approval prompts
- ✅ Full automation
- ✅ Respects explicit deny rules (safety)

**Current OpenClaw Status:** ⚠️ **PARTIALLY IMPLEMENTED**
- ✅ `bypassPermissions` mode exists in types
- ✅ Tool classification exists
- ✅ Auto-approve logic exists
- ❌ **NO TUI command to enable/disable**
- ❌ **NO CLI flag (`--yolo`)**
- ❌ **NO environment variable (`OPENCLAW_YOLO`)**
- ❌ **NO persistence (session-only)**

---

## 📊 RESEARCH FINDINGS

### **1. Claude Code YOLO Mode:**

**Implementation:**
```bash
# CLI flag
claude --yolo

# Environment variable
export CLAUDE_YOLO=true

# In-session command
/approval-mode yolo
```

**Security:**
- ⚠️ Full terminal access
- ⚠️ No approval prompts
- ✅ Respects explicit deny rules
- ✅ Only for trusted environments

**Use Cases:**
- CI/CD pipelines
- Automated scripts
- Personal projects (trusted)
- Batch processing

---

### **2. Qwen Code YOLO Mode:**

**Implementation:**
```bash
# Command
/approval-mode yolo

# Set as project default
/approval-mode yolo --project

# Set as user default
/approval-mode yolo --user

# Config file (.qwen/settings.json)
{
  "permissions": {
    "defaultMode": "yolo",
    "confirmShellCommands": false,
    "confirmFileEdits": false
  }
}
```

**Security Warnings:**
- ⚠️ Highest risk level
- ⚠️ Full terminal access
- ⚠️ Could delete files, install packages
- ✅ Only for trusted codebases

---

### **3. OpenCode YOLO Mode:**

**Implementation:**
```bash
# CLI flag
opencode --yolo

# Environment variable
OPENCODE_YOLO=true

# UI Settings
Settings → General → YOLO Mode
  - This Session Only (temporary)
  - Always Enabled (persistent)

# API Endpoints
GET  /config/yolo   # Check status
POST /config/yolo   # Enable/disable
```

**Security Safeguards:**
- ✅ Explicit deny rules always respected
- ✅ Only "ask" rules affected
- ✅ Session-only option available
- ✅ Clear UI warnings

**Permission Logic:**
```
Permission Request
    ↓
Check YOLO Mode?
    ├─ Yes → Is rule "deny"? → Block
    │         └─ No → Auto-approve
    └─ No → Show prompt to user
```

---

## 🔧 OPENCLAW CURRENT STATE

### **What Exists:**

**1. Permission Mode Types:**
```typescript
// src/agents/plan-mode/types.ts
export type PermissionMode = 
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'  // ← YOLO mode equivalent!
  | 'plan'
  | 'dontAsk';
```

**2. Tool Classification:**
```typescript
// src/agents/plan-mode/permission-mode.ts
const EDIT_TOOLS = ['write', 'edit', 'notebookedit'];
const DESTRUCTIVE_TOOLS = ['bash', 'process', 'delete', 'move'];
const READ_ONLY_TOOLS = ['read', 'glob', 'grep'];
```

**3. Auto-Approve Logic:**
```typescript
// src/agents/plan-mode/permission-mode.ts
export function isToolAutoApproved(toolName: string): boolean {
  const mode = getPermissionMode();
  
  // In bypassPermissions mode: never prompt
  if (mode === 'bypassPermissions') {
    return true;  // ← YOLO mode!
  }
  
  // Read-only tools always auto-approved
  if (isReadOnlyTool(toolName)) {
    return true;
  }
  
  // Edit tools auto-approved in acceptEdits mode
  if (mode === 'acceptEdits' && isEditTool(toolName)) {
    return true;
  }
  
  return false;
}
```

**4. Tool Execution Blocking:**
```typescript
// src/agents/tool-execution-wrapper.ts
export async function executeToolWithHooks(tool, args, context): Promise<ToolExecutionResult> {
  const mode = getPermissionMode();
  
  // In bypassPermissions mode: skip all checks
  if (mode === 'bypassPermissions') {
    return executeTool(tool, args, context);  // ← Auto-execute!
  }
  
  // ... normal permission checks
}
```

---

### **What's Missing:**

| Feature | Status | Priority |
|---------|--------|----------|
| **TUI Command** | ❌ Missing | 🔴 HIGH |
| **CLI Flag (`--yolo`)** | ❌ Missing | 🟡 MEDIUM |
| **Env Variable** | ❌ Missing | 🟡 MEDIUM |
| **Persistence** | ❌ Missing | 🟢 LOW |
| **Security Warnings** | ❌ Missing | 🔴 HIGH |
| **Config File Support** | ❌ Missing | 🟢 LOW |

---

## 📋 IMPLEMENTATION PLAN

### **Phase 1: TUI Command** (HIGH PRIORITY - 30 minutes)

**File:** `src/tui/commands.ts`

```typescript
// Add command registration
{
  name: "yolo",
  description: "Toggle YOLO mode (auto-approve all tools)",
  getArgumentCompletions: (prefix) => [
    { value: 'on', label: 'Enable YOLO mode' },
    { value: 'off', label: 'Disable YOLO mode' },
    { value: 'status', label: 'Check YOLO status' }
  ]
}
```

**File:** `src/tui/tui-command-handlers.ts`

```typescript
case "yolo": {
  const action = args?.toLowerCase() || 'toggle';
  
  if (action === 'on' || action === 'enable') {
    setPermissionMode('bypassPermissions');
    chatLog.addSystem(
      '⚠️  YOLO MODE ENABLED\n' +
      'All tool calls will be auto-approved.\n' +
      'Only use in trusted environments!\n' +
      'Use /yolo off to disable.'
    );
  } else if (action === 'off' || action === 'disable') {
    setPermissionMode('default');
    chatLog.addSystem('✅ YOLO mode disabled. Normal approval restored.');
  } else {
    // Toggle or status
    const mode = getPermissionMode();
    if (mode === 'bypassPermissions') {
      chatLog.addSystem('⚠️  YOLO mode is currently ENABLED');
    } else {
      chatLog.addSystem('✅ YOLO mode is currently DISABLED');
    }
  }
  
  updateFooter();
  break;
}
```

---

### **Phase 2: CLI Flag** (MEDIUM PRIORITY - 1 hour)

**File:** `src/cli/program/register.agent.ts`

```typescript
// Add --yolo flag
program
  .option('--yolo', 'Enable YOLO mode (auto-approve all tools)')
  .option('--yolo-session', 'Enable YOLO mode for this session only');

// In agent startup
if (opts.yolo || opts.yoloSession || process.env.OPENCLAW_YOLO === 'true') {
  setPermissionMode('bypassPermissions');
  log.warn('YOLO mode enabled - all tools auto-approved');
}
```

**File:** `src/config/env-vars.effort.ts` (or new file)

```typescript
// Add YOLO environment variable
export const YOLO_ENV_VARS = {
  YOLO: 'OPENCLAW_YOLO',
  YOLO_SESSION: 'OPENCLAW_YOLO_SESSION'
};

export function isYoloModeEnabled(): boolean {
  return process.env.OPENCLAW_YOLO === 'true' || 
         process.env.OPENCLAW_YOLO_SESSION === 'true';
}
```

---

### **Phase 3: Security Warnings** (HIGH PRIORITY - 30 minutes)

**File:** `src/agents/plan-mode/permission-mode.ts`

```typescript
/**
 * Get YOLO mode warning message
 */
export function getYoloWarning(): string {
  return [
    '⚠️  YOLO MODE WARNING',
    '',
    'You are about to enable YOLO (You Only Live Once) mode.',
    '',
    'In this mode:',
    '  • All tool calls will be auto-approved',
    '  • No approval prompts will be shown',
    '  • File edits execute immediately',
    '  • Shell commands run without confirmation',
    '',
    'Security risks:',
    '  • AI can modify any file',
    '  • AI can execute any command',
    '  • AI can install packages',
    '  • AI can delete files',
    '',
    'Only enable YOLO mode if:',
    '  ✓ You trust the current codebase',
    '  ✓ You understand all actions AI will take',
    '  ✓ Important files are backed up',
    '  ✓ You are in a controlled environment',
    '',
    'Type "yolo on" again to confirm.'
  ].join('\n');
}
```

**File:** `src/tui/tui-command-handlers.ts`

```typescript
case "yolo": {
  const action = args?.toLowerCase() || 'toggle';
  
  if (action === 'on' || action === 'enable') {
    const currentMode = getPermissionMode();
    
    // If already in YOLO mode, just confirm
    if (currentMode === 'bypassPermissions') {
      chatLog.addSystem('⚠️  YOLO mode is already enabled');
      break;
    }
    
    // Show warning on first enable
    chatLog.addSystem(getYoloWarning());
    chatLog.addSystem('');
    chatLog.addSystem('Type "/yolo confirm" to enable, or any other command to cancel.');
    break;
  }
  
  if (action === 'confirm') {
    setPermissionMode('bypassPermissions');
    chatLog.addSystem('⚠️  YOLO MODE ENABLED - All tools auto-approved');
    updateFooter();
    break;
  }
  
  // ... rest of handler
}
```

---

### **Phase 4: Persistence** (LOW PRIORITY - 2 hours)

**File:** `src/config/types.openclaw.ts`

```typescript
export interface OpenClawPermissionsConfig {
  defaultMode?: PermissionMode;
  confirmShellCommands?: boolean;
  confirmFileEdits?: boolean;
  yolo?: boolean;  // YOLO mode flag
}
```

**File:** `~/.openclaw/settings.json` or `.openclaw/settings.json`

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "confirmShellCommands": false,
    "confirmFileEdits": false,
    "yolo": true
  }
}
```

**File:** `src/config/config.ts`

```typescript
export function loadPermissionsConfig(): OpenClawPermissionsConfig {
  const config = loadConfig();
  
  return {
    defaultMode: config.permissions?.defaultMode || 'default',
    confirmShellCommands: config.permissions?.confirmShellCommands ?? true,
    confirmFileEdits: config.permissions?.confirmFileEdits ?? true,
    yolo: config.permissions?.yolo || process.env.OPENCLAW_YOLO === 'true'
  };
}
```

---

## 🎯 USAGE EXAMPLES

### **TUI Commands:**

```bash
# Enable YOLO mode
/yolo on
⚠️  YOLO MODE WARNING
[warning message]
Type "/yolo confirm" to enable

/yolo confirm
⚠️  YOLO MODE ENABLED - All tools auto-approved

# Disable YOLO mode
/yolo off
✅ YOLO mode disabled. Normal approval restored.

# Check status
/yolo status
⚠️  YOLO mode is currently ENABLED

# Toggle
/yolo
✅ YOLO mode is currently DISABLED
```

### **CLI Usage:**

```bash
# Enable YOLO mode for session
openclaw --yolo

# Enable via environment
OPENCLAW_YOLO=true openclaw

# Normal mode (default)
openclaw
```

### **Config File:**

```json
// ~/.openclaw/settings.json
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "yolo": true
  }
}
```

---

## ⚠️ SECURITY CONSIDERATIONS

### **Risks:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| **File Deletion** | 🔴 High | Backup important files |
| **Command Execution** | 🔴 High | Use in isolated environments |
| **Package Installation** | 🟡 Medium | Review package sources |
| **Network Requests** | 🟡 Medium | Use firewall rules |
| **Data Leakage** | 🟡 Medium | Don't use with sensitive data |

### **Safeguards:**

**What YOLO Mode DOES:**
- ✅ Auto-approves "ask" rules
- ✅ Skips approval prompts
- ✅ Executes tools immediately

**What YOLO Mode DOES NOT Do:**
- ❌ Does NOT bypass explicit "deny" rules
- ❌ Does NOT disable audit logging
- ❌ Does NOT disable sandbox (if enabled)
- ❌ Does NOT allow forbidden tools

---

## 📊 COMPARISON WITH OTHER TOOLS

| Feature | OpenClaw | Claude Code | Qwen Code | OpenCode |
|---------|----------|-------------|-----------|----------|
| **YOLO Mode** | ⚠️ Partial | ✅ Full | ✅ Full | ✅ Full |
| **CLI Flag** | ❌ Missing | ✅ `--yolo` | ⚠️ Partial | ✅ `--yolo` |
| **Env Variable** | ❌ Missing | ✅ `CLAUDE_YOLO` | ⚠️ Partial | ✅ `OPENCODE_YOLO` |
| **TUI Command** | ❌ Missing | ✅ `/approval-mode` | ✅ `/approval-mode` | ✅ Settings UI |
| **Persistence** | ❌ Missing | ✅ Config file | ✅ Config file | ✅ Config file |
| **Security Warning** | ❌ Missing | ✅ Yes | ✅ Yes | ✅ Yes |
| **Session-Only** | ⚠️ Partial | ✅ Yes | ✅ Yes | ✅ Yes |

---

## 🎯 IMPLEMENTATION PRIORITY

### **DO NOW (HIGH PRIORITY):**

**1. TUI Command** (30 minutes)
```bash
/yolo on|off|status|confirm
```

**2. Security Warnings** (30 minutes)
```typescript
getYoloWarning() → Display warning before enabling
```

**Total Time:** ~1 hour
**Impact:** Power users can enable YOLO mode

---

### **DO SOON (MEDIUM PRIORITY):**

**3. CLI Flag** (1 hour)
```bash
openclaw --yolo
```

**4. Environment Variable** (30 minutes)
```bash
OPENCLAW_YOLO=true openclaw
```

**Total Time:** ~1.5 hours
**Impact:** CI/CD and automation support

---

### **DO LATER (LOW PRIORITY):**

**5. Persistence** (2 hours)
```json
{
  "permissions": {
    "yolo": true
  }
}
```

**6. Config File Support** (1 hour)

**Total Time:** ~3 hours
**Impact:** User convenience

---

## 🎉 CONCLUSION

### **Current Status:** ⚠️ **PARTIALLY IMPLEMENTED**

**What Exists:**
- ✅ `bypassPermissions` mode in types
- ✅ Tool classification (edit/destructive/read-only)
- ✅ Auto-approve logic
- ✅ Tool execution bypass

**What's Missing:**
- ❌ TUI command (`/yolo`)
- ❌ CLI flag (`--yolo`)
- ❌ Environment variable (`OPENCLAW_YOLO`)
- ❌ Security warnings
- ❌ Persistence

### **Recommendation:**

**Implement Phase 1 & 2 NOW** (1 hour total):
1. Add `/yolo` TUI command
2. Add security warnings
3. Add `--yolo` CLI flag
4. Add `OPENCLAW_YOLO` env variable

**Benefits:**
- ✅ Power users will love it
- ✅ CI/CD automation support
- ✅ Competitive with Claude Code/Qwen Code
- ✅ Easy implementation (existing infrastructure)

---

**Research Complete:** 2026-02-24
**Implementation Time:** ~1 hour (Phase 1&2)
**Priority:** 🔴 **HIGH** (easy win, power users want it)
**Security:** ⚠️ **Warnings required**
