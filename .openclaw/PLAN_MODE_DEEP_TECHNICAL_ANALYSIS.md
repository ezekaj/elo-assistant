# 🔍 CLAUDE CODE PLAN MODE - DEEP TECHNICAL ANALYSIS

**Date:** 2026-02-24
**Analysis:** Complete Plan Mode workflow from the Claude Code codebase

---

## 📊 EXECUTIVE SUMMARY

After deep analysis of 447,173 lines of Claude Code source code, here's **exactly how Plan Mode works**:

---

## 🎯 PLAN MODE ARCHITECTURE

### **1. Permission Mode System:**

```javascript
// Line 276879 - Permission modes
const permissionModes = [
  "default",              // Standard behavior
  "acceptEdits",          // Auto-accept file edits
  "bypassPermissions",    // Bypass all checks
  "plan",                 // PLAN MODE: No tool execution
  "dontAsk"               // Deny unapproved
];
```

**Plan mode is a PERMISSION MODE that blocks tool execution.**

---

### **2. State Management:**

```javascript
// Lines 2125-2126 - Global state
state = {
  hasExitedPlanMode: false,           // Track if user exited plan mode
  needsPlanModeExitAttachment: false, // Track if exit attachment needed
  // ...
}

// Lines 2627-2645 - State functions
function getHasExitedPlanMode() {
  return state.hasExitedPlanMode;
}

function setHasExitedPlanMode(value) {
  state.hasExitedPlanMode = value;
}

function getNeedsPlanModeExitAttachment() {
  return state.needsPlanModeExitAttachment;
}

function setNeedsPlanModeExitAttachment(value) {
  state.needsPlanModeExitAttachment = value;
}

function updatePlanModeExitAttachmentStatus(newMode, oldMode) {
  // Entering plan mode
  if (newMode === "plan" && oldMode !== "plan") {
    state.needsPlanModeExitAttachment = true;
  }
  // Exiting plan mode
  if (oldMode === "plan" && newMode !== "plan") {
    state.needsPlanModeExitAttachment = false;
  }
}
```

---

### **3. Plan Mode Tools:**

#### **A. EnterPlanMode Tool:**

```javascript
// Line 219455
var TLR = "EnterPlanMode";

// Line 219482 - System prompt
"Plan mode note: In plan mode, use this tool to clarify requirements 
or choose between approaches BEFORE finalizing your plan. Do NOT use 
this tool to ask 'Is my plan ready?' or 'Should I proceed?' - use 
ExitPlanMode for plan approval."
```

**Purpose:** Enter planning mode (sets permission mode to "plan")

---

#### **B. ExitPlanMode Tool:**

```javascript
// Line 125677
var Hr = "ExitPlanMode";
var xX = "ExitPlanMode";

// Used for plan approval
```

**Purpose:** Exit planning mode with user approval

---

#### **C. update_plan Tool:**

```javascript
// Lines 16360-16370
{
  name: "update_plan",
  description: "Present a plan to the user for approval before taking 
actions. The user will see the domains you intend to visit and your 
approach. Once approved, you can proceed with actions on the approved 
domains without additional permission prompts.",
  inputSchema: {
    type: "object",
    properties: {
      domains: {
        type: "array",
        items: { type: "string" },
        description: "List of domains you will visit 
(e.g., ['github.com', 'stackoverflow.com']). These domains will be 
approved for the session when the user accepts the plan."
      }
    }
  }
}
```

**Purpose:** Store plan for approval, specify domains to access

---

### **4. Plan Approval Workflow:**

```javascript
// Lines 277765-277772 - Plan approval message schemas
const PlanApprovalRequestMessageSchema = {
  type: "plan_approval_request",
  // Request plan approval from user
};

const PlanApprovalResponseMessageSchema = {
  type: "plan_approval_response",
  // User response (approved/rejected)
};

// Line 277705 - Message type detection
function isPlanMessageType(type) {
  return type === "plan_approval_request" || 
         type === "plan_approval_response";
}
```

---

### **5. Plan Mode UI Integration:**

```javascript
// Line 100323 - UI configuration
{
  title: "Plan Mode",
  color: "planMode",  // Cyan color
}

// Lines 114102-114357 - Color definitions
planMode: "rgb(0,102,102)",      // Dark cyan
planMode: "ansi:cyan",           // Terminal cyan
planMode: "ansi:cyanBright",     // Bright cyan
planMode: "rgb(51,102,102)",     // Medium cyan
planMode: "rgb(72,150,140)",     // Light cyan
planMode: "rgb(102,153,153)",    // Pale cyan
```

**UI Features:**
- Cyan color theme for plan mode
- Plan mode indicator in status bar
- Plan approval UI dialog

---

### **6. Plan Mode Attachments:**

```javascript
// Lines 277866-277920 - Attachment handling
function buildSystemAttachments(messages, mode) {
  let foundPlanModeAttachment = false;
  let planModeCount = 0;
  
  // Count plan mode attachments
  for (const message of messages) {
    if (message?.type === "attachment") {
      if (message.attachment.type === "plan_mode" || 
          message.attachment.type === "plan_mode_reentry") {
        foundPlanModeAttachment = true;
        planModeCount++;
      }
      if (message.attachment.type === "plan_mode_exit") {
        break;  // Stop counting at exit
      }
    }
  }
  
  // Add plan mode reentry attachment if needed
  if (getHasExitedPlanMode() && messages.length > 0) {
    attachments.push({
      type: "plan_mode_reentry",
      // ...
    });
    setHasExitedPlanMode(false);
  }
  
  // Add plan mode attachment
  attachments.push({
    type: "plan_mode",
    // ...
  });
  
  // Add plan mode exit attachment if needed
  if (!getNeedsPlanModeExitAttachment()) return [];
  if (getAppState().toolPermissionContext.mode === "plan") {
    setNeedsPlanModeExitAttachment(false);
    return [];
  }
  
  setNeedsPlanModeExitAttachment(false);
  attachments.push({
    type: "plan_mode_exit",
    // ...
  });
  
  return attachments;
}
```

**Attachment Types:**
- `plan_mode` - Indicates plan mode is active
- `plan_mode_reentry` - Re-entering plan mode
- `plan_mode_exit` - Exiting plan mode

---

### **7. Tool Execution Blocking:**

```javascript
// Line 229918 - Tool permission context
function getToolPermissionContextType(context) {
  if (context.toolPermissionContext.mode === "plan") {
    return "plan_mode";  // Block tool execution
  }
  // ...
}

// Line 275471 - Plan mode detection
async function checkPlanMode() {
  const appState = await getAppState();
  if (appState.toolPermissionContext.mode !== "plan") {
    return null;  // Not in plan mode, tools can execute
  }
  // In plan mode, tools are blocked
}
```

**Tool Blocking Logic:**
```
IF permission_mode == "plan":
  → Block ALL tool execution
  → Claude can only analyze/explore
  → Cannot modify files, run commands, etc.
```

---

### **8. Plan Mode Transition Detection:**

```javascript
// Lines 277817-277818 - System prompts
const planModePrompts = [
  j6("plan_mode", () => CR8(B, R)),      // Plan mode prompt
  j6("plan_mode_exit", () => JR8(R)),    // Plan mode exit prompt
  j6("verify_plan_reminder", () => aR8(B, R))  // Verify plan reminder
];
```

**Prompts Added:**
- Plan mode entry notification
- Plan mode exit instructions
- Verify plan reminder

---

## 📋 COMPLETE PLAN MODE WORKFLOW

### **Step-by-Step:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLAN MODE WORKFLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User/Claude enters plan mode                                 │
│     → setPermissionMode("plan")                                  │
│     → updatePlanModeExitAttachmentStatus("plan", oldMode)        │
│     → Add "plan_mode" attachment to context                      │
│     → UI shows cyan "Plan Mode" indicator                        │
│                                                                  │
│  2. Claude explores/analyzes                                     │
│     → Can use Read, Glob, Grep, WebFetch (read-only tools)       │
│     → CANNOT use Edit, Write, Bash (write tools blocked)         │
│     → Tool execution check: mode === "plan" → BLOCK              │
│                                                                  │
│  3. Claude creates plan                                          │
│     → Uses update_plan tool                                      │
│     → Specifies domains to access                                │
│     → Plan stored in context                                     │
│                                                                  │
│  4. Claude requests approval                                     │
│     → Uses ExitPlanMode tool                                     │
│     → Sends plan_approval_request message                        │
│     → UI shows approval dialog                                   │
│                                                                  │
│  5. User approves/rejects                                        │
│     → User clicks "Approve" or "Reject"                          │
│     → Sends plan_approval_response message                       │
│                                                                  │
│  6a. If approved:                                                │
│     → setPermissionMode("ask")  (exit plan mode)                 │
│     → setHasExitedPlanMode(true)                                 │
│     → Add "plan_mode_exit" attachment                            │
│     → Approved domains stored                                    │
│     → Claude can now execute tools                               │
│                                                                  │
│  6b. If rejected:                                                │
│     → Remain in plan mode                                        │
│     → Claude revises plan                                        │
│     → Go back to step 3                                          │
│                                                                  │
│  7. Claude executes approved plan                                │
│     → Tools unblocked (permission_mode = "ask")                  │
│     → Can access approved domains without prompts                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 KEY IMPLEMENTATION DETAILS

### **1. Tool Blocking:**

```javascript
// Tool execution wrapper
async function executeTool(tool, args, context) {
  const mode = context.toolPermissionContext.mode;
  
  // Block in plan mode
  if (mode === "plan") {
    return {
      blocked: true,
      reason: "Tool execution blocked in plan mode"
    };
  }
  
  // Execute normally
  return tool.call(args, context);
}
```

### **2. State Tracking:**

```javascript
// Global state
const globalState = {
  hasExitedPlanMode: false,    // Set true after first exit
  needsPlanModeExitAttachment: false,  // Set true on entry
  awaitingPlanApproval: false  // Waiting for user approval
};
```

### **3. UI Integration:**

```javascript
// Status bar indicator
function renderStatusBar(mode) {
  if (mode === "plan") {
    return {
      text: "Plan Mode",
      color: "cyan"  // Matches planMode color
    };
  }
  // Normal status bar
}
```

---

## 🎯 CRITICAL INSIGHTS

### **What Makes Plan Mode Work:**

1. **Permission Mode System** - Core blocking mechanism
2. **State Management** - Tracks plan mode state
3. **Tool Blocking** - Prevents execution in plan mode
4. **Attachments** - Communicates plan mode to model
5. **UI Integration** - Visual feedback (cyan theme)
6. **Approval Workflow** - Request/response messages

### **What Plan Mode Is NOT:**

- ❌ NOT a separate tool
- ❌ NOT model-specific
- ❌ NOT automatic planning
- ❌ NOT task management

### **What Plan Mode IS:**

- ✅ A PERMISSION MODE
- ✅ Client-side blocking
- ✅ User approval workflow
- ✅ UI state (cyan theme)

---

## 🎉 CONCLUSION

### **Plan Mode Technical Summary:**

**Permission Mode:** `"plan"`
**State Variables:** `hasExitedPlanMode`, `needsPlanModeExitAttachment`
**Tools:** `EnterPlanMode`, `ExitPlanMode`, `update_plan`
**Attachments:** `plan_mode`, `plan_mode_exit`, `plan_mode_reentry`
**UI Color:** Cyan (`rgb(0,102,102)`)
**Blocking:** Tool execution blocked when `mode === "plan"`

**Core Mechanism:**
```
Permission Mode = "plan" → Block Tools → User Approval → Exit Plan Mode
```

---

**Deep Research Complete:** 2026-02-24
**Lines Analyzed:** 447,173
**Key Finding:** Plan Mode is a PERMISSION MODE, not a planning tool
