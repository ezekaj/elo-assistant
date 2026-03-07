# 📋 PLAN MODE - COMPREHENSIVE IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Full Plan Mode implementation for OpenClaw - Works with ALL LLM providers

---

## 🎯 EXECUTIVE SUMMARY

**Plan Mode** is a **permission mode** that:
1. Blocks tool execution during planning phase
2. Allows Claude to explore/analyze without making changes
3. Requires user approval before executing plan
4. Works with ANY LLM provider (client-side feature)

---

## 📊 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    PLAN MODE SYSTEM                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Permission Mode │    │   State Manager  │               │
│  │  (plan/ask/etc)  │◀──▶│   (global state) │               │
│  └────────┬─────────┘    └──────────────────┘               │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              TOOL EXECUTION BLOCKER                      ││
│  │  IF mode == "plan" → Block write tools                   ││
│  │  IF mode == "ask" → Normal execution                     ││
│  └──────────────────────────────────────────────────────────┘│
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │  Plan Mode Tools │    │   TUI Integration│               │
│  │  - EnterPlanMode │    │   - Cyan theme   │               │
│  │  - ExitPlanMode  │    │   - Status bar   │               │
│  │  - update_plan   │    │   - Approval UI  │               │
│  └──────────────────┘    └──────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 FILE STRUCTURE

### **New Files to Create:**

```
src/
└── agents/
    ├── plan-mode/
    │   ├── types.ts                    # Type definitions
    │   ├── state.ts                    # State management
    │   ├── permission-mode.ts          # Permission mode system
    │   ├── tools/
    │   │   ├── enter-plan-mode.ts      # EnterPlanMode tool
    │   │   ├── exit-plan-mode.ts       # ExitPlanMode tool
    │   │   └── update-plan.ts          # Update plan tool
    │   ├── attachments.ts              # Plan mode attachments
    │   └── index.ts                    # Public exports
    │
    └── tool-execution-wrapper.ts       # MODIFIED: Add plan mode blocking
```

### **Modified Files:**

```
src/
├── tui/
│   ├── commands.ts                     # Add plan mode commands
│   ├── tui-command-handlers.ts         # Add command handlers
│   └── components/
│       └── plan-mode-indicator.ts      # NEW: Plan mode UI indicator
│
├── config/
│   └── types.agent-defaults.ts         # Add plan mode config
│
└── gateway/
    └── tools-invoke-http.ts            # Add plan mode context
```

---

## 🔧 IMPLEMENTATION PHASES

### **Phase 1: Core System** (Critical)

#### **1.1 Type Definitions** (`src/agents/plan-mode/types.ts`)

```typescript
/**
 * Plan Mode Permission Modes
 * Matches Claude Code's permission mode system
 */
export type PermissionMode = 
  | 'default'              // Standard behavior
  | 'acceptEdits'          // Auto-accept file edits
  | 'bypassPermissions'    // Bypass all permission checks
  | 'plan'                 // Plan mode: No tool execution
  | 'dontAsk';             // Deny unapproved operations

/**
 * Plan Mode State
 * Tracks plan mode lifecycle
 */
export interface PlanModeState {
  /** Current permission mode */
  currentMode: PermissionMode;
  /** Whether user has exited plan mode in this session */
  hasExitedPlanMode: boolean;
  /** Whether exit attachment is needed */
  needsPlanModeExitAttachment: boolean;
  /** Whether awaiting plan approval */
  awaitingPlanApproval: boolean;
  /** Current plan (if any) */
  currentPlan: Plan | null;
  /** Approved domains for session */
  approvedDomains: string[];
}

/**
 * Plan structure
 */
export interface Plan {
  /** Plan content/description */
  content: string;
  /** Domains to access */
  domains?: string[];
  /** Actions to take */
  actions?: string[];
  /** Identified risks */
  risks?: string[];
  /** When plan was created */
  createdAt: string;
}

/**
 * Plan approval response
 */
export interface PlanApprovalResponse {
  /** Whether plan was approved */
  approved: boolean;
  /** User feedback (if rejected) */
  feedback?: string;
}
```

#### **1.2 State Management** (`src/agents/plan-mode/state.ts`)

```typescript
import type { PlanModeState, PermissionMode, Plan } from './types.js';

/**
 * Global plan mode state
 * Provider-agnostic - works with ANY LLM
 */
const state: PlanModeState = {
  currentMode: 'default',
  hasExitedPlanMode: false,
  needsPlanModeExitAttachment: false,
  awaitingPlanApproval: false,
  currentPlan: null,
  approvedDomains: [],
};

/**
 * Set permission mode
 * Handles mode transitions automatically
 */
export function setPermissionMode(mode: PermissionMode): void {
  const oldMode = state.currentMode;
  state.currentMode = mode;
  
  // Handle plan mode transitions
  if (oldMode === 'plan' && mode !== 'plan') {
    // Exiting plan mode
    state.needsPlanModeExitAttachment = false;
    state.hasExitedPlanMode = true;
  }
  if (mode === 'plan' && oldMode !== 'plan') {
    // Entering plan mode
    state.needsPlanModeExitAttachment = true;
  }
}

/**
 * Get current permission mode
 */
export function getPermissionMode(): PermissionMode {
  return state.currentMode;
}

/**
 * Check if in plan mode
 */
export function isPlanMode(): boolean {
  return state.currentMode === 'plan';
}

/**
 * Get plan mode state
 */
export function getPlanModeState(): PlanModeState {
  return { ...state };
}

/**
 * Store plan for approval
 */
export function storePlan(plan: Plan): void {
  state.currentPlan = plan;
  state.awaitingPlanApproval = true;
}

/**
 * Get current plan
 */
export function getCurrentPlan(): Plan | null {
  return state.currentPlan;
}

/**
 * Approve plan and exit plan mode
 */
export function approvePlan(domains?: string[]): void {
  if (domains) {
    state.approvedDomains = domains;
  }
  state.awaitingPlanApproval = false;
  state.currentPlan = null;
  setPermissionMode('default');  // Exit plan mode
}

/**
 * Reject plan (stay in plan mode)
 */
export function rejectPlan(): void {
  state.awaitingPlanApproval = false;
  // Stay in plan mode for revision
}

/**
 * Approve domain for session
 */
export function approveDomain(domain: string): void {
  if (!state.approvedDomains.includes(domain)) {
    state.approvedDomains.push(domain);
  }
}

/**
 * Check if domain is approved
 */
export function isDomainApproved(domain: string): boolean {
  return state.approvedDomains.includes(domain);
}
```

#### **1.3 Permission Mode System** (`src/agents/plan-mode/permission-mode.ts`)

```typescript
import { getPermissionMode, isPlanMode } from './state.js';

/**
 * Check if tool execution should be blocked
 * Works with ANY LLM provider (client-side check)
 */
export function shouldBlockToolExecution(toolName: string): boolean {
  const mode = getPermissionMode();
  
  // Always block in plan mode
  if (mode === 'plan') {
    return isWriteTool(toolName);
  }
  
  // Don't block in other modes
  return false;
}

/**
 * Check if tool is a write tool (modifies state)
 */
function isWriteTool(toolName: string): boolean {
  const writeTools = [
    'edit',
    'write',
    'bash',
    'process',
    'delete',
    'move',
    'copy'
  ];
  
  return writeTools.some(write => toolName.toLowerCase().includes(write));
}

/**
 * Check if tool is read-only (safe in plan mode)
 */
export function isReadOnlyTool(toolName: string): boolean {
  const readOnlyTools = [
    'read',
    'glob',
    'grep',
    'web_fetch',
    'web_search',
    'memory_search',
    'memory_get'
  ];
  
  return readOnlyTools.some(read => toolName.toLowerCase().includes(read));
}

/**
 * Get block reason for tool
 */
export function getToolBlockReason(toolName: string): string {
  if (isPlanMode()) {
    if (isWriteTool(toolName)) {
      return 'Tool execution is blocked in plan mode. Use exit_plan_mode to get approval.';
    }
  }
  
  return '';
}
```

---

### **Phase 2: Plan Mode Tools** (High Priority)

#### **2.1 Enter Plan Mode Tool** (`src/agents/plan-mode/tools/enter-plan-mode.ts`)

```typescript
import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from '../../tools/common.js';
import { jsonResult } from '../../tools/common.js';
import { setPermissionMode, isPlanMode, getPermissionMode } from '../state.js';

const EnterPlanModeOutputSchema = Type.Object({
  success: Type.Boolean({ description: 'Whether entering plan mode succeeded' }),
  mode: Type.String({ description: 'Current permission mode' }),
  message: Type.String({ description: 'Status message' }),
  alreadyInPlanMode: Type.Optional(Type.Boolean({ description: 'Whether already in plan mode' }))
});

export function createEnterPlanModeTool(): AnyAgentTool {
  return {
    name: 'enter_plan_mode',
    description: 'Enter planning mode for exploring and creating plans. In plan mode, you can analyze and explore but cannot execute write tools (edit, write, bash, etc.). Works with any LLM provider.',
    parameters: Type.Object({}),
    outputSchema: EnterPlanModeOutputSchema,
    
    async call(args: Record<string, unknown>, context: any) {
      // Check if already in plan mode
      if (isPlanMode()) {
        return jsonResult({
          success: false,
          mode: 'plan',
          message: 'Already in plan mode',
          alreadyInPlanMode: true
        });
      }
      
      // Enter plan mode
      setPermissionMode('plan');
      
      return jsonResult({
        success: true,
        mode: 'plan',
        message: 'Entered plan mode. You can now explore and create plans without executing tools. Use exit_plan_mode when ready for approval.'
      });
    }
  };
}
```

#### **2.2 Exit Plan Mode Tool** (`src/agents/plan-mode/tools/exit-plan-mode.ts`)

```typescript
import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from '../../tools/common.js';
import { jsonResult } from '../../tools/common.js';
import { 
  isPlanMode, 
  storePlan, 
  approvePlan,
  getCurrentPlan 
} from '../state.js';

const ExitPlanModeOutputSchema = Type.Object({
  success: Type.Boolean({ description: 'Whether exit plan mode succeeded' }),
  approved: Type.Boolean({ description: 'Whether plan was approved' }),
  message: Type.String({ description: 'Status message' }),
  notInPlanMode: Type.Optional(Type.Boolean({ description: 'Whether not in plan mode' }))
});

export function createExitPlanModeTool(): AnyAgentTool {
  return {
    name: 'exit_plan_mode',
    description: 'Exit planning mode and get user approval for the plan. Present your plan first using update_plan, then use this to get approval. Works with any LLM provider.',
    parameters: Type.Object({
      plan: Type.Optional(Type.String({ description: 'The plan to present for approval' })),
      domains: Type.Optional(Type.Array(Type.String({ description: 'Domains to access' })))
    }),
    outputSchema: ExitPlanModeOutputSchema,
    
    async call(args: Record<string, unknown>, context: any) {
      // Check if in plan mode
      if (!isPlanMode()) {
        return jsonResult({
          success: false,
          approved: false,
          message: 'Not in plan mode',
          notInPlanMode: true
        });
      }
      
      const plan = args.plan as string | undefined;
      const domains = args.domains as string[] | undefined;
      
      // Store plan if provided
      if (plan) {
        storePlan({
          content: plan,
          domains,
          createdAt: new Date().toISOString()
        });
      }
      
      // Get existing plan if not provided
      const existingPlan = getCurrentPlan();
      
      // In real implementation, this would show UI approval dialog
      // For now, auto-approve (TUI will handle actual approval)
      approvePlan(domains);
      
      return jsonResult({
        success: true,
        approved: true,
        message: existingPlan 
          ? 'Plan approved! You can now execute tools.' 
          : 'Exited plan mode.'
      });
    }
  };
}
```

#### **2.3 Update Plan Tool** (`src/agents/plan-mode/tools/update-plan.ts`)

```typescript
import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from '../../tools/common.js';
import { jsonResult } from '../../tools/common.js';
import { storePlan, isPlanMode } from '../state.js';

const UpdatePlanOutputSchema = Type.Object({
  success: Type.Boolean({ description: 'Whether plan update succeeded' }),
  planStored: Type.Boolean({ description: 'Whether plan was stored' }),
  notInPlanMode: Type.Optional(Type.Boolean({ description: 'Whether not in plan mode' }))
});

export function createUpdatePlanTool(): AnyAgentTool {
  return {
    name: 'update_plan',
    description: 'Present a plan to the user for approval before taking actions. The user will see the domains you intend to visit and your approach. Once approved, you can proceed with actions on the approved domains without additional permission prompts. Works with any LLM provider.',
    parameters: Type.Object({
      plan: Type.String({ description: 'The plan to present' }),
      domains: Type.Optional(Type.Array(Type.String({ description: 'List of domains you will visit (e.g., ["github.com", "stackoverflow.com"])' }))),
      actions: Type.Optional(Type.Array(Type.String({ description: 'Actions to take' }))),
      risks: Type.Optional(Type.Array(Type.String({ description: 'Identified risks' })))
    }),
    outputSchema: UpdatePlanOutputSchema,
    
    async call(args: Record<string, unknown>, context: any) {
      // Check if in plan mode
      if (!isPlanMode()) {
        return jsonResult({
          success: false,
          planStored: false,
          message: 'Not in plan mode',
          notInPlanMode: true
        });
      }
      
      const plan = {
        content: args.plan as string,
        domains: args.domains as string[] | undefined,
        actions: args.actions as string[] | undefined,
        risks: args.risks as string[] | undefined,
        createdAt: new Date().toISOString()
      };
      
      // Store plan for approval
      storePlan(plan);
      
      return jsonResult({
        success: true,
        planStored: true,
        message: 'Plan stored. Use exit_plan_mode to get user approval.'
      });
    }
  };
}
```

---

### **Phase 3: Tool Execution Integration** (Critical)

#### **3.1 Modify Tool Execution Wrapper** (`src/agents/tool-execution-wrapper.ts`)

```typescript
// ADD at top of file
import { shouldBlockToolExecution, getToolBlockReason } from './plan-mode/permission-mode.js';

// MODIFY executeToolWithHooks function
export async function executeToolWithHooks(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const hookContext = {
    session_id: context.session_id || 'unknown',
    tool_use_id: context.tool_use_id || `tool_${Date.now()}`,
    cwd: process.cwd(),
    transcript_path: '',
    permission_mode: getPermissionMode(),  // ADD: Pass permission mode
  };
  
  // ADD: Check plan mode blocking
  const blockReason = shouldBlockToolExecution(tool.name);
  if (blockReason) {
    return {
      blocked: true,
      reason: getToolBlockReason(tool.name),
      permissionMode: getPermissionMode()
    };
  }
  
  // ... rest of existing execution logic
}
```

---

### **Phase 4: TUI Integration** (High Priority)

#### **4.1 Plan Mode Commands** (`src/tui/commands.ts`)

```typescript
// ADD imports
import { 
  isPlanMode, 
  getPlanModeState,
  setPermissionMode 
} from '../agents/plan-mode/state.js';

// ADD to known commands list
const knownCommands = [
  // ... existing
  "enter-plan-mode",
  "exit-plan-mode",
  "plan-status"
];

// ADD command registrations
{
  name: "enter-plan-mode",
  description: "Enter plan mode (no tool execution)",
},
{
  name: "exit-plan-mode",
  description: "Exit plan mode with approval",
},
{
  name: "plan-status",
  description: "Show plan mode status",
},
```

#### **4.2 Plan Mode Command Handlers** (`src/tui/tui-command-handlers.ts`)

```typescript
// ADD handlers
case "enter-plan-mode": {
  setPermissionMode('plan');
  chatLog.addSystem('✅ Entered plan mode. Write tools blocked.');
  updateFooter();
  break;
}

case "exit-plan-mode": {
  setPermissionMode('default');
  chatLog.addSystem('✅ Exited plan mode. Tools unblocked.');
  updateFooter();
  break;
}

case "plan-status": {
  const state = getPlanModeState();
  chatLog.addSystem(
    `Plan Mode Status:\n` +
    `  Mode: ${state.currentMode}\n` +
    `  Has Exited: ${state.hasExitedPlanMode}\n` +
    `  Awaiting Approval: ${state.awaitingPlanApproval}\n` +
    `  Approved Domains: ${state.approvedDomains.join(', ') || 'none'}`
  );
  break;
}
```

#### **4.3 Plan Mode UI Indicator** (`src/tui/components/plan-mode-indicator.ts`)

```typescript
import { isPlanMode, getPlanModeState } from '../../agents/plan-mode/state.js';

export function renderPlanModeIndicator(): any {
  const state = getPlanModeState();
  
  if (!isPlanMode()) {
    return null;  // Not in plan mode
  }
  
  // Cyan color scheme (matches Claude Code)
  return Text.create(
    `📋 Plan Mode`,
    { color: 'cyan' }
  );
}

export function renderPlanModeStatusBar(): any {
  const state = getPlanModeState();
  
  if (!isPlanMode()) {
    return null;
  }
  
  let status = '📋 Plan Mode';
  
  if (state.awaitingPlanApproval) {
    status += ' (Awaiting Approval)';
  }
  
  return Text.create(status, { color: 'cyan' });
}
```

---

## ✅ VERIFICATION CHECKLIST

### **Code Quality:**
- [ ] All TypeScript types defined
- [ ] All functions have JSDoc comments
- [ ] All errors properly handled
- [ ] No circular dependencies

### **Feature Completeness:**
- [ ] Permission mode system working
- [ ] State management working
- [ ] EnterPlanMode tool working
- [ ] ExitPlanMode tool working
- [ ] UpdatePlan tool working
- [ ] Tool blocking working
- [ ] TUI commands working
- [ ] UI indicator working

### **Integration:**
- [ ] Tools registered in openclaw-tools.ts
- [ ] Tool execution wrapper updated
- [ ] TUI commands registered
- [ ] TUI handlers implemented
- [ ] UI indicator integrated

### **Testing:**
- [ ] Test plan mode entry
- [ ] Test plan mode exit
- [ ] Test tool blocking
- [ ] Test TUI commands
- [ ] Test with different LLM providers

---

## 📝 IMPLEMENTATION ORDER

1. **Phase 1: Core System** - Types, State, Permission Mode
2. **Phase 2: Plan Mode Tools** - Enter, Exit, Update
3. **Phase 3: Tool Execution** - Add blocking logic
4. **Phase 4: TUI Integration** - Commands, Handlers, UI
5. **Phase 5: Testing & Verification** - Test all features

---

**Status:** Ready for implementation
**Estimated Lines:** ~1,500 new lines
**Estimated Files:** 10 new, 5 modified
