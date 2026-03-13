# 📦 PROMPT-CACHING-SCOPE-2026-01-05 - COMPLETE ANALYSIS

**Based on:** Deep search of Claude Code source (447k lines) + Official Documentation  
**Date:** 2026-02-24  
**Beta Header:** `prompt-caching-scope-2026-01-05`

---

## 📋 EXECUTIVE SUMMARY

**Prompt Caching Scope** is a **beta feature** that enables **fine-grained cache control** with explicit cache breakpoints for optimal prompt caching.

### **Key Points:**
- **Beta Date:** January 5, 2026
- **Purpose:** Fine-grained cache control with explicit breakpoints
- **Benefit:** 45-80% API cost reduction, 13-31% faster time to first token
- **Control:** Place `cache_control` on individual content blocks
- **Breakpoints:** Up to 4 per request
- **TTL Options:** 5-minute (default), 1-hour (2x price)

---

## 🎯 WHAT IT DOES

### **Traditional Caching:**
```json
{
  "cache_control": {"type": "ephemeral"},  // Single breakpoint at end
  "messages": [...]
}
```
- One cache breakpoint
- Caches everything up to breakpoint
- Limited optimization

### **Fine-Grained Caching (NEW):**
```json
{
  "tools": [{
    "name": "search",
    "cache_control": {"type": "ephemeral"}  // Breakpoint 1
  }],
  "system": [{
    "type": "text",
    "text": "Instructions...",
    "cache_control": {"type": "ephemeral"}  // Breakpoint 2
  }],
  "messages": [{
    "role": "user",
    "content": [{
      "type": "text",
      "text": "Query",
      "cache_control": {"type": "ephemeral"}  // Breakpoint 3
    }]
  }]
}
```
- Multiple breakpoints (up to 4)
- Cache different sections independently
- Optimal cost savings

---

## 🔧 HOW IT WORKS (From Source Code)

### **1. Beta Header Definition**

From Claude Code source (line 1740):
```javascript
EfT = "prompt-caching-scope-2026-01-05"
```

### **2. Beta Header Activation**

From source (line 65863):
```javascript
if (B) R.push(EfT);
```

**Translation:**
- `B` = Some condition (likely model support or feature flag)
- `R.push(EfT)` = Add beta header to request

### **3. Cache Control Placement**

From documentation:
```javascript
// Can be placed on:
- tools array
- system content blocks
- message content blocks
- tool_use blocks
- tool_result blocks
```

---

## 📊 CACHE BREAKPOINT RULES

| Aspect | Limit |
|--------|-------|
| **Maximum breakpoints** | 4 per request |
| **Lookback window** | 20 blocks before each breakpoint |
| **Minimum cacheable tokens** | 1024-4096 (varies by model) |
| **Cache availability** | After first response begins |
| **Default TTL** | 5 minutes |
| **Extended TTL** | 1 hour (2x price) |

---

## 🎯 OPTIMAL BREAKPOINT PLACEMENT

### **Recommended Strategy:**

```
┌─────────────────────────────────────────────────────────┐
│  BREAKPOINT LOCATIONS (in order)                        │
├─────────────────────────────────────────────────────────┤
│  1. End of tool definitions (rarely changes)            │
│  2. End of system instructions (stable)                 │
│  3. Before editable/dynamic content                     │
│  4. End of conversation (maximize cache hits)           │
└─────────────────────────────────────────────────────────┘
```

### **Example: Multi-Frequency Caching**

```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read a file",
      "cache_control": {"type": "ephemeral", "ttl": "1h"}  // Long TTL
    }
  ],
  "system": [
    {
      "type": "text",
      "text": "You are a helpful coding assistant.",
      "cache_control": {"type": "ephemeral", "ttl": "1h"}  // Long TTL
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Long context document...",
          "cache_control": {"type": "ephemeral", "ttl": "5m"}  // Short TTL
        },
        {
          "type": "text",
          "text": "User query",
          "cache_control": {"type": "ephemeral", "ttl": "5m"}  // Short TTL
        }
      ]
    }
  ]
}
```

---

## 💰 PRICING

### **Cache Operations:**

| Model | Base Input | 5m Write | 1h Write | Read | Output |
|-------|-----------|----------|----------|------|--------|
| **Opus 4.6** | $5/MTok | $6.25/MTok | $10/MTok | $0.50/MTok | $25/MTok |
| **Sonnet 4.6** | $3/MTok | $3.75/MTok | $6/MTok | $0.30/MTok | $15/MTok |
| **Haiku 4.5** | $1/MTok | $1.25/MTok | $2/MTok | $0.10/MTok | $5/MTok |

### **Multipliers:**
- **5m cache write:** 1.25× base input price
- **1h cache write:** 2× base input price
- **Cache read:** 0.1× base input price (90% savings!)

### **Example Savings:**

**Without Caching:**
```
100,000 tokens × $5/MTok = $0.50 per request
100 requests = $50.00
```

**With Caching (90% hit rate):**
```
Cache read:  90,000 × $0.50/MTok = $0.045
Cache miss:  10,000 × $5/MTok    = $0.05
Total per request: $0.095
100 requests = $9.50 (81% savings!)
```

---

## 📈 TRACKING CACHE PERFORMANCE

### **Response Fields:**

```json
{
  "usage": {
    "input_tokens": 50,                    // Not cached
    "cache_read_input_tokens": 100000,     // From cache
    "cache_creation_input_tokens": 0,      // Written to cache
    "output_tokens": 500
  }
}
```

### **Total Input Formula:**
```
total_input_tokens = cache_read + cache_creation + input
```

### **Cache Hit Rate:**
```
hit_rate = cache_read / (cache_read + cache_creation + input)
```

**Example:**
```
hit_rate = 100000 / (100000 + 0 + 50) = 99.95%
```

---

## ⚠️ WHAT INVALIDATES CACHE

| Change | Tools | System | Messages |
|--------|-------|--------|----------|
| Tool definitions modified | ✘ | ✘ | ✘ |
| Web search enabled/disabled | ✓ | ✘ | ✘ |
| Citations enabled/disabled | ✓ | ✘ | ✘ |
| Speed setting changed | ✓ | ✘ | ✘ |
| Tool choice changed | ✓ | ✓ | ✘ |
| Images added/removed | ✓ | ✓ | ✘ |
| Thinking parameters changed | ✓ | ✓ | ✘ |

**Key Point:** Cache hits require **100% identical** prompt segments up to and including the `cache_control` block.

---

## 📊 CLAUDE CODE vs OPENCLAW

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Prompt Caching** | ✅ Full support | ❌ Not implemented | HIGH |
| **Fine-Grained Control** | ✅ Yes | ❌ No | HIGH |
| **Cache Breakpoints** | ✅ Up to 4 | ❌ No | HIGH |
| **TTL Options** | ✅ 5m, 1h | ❌ No | HIGH |
| **Cache Tracking** | ✅ Full metrics | ❌ No | HIGH |
| **Auto-Caching** | ✅ Yes | ❌ No | HIGH |

---

## 💡 OPENCLAW INTEGRATION STATUS

### **Current Status:**

OpenClaw **does NOT currently support** prompt caching.

**What OpenClaw Has:**
- ✅ Basic tool support
- ✅ Message handling
- ❌ Prompt caching
- ❌ Cache control
- ❌ Cache breakpoints
- ❌ Cache metrics tracking

### **What's Needed:**

#### **1. Beta Header Support**

```typescript
// src/config/types.agent-runtime.ts
export const CacheControlSchema = z.object({
  type: z.enum(['ephemeral']),
  ttl: z.enum(['5m', '1h']).optional()
});
```

#### **2. Cache Control Injection**

```typescript
// src/agents/prompt-caching.ts
export function applyCacheControl(prompt: any, options: CacheOptions): any {
  return {
    ...prompt,
    cache_control: {
      type: 'ephemeral',
      ttl: options.ttl || '5m'
    }
  };
}
```

#### **3. Breakpoint Management**

```typescript
// src/agents/cache-breakpoints.ts
export class CacheBreakpointManager {
  private breakpoints: Breakpoint[] = [];
  
  addBreakpoint(position: number, ttl: '5m' | '1h' = '5m'): void {
    if (this.breakpoints.length >= 4) {
      throw new Error('Maximum 4 breakpoints per request');
    }
    this.breakpoints.push({ position, ttl });
  }
  
  applyToPrompt(prompt: any): any {
    // Apply cache_control at breakpoint positions
  }
}
```

#### **4. Cache Metrics Tracking**

```typescript
// src/agents/cache-metrics.ts
export interface CacheMetrics {
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  hitRate: number;
  costSavings: number;
}

export function calculateCacheMetrics(usage: any): CacheMetrics {
  const total = usage.cache_read_input_tokens + 
                usage.cache_creation_input_tokens + 
                usage.input_tokens;
  
  return {
    cacheReadTokens: usage.cache_read_input_tokens,
    cacheCreationTokens: usage.cache_creation_input_tokens,
    inputTokens: usage.input_tokens,
    hitRate: usage.cache_read_input_tokens / total,
    costSavings: calculateSavings(usage)
  };
}
```

---

## 🎯 IMPLEMENTATION RECOMMENDATION

### **Priority:** HIGH

**Why:**
- ✅ **45-80% cost reduction** - Significant savings
- ✅ **13-31% faster** - Better user experience
- ✅ **Essential for agentic workflows** - Long conversations
- ⚠️ **Complex implementation** - Requires prompt restructuring

### **Implementation Steps:**

1. **Add beta header support** (LOW effort) - 2 hours
2. **Add cache control types** (LOW effort) - 2 hours
3. **Add breakpoint manager** (MEDIUM effort) - 4 hours
4. **Add cache metrics** (MEDIUM effort) - 4 hours
5. **Integrate with existing tools** (HIGH effort) - 8 hours
6. **Test and optimize** (MEDIUM effort) - 4 hours

**Total:** 24 hours (~3-4 days)

---

## 📝 BEST PRACTICES

### **For OpenClaw Implementation:**

1. **Start with auto-caching** for multi-turn conversations
2. **Add explicit breakpoints** for tool definitions
3. **Cache system instructions** separately from messages
4. **Use 1h TTL** for stable content (tools, system)
5. **Use 5m TTL** for dynamic content (messages)
6. **Track cache metrics** to optimize strategy
7. **Place static content first** (tools → system → messages)
8. **Add breakpoint at conversation end** for max hits

---

## 🎉 CONCLUSION

**Prompt Caching Scope (`prompt-caching-scope-2026-01-05`)** is:

- ✅ **Powerful** - 45-80% cost reduction
- ✅ **Fast** - 13-31% faster responses
- ✅ **Flexible** - Fine-grained control
- ✅ **Essential** - For agentic workflows
- ⚠️ **Not in OpenClaw** - Needs implementation

**For OpenClaw:**
- Current caching support: NONE
- Implementation priority: HIGH
- Estimated effort: 3-4 days
- ROI: Very high (cost savings pay for development)

**Recommendation:** Implement prompt caching support to enable significant cost savings and performance improvements for agentic workflows.

---

**ANALYSIS COMPLETE** 🎯
