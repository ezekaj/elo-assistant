# 📦 PROMPT CACHING IMPLEMENTATION PLAN

**Goal:** Implement fine-grained prompt caching with breakpoints for OpenClaw  
**Date:** 2026-02-24  
**Status:** Ready for Implementation  

---

## 📋 EXECUTIVE SUMMARY

This plan implements **Claude Code-style prompt caching** with:
- ✅ Fine-grained cache control
- ✅ Up to 4 cache breakpoints per request
- ✅ TTL options (5m, 1h)
- ✅ Cache metrics tracking
- ✅ 45-80% cost reduction target
- ✅ 13-31% faster responses

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW AGENT                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Prompt Builder                                       │ │
│  │  - Builds messages with cache_control                 │ │
│  │  - Places breakpoints strategically                   │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           CACHE BREAKPOINT MANAGER (NEW)                    │
│  - Manages up to 4 breakpoints per request                  │
│  - Tracks TTL per breakpoint                                │
│  - Validates breakpoint placement                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              CACHE METRICS TRACKER (NEW)                    │
│  - Tracks cache_read_tokens                                 │
│  - Tracks cache_creation_tokens                             │
│  - Calculates hit rate & savings                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  API REQUEST                                │
│  - Includes cache_control on blocks                         │
│  - Includes beta header                                     │
│  - Returns cache metrics                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### **PHASE 1: CORE TYPES & CONFIG**

#### **1.1 Cache Control Types**
**File:** `src/config/types.cache.ts` (NEW)

**Purpose:** Define cache control types and TTL options

**Key Types:**
```typescript
export type CacheTTL = '5m' | '1h';

export interface CacheControl {
  type: 'ephemeral';
  ttl?: CacheTTL;
}

export interface CacheBreakpoint {
  position: number;  // Block index
  ttl: CacheTTL;
  description?: string;
}

export interface CacheMetrics {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  hitRate: number;
  estimatedSavings: number;
}
```

#### **1.2 Provider Cache Config**
**File:** `src/config/types.cache.ts` (continued)

**Provider-Specific Config:**
```typescript
export interface ProviderCacheConfig {
  supported: boolean;
  maxBreakpoints: number;
  minCacheableTokens: number;
  ttlOptions: CacheTTL[];
  betaHeader?: string;
  pricing: {
    baseInput: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
  };
}

export const PROVIDER_CACHE_CONFIGS: Record<string, ProviderCacheConfig> = {
  'claude': {
    supported: true,
    maxBreakpoints: 4,
    minCacheableTokens: 1024,
    ttlOptions: ['5m', '1h'],
    betaHeader: 'prompt-caching-scope-2026-01-05',
    pricing: {
      baseInput: 5,
      cacheWrite5m: 6.25,
      cacheWrite1h: 10,
      cacheRead: 0.50
    }
  },
  'zhipu': {
    supported: false,  // Not supported yet
    maxBreakpoints: 0,
    minCacheableTokens: 0,
    ttlOptions: [],
    pricing: { baseInput: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }
  },
  // ... other providers
};
```

---

### **PHASE 2: CACHE BREAKPOINT MANAGER**

#### **2.1 Breakpoint Manager Class**
**File:** `src/agents/cache-breakpoint-manager.ts` (NEW)

**Purpose:** Manage cache breakpoints for optimal caching

**Key Class:**
```typescript
export class CacheBreakpointManager {
  private breakpoints: CacheBreakpoint[] = [];
  private maxBreakpoints = 4;
  
  // Add breakpoint at specific position
  addBreakpoint(position: number, ttl: CacheTTL = '5m', description?: string): void;
  
  // Add breakpoint at end of tools
  addToolsBreakpoint(ttl?: CacheTTL): void;
  
  // Add breakpoint at end of system
  addSystemBreakpoint(ttl?: CacheTTL): void;
  
  // Add breakpoint at end of messages
  addMessagesBreakpoint(ttl?: CacheTTL): void;
  
  // Validate breakpoints
  validate(): { valid: boolean; errors: string[] };
  
  // Get breakpoints for API request
  getBreakpoints(): CacheBreakpoint[];
  
  // Clear all breakpoints
  clear(): void;
}
```

**Implementation Details:**
```typescript
export class CacheBreakpointManager {
  addBreakpoint(position: number, ttl: CacheTTL = '5m', description?: string): void {
    if (this.breakpoints.length >= this.maxBreakpoints) {
      throw new Error(`Maximum ${this.maxBreakpoints} breakpoints per request`);
    }
    
    // Validate TTL ordering (longer TTLs must come first)
    if (ttl === '5m' && this.breakpoints.some(bp => bp.ttl === '1h')) {
      throw new Error('5m TTL cannot come after 1h TTL');
    }
    
    this.breakpoints.push({ position, ttl, description });
  }
  
  addToolsBreakpoint(ttl: CacheTTL = '1h'): void {
    // Tools are typically at position 0
    this.addBreakpoint(0, ttl, 'Tool definitions');
  }
  
  addSystemBreakpoint(ttl: CacheTTL = '1h'): void {
    // System is typically at position 1
    this.addBreakpoint(1, ttl, 'System instructions');
  }
  
  addMessagesBreakpoint(ttl: CacheTTL = '5m'): void {
    // Messages are at the end
    this.addBreakpoint(-1, ttl, 'Conversation messages');
  }
  
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (this.breakpoints.length > this.maxBreakpoints) {
      errors.push(`Too many breakpoints: ${this.breakpoints.length} > ${this.maxBreakpoints}`);
    }
    
    // Check TTL ordering
    let lastTTL: CacheTTL | null = null;
    for (const bp of this.breakpoints) {
      if (lastTTL === '5m' && bp.ttl === '1h') {
        errors.push('1h TTL cannot come after 5m TTL');
      }
      lastTTL = bp.ttl;
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

---

### **PHASE 3: CACHE METRICS TRACKER**

#### **3.1 Metrics Tracker Class**
**File:** `src/agents/cache-metrics-tracker.ts` (NEW)

**Purpose:** Track and calculate cache performance metrics

**Key Class:**
```typescript
export class CacheMetricsTracker {
  private totalReadTokens = 0;
  private totalCreationTokens = 0;
  private totalInputTokens = 0;
  private requestCount = 0;
  
  // Record metrics from API response
  recordMetrics(usage: APIUsage): void;
  
  // Get current metrics
  getMetrics(): CacheMetrics;
  
  // Get hit rate
  getHitRate(): number;
  
  // Calculate cost savings
  calculateSavings(model: string): number;
  
  // Reset metrics
  reset(): void;
}
```

**Implementation:**
```typescript
export class CacheMetricsTracker {
  recordMetrics(usage: {
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    input_tokens: number;
  }): void {
    this.totalReadTokens += usage.cache_read_input_tokens || 0;
    this.totalCreationTokens += usage.cache_creation_input_tokens || 0;
    this.totalInputTokens += usage.input_tokens;
    this.requestCount++;
  }
  
  getMetrics(): CacheMetrics {
    const total = this.totalReadTokens + this.totalCreationTokens + this.totalInputTokens;
    const hitRate = total > 0 ? this.totalReadTokens / total : 0;
    
    return {
      cacheReadTokens: this.totalReadTokens,
      cacheCreationTokens: this.totalCreationTokens,
      inputTokens: this.totalInputTokens,
      hitRate,
      estimatedSavings: this.calculateSavings('claude-opus-4-6')
    };
  }
  
  getHitRate(): number {
    const total = this.totalReadTokens + this.totalCreationTokens + this.totalInputTokens;
    return total > 0 ? this.totalReadTokens / total : 0;
  }
  
  calculateSavings(model: string): number {
    const pricing = PROVIDER_CACHE_CONFIGS['claude'].pricing;
    
    // Cost without caching
    const totalTokens = this.totalReadTokens + this.totalCreationTokens + this.totalInputTokens;
    const costWithoutCache = totalTokens * pricing.baseInput / 1000000;
    
    // Cost with caching
    const costWithCache = (
      this.totalReadTokens * pricing.cacheRead +
      this.totalCreationTokens * pricing.cacheWrite5m +
      this.totalInputTokens * pricing.baseInput
    ) / 1000000;
    
    return costWithoutCache - costWithCache;
  }
  
  reset(): void {
    this.totalReadTokens = 0;
    this.totalCreationTokens = 0;
    this.totalInputTokens = 0;
    this.requestCount = 0;
  }
}
```

---

### **PHASE 4: PROMPT BUILDER ENHANCEMENT**

#### **4.1 Cache-Aware Prompt Builder**
**File:** `src/agents/prompt-builder.ts` (MODIFY)

**Purpose:** Build prompts with cache_control blocks

**Changes:**
```typescript
import { CacheBreakpointManager } from './cache-breakpoint-manager.js';
import type { CacheControl } from '../config/types.cache.js';

export function buildPromptWithCaching(
  messages: any[],
  tools?: any[],
  system?: string,
  cacheManager?: CacheBreakpointManager
): any {
  const result: any = {
    messages,
    tools,
    system
  };
  
  // Apply cache_control to blocks at breakpoint positions
  if (cacheManager) {
    const breakpoints = cacheManager.getBreakpoints();
    
    for (const bp of breakpoints) {
      if (bp.position === 0 && tools) {
        // Apply to tools
        tools[tools.length - 1].cache_control = {
          type: 'ephemeral',
          ttl: bp.ttl
        };
      } else if (bp.position === 1 && system) {
        // Apply to system
        if (Array.isArray(system)) {
          system[system.length - 1].cache_control = {
            type: 'ephemeral',
            ttl: bp.ttl
          };
        }
      } else if (bp.position === -1 && messages) {
        // Apply to last message
        const lastMessage = messages[messages.length - 1];
        if (Array.isArray(lastMessage.content)) {
          lastMessage.content[lastMessage.content.length - 1].cache_control = {
            type: 'ephemeral',
            ttl: bp.ttl
          };
        }
      }
    }
  }
  
  return result;
}
```

---

### **PHASE 5: API INTEGRATION**

#### **5.1 Beta Header Support**
**File:** `src/agents/model-selection.ts` (MODIFY)

**Purpose:** Add beta headers for caching

**Changes:**
```typescript
export function getModelBetas(params: {
  provider: string;
  model: string;
  enableCaching?: boolean;
}): string[] {
  const betas: string[] = [];
  
  // Add caching beta header if enabled
  if (params.enableCaching) {
    const providerConfig = PROVIDER_CACHE_CONFIGS[params.provider];
    if (providerConfig?.betaHeader) {
      betas.push(providerConfig.betaHeader);
    }
  }
  
  // Add other beta headers (thinking, etc.)
  // ... existing code ...
  
  return betas;
}
```

#### **5.2 API Request Enhancement**
**File:** `src/gateway/api-client.ts` (MODIFY)

**Purpose:** Include cache_control in API requests

**Changes:**
```typescript
async function sendMessage(request: {
  messages: any[];
  tools?: any[];
  system?: string;
  cacheControl?: CacheControl;
  betas?: string[];
}): Promise<any> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01'
  };
  
  // Add beta headers
  if (request.betas && request.betas.length > 0) {
    headers['anthropic-beta'] = request.betas.join(',');
  }
  
  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...request,
      // cache_control is already in messages/tools/system
    })
  });
  
  const result = await response.json();
  
  // Record cache metrics
  if (result.usage) {
    cacheMetricsTracker.recordMetrics(result.usage);
  }
  
  return result;
}
```

---

### **PHASE 6: TUI INTEGRATION**

#### **6.1 Cache Status Display**
**File:** `src/tui/components/cache-status.ts` (NEW)

**Purpose:** Display cache metrics in TUI

**Component:**
```typescript
import { Text, Box } from '@mariozechner/pi-tui';
import { cacheMetricsTracker } from '../cache-metrics-tracker.js';

export function renderCacheStatus(): any {
  const metrics = cacheMetricsTracker.getMetrics();
  
  return Box.create({
    children: [
      Text.create(`Cache Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%`, {
        color: metrics.hitRate > 0.8 ? 'green' : 'yellow'
      }),
      Text.create(`Read: ${metrics.cacheReadTokens.toLocaleString()} tokens`),
      Text.create(`Creation: ${metrics.cacheCreationTokens.toLocaleString()} tokens`),
      Text.create(`Savings: $${metrics.estimatedSavings.toFixed(4)}`)
    ],
    border: { type: 'rounded', color: 'gray' },
    padding: 1,
    margin: { top: 1 }
  });
}
```

#### **6.2 Cache Commands**
**File:** `src/tui/commands.ts` (MODIFY)

**Purpose:** Add cache control commands

**Changes:**
```typescript
const cacheCommands: SlashCommand[] = [
  {
    name: 'cache',
    description: 'Show cache metrics',
    execute: async () => {
      const metrics = cacheMetricsTracker.getMetrics();
      chatLog.addSystem(
        `Cache Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%\n` +
        `Read: ${metrics.cacheReadTokens.toLocaleString()} tokens\n` +
        `Creation: ${metrics.cacheCreationTokens.toLocaleString()} tokens\n` +
        `Savings: $${metrics.estimatedSavings.toFixed(4)}`
      );
    }
  },
  {
    name: 'cache-reset',
    description: 'Reset cache metrics',
    execute: async () => {
      cacheMetricsTracker.reset();
      chatLog.addSystem('Cache metrics reset');
    }
  }
];
```

---

## 🔧 IMPLEMENTATION STEPS

### **Step 1: Create Core Types**
```bash
touch src/config/types.cache.ts
```

**Time:** 1 hour  
**Files:** 1  
**Lines:** ~200

### **Step 2: Create Breakpoint Manager**
```bash
touch src/agents/cache-breakpoint-manager.ts
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~300

### **Step 3: Create Metrics Tracker**
```bash
touch src/agents/cache-metrics-tracker.ts
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~250

### **Step 4: Modify Prompt Builder**
```bash
# Modify existing file
edit src/agents/prompt-builder.ts
```

**Time:** 2 hours  
**Files:** 1 (modified)  
**Lines:** ~100 added

### **Step 5: Modify Model Selection**
```bash
# Modify existing file
edit src/agents/model-selection.ts
```

**Time:** 1 hour  
**Files:** 1 (modified)  
**Lines:** ~50 added

### **Step 6: Modify API Client**
```bash
# Modify existing file
edit src/gateway/api-client.ts
```

**Time:** 2 hours  
**Files:** 1 (modified)  
**Lines:** ~100 added

### **Step 7: Create TUI Components**
```bash
touch src/tui/components/cache-status.ts
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~150

### **Step 8: Add TUI Commands**
```bash
# Modify existing file
edit src/tui/commands.ts
```

**Time:** 1 hour  
**Files:** 1 (modified)  
**Lines:** ~50 added

### **Step 9: Integration & Testing**
```bash
# Wire everything together
# Test with mock API responses
# Verify cache metrics
```

**Time:** 4 hours  
**Files:** All  
**Lines:** N/A

### **Step 10: Documentation**
```bash
touch docs/prompt-caching.md
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~500

---

## 📊 TOTAL EFFORT

| Phase | Time | Files | Lines |
|-------|------|-------|-------|
| Core Types | 1h | 1 | 200 |
| Breakpoint Manager | 2h | 1 | 300 |
| Metrics Tracker | 2h | 1 | 250 |
| Prompt Builder | 2h | 1 | 100 |
| Model Selection | 1h | 1 | 50 |
| API Client | 2h | 1 | 100 |
| TUI Components | 2h | 1 | 150 |
| TUI Commands | 1h | 1 | 50 |
| Integration | 4h | All | N/A |
| Documentation | 2h | 1 | 500 |
| **TOTAL** | **19h** | **10** | **~1700** |

**Timeline:** 2-3 days (full-time) or 1 week (part-time)

---

## ✅ VERIFICATION CHECKLIST

- [ ] Types defined and exported
- [ ] Breakpoint manager implemented
- [ ] Metrics tracker implemented
- [ ] Prompt builder enhanced
- [ ] Model selection updated
- [ ] API client enhanced
- [ ] TUI components created
- [ ] TUI commands added
- [ ] Integration complete
- [ ] Tests passing
- [ ] Documentation complete
- [ ] No breaking changes
- [ ] Cache metrics accurate
- [ ] Beta headers working
- [ ] Cost savings calculated

---

## 📈 EXPECTED RESULTS

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **API Cost** | 100% | 20-55% | 45-80% savings |
| **Time to First Token** | 100% | 69-87% | 13-31% faster |
| **Cache Hit Rate** | 0% | 80-95% | New metric |
| **Breakpoints** | 0 | Up to 4 | New feature |
| **TTL Options** | None | 5m, 1h | New feature |

---

## 🎯 SUCCESS CRITERIA

1. ✅ Cache hit rate > 80%
2. ✅ Cost savings > 45%
3. ✅ No breaking changes
4. ✅ All tests passing
5. ✅ TUI displays metrics
6. ✅ Breakpoints work correctly
7. ✅ TTL options functional
8. ✅ Beta headers sent correctly

---

**READY FOR IMPLEMENTATION** 🚀
