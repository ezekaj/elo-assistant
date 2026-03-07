# 🔍 PLAN MODE - DEEP RESEARCH REPORT

**Date:** 2026-02-24
**Analysis:** Claude Code Plan Mode vs OpenClaw

---

## 📊 EXECUTIVE SUMMARY

**Plan Mode** is a Claude Code feature that allows users to **review and approve a plan before any tool execution**. This is a **permission mode** that prevents actual tool execution until the user approves the plan.

**OpenClaw Status:** ⚠️ **PARTIAL** - Has Task tool for planning, but no dedicated Plan Mode permission mode.

---

## 🎯 CLAUDE CODE PLAN MODE

### **1. Permission Mode System:**

```javascript
// Line 276879
const permissionModes = ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"];

// Line 102047
// Plan mode description:
"plan" - Planning mode, no actual tool execution.
```

**Permission Modes:**
| Mode | Description |
|------|-------------|
| `default` | Standard behavior, prompts for dangerous operations |
| `acceptEdits` | Auto-accept file edit operations |
| `bypassPermissions` | Bypass all permission checks |
| `plan` | **Planning mode, no actual tool execution** |
| `dontAsk` | Don't prompt, deny if not pre-approved |

---

### **2. Plan Mode State Management:**

```javascript
// Lines 2125-2126
state = {
  hasExitedPlanMode: false,
  needsPlanModeExitAttachment: false,
  // ...
}

// Lines 2627-2645
function getHasExitedPlanMode() {
  return gR.hasExitedPlanMode;
}

function setHasExitedPlanMode(T) {
  gR.hasExitedPlanMode = T;
}

function getNeedsPlanModeExitAttachment() {
  return gR.needsPlanModeExitAttachment;
}

function setNeedsPlanModeExitAttachment(T) {
  gR.needsPlanModeExitAttachment = T;
}

function updatePlanModeExitAttachmentStatus(T, R) {
  // T = new mode, R = old mode
  if (R === "plan" && T !== "plan") {
    gR.needsPlanModeExitAttachment = false;
  }
  if (T === "plan" && R !== "plan") {
    gR.needsPlanModeExitAttachment = true;
  }
}
```

**State Tracking:**
- `hasExitedPlanMode` - Whether user has exited plan mode in this session
- `needsPlanModeExitAttachment` - Whether exit attachment is needed

---

### **3. Plan Mode Tools:**

#### **Enter Plan Mode Tool:**

```javascript
// Line 219455
var TLR = "EnterPlanMode";

// Line 219482
// System prompt for plan mode:
"Plan mode note: In plan mode, use this tool to clarify requirements 
or choose between approaches BEFORE finalizing your plan. Do NOT use 
this tool to ask 'Is my plan ready?' or 'Should I proceed?' - use 
ExitPlanMode for plan approval."
```

#### **Exit Plan Mode Tool:**

```javascript
// Line 125677
var Hr = "ExitPlanMode";

// Used for plan approval
```

#### **Update Plan Tool:**

```javascript
// Line 16360
{
  name: "update_plan",
  description: "Present a plan to the user for approval before taking actions. 
The user will see the domains you intend to visit and your approach. Once 
approved, you can proceed with actions on the approved domains without 
additional permission prompts.",
  inputSchema: {
    type: "object",
    properties: {
      domains: {
        type: "array",
        items: { type: "string" },
        description: "List of domains you will visit"
      }
    }
  }
}
```

---

### **4. Plan Mode UI:**

```javascript
// Line 100323
{
  title: "Plan Mode",
  color: "planMode",  // Cyan color
}

// Lines 114102-114357
// Color definitions
planMode: "rgb(0,102,102)",      // Dark cyan
planMode: "ansi:cyan",           // Terminal cyan
planMode: "ansi:cyanBright",     // Bright cyan
planMode: "rgb(51,102,102)",     // Medium cyan
planMode: "rgb(72,150,140)",     // Light cyan
planMode: "rgb(102,153,153)",    // Pale cyan
```

**UI Features:**
- Cyan color scheme for plan mode
- Plan mode indicator in status bar
- Plan approval UI

---

### **5. Plan Mode Detection:**

```javascript
// Line 229918
if (T.toolPermissionContext.mode === "plan") {
  return "plan_mode";
}

// Line 275471
if ((await T.getAppState()).toolPermissionContext.mode !== "plan") {
  return null;  // Not in plan mode
}

// Line 277866
if (B?.type === "attachment" && 
    (B.attachment.type === "plan_mode" || 
     B.attachment.type === "plan_mode_reentry")) {
  // Handle plan mode attachment
}
```

---

### **6. Plan Mode Workflow:**

```
1. User enters plan mode (permissionMode: "plan")
   ↓
2. Claude can use tools to explore/analyze
   ↓
3. Claude creates plan using update_plan tool
   ↓
4. User reviews plan in UI
   ↓
5. Claude uses ExitPlanMode tool to get approval
   ↓
6. User approves plan
   ↓
7. Exits plan mode (permissionMode changes)
   ↓
8. Claude executes approved plan
```

---

## 🎯 OPENCLAW STATUS

### **What OpenClaw Has:**

#### **1. Task Tool (Similar but Different):**

```typescript
// src/agents/tools/task.ts
export const MCP_TASK_PROTOCOL_VERSION = '2024-11-05';

const TaskSchema = Type.Object({
  command: Type.String({ description: 'Command to execute' }),
  description: Type.String({ description: 'Task description' }),
  owner: Type.Optional(Type.String({ description: 'Task owner' })),
  blocks: Type.Optional(Type.Array(Type.String())),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  metadata: Type.Optional(Type.Object({}))
});
```

**Task Tool Features:**
- ✅ Background task execution
- ✅ Task tracking (pending, running, completed, failed, cancelled)
- ✅ Task dependencies (blocks/blockedBy)
- ✅ Task output retrieval
- ✅ Task cancellation

**But NOT:**
- ❌ No plan mode permission mode
- ❌ No plan approval workflow
- ❌ No plan mode UI

---

#### **2. Permission Mode Support:**

```typescript
// src/agents/tool-execution-wrapper.ts
interface ToolExecutionContext {
  permission_mode?: string;  // Supports permission mode
}

// src/gateway/tools-invoke-http.ts
const hookContext = {
  permission_mode: context.permission_mode,  // Passes permission mode
  // ...
};
```

**Permission Mode Support:**
- ✅ Permission mode field exists
- ✅ Passed through tool execution
- ⚠️ But only "ask" mode implemented

---

### **What OpenClaw is Missing:**

| Feature | Claude Code | OpenClaw | Status |
|---------|-------------|----------|--------|
| **Plan Permission Mode** | ✅ `plan` mode | ❌ Missing | ❌ MISSING |
| **Enter Plan Mode Tool** | ✅ `EnterPlanMode` | ❌ Missing | ❌ MISSING |
| **Exit Plan Mode Tool** | ✅ `ExitPlanMode` | ❌ Missing | ❌ MISSING |
| **Update Plan Tool** | ✅ `update_plan` | ❌ Missing | ❌ MISSING |
| **Plan Mode State** | ✅ State tracking | ❌ Missing | ❌ MISSING |
| **Plan Mode UI** | ✅ Cyan theme | ❌ Missing | ❌ MISSING |
| **Plan Approval** | ✅ Approval workflow | ❌ Missing | ❌ MISSING |
| **Task Tool** | ✅ | ✅ | ✅ MATCH |

---

## 📋 IMPLEMENTATION REQUIREMENTS

### **To Add Plan Mode to OpenClaw:**

#### **Phase 1: Permission Mode Support**

```typescript
// Add to permission modes
export type PermissionMode = 
  | 'ask'              // Current default
  | 'acceptEdits'      // Auto-accept edits
  | 'bypassPermissions' // Bypass all
  | 'plan'             // NEW: Planning mode
  | 'dontAsk';         // Deny unapproved
```

#### **Phase 2: Plan Mode Tools**

```typescript
// Enter Plan Mode Tool
const EnterPlanModeTool = {
  name: 'enter_plan_mode',
  description: 'Enter planning mode for exploring and creating plans',
  async call(args, context) {
    // Set permission mode to "plan"
    setPermissionMode('plan');
    return { success: true, mode: 'plan' };
  }
};

// Exit Plan Mode Tool
const ExitPlanModeTool = {
  name: 'exit_plan_mode',
  description: 'Exit planning mode and get user approval',
  async call(args, context) {
    // Present plan to user for approval
    const approved = await presentPlanForApproval(args.plan);
    if (approved) {
      setPermissionMode('ask');  // Exit plan mode
      return { success: true, approved: true };
    }
    return { success: true, approved: false };
  }
};

// Update Plan Tool
const UpdatePlanTool = {
  name: 'update_plan',
  description: 'Present a plan to the user for approval',
  parameters: Type.Object({
    plan: Type.String({ description: 'The plan to present' }),
    domains: Type.Optional(Type.Array(Type.String())),
    actions: Type.Optional(Type.Array(Type.String()))
  }),
  async call(args, context) {
    // Store plan for approval
    storePlan(args.plan);
    return { success: true, planStored: true };
  }
};
```

#### **Phase 3: Plan Mode State**

```typescript
// Plan mode state management
const planModeState = {
  hasExitedPlanMode: false,
  needsPlanModeExitAttachment: false,
  currentPlan: null,
};

export function setPlanModeState(state: Partial<typeof planModeState>) {
  Object.assign(planModeState, state);
}

export function getPlanModeState() {
  return { ...planModeState };
}

export function updatePlanModeExitAttachmentStatus(newMode: string, oldMode: string) {
  if (oldMode === 'plan' && newMode !== 'plan') {
    planModeState.needsPlanModeExitAttachment = false;
  }
  if (newMode === 'plan' && oldMode !== 'plan') {
    planModeState.needsPlanModeExitAttachment = true;
  }
}
```

#### **Phase 4: Plan Mode UI**

```typescript
// Plan mode UI indicator
function renderPlanModeIndicator(): any {
  const state = getPlanModeState();
  
  if (state.currentPlan) {
    return Text.create(
      `📋 Plan Mode: ${state.currentPlan.title}`,
      { color: 'cyan' }
    );
  }
  
  return null;
}
```

---

## 🎯 DO YOU NEED PLAN MODE?

### **For Most Users: NO**

Plan Mode is a **nice-to-have** feature for specific use cases:

- ✅ Complex multi-step tasks
- ✅ Tasks requiring user approval
- ✅ Sensitive operations
- ✅ Team coordination

### **For Enterprise: MAYBE**

Consider implementing if:

- ❓ Users need to approve plans before execution
- ❓ Compliance requires plan approval
- ❓ Team coordination is important
- ❓ Sensitive operations are common

---

## 📊 COMPARISON WITH TASK TOOL

| Feature | Plan Mode | Task Tool | OpenClaw Has |
|---------|-----------|-----------|--------------|
| **Purpose** | Plan approval | Background execution | ✅ Task |
| **Execution** | After approval | Immediate/Background | ✅ Task |
| **User Approval** | ✅ Required | ❌ Optional | ⚠️ Partial |
| **Plan Storage** | ✅ Yes | ❌ No | ❌ Missing |
| **Permission Mode** | ✅ `plan` mode | ❌ N/A | ❌ Missing |
| **UI Integration** | ✅ Cyan theme | ❌ Basic | ⚠️ Partial |

---

## 🎉 CONCLUSION

### **Status: ⚠️ PARTIAL IMPLEMENTATION**

**OpenClaw Has:**
- ✅ Task tool for background execution
- ✅ Permission mode infrastructure
- ✅ Task dependencies and tracking

**OpenClaw Missing:**
- ❌ Plan permission mode
- ❌ Enter/Exit Plan Mode tools
- ❌ Update Plan tool
- ❌ Plan mode state management
- ❌ Plan mode UI (cyan theme)
- ❌ Plan approval workflow

**Recommendation:** Plan Mode is a **low priority** feature. The Task tool provides similar functionality for most use cases. Implement Plan Mode only if you need explicit plan approval workflow.

---

**Research Complete:** 2026-02-24
**Feature Status:** ⚠️ **PARTIAL (Task tool exists, Plan Mode missing)**
**Implementation Effort:** 🔴 HIGH
**Priority:** 🟢 LOW (Task tool covers most use cases)
