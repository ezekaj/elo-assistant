# 🤖 AUTOMATIC MODEL-BASED BEHAVIOR

**Date:** 2026-02-24
**Goal:** Automatic behavior based on chosen LLM - NO manual permission modes

---

## 📊 EXECUTIVE SUMMARY

**User Request:**
1. ❌ NO permission mode system
2. ✅ Automatic behavior based on chosen LLM

**Solution:** Model-based automatic behavior configuration.

---

## 🎯 CONCEPT

### **Instead of Manual Permission Modes:**

```
❌ OLD WAY (Manual):
User: /permission-mode plan
Claude: Enters plan mode
User: /permission-mode ask
Claude: Exits plan mode

❌ COMPLEX: Users must remember commands
```

### **Automatic Model-Based Behavior:**

```
✅ NEW WAY (Automatic):
User selects: claude-opus-4-6
→ Automatically: More cautious, creates plans for complex tasks

User selects: gpt-4o-mini
→ Automatically: Fast execution, minimal planning

User selects: gemini-2.0-flash
→ Automatically: Balanced approach

✅ SIMPLE: Behavior matches model capabilities
```

---

## 📋 IMPLEMENTATION

### **1. Model Behavior Profiles:**

```typescript
// src/agents/model-behaviors.ts

/**
 * Automatic behavior profiles based on model
 * NO manual permission modes needed
 */
export type ModelBehaviorProfile = {
  /** How cautious the model should be */
  cautionLevel: 'low' | 'medium' | 'high';
  
  /** Whether to create plans for complex tasks */
  autoPlan: boolean;
  
  /** Auto-approve safe operations */
  autoApproveSafe: boolean;
  
  /** Require approval for file edits */
  requireEditApproval: boolean;
  
  /** Require approval for bash commands */
  requireBashApproval: boolean;
  
  /** Maximum tool calls before asking */
  maxToolCallsBeforeAsk: number;
};

/**
 * Default behavior profiles per model type
 */
export const MODEL_BEHAVIOR_PROFILES: Record<string, ModelBehaviorProfile> = {
  // Powerful models - more cautious
  'claude-opus': {
    cautionLevel: 'high',
    autoPlan: true,
    autoApproveSafe: false,
    requireEditApproval: true,
    requireBashApproval: true,
    maxToolCallsBeforeAsk: 3
  },
  
  // Balanced models
  'claude-sonnet': {
    cautionLevel: 'medium',
    autoPlan: true,
    autoApproveSafe: true,
    requireEditApproval: false,
    requireBashApproval: true,
    maxToolCallsBeforeAsk: 5
  },
  
  // Fast models - less cautious
  'claude-haiku': {
    cautionLevel: 'low',
    autoPlan: false,
    autoApproveSafe: true,
    requireEditApproval: false,
    requireBashApproval: false,
    maxToolCallsBeforeAsk: 10
  },
  
  // GPT models
  'gpt-4': {
    cautionLevel: 'high',
    autoPlan: true,
    autoApproveSafe: false,
    requireEditApproval: true,
    requireBashApproval: true,
    maxToolCallsBeforeAsk: 3
  },
  
  'gpt-4o-mini': {
    cautionLevel: 'low',
    autoPlan: false,
    autoApproveSafe: true,
    requireEditApproval: false,
    requireBashApproval: false,
    maxToolCallsBeforeAsk: 10
  },
  
  // Gemini models
  'gemini-2.0-flash': {
    cautionLevel: 'medium',
    autoPlan: true,
    autoApproveSafe: true,
    requireEditApproval: false,
    requireBashApproval: true,
    maxToolCallsBeforeAsk: 5
  },
  
  // Local models - most permissive
  'ollama': {
    cautionLevel: 'low',
    autoPlan: false,
    autoApproveSafe: true,
    requireEditApproval: false,
    requireBashApproval: false,
    maxToolCallsBeforeAsk: 20
  }
};

/**
 * Get behavior profile for current model
 */
export function getModelBehavior(model: string): ModelBehaviorProfile {
  const normalized = model.toLowerCase();
  
  // Check for known model patterns
  for (const [pattern, profile] of Object.entries(MODEL_BEHAVIOR_PROFILES)) {
    if (normalized.includes(pattern)) {
      return profile;
    }
  }
  
  // Default to medium caution
  return {
    cautionLevel: 'medium',
    autoPlan: true,
    autoApproveSafe: true,
    requireEditApproval: false,
    requireBashApproval: true,
    maxToolCallsBeforeAsk: 5
  };
}
```

---

### **2. Configuration Override:**

```typescript
// src/config/types.agent-defaults.ts

export interface AgentDefaultsConfig {
  // ... existing config
  
  /**
   * Model-specific behavior overrides
   * Users can customize automatic behavior per model
   */
  modelBehaviors?: Record<string, Partial<ModelBehaviorProfile>>;
}

// Example config:
{
  "agents": {
    "defaults": {
      "modelBehaviors": {
        "claude-opus-4-6": {
          "autoPlan": true,
          "requireEditApproval": true
        },
        "gpt-4o-mini": {
          "autoPlan": false,
          "requireBashApproval": false
        }
      }
    }
  }
}
```

---

### **3. Automatic Behavior Application:**

```typescript
// src/agents/tool-execution-wrapper.ts

import { getModelBehavior } from './model-behaviors.js';

export async function executeToolWithHooks(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  // Get automatic behavior based on model
  const behavior = getModelBehavior(context.model);
  
  // Auto-approve safe operations if configured
  if (behavior.autoApproveSafe && isSafeOperation(tool.name)) {
    return executeTool(tool, args, context);
  }
  
  // Check if approval is required
  if (tool.name === 'edit' && behavior.requireEditApproval) {
    const approved = await requestApproval(tool, args);
    if (!approved) {
      return { blocked: true, reason: 'Edit requires approval' };
    }
  }
  
  if (tool.name === 'bash' && behavior.requireBashApproval) {
    const approved = await requestApproval(tool, args);
    if (!approved) {
      return { blocked: true, reason: 'Bash requires approval' };
    }
  }
  
  // Execute tool
  return executeTool(tool, args, context);
}
```

---

### **4. Automatic Planning:**

```typescript
// src/agents/auto-planner.ts

import { getModelBehavior } from './model-behaviors.js';

export async function shouldAutoPlan(
  task: string,
  model: string
): Promise<boolean> {
  const behavior = getModelBehavior(model);
  
  // If autoPlan is disabled for this model, skip planning
  if (!behavior.autoPlan) {
    return false;
  }
  
  // Check task complexity
  const complexity = analyzeTaskComplexity(task);
  
  // Complex tasks → auto plan
  if (complexity === 'high') {
    return true;
  }
  
  // Simple tasks → skip planning
  return false;
}

function analyzeTaskComplexity(task: string): 'low' | 'medium' | 'high' {
  // Simple heuristics for task complexity
  const indicators = {
    high: ['implement', 'create', 'build', 'refactor', 'migrate'],
    medium: ['fix', 'update', 'modify', 'add'],
    low: ['show', 'list', 'read', 'check']
  };
  
  const taskLower = task.toLowerCase();
  
  if (indicators.high.some(word => taskLower.includes(word))) {
    return 'high';
  }
  
  if (indicators.medium.some(word => taskLower.includes(word))) {
    return 'medium';
  }
  
  return 'low';
}
```

---

### **5. TUI Display:**

```typescript
// src/tui/components/model-behavior-indicator.ts

import { getModelBehavior } from '../agents/model-behaviors.js';

export function renderModelBehaviorIndicator(model: string): any {
  const behavior = getModelBehavior(model);
  
  const icons = {
    low: '⚡',      // Fast, permissive
    medium: '⚖️',   // Balanced
    high: '🛡️'      // Cautious, safe
  };
  
  const labels = {
    low: 'Fast',
    medium: 'Balanced',
    high: 'Cautious'
  };
  
  return Text.create(
    `${icons[behavior.cautionLevel]} ${labels[behavior.cautionLevel]}`,
    { color: behavior.cautionLevel === 'high' ? 'red' : behavior.cautionLevel === 'medium' ? 'yellow' : 'green' }
  );
}
```

---

## 📊 BEHAVIOR EXAMPLES

### **User Selects Claude Opus:**

```
User: /model claude-opus-4-6
TUI: 🛡️ Cautious mode active

User: Fix the login bug
Claude: I'll analyze the code and create a plan first...
→ Creates plan automatically
→ Asks for approval before making changes
→ Requires approval for bash commands
```

### **User Selects GPT-4o-mini:**

```
User: /model gpt-4o-mini
TUI: ⚡ Fast mode active

User: Fix the login bug
Claude: On it!
→ Directly fixes the issue
→ Auto-approves safe edits
→ No approval needed for simple bash
```

### **User Selects Local Ollama:**

```
User: /model ollama/llama-3.1
TUI: ⚡ Fast mode active

User: Run tests and fix any issues
Claude: Running tests... Found 2 issues. Fixing...
→ Maximum autonomy
→ No approvals needed
→ Fast execution
```

---

## ✅ CONFIGURATION EXAMPLES

### **Default Behavior (No Config Needed):**

```json
{
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-6"
    }
  }
}

→ Automatically uses medium caution for sonnet
→ Auto-plans complex tasks
→ Approves safe operations
```

### **Custom Behavior Override:**

```json
{
  "agents": {
    "defaults": {
      "model": "claude-opus-4-6",
      "modelBehaviors": {
        "claude-opus-4-6": {
          "autoPlan": true,
          "requireEditApproval": true,
          "requireBashApproval": true,
          "maxToolCallsBeforeAsk": 3
        },
        "gpt-4o-mini": {
          "autoPlan": false,
          "requireEditApproval": false,
          "requireBashApproval": false,
          "maxToolCallsBeforeAsk": 10
        }
      }
    }
  }
}
```

---

## 🎯 BENEFITS

### **vs Manual Permission Modes:**

| Feature | Manual Modes | Automatic Model-Based |
|---------|-------------|----------------------|
| **User Effort** | ❌ Must remember commands | ✅ Set model, done |
| **Consistency** | ❌ Easy to forget | ✅ Always matches model |
| **Flexibility** | ⚠️ One size fits all | ✅ Per-model behavior |
| **Complexity** | ❌ Multiple modes to learn | ✅ Just pick model |
| **Intuitive** | ❌ Abstract concept | ✅ Model = behavior |

---

## 🎉 CONCLUSION

### **Status: ✅ SIMPLE & AUTOMATIC**

**No Permission Modes:**
- ❌ No `/permission-mode` commands
- ❌ No manual mode switching
- ❌ No complex state management

**Automatic Behavior:**
- ✅ Behavior matches model capabilities
- ✅ Powerful models → more cautious
- ✅ Fast models → more permissive
- ✅ Configurable per model
- ✅ Simple for users

**User Experience:**
```
User picks model → Behavior automatically matches
That's it!
```

---

**Implementation Plan:** 2026-02-24
**Complexity:** 🟢 LOW (simpler than permission modes)
**User Experience:** ✅ EXCELLENT (automatic, intuitive)
