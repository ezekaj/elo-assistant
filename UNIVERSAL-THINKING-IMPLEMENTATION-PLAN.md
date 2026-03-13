# 🧠 UNIVERSAL THINKING SUPPORT - DEEP IMPLEMENTATION PLAN

**Goal:** Implement interleaved thinking support for ALL LLM providers (not just Opus 4.6)  
**Date:** 2026-02-24  
**Status:** Ready for Implementation  

---

## 📋 EXECUTIVE SUMMARY

This plan implements **universal thinking support** that works with:
- ✅ Zhipu (GLM-4.7, GLM-5)
- ✅ OpenRouter (Gemini, Grok, DeepSeek, etc.)
- ✅ LM Studio (local models)
- ✅ Claude (when available)
- ✅ Any future provider

**Key Features:**
- Adaptive thinking modes (off, minimal, low, medium, high, adaptive)
- Interleaved thinking display (show reasoning between tool calls)
- Provider-specific thinking configuration
- TUI controls for thinking visibility
- Budget control for thinking tokens

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW TUI                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Thinking Controls                                    │ │
│  │  - /think [mode]                                      │ │
│  │  - Toggle thinking display                            │ │
│  │  - Show/hide interleaved thinking                     │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              THINKING MODE MANAGER (NEW)                    │
│  - Determine thinking mode per model                        │
│  - Calculate thinking budget                                │
│  - Provider-specific configuration                          │
│  - Beta header management                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           PROVIDER ADAPTERS (Enhanced)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Zhipu     │ │ OpenRouter  │ │ LM Studio   │           │
│  │  Adapter    │ │  Adapter    │ │  Adapter    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  - Thinking config per provider                             │
│  - Beta headers per provider                                │
│  - Budget control per provider                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              INTERLEAVED DISPLAY (NEW)                      │
│  - Show thinking between tool calls                         │
│  - Format thinking blocks                                   │
│  - Toggle visibility                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### **PHASE 1: CORE INFRASTRUCTURE**

#### **1.1 Thinking Types & Schema**
**File:** `src/config/types.thinking.ts` (NEW)

**Purpose:** Define thinking modes and configuration

**Key Types:**
```typescript
export type ThinkingMode = 
  | 'off'       // No thinking
  | 'minimal'   // Very brief (1-2 sentences)
  | 'low'       // Brief reasoning
  | 'medium'    // Moderate reasoning
  | 'high'      // Extensive reasoning
  | 'adaptive'; // Model decides (Opus 4.6+)

export interface ThinkingConfig {
  mode: ThinkingMode;
  budgetTokens?: number;  // Max thinking tokens
  enabled?: boolean;
  interleaved?: boolean;  // Show between tool calls
  displayMode?: 'inline' | 'separate' | 'hidden';
}

export interface ProviderThinkingConfig {
  supported: boolean;
  modes: ThinkingMode[];
  budgetSupport: boolean;
  betaHeader?: string;
  defaultMode: ThinkingMode;
}
```

#### **1.2 Thinking Mode Manager**
**File:** `src/agents/thinking-manager.ts` (NEW)

**Purpose:** Central management of thinking configuration

**Key Functions:**
```typescript
- getThinkingConfig(model: string): ThinkingConfig
- getProviderConfig(provider: string): ProviderThinkingConfig
- calculateBudget(mode: ThinkingMode, contextTokens: number): number
- getBetaHeaders(model: string): string[]
- isInterleavedSupported(model: string): boolean
```

**Implementation:**
```typescript
export class ThinkingManager {
  private providerConfigs = new Map<string, ProviderThinkingConfig>();
  
  constructor() {
    this.initializeProviderConfigs();
  }
  
  private initializeProviderConfigs() {
    // Zhipu GLM
    this.providerConfigs.set('zhipu', {
      supported: true,
      modes: ['off', 'minimal', 'low', 'medium', 'high'],
      budgetSupport: false,
      defaultMode: 'low'
    });
    
    // OpenRouter (Gemini, Grok, etc.)
    this.providerConfigs.set('openrouter', {
      supported: true,
      modes: ['off', 'minimal', 'low', 'medium', 'high', 'adaptive'],
      budgetSupport: true,
      defaultMode: 'adaptive'
    });
    
    // LM Studio (local)
    this.providerConfigs.set('lmstudio', {
      supported: true,
      modes: ['off', 'minimal', 'low', 'medium', 'high'],
      budgetSupport: false,
      defaultMode: 'low'
    });
    
    // Claude
    this.providerConfigs.set('claude', {
      supported: true,
      modes: ['off', 'minimal', 'low', 'medium', 'high', 'adaptive'],
      budgetSupport: true,
      betaHeader: 'interleaved-thinking-2025-05-14',
      defaultMode: 'adaptive'
    });
  }
  
  getThinkingConfig(model: string): ThinkingConfig {
    const provider = this.extractProvider(model);
    const providerConfig = this.providerConfigs.get(provider);
    
    if (!providerConfig) {
      return { mode: 'low', enabled: true };
    }
    
    return {
      mode: providerConfig.defaultMode,
      enabled: true,
      interleaved: providerConfig.modes.includes('adaptive'),
      displayMode: 'inline'
    };
  }
  
  getBetaHeaders(model: string): string[] {
    const provider = this.extractProvider(model);
    const providerConfig = this.providerConfigs.get(provider);
    
    if (providerConfig?.betaHeader) {
      return [providerConfig.betaHeader];
    }
    
    return [];
  }
  
  private extractProvider(model: string): string {
    if (model.includes('/')) {
      return model.split('/')[0];
    }
    if (model.includes('glm')) return 'zhipu';
    if (model.includes('gemini')) return 'openrouter';
    if (model.includes('grok')) return 'openrouter';
    if (model.includes('claude')) return 'claude';
    return 'unknown';
  }
}

// Singleton
let instance: ThinkingManager | null = null;
export function getThinkingManager(): ThinkingManager {
  if (!instance) {
    instance = new ThinkingManager();
  }
  return instance;
}
```

---

### **PHASE 2: PROVIDER INTEGRATION**

#### **2.1 Zhipu Adapter Enhancement**
**File:** `src/agents/providers/zhipu-adapter.ts` (NEW)

**Purpose:** Zhipu-specific thinking configuration

**Implementation:**
```typescript
export interface ZhipuThinkingConfig {
  thinking_enabled?: boolean;
  thinking_budget?: number;
}

export function buildZhipuRequest(
  messages: any[],
  thinking: ThinkingConfig
): ZhipuRequest {
  return {
    model: 'glm-5',
    messages,
    // Zhipu doesn't support explicit thinking config
    // Thinking is implicit in model behavior
    max_tokens: calculateMaxTokens(thinking)
  };
}

function calculateMaxTokens(thinking: ThinkingConfig): number {
  const base = 4096;
  switch (thinking.mode) {
    case 'off': return base;
    case 'minimal': return base + 512;
    case 'low': return base + 1024;
    case 'medium': return base + 2048;
    case 'high': return base + 4096;
    default: return base + 1024;
  }
}
```

#### **2.2 OpenRouter Adapter Enhancement**
**File:** `src/agents/providers/openrouter-adapter.ts` (NEW)

**Purpose:** OpenRouter-specific thinking configuration

**Implementation:**
```typescript
export interface OpenRouterThinkingConfig {
  thinking?: {
    type: 'enabled' | 'adaptive' | 'disabled';
    budget_tokens?: number;
  };
}

export function buildOpenRouterRequest(
  messages: any[],
  thinking: ThinkingConfig,
  model: string
): OpenRouterRequest {
  const request: OpenRouterRequest = {
    model,
    messages,
    max_tokens: calculateMaxTokens(thinking)
  };
  
  // Add thinking config for supported models
  if (thinking.enabled && thinking.mode !== 'off') {
    if (thinking.mode === 'adaptive') {
      request.thinking = {
        type: 'adaptive'
      };
    } else {
      request.thinking = {
        type: 'enabled',
        budget_tokens: thinking.budgetTokens || getBudgetForMode(thinking.mode)
      };
    }
  }
  
  return request;
}
```

#### **2.3 LM Studio Adapter Enhancement**
**File:** `src/agents/providers/lmstudio-adapter.ts` (NEW)

**Purpose:** LM Studio-specific thinking configuration

**Implementation:**
```typescript
export function buildLmStudioRequest(
  messages: any[],
  thinking: ThinkingConfig
): LmStudioRequest {
  // LM Studio doesn't support explicit thinking
  // Control via temperature and max_tokens
  return {
    model: 'local-model',
    messages,
    temperature: getTemperatureForThinking(thinking.mode),
    max_tokens: calculateMaxTokens(thinking)
  };
}

function getTemperatureForThinking(mode: ThinkingMode): number {
  switch (mode) {
    case 'off': return 0.0;  // Deterministic
    case 'minimal': return 0.3;
    case 'low': return 0.5;
    case 'medium': return 0.7;
    case 'high': return 0.9;
    default: return 0.5;
  }
}
```

---

### **PHASE 3: INTERLEAVED DISPLAY**

#### **3.1 Thinking Display Component**
**File:** `src/tui/components/thinking-display.ts` (NEW)

**Purpose:** Render thinking blocks in TUI

**Implementation:**
```typescript
import { Text, Box } from '@mariozechner/pi-tui';

export interface ThinkingBlock {
  type: 'thinking';
  content: string;
  timestamp: number;
  duration?: number;
  interleaved?: boolean;
}

export function renderThinkingBlock(block: ThinkingBlock): any {
  const duration = block.duration 
    ? ` (${block.duration}s)` 
    : '';
  
  return Box.create({
    children: [
      Text.create(`🤔 Thinking${duration}`, {
        color: 'gray',
        italic: true,
        bold: true
      }),
      Text.create(block.content, {
        color: 'gray',
        italic: true
      })
    ],
    border: {
      type: 'rounded',
      color: 'gray'
    },
    padding: 1,
    margin: { top: 1, bottom: 1 }
  });
}

export function renderInterleavedThinking(
  blocks: ThinkingBlock[]
): any[] {
  return blocks.map(block => renderThinkingBlock(block));
}
```

#### **3.2 Chat Log Enhancement**
**File:** `src/tui/components/chat-log.ts` (MODIFY)

**Purpose:** Support thinking blocks in chat log

**Changes:**
```typescript
// Add thinking block rendering
export class ChatLog {
  private thinkingBlocks: ThinkingBlock[] = [];
  private showThinking = true;
  
  addThinkingBlock(content: string, interleaved = false) {
    const block: ThinkingBlock = {
      type: 'thinking',
      content,
      timestamp: Date.now(),
      interleaved
    };
    
    this.thinkingBlocks.push(block);
    
    if (this.showThinking && interleaved) {
      this.renderBlock(block);
    }
  }
  
  toggleThinking() {
    this.showThinking = !this.showThinking;
    this.render();
  }
  
  private renderBlock(block: ThinkingBlock) {
    const widget = renderThinkingBlock(block);
    this.container.append(widget);
  }
}
```

---

### **PHASE 4: TUI INTEGRATION**

#### **4.1 Thinking Commands**
**File:** `src/tui/commands.ts` (MODIFY)

**Purpose:** Add thinking control commands

**Changes:**
```typescript
const thinkingCommands: SlashCommand[] = [
  {
    name: 'think',
    description: 'Set thinking mode',
    execute: async (args) => {
      const mode = args[0] as ThinkingMode;
      const config = getThinkingManager().getThinkingConfig(currentModel);
      config.mode = mode;
      chatLog.addSystem(`Thinking mode set to: ${mode}`);
    }
  },
  {
    name: 'thinking',
    description: 'Toggle thinking display',
    execute: async () => {
      chatLog.toggleThinking();
      chatLog.addSystem(`Thinking display: ${chatLog.showThinking ? 'ON' : 'OFF'}`);
    }
  },
  {
    name: 'budget',
    description: 'Set thinking budget',
    execute: async (args) => {
      const tokens = parseInt(args[0]);
      const config = getThinkingManager().getThinkingConfig(currentModel);
      config.budgetTokens = tokens;
      chatLog.addSystem(`Thinking budget set to: ${tokens} tokens`);
    }
  }
];
```

---

### **PHASE 5: MODEL SELECTION INTEGRATION**

#### **5.1 Model Selection Enhancement**
**File:** `src/agents/model-selection.ts` (MODIFY)

**Purpose:** Integrate thinking manager with model selection

**Changes:**
```typescript
import { getThinkingManager } from './thinking-manager.js';

export function resolveThinkingDefault(params: {
  model: string;
  config: OpenClawConfig;
}): ThinkingConfig {
  const thinkingManager = getThinkingManager();
  const providerConfig = thinkingManager.getProviderConfig(
    extractProvider(params.model)
  );
  
  const userConfig = params.config.agents?.defaults?.thinkingDefault;
  
  return {
    mode: userConfig as ThinkingMode || providerConfig.defaultMode,
    enabled: userConfig !== 'off',
    interleaved: providerConfig.modes.includes('adaptive'),
    budgetTokens: undefined  // Auto-calculated
  };
}

export function getModelBetas(model: string): string[] {
  const thinkingManager = getThinkingManager();
  return thinkingManager.getBetaHeaders(model);
}
```

---

## 🔧 IMPLEMENTATION STEPS

### **Step 1: Create Core Files**
```bash
# Create thinking types
touch src/config/types.thinking.ts

# Create thinking manager
touch src/agents/thinking-manager.ts

# Create thinking display
touch src/tui/components/thinking-display.ts
```

### **Step 2: Create Provider Adapters**
```bash
# Create provider adapters
touch src/agents/providers/zhipu-adapter.ts
touch src/agents/providers/openrouter-adapter.ts
touch src/agents/providers/lmstudio-adapter.ts
```

### **Step 3: Modify Existing Files**
```bash
# Modify chat-log.ts
# Modify commands.ts
# Modify model-selection.ts
```

### **Step 4: Integration**
```bash
# Wire everything together
# Test with each provider
```

---

## 📊 EXPECTED RESULTS

| Feature | Before | After | Improvement |
|---------|--------|-------|-------------|
| **Thinking Modes** | 4 | 6 | +50% |
| **Provider Support** | 1 | 4 | +300% |
| **Interleaved Display** | ❌ | ✅ | NEW |
| **Budget Control** | ❌ | ✅ | NEW |
| **TUI Controls** | Basic | Advanced | +200% |

---

## ✅ VERIFICATION CHECKLIST

- [ ] Thinking types defined
- [ ] Thinking manager implemented
- [ ] Provider adapters created
- [ ] Interleaved display working
- [ ] TUI commands added
- [ ] Model selection integrated
- [ ] Test with Zhipu
- [ ] Test with OpenRouter
- [ ] Test with LM Studio
- [ ] No breaking changes
- [ ] Documentation complete

---

**READY FOR IMPLEMENTATION** 🚀
