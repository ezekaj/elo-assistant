# 🤖 AUTOMATIC BEHAVIOR - WHEN IT APPLIES

**Date:** 2026-02-24
**Clarification:** Behavior applies EVERYWHERE, not just at model selection

---

## 📊 SHORT ANSWER

**NO** - Automatic behavior is **NOT only at model selection**. It applies:

1. ✅ **At model selection** - Sets the behavior profile
2. ✅ **At tool execution** - Checks behavior for each tool
3. ✅ **At task analysis** - Decides whether to auto-plan
4. ✅ **At approval prompts** - Determines what needs approval
5. ✅ **Throughout the session** - Consistent behavior

---

## 🎯 **WHERE BEHAVIOR APPLIES**

### **1. Model Selection (One-Time Setup):**

```typescript
// src/agents/model-selection.ts

export function selectModel(model: string) {
  // Get behavior profile for this model
  const behavior = getModelBehavior(model);
  
  // Store in session context
  sessionContext.behavior = behavior;
  
  // Show indicator in TUI
  showBehaviorIndicator(behavior.cautionLevel);
  
  // This happens ONCE when model is selected
}
```

**When:** User runs `/model claude-opus-4-6`
**Effect:** Behavior profile loaded for session

---

### **2. Tool Execution (Every Tool Call):**

```typescript
// src/agents/tool-execution-wrapper.ts

export async function executeTool(tool, args, context) {
  // Get behavior from session (set at model selection)
  const behavior = context.sessionContext.behavior;
  
  // Check if this tool needs approval
  if (tool.name === 'edit' && behavior.requireEditApproval) {
    const approved = await requestApproval(tool, args);
    if (!approved) {
      return { blocked: true };
    }
  }
  
  if (tool.name === 'bash' && behavior.requireBashApproval) {
    const approved = await requestApproval(tool, args);
    if (!approved) {
      return { blocked: true };
    }
  }
  
  // Auto-approve safe operations if configured
  if (behavior.autoApproveSafe && isSafeOperation(tool.name)) {
    return executeTool(tool, args, context);
  }
  
  // Execute tool
  return executeTool(tool, args, context);
}
```

**When:** Every tool call (edit, bash, read, write, etc.)
**Effect:** Behavior determines if approval needed

---

### **3. Task Analysis (Every Complex Task):**

```typescript
// src/agents/auto-planner.ts

export async function handleUserRequest(request: string, context) {
  const behavior = context.sessionContext.behavior;
  
  // Check if auto-planning is enabled for this model
  if (!behavior.autoPlan) {
    // Direct execution (fast models)
    return executeDirectly(request);
  }
  
  // Analyze task complexity
  const complexity = analyzeTaskComplexity(request);
  
  // Complex tasks → auto plan (cautious models)
  if (complexity === 'high') {
    return createPlan(request);
  }
  
  // Simple tasks → direct execution
  return executeDirectly(request);
}
```

**When:** User makes a request
**Effect:** Behavior determines if plan is created

---

### **4. Approval Prompts (When Approval Needed):**

```typescript
// src/agents/approval-manager.ts

export async function requestApproval(tool, args, context) {
  const behavior = context.sessionContext.behavior;
  
  // Check max tool calls before asking
  context.toolCallCount++;
  if (context.toolCallCount >= behavior.maxToolCallsBeforeAsk) {
    context.toolCallCount = 0;
    return showApprovalPrompt(tool, args);
  }
  
  // Check caution level
  if (behavior.cautionLevel === 'high') {
    return showApprovalPrompt(tool, args);
  }
  
  // Low caution → auto-approve
  return true;
}
```

**When:** Tool needs approval
**Effect:** Behavior determines approval flow

---

### **5. Throughout Session (Consistent Behavior):**

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User selects model                                       │
│     → Behavior profile loaded                                │
│                                                              │
│  2. User makes request                                       │
│     → Auto-plan check (based on behavior)                    │
│                                                              │
│  3. Claude uses tools                                        │
│     → Approval check (based on behavior)                     │
│     → Auto-approve check (based on behavior)                 │
│                                                              │
│  4. Multiple tool calls                                      │
│     → Max calls check (based on behavior)                    │
│                                                              │
│  5. Session continues                                        │
│     → Consistent behavior throughout                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 **BEHAVIOR CHECKPOINTS**

### **Every Time These Happen:**

| Event | Behavior Check | What It Does |
|-------|---------------|--------------|
| **Model Selection** | ✅ Load profile | Sets behavior for session |
| **User Request** | ✅ Auto-plan check | Decides if plan needed |
| **Edit Tool** | ✅ Approval check | Asks if requireEditApproval |
| **Bash Tool** | ✅ Approval check | Asks if requireBashApproval |
| **Safe Operation** | ✅ Auto-approve | Skips approval if autoApproveSafe |
| **Tool Call #N** | ✅ Max calls check | Asks after N calls |
| **Complex Task** | ✅ Complexity check | Creates plan if high complexity |

---

## 🎯 **EXAMPLE SESSION FLOW**

### **Session with Claude Opus (High Caution):**

```
1. User: /model claude-opus-4-6
   → Behavior loaded: caution=high, autoPlan=true, requireEditApproval=true

2. User: Fix the login bug
   → Auto-plan check: HIGH complexity → Creates plan
   → Claude: "Here's my plan: 1) Analyze code 2) Identify issue 3) Fix"

3. Claude uses Read tool
   → Approval check: Read is safe → Auto-approved

4. Claude uses Edit tool
   → Approval check: requireEditApproval=true → ASKS USER
   → User: Approve
   → Edit executed

5. Claude uses Bash tool (npm test)
   → Approval check: requireBashApproval=true → ASKS USER
   → User: Approve
   → Bash executed

6. Claude uses Edit tool again
   → Approval check: requireEditApproval=true → ASKS USER
   → User: Approve
   → Edit executed
```

---

### **Session with GPT-4o-mini (Low Caution):**

```
1. User: /model gpt-4o-mini
   → Behavior loaded: caution=low, autoPlan=false, requireEditApproval=false

2. User: Fix the login bug
   → Auto-plan check: autoPlan=false → Direct execution
   → Claude: "On it!"

3. Claude uses Read tool
   → Approval check: Read is safe → Auto-approved

4. Claude uses Edit tool
   → Approval check: requireEditApproval=false → AUTO-APPROVED
   → Edit executed immediately

5. Claude uses Bash tool (npm test)
   → Approval check: requireBashApproval=false → AUTO-APPROVED
   → Bash executed immediately

6. Claude uses Edit tool again
   → Approval check: requireEditApproval=false → AUTO-APPROVED
   → Edit executed immediately
```

---

## ✅ **SUMMARY**

### **Behavior Applies:**

| When | Applies? | Why |
|------|----------|-----|
| **Model Selection** | ✅ Yes | Sets behavior profile |
| **Every Tool Call** | ✅ Yes | Checks approval requirements |
| **Every User Request** | ✅ Yes | Decides auto-plan |
| **Every Approval** | ✅ Yes | Determines approval flow |
| **Throughout Session** | ✅ Yes | Consistent behavior |

### **Behavior Does NOT Apply:**

| When | Applies? | Why |
|------|----------|-----|
| **Other Sessions** | ❌ No | Each session has own model |
| **Different Model** | ❌ No | New model = new behavior |
| **Manual Override** | ⚠️ Optional | Users can customize per-model |

---

## 🎉 **CONCLUSION**

### **Status: ✅ EVERYWHERE IN SESSION**

**Automatic behavior applies:**
- ✅ At model selection (one-time)
- ✅ At every tool execution
- ✅ At every user request
- ✅ At every approval prompt
- ✅ Throughout entire session

**NOT just at model selection!**

**Model selection → Sets behavior**
**Behavior → Applies everywhere**

---

**Clarification Complete:** 2026-02-24
**Scope:** ✅ **FULL SESSION COVERAGE**
