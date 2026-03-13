# 🧠 ADAPTIVE-THINKING-2026-01-28 - COMPLETE ANALYSIS

**Based on:** Deep search of Claude Code source (447k lines) + Official Documentation  
**Date:** 2026-02-24  
**Beta Header:** `adaptive-thinking-2026-01-28`

---

## 📋 EXECUTIVE SUMMARY

**Adaptive Thinking** is a **revolutionary thinking mode** for Claude Opus 4.6 where Claude **automatically decides** when and how much to think based on request complexity.

### **Key Points:**
- **Beta Date:** January 28, 2026
- **Purpose:** Dynamic thinking depth (Claude decides, not you)
- **Models:** Opus 4.6 ONLY (recommended), deprecated on older models
- **Effort Levels:** low, medium, high (default), max
- **Key Feature:** Enables **interleaved thinking** (thinks between tool calls)
- **Status:** RECOMMENDED for Opus 4.6, replaces manual `budget_tokens`

---

## 🎯 WHAT IT DOES

### **Traditional (Manual) Thinking:**
```
You: "Set budget_tokens: 10000"
Claude: Thinks for exactly 10000 tokens (whether needed or not)
```

### **Adaptive Thinking:**
```
You: "Use adaptive thinking"
Claude: Evaluates complexity → Decides thinking depth automatically
  - Simple query → 500 tokens
  - Complex task → 15000 tokens
  - Agentic workflow → Thinks between each tool call
```

**Key Difference:** Claude **optimizes thinking** for each request instead of using a fixed budget.

---

## 🔧 HOW IT WORKS (From Source Code)

### **1. Beta Header Definition**

From Claude Code source (line 1739):
```javascript
SaA = "adaptive-thinking-2026-01-28"
```

### **2. Deprecation Warning**

From source (line 124349):
```javascript
if (B.model in kg0 && B.thinking && B.thinking.type === "enabled") {
  console.warn(`Using Claude with ${B.model} and 'thinking.type=enabled' 
                is deprecated. Use 'thinking.type=adaptive' instead 
                which results in better model performance...`);
}
```

**`kg0`** = Set of Opus 4.6 model IDs

**Translation:** Using `thinking.type=enabled` on Opus 4.6 triggers a deprecation warning. Use `adaptive` instead.

### **3. Effort Level Configuration**

From documentation:
```javascript
output_config: {
  effort: "high"  // or "low", "medium", "max"
}
```

---

## 📊 EFFORT LEVELS

| Level | Thinking Behavior | When to Use | Token Usage |
|-------|-------------------|-------------|-------------|
| **low** | Skips thinking for simple tasks | Quick edits, simple questions | ~500-2000 |
| **medium** | Moderate thinking | Standard development tasks | ~2000-8000 |
| **high** (default) | Almost always thinks | Complex debugging, multi-file changes | ~8000-15000 |
| **max** | Maximum depth, no constraints | Architecture decisions, edge cases | ~15000+ |

### **Claude Code Trigger Words:**

| Trigger | Maps To | Effect |
|---------|---------|--------|
| (none) | `high` | Default behavior |
| `think` | `high` | Nudge toward thinking |
| `think hard` | `high` | Emphasis on thinking |
| `think harder` | `max` | Leaning toward maximum |
| `ultrathink` | `max` | Maximum depth |

---

## 📝 API FORMAT

### **Opus 4.6 (Adaptive Thinking - Recommended):**

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=16000,
    thinking={
        "type": "adaptive"  # ← Key parameter
    },
    output_config={
        "effort": "high"  # Optional: "low" | "medium" | "high" | "max"
    },
    messages=[{"role": "user", "content": "Your prompt"}]
)
```

### **Older Models (Manual Thinking - Deprecated on 4.6):**

```python
response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000  # ← Manual budget
    },
    messages=[{"role": "user", "content": "Your prompt"}]
)
```

### **Claude Code CLI:**

```bash
# Set effort level
/effort medium

# Use in conversation
claude -p "Fix this bug" --effort high
```

---

## 🎯 MODEL SUPPORT

| Model | Adaptive Thinking | Manual Thinking | Status |
|-------|-------------------|-----------------|--------|
| **claude-opus-4-6** | ✅ **Recommended** | ⚠️ Deprecated | Use adaptive |
| claude-opus-4-5 | ❌ Not supported | ✅ Required | Use manual |
| claude-sonnet-4-5 | ❌ Not supported | ✅ Required | Use manual |
| claude-3-7-sonnet | ❌ Not supported | ✅ Required | Use manual |

**Key Point:** Adaptive thinking is **Opus 4.6 exclusive**.

---

## 🔄 ADAPTIVE vs. MANUAL vs. DISABLED

| Mode | Configuration | Pros | Cons | Best For |
|------|---------------|------|------|----------|
| **Adaptive** | `thinking: {type: "adaptive"}` | Auto-optimizes, interleaved thinking, simpler config | Opus 4.6 only | Opus 4.6 users |
| **Manual** | `thinking: {type: "enabled", budget_tokens: N}` | Precise control, all models | Requires tuning, no interleaving | Older models |
| **Disabled** | Omit thinking parameter | Fastest, cheapest | No extended reasoning | Simple queries |

---

## 🚀 KEY FEATURES

### **1. Interleaved Thinking**

**Traditional:** Think → Act → Think → Act (sequential)

**Adaptive:** Think → Act → **Think** → Act → **Think** → Act (interleaved)

**Benefit:** Claude can **reconsider strategy between tool calls**, making it much more effective for agentic workflows.

### **2. Automatic Depth Adjustment**

**Example:**
```
Request 1: "What's 2+2?"
→ Claude thinks: 50 tokens (minimal)
→ Response: "4"

Request 2: "Debug this race condition"
→ Claude thinks: 12000 tokens (deep)
→ Response: Detailed analysis with fix
```

### **3. Effort Guidance**

You can guide (not force) thinking depth:
```python
# Soft guidance
output_config={"effort": "medium"}

# Hard limit
max_tokens=16000  # Absolute cap
```

---

## ⚠️ IMPORTANT CONSIDERATIONS

### **1. Billing**

**You're charged for FULL thinking tokens**, even though:
- Claude 4 models return **summarized thinking** (not full thought process)
- Visible token count ≠ billed token count

**Example:**
```
Visible thinking: 2000 tokens (summarized)
Billed thinking: 10000 tokens (actual)
```

### **2. Redacted Thinking**

Some thinking may be **encrypted** by safety systems:
```
[Thinking redacted for safety]
```
- Doesn't affect response quality
- Still billed at full cost

### **3. Cache Impact**

**Switching thinking modes breaks prompt cache:**
- adaptive → enabled: Cache miss
- enabled → disabled: Cache miss
- adaptive → adaptive: Cache hit

**Impact:** Increased latency and cost on cache misses.

### **4. Tuning**

If Claude thinks too much or too little:

**Option 1:** Adjust effort level
```python
output_config={"effort": "low"}  # Less thinking
```

**Option 2:** Add system prompt guidance
```
System: "For simple tasks, respond quickly without extended thinking."
```

---

## 📈 COMPARISON: CLAUDE CODE vs OPENCLAW

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Adaptive Thinking** | ✅ Full support | ❌ Not implemented | HIGH |
| **Effort Levels** | ✅ 4 levels | ⚠️ 5 modes (different) | MEDIUM |
| **Interleaved Thinking** | ✅ Auto on Opus 4.6 | ⚠️ Partial | MEDIUM |
| **Beta Header** | ✅ `adaptive-thinking-2026-01-28` | ❌ Not supported | HIGH |
| **Deprecation Warning** | ✅ Yes | ❌ No | LOW |
| **Trigger Words** | ✅ `think`, `ultrathink` | ❌ No | MEDIUM |

---

## 💡 OPENCLAW INTEGRATION STATUS

### **Current Status:**

OpenClaw **does NOT currently support** adaptive thinking.

**What OpenClaw Has:**
- ✅ Basic thinking modes (off, minimal, low, medium, high)
- ✅ Thinking configuration
- ⚠️ Universal thinking manager (from previous implementation)
- ❌ Adaptive thinking mode
- ❌ Effort levels
- ❌ Beta header support for adaptive thinking
- ❌ Interleaved thinking support

### **What's Needed:**

#### **1. Add Adaptive Thinking Mode**

```typescript
// src/config/types.thinking.ts
export type ThinkingMode = 
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'adaptive';  // ← NEW
```

#### **2. Add Beta Header Support**

```typescript
// src/agents/thinking-manager.ts
export const PROVIDER_THINKING_CONFIGS = {
  'claude': {
    supported: true,
    modes: ['off', 'minimal', 'low', 'medium', 'high', 'adaptive'],
    budgetSupport: true,
    betaHeader: 'adaptive-thinking-2026-01-28',  // ← NEW
    defaultMode: 'adaptive'  // ← Changed from 'low'
  }
};
```

#### **3. Add Effort Level Support**

```typescript
// src/config/types.thinking.ts
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

export interface ThinkingConfig {
  mode: ThinkingMode;
  effort?: EffortLevel;  // ← NEW
  // ... existing fields
}
```

#### **4. Add Deprecation Warning**

```typescript
// src/agents/model-selection.ts
if (model.includes('opus-4-6') && thinking.mode === 'enabled') {
  log.warn('thinking.type=enabled is deprecated on Opus 4.6. Use adaptive instead.');
}
```

---

## 🎯 IMPLEMENTATION RECOMMENDATION

### **Priority:** HIGH

**Why:**
- ✅ **Opus 4.6 is the latest model** - should support its key features
- ✅ **Better performance** - adaptive thinking outperforms manual
- ✅ **Interleaved thinking** - crucial for agentic workflows
- ✅ **Simpler config** - no need to tune budget_tokens
- ⚠️ **Requires Opus 4.6** - limited model support

### **Implementation Steps:**

1. **Add adaptive mode to types** (LOW effort) - 1 hour
2. **Add beta header support** (LOW effort) - 1 hour
3. **Add effort levels** (MEDIUM effort) - 2 hours
4. **Add deprecation warning** (LOW effort) - 1 hour
5. **Update thinking manager** (MEDIUM effort) - 2 hours
6. **Test with Opus 4.6** (MEDIUM effort) - 2 hours

**Total:** 9 hours (~1-2 days)

---

## 📝 CONCLUSION

**Adaptive Thinking (`adaptive-thinking-2026-01-28`)** is:

- ✅ **Revolutionary** - Claude decides thinking depth automatically
- ✅ **Opus 4.6 exclusive** - key differentiator for latest model
- ✅ **Interleaved** - thinks between tool calls (crucial for agents)
- ✅ **Recommended** - replaces manual `budget_tokens` on Opus 4.6
- ⚠️ **Not yet in OpenClaw** - needs implementation

**For OpenClaw:**
- Current thinking support: GOOD (5 modes)
- Missing adaptive support: MEDIUM gap
- Implementation effort: LOW-MEDIUM (1-2 days)
- Priority: HIGH (Opus 4.6 is latest model)

**Recommendation:** Implement adaptive thinking support to fully support Opus 4.6 and enable interleaved thinking for agentic workflows.

---

**ANALYSIS COMPLETE** 🎯
