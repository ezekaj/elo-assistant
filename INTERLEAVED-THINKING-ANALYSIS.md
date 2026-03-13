# 🧠 INTERLEAVED THINKING (2025-05-14) - COMPLETE ANALYSIS

**Based on:** Deep search of Claude Code source (447k lines)  
**Date:** 2026-02-24  
**Beta Header:** `interleaved-thinking-2025-05-14`

---

## 📋 EXECUTIVE SUMMARY

**Interleaved Thinking** is a beta feature that allows Claude models to display their thinking/reasoning process **interleaved with tool use** during long-running sessions.

### **Key Points:**
- **Beta Date:** May 14, 2025 (`interleaved-thinking-2025-05-14`)
- **Purpose:** Show reasoning between tool calls, not just at the end
- **Models:** Claude Opus 4.6, Sonnet 4.5+
- **Status:** Auto-enabled on Opus 4.6 with adaptive thinking
- **OpenClaw:** Currently supported via `thinkingEnabled` config

---

## 🔍 WHAT IS INTERLEAVED THINKING?

### **Traditional Thinking (Before):**
```
User: "Research competitors and write a report"

Claude:
  [Thinking for 30 seconds...]
  [All thinking hidden]
  
  [Tool Call 1] web_search("competitor A")
  [Tool Call 2] web_search("competitor B")
  [Tool Call 3] write_file("report.md")
  
  "Here's the report..."
```

### **Interleaved Thinking (After):**
```
User: "Research competitors and write a report"

Claude:
  [Thinking] "I need to research competitors first..."
  
  [Tool Call 1] web_search("competitor A")
  
  [Thinking] "Found info on A, now searching for B..."
  
  [Tool Call 2] web_search("competitor B")
  
  [Thinking] "Have enough info, writing report now..."
  
  [Tool Call 3] write_file("report.md")
  
  "Here's the report..."
```

**Key Difference:** Thinking is shown **between** tool calls, not all at once at the beginning.

---

## 🔧 HOW IT WORKS (From Source Code)

### **1. Beta Header Detection**

From Claude Code source (line 65854):
```javascript
if (!isTruthy(process.env.DISABLE_INTERLEAVED_THINKING) && _00(T)) {
  R.push("interleaved-thinking-2025-05-14");
}
```

**Function `_00(T)`** checks if the model supports interleaved thinking.

### **2. Model Support Check**

From source (line 1744):
```javascript
lSR = new Set([
  "interleaved-thinking-2025-05-14",
  "context-1m-2025-08-07", 
  "tool-search-tool-2025-10-19",
  "tool-examples-2025-10-29"
])

iSR = new Set([
  "claude-code-20250219",
  "interleaved-thinking-2025-05-14",
  "context-management-2025-06-27"
])
```

**Models in `iSR` set support interleaved thinking.**

### **3. Thinking Configuration**

From source (line 101090):
```javascript
alwaysThinkingEnabled: y.boolean().optional()
  .describe("When false, thinking is disabled. 
             When absent or true, thinking is enabled 
             automatically for supported models.")
```

### **4. Adaptive Thinking (Opus 4.6)**

From source (line 124349):
```javascript
if (B.model in kg0 && B.thinking && B.thinking.type === "enabled") {
  console.warn(`Using Claude with ${B.model} and 'thinking.type=enabled' 
                is deprecated. Use 'thinking.type=adaptive' instead...`);
}
```

**Opus 4.6 automatically enables interleaved thinking with adaptive thinking - no beta header needed!**

---

## 📊 API FORMAT

### **For Opus 4.6 (Recommended):**
```json
{
  "model": "claude-opus-4-6",
  "thinking": {
    "type": "adaptive"
  },
  "messages": [...]
}
```
**No beta header needed - automatic!**

### **For Older Models (Sonnet 4.5, etc.):**
```json
{
  "model": "claude-sonnet-4-5",
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  },
  "betas": ["interleaved-thinking-2025-05-14"],
  "messages": [...]
}
```

### **CLI Usage:**
```bash
# Opus 4.6 (automatic)
claude -p "Research competitors" --model claude-opus-4-6

# Older models (manual beta header)
claude --betas interleaved-thinking-2025-05-14 -p "Research competitors"
```

---

## 🎯 WHEN TO USE IT

### **Good Use Cases:**
✅ Long-running interactive sessions  
✅ Complex multi-step tasks  
✅ When users want to see reasoning process  
✅ Debugging tool selection  
✅ Educational/demonstration purposes  

### **Not Needed For:**
❌ Simple questions  
❌ Single tool call tasks  
❌ When speed is critical (adds latency)  
❌ Opus 4.6 with adaptive thinking (automatic)  

---

## 🚀 OPENCLAW INTEGRATION STATUS

### **Current Support:**

OpenClaw has thinking support via:

```typescript
// Config
{
  "agents": {
    "defaults": {
      "thinkingDefault": "low"  // or "minimal", "medium", "high"
    }
  }
}
```

### **TUI Controls:**

In TUI, users can toggle thinking:
- `/think low` - Minimal thinking
- `/think minimal` - Very brief thinking
- `/think off` - Disable thinking

### **What's Missing:**

❌ No explicit `interleaved-thinking-2025-05-14` beta header support  
❌ No adaptive thinking mode  
❌ No thinking budget control  
❌ No visibility into thinking between tool calls  

---

## 💡 RECOMMENDATIONS FOR OPENCLAW

### **1. Add Adaptive Thinking Support**

```typescript
// src/config/types.agent-defaults.ts
export type ThinkingMode = 
  | "off" 
  | "minimal" 
  | "low" 
  | "medium" 
  | "high"
  | "adaptive";  // NEW - for Opus 4.6
```

### **2. Add Beta Header Support**

```typescript
// src/agents/model-selection.ts
function getBetas(model: string): string[] {
  const betas: string[] = [];
  
  if (model.includes("opus-4-6")) {
    // Auto-enabled, no header needed
  } else if (model.includes("sonnet-4-5")) {
    betas.push("interleaved-thinking-2025-05-14");
  }
  
  return betas;
}
```

### **3. Add Thinking Budget Control**

```typescript
// src/config/types.agent-defaults.ts
export type ThinkingConfig = {
  type: ThinkingMode;
  budgetTokens?: number;  // For older models
};
```

### **4. Show Thinking in TUI**

```typescript
// src/tui/components/chat-log.ts
function renderThinkingBlock(block: ThinkingBlock) {
  return Text.create(`🤔 ${block.thinking}`, {
    color: 'gray',
    italic: true
  });
}
```

---

## 📈 COMPARISON: CLAUDE CODE vs OPENCLAW

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Interleaved Thinking** | ✅ Auto (Opus 4.6) | ⚠️ Partial | MEDIUM |
| **Adaptive Thinking** | ✅ Yes | ❌ No | HIGH |
| **Thinking Budget** | ✅ Yes | ❌ No | MEDIUM |
| **Beta Headers** | ✅ Yes | ⚠️ Limited | MEDIUM |
| **TUI Toggle** | ✅ Yes | ✅ Yes | ✅ Match |
| **Thinking Modes** | ✅ 4 modes | ✅ 4 modes | ✅ Match |

---

## 🔮 FUTURE ENHANCEMENTS

### **Phase 1: Adaptive Thinking**
- Add `thinkingDefault: "adaptive"` config
- Auto-detect Opus 4.6 and enable
- No beta header needed

### **Phase 2: Thinking Budget**
- Add `thinkingBudgetTokens` config
- Control max thinking tokens
- Show budget usage in TUI

### **Phase 3: Interleaved Display**
- Show thinking between tool calls
- Add thinking visualization component
- Toggle thinking visibility

### **Phase 4: Beta Header Management**
- Auto-add beta headers based on model
- Support `interleaved-thinking-2025-05-14`
- Support `tool-search-tool-2025-10-19`
- Support `context-1m-2025-08-07`

---

## 📝 IMPLEMENTATION PRIORITY

| Enhancement | Priority | Effort | Impact |
|-------------|----------|--------|--------|
| Adaptive Thinking | HIGH | Low | High |
| Thinking Budget | MEDIUM | Low | Medium |
| Beta Header Auto-Detect | MEDIUM | Medium | High |
| Interleaved Display | LOW | High | Medium |

---

## ✅ CONCLUSION

**Interleaved Thinking** is a powerful feature that:
- Shows reasoning between tool calls
- Improves transparency
- Helps users understand AI decisions
- **Auto-enabled on Opus 4.6** (no action needed)

**For OpenClaw:**
- ✅ Basic thinking support exists
- ⚠️ Adaptive thinking missing (HIGH priority)
- ⚠️ Beta header support limited (MEDIUM priority)
- ⚠️ Thinking budget missing (MEDIUM priority)

**Recommendation:** Implement adaptive thinking support first (low effort, high impact for Opus 4.6 users).

---

**ANALYSIS COMPLETE** 🎯
