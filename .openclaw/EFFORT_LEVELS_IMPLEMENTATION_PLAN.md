# 📋 EFFORT LEVELS - COMPREHENSIVE IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Implement full Effort Levels support matching Claude Code

---

## 🎯 EXECUTIVE SUMMARY

This plan implements **Effort Levels** (low/medium/high/max) for controlling thinking depth and token spend in OpenClaw, matching Claude Code's implementation exactly.

---

## 📊 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    EFFORT LEVELS SYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │ Environment      │───▶│ Model Config     │               │
│  │ (OPENCLAW_EFFORT)│    │ (supportsEffort) │               │
│  └──────────────────┘    └────────┬─────────┘               │
│           │                       │                          │
│           ▼                       ▼                          │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │ CLI Option       │───▶│ Effort Validator │               │
│  │ (--effort)       │    │ (validation)     │               │
│  └──────────────────┘    └────────┬─────────┘               │
│           │                       │                          │
│           ▼                       ▼                          │
│  ┌──────────────────────────────────────────┐               │
│  │         Agent Configuration              │               │
│  │         { "effort": "high" }             │               │
│  └──────────────────────────────────────────┘               │
│                       │                                      │
│                       ▼                                      │
│  ┌──────────────────────────────────────────┐               │
│  │         API Request                      │               │
│  │         output_config: { effort: "..." } │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 IMPLEMENTATION PHASES

### **Phase 1: Schema Updates**

#### **File: `src/gateway/open-responses.schema.ts`**

**Change:** Add `"max"` to effort enum

```typescript
// Before
effort: z.enum(["low", "medium", "high"]).optional(),

// After
effort: z.enum(["low", "medium", "high", "max"]).optional(),
```

**Why:** Claude Code supports 4 effort levels, OpenClaw only had 3.

---

### **Phase 2: Environment Variable Support**

#### **File: `src/config/env-vars.ts`** (NEW FILE)

**Create:** Environment variable configuration for effort levels

```typescript
/**
 * Effort Level Environment Variables
 * Matches Claude Code's CLAUDE_CODE_EFFORT_LEVEL
 */

export const OPENCLAW_EFFORT_LEVEL = process.env.OPENCLAW_EFFORT_LEVEL;
export const OPENCLAW_THINKING_LEVEL = process.env.OPENCLAW_THINKING_LEVEL;

/**
 * Get default effort level from environment
 * @returns Default effort level or undefined
 */
export function getDefaultEffortLevel(): "low" | "medium" | "high" | "max" | undefined {
  if (!OPENCLAW_EFFORT_LEVEL) {
    return undefined;
  }
  
  const level = OPENCLAW_EFFORT_LEVEL.toLowerCase().trim();
  if (["low", "medium", "high", "max"].includes(level)) {
    return level as "low" | "medium" | "high" | "max";
  }
  
  return undefined;
}
```

**Why:** Allows users to set default effort level globally.

---

### **Phase 3: Model Effort Capability**

#### **File: `src/config/types.models.ts`**

**Add:** Model effort capability declaration

```typescript
export interface ModelConfig {
  id: string;
  displayName: string;
  description: string;
  provider: string;
  
  // NEW: Effort capability
  supportsEffort?: boolean;
  supportedEffortLevels?: ("low" | "medium" | "high" | "max")[];
  
  // Existing fields
  supportsThinking?: boolean;
  supportsAdaptiveThinking?: boolean;
  // ... other fields
}
```

**Why:** Models need to declare which effort levels they support.

---

### **Phase 4: Effort Validation Logic**

#### **File: `src/agents/effort-validator.ts`** (NEW FILE)

**Create:** Effort validation utilities

```typescript
import type { ModelConfig } from "../config/types.models.js";

export type EffortLevel = "low" | "medium" | "high" | "max";

/**
 * Valid effort levels
 */
export const VALID_EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "max"];

/**
 * Normalize user-provided effort level strings to canonical enum
 */
export function normalizeEffortLevel(raw?: string | null): EffortLevel | undefined {
  if (!raw) {
    return undefined;
  }
  
  const key = raw.toLowerCase().trim();
  
  if (["low"].includes(key)) {
    return "low";
  }
  if (["mid", "med", "medium"].includes(key)) {
    return "medium";
  }
  if (["high", "ultra"].includes(key)) {
    return "high";
  }
  if (["max", "maximum", "highest"].includes(key)) {
    return "max";
  }
  
  return undefined;
}

/**
 * Check if model supports effort levels
 */
export function modelSupportsEffort(model?: ModelConfig): boolean {
  return model?.supportsEffort === true;
}

/**
 * Get supported effort levels for model
 */
export function getModelEffortLevels(model?: ModelConfig): EffortLevel[] {
  if (!model?.supportedEffortLevels) {
    return VALID_EFFORT_LEVELS;
  }
  return model.supportedEffortLevels;
}

/**
 * Validate effort level for model
 * @param effort - Effort level to validate
 * @param model - Model configuration
 * @returns Validation result
 */
export function validateEffortLevel(
  effort: string,
  model?: ModelConfig
): { valid: boolean; error?: string } {
  const normalized = normalizeEffortLevel(effort);
  
  if (!normalized) {
    return {
      valid: false,
      error: `Invalid effort level '${effort}'. Valid options: ${VALID_EFFORT_LEVELS.join(", ")}`
    };
  }
  
  if (!model) {
    return { valid: true };
  }
  
  if (!modelSupportsEffort(model)) {
    return {
      valid: false,
      error: `Model '${model.id}' does not support effort levels`
    };
  }
  
  const supportedLevels = getModelEffortLevels(model);
  if (!supportedLevels.includes(normalized)) {
    return {
      valid: false,
      error: `Model '${model.id}' does not support effort level '${normalized}'. Supported: ${supportedLevels.join(", ")}`
    };
  }
  
  return { valid: true };
}

/**
 * Get default effort for model
 */
export function getDefaultEffortForModel(model?: ModelConfig): EffortLevel | undefined {
  if (!model) {
    return "high";
  }
  
  // Opus 4.6 defaults to medium
  if (model.id.toLowerCase().includes("opus-4-6")) {
    return "medium";
  }
  
  return "high";
}
```

**Why:** Centralized validation logic for effort levels.

---

### **Phase 5: CLI Option**

#### **File: `src/cli/program.ts`** or `src/cli/program/register.agent.ts`

**Add:** `--effort` CLI option

```typescript
// In agent command registration
.option(
  "--effort <level>",
  "Effort level for thinking depth (low|medium|high|max). Default: high"
)
```

**Why:** Allows users to set effort level per session.

---

### **Phase 6: Agent Configuration**

#### **File: `src/config/types.agent-defaults.ts`**

**Add:** Effort configuration to agent defaults

```typescript
export interface AgentDefaultsConfig {
  // Existing fields
  model?: string;
  thinkingDefault?: ThinkLevel;
  
  // NEW: Effort configuration
  effortDefault?: "low" | "medium" | "high" | "max";
}
```

**Why:** Agents can specify default effort level.

---

### **Phase 7: Gateway Integration**

#### **File: `src/gateway/openresponses-http.ts`**

**Add:** Effort level processing in API handler

```typescript
// In buildAgentPrompt or similar function
function resolveEffortLevel(params: {
  effort?: string;
  model?: ModelConfig;
}): EffortLevel | undefined {
  // 1. Check explicit effort parameter
  if (params.effort) {
    const validation = validateEffortLevel(params.effort, params.model);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    return normalizeEffortLevel(params.effort);
  }
  
  // 2. Check environment variable
  const envDefault = getDefaultEffortLevel();
  if (envDefault) {
    return envDefault;  }
  
  // 3. Check model default
  const modelDefault = getDefaultEffortForModel(params.model);
  if (modelDefault) {
    return modelDefault;
  }
  
  // 4. Fall back to "high"
  return "high";
}
```

**Why:** Resolves effort level from multiple sources with proper precedence.

---

### **Phase 8: Model Configuration Updates**

#### **File: `src/agents/model-selection.ts`** or `src/config/models.ts`

**Add:** Effort capability to model definitions

```typescript
const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    description: "Most capable model for complex tasks",
    provider: "anthropic",
    supportsEffort: true,
    supportedEffortLevels: ["low", "medium", "high", "max"],
    // ... other fields
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    description: "Highly capable model",
    provider: "anthropic",
    supportsEffort: true,
    supportedEffortLevels: ["low", "medium", "high"],  // No max for 4.5
    // ... other fields
  },
  {
    id: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    description: "Balanced performance",
    provider: "anthropic",
    supportsEffort: false,  // Sonnet doesn't support effort
    // ... other fields
  },
];
```

**Why:** Models declare their effort capabilities.

---

### **Phase 9: Documentation**

#### **File: `docs/effort-levels.md`** (NEW FILE)

**Create:** Effort levels documentation

```markdown
# Effort Levels

Effort levels control thinking depth and token spend for supported models.

## Available Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `low` | Minimal thinking, cost-optimized | Simple tasks, subagents |
| `medium` | Balanced thinking/cost | Default for Opus 4.6 |
| `high` | Deep thinking (default) | Complex tasks |
| `max` | Deepest reasoning (Opus 4.6 only) | Critical analysis |

## Usage

### CLI
```bash
claude --effort medium "Review this PR"
```

### Environment Variable
```bash
export OPENCLAW_EFFORT_LEVEL=high
```

### Agent Configuration
```json
{
  "name": "code-reviewer",
  "effortDefault": "high"
}
```

### API
```json
{
  "output_config": {
    "effort": "high"
  }
}
```

## Model Support

| Model | Supports Effort | Levels |
|-------|----------------|--------|
| Opus 4.6 | ✅ | low, medium, high, max |
| Opus 4.5 | ✅ | low, medium, high |
| Sonnet 4.5 | ❌ | N/A |
| Haiku 4.5 | ❌ | N/A |
```

**Why:** Users need documentation on how to use effort levels.

---

## 📝 FILES TO CREATE/MODIFY

### **New Files (4):**
1. `src/config/env-vars.ts` - Environment variable configuration
2. `src/agents/effort-validator.ts` - Effort validation utilities
3. `docs/effort-levels.md` - User documentation
4. `src/agents/effort-types.ts` - Type definitions (optional, for clarity)

### **Modified Files (7):**
1. `src/gateway/open-responses.schema.ts` - Add "max" to enum
2. `src/config/types.models.ts` - Add effort capability fields
3. `src/config/types.agent-defaults.ts` - Add effortDefault field
4. `src/gateway/openresponses-http.ts` - Add effort processing
5. `src/agents/model-selection.ts` - Add effort capability to models
6. `src/cli/program/register.agent.ts` - Add --effort CLI option
7. `src/auto-reply/thinking.ts` - Add effort level utilities

---

## ✅ VERIFICATION CHECKLIST

- [ ] Schema includes "max" effort level
- [ ] Environment variable support working
- [ ] Model effort capability declared
- [ ] CLI --effort option working
- [ ] Agent config support working
- [ ] Validation logic complete
- [ ] All components wired together
- [ ] Build successful
- [ ] No TypeScript errors
- [ ] Documentation complete

---

## 🎯 SUCCESS CRITERIA

**Implementation is complete when:**

1. ✅ All 4 effort levels supported (low/medium/high/max)
2. ✅ Environment variable `OPENCLAW_EFFORT_LEVEL` works
3. ✅ CLI `--effort` option works
4. ✅ Agent config `effortDefault` works
5. ✅ Model effort capability declared
6. ✅ Validation prevents invalid effort levels
7. ✅ Documentation complete
8. ✅ Build successful with no errors

---

**Status:** Ready for implementation
