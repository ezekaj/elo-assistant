# 🔍 EFFORT LEVELS DEEP RESEARCH REPORT

**Date:** 2026-02-24
**Analysis Source:** Claude Code v2.1.50 (447,173 lines)

---

## 📊 EXECUTIVE SUMMARY

**Finding:** Claude Code's Effort Levels control **thinking depth and token spend** for Opus 4.5/4.6 models. This is separate from (but works with) Adaptive Thinking.

**OpenClaw Status:** ⚠️ **PARTIAL** - Has thinking levels but missing effort parameter integration.

---

## 1. CLAUDE CODE EFFORT LEVELS

### **A. Effort Level Values** (Line 146598)

```javascript
const xCT = ["low", "medium", "high", "max"];
```

**Four effort levels:**
| Level | Description | Use Case |
|-------|-------------|----------|
| `low` | Minimal thinking, cost-optimized | Simple tasks, subagents |
| `medium` | Balanced thinking/cost | Default for Opus 4.6 |
| `high` | Deep thinking (default) | Complex tasks |
| `max` | Deepest reasoning (Opus 4.6 only) | Critical analysis |

### **B. API Integration** (Lines 208619-208620)

```javascript
// In agent configuration
..._.effort !== void 0 ? {
    effort: _.effort
} : {},
```

**Effort is passed in agent configuration and API calls.**

### **C. Model Configuration** (Lines 277024-277025)

```typescript
supportsEffort: y.boolean().optional()
  .describe("Whether this model supports effort levels"),
supportedEffortLevels: y.array(y.enum(["low", "medium", "high", "max"]))
  .optional()
  .describe("Available effort levels for this model"),
```

**Models declare effort support in their configuration.**

### **D. Default Effort Logic** (Lines 146571-146598)

```javascript
// Get effort from environment variable
function mG_() {
    return oBT(process.env.CLAUDE_CODE_EFFORT_LEVEL)
}

// Get default effort for model
function vCT(T) {
    if (ibT() && T.toLowerCase().includes("opus-4-6")) return "medium";
    return
}

// Validate effort value
function oBT(T) {
    let T = XB();
    return oBT(T.effortLevel)
}

// Valid effort levels
xCT = ["low", "medium", "high", "max"]
```

### **E. Agent File Configuration** (Lines 208707-208709)

```javascript
let f = A.effort,
    U = f !== void 0 ? oBT(f) : void 0;
if (f !== void 0 && U === void 0) 
    F(`Agent file ${T} has invalid effort '${f}'. Valid options: ${xCT.join(", ")} or an integer`);
```

**Agents can specify effort in their JSON configuration.**

### **F. CLI Option** (Line 445730)

```bash
--effort <level>
Effort level for the current session (low, medium, high)
```

**Note:** `max` is not available via CLI in interactive mode.

### **G. Effort Validation** (Lines 445837-445838)

```javascript
if (H.effort === "max" && (!a || D_())) {
    let aA = !a ? 'Effort level "max" is not available in interactive mode.' 
                : 'Effort level "max" is not available for Claude.ai subscribers.';
}
```

**`max` effort has restrictions:**
- Not available in interactive mode
- Not available for Claude.ai subscribers

### **H. UI Integration** (Lines 189964-189965)

```javascript
left: "modelPicker:decreaseEffort",
right: "modelPicker:increaseEffort"
```

**Keyboard shortcuts for adjusting effort in model picker.**

### **I. Effort Display** (Lines 372075, 372191-372193)

```javascript
if (q !== void 0) O += ` with ${$R.bold(q)} effort`;

_ = hR(($) => $.effortValue),
D = _ !== void 0 ? ` (effort: ${_})` : "";
```

**Effort level is displayed in status messages.**

### **J. Output Config Integration** (Lines 381845, 384396-384400)

```javascript
effortValue: YT.output_config?.effort,

let ST = T.effort !== void 0 ? T.effort : HT.effortValue;
return {
    effortValue: ST
}
```

**Effort is part of `output_config` in API responses.**

### **K. Documentation** (Lines 412703-412705)

```html
<h2>Thinking & Effort (Quick Reference)</h2>

<p><strong>Effort parameter (GA, no beta header — Opus 4.5 and Opus 4.6 only):</strong> 
Controls thinking depth and overall token spend via 
<code>output_config: {effort: "low"|"medium"|"high"|"max"}</code>. 
Default is <code>high</code> (equivalent to omitting it). 
<code>max</code> is Opus 4.6 only. Will error on Sonnet 4.5 / Haiku 4.5. 
Combine with adaptive thinking for the best cost-quality tradeoffs. 
Use <code>low</code> for subagents or simple tasks; 
<code>max</code> for the deepest reasoning.</p>
```

---

## 2. OPENCLAW EFFORT LEVELS

### **A. Current Implementation**

**File:** `src/gateway/open-responses.schema.ts` (Line 205)

```typescript
reasoning: z
  .object({
    effort: z.enum(["low", "medium", "high"]).optional(),
    summary: z.enum(["auto", "concise", "detailed"]).optional(),
  })
  .optional(),
```

**Status:** ✅ Schema exists but only has 3 levels (missing `max`)

### **B. Thinking Levels** (`src/auto-reply/thinking.ts`)

```typescript
export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export function normalizeThinkLevel(raw?: string | null): ThinkLevel | undefined {
  // Normalizes: off, minimal, low, medium, high, xhigh
  // Also accepts aliases: on, min, mid, med, ultra, max, etc.
}

export function listThinkingLevels(provider?: string, model?: string): ThinkLevel[] {
  const levels: ThinkLevel[] = ["off", "minimal", "low", "medium", "high"];
  if (supportsXHighThinking(provider, model)) {
    levels.push("xhigh");
  }
  return levels;
}
```

**Status:** ✅ OpenClaw has thinking levels but they're different from effort levels

### **C. Model Configuration** (`src/config/types.agent-defaults.ts`)

```typescript
thinkingDefault?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
```

**Status:** ✅ Thinking is configured per agent/model

---

## 3. COMPARISON

| Feature | Claude Code | OpenClaw | Status |
|---------|-------------|----------|--------|
| **Effort Levels** | ✅ low/medium/high/max | ⚠️ low/medium/high (schema) | ⚠️ MISSING `max` |
| **Thinking Levels** | ✅ Adaptive thinking | ✅ off/minimal/low/medium/high/xhigh | ✅ MATCH |
| **Environment Variable** | ✅ CLAUDE_CODE_EFFORT_LEVEL | ❌ Not implemented | ❌ MISSING |
| **CLI Option** | ✅ --effort <level> | ❌ Not implemented | ❌ MISSING |
| **Agent Config** | ✅ effort in JSON | ❌ Not implemented | ❌ MISSING |
| **Model Declaration** | ✅ supportsEffort, supportedEffortLevels | ❌ Not implemented | ❌ MISSING |
| **Output Config** | ✅ output_config.effort | ⚠️ In schema only | ⚠️ PARTIAL |
| **UI Controls** | ✅ modelPicker:increase/decreaseEffort | ❌ Not implemented | ❌ MISSING |
| **Validation** | ✅ Validates effort per model | ❌ Not implemented | ❌ MISSING |
| **Documentation** | ✅ Comprehensive docs | ❌ Not implemented | ❌ MISSING |

---

## 4. KEY DIFFERENCES

### **Claude Code:**
- **Effort** = Token spend control (low/medium/high/max)
- **Thinking** = Adaptive thinking (enabled/disabled with budget)
- **Separate controls** that work together
- **Model-specific** (Opus 4.5/4.6 only for effort)
- **Environment variable** support
- **CLI option** support
- **Agent config** support

### **OpenClaw:**
- **Thinking** = Combined thinking level (off/minimal/low/medium/high/xhigh)
- **No effort parameter** (only in schema)
- **No environment variable**
- **No CLI option**
- **No agent config** support
- **No model-specific** effort declaration

---

## 5. GAP ANALYSIS

### **Missing in OpenClaw:**

1. **`max` Effort Level** ❌
   - Schema only has `["low", "medium", "high"]`
   - Missing `"max"` from enum

2. **Environment Variable** ❌
   - No `OPENCLAW_EFFORT_LEVEL` support
   - No default effort from env

3. **CLI Option** ❌
   - No `--effort <level>` flag
   - No effort validation in CLI

4. **Agent Configuration** ❌
   - Agents can't specify effort in JSON
   - No effort validation for agents

5. **Model Declaration** ❌
   - Models don't declare `supportsEffort`
   - Models don't declare `supportedEffortLevels`

6. **Effort Validation** ❌
   - No validation per model
   - No error for unsupported effort

7. **UI Integration** ❌
   - No model picker effort controls
   - No effort display in status

8. **Documentation** ❌
   - No effort level documentation
   - No usage examples

---

## 6. RECOMMENDATIONS

### **High Priority:**

1. **Add `max` to Effort Schema**
   ```typescript
   effort: z.enum(["low", "medium", "high", "max"]).optional()
   ```

2. **Add Environment Variable Support**
   ```typescript
   const defaultEffort = process.env.OPENCLAW_EFFORT_LEVEL || "high";
   ```

3. **Add Model Effort Declaration**
   ```typescript
   interface ModelConfig {
     supportsEffort?: boolean;
     supportedEffortLevels?: ("low" | "medium" | "high" | "max")[];
   }
   ```

### **Medium Priority:**

4. **Add CLI Option**
   ```bash
   --effort <level>  Effort level (low|medium|high|max)
   ```

5. **Add Agent Config Support**
   ```json
   {
     "effort": "medium"
   }
   ```

6. **Add Effort Validation**
   ```typescript
   function validateEffort(effort: string, model: ModelConfig): boolean
   ```

### **Low Priority:**

7. **Add UI Controls**
   - Model picker effort adjustment
   - Effort display in status

8. **Add Documentation**
   - Effort level guide
   - Usage examples

---

## 7. IMPLEMENTATION COMPLEXITY

| Feature | Complexity | Lines | Priority |
|---------|------------|-------|----------|
| Add `max` to schema | Low | 1 | 🔴 HIGH |
| Environment variable | Low | 5 | 🔴 HIGH |
| Model declaration | Medium | 20 | 🔴 HIGH |
| CLI option | Medium | 15 | 🟡 MEDIUM |
| Agent config | Medium | 20 | 🟡 MEDIUM |
| Validation logic | Medium | 30 | 🟡 MEDIUM |
| UI controls | High | 50+ | 🟢 LOW |
| Documentation | Low | 20 | 🟢 LOW |

---

## 8. USAGE EXAMPLES (Claude Code)

### **API Usage:**
```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=1024,
    output_config={"effort": "high"},  # low | medium | high (default) | max
    messages=[{"role": "user", "content": "Analyze this code..."}]
)
```

### **CLI Usage:**
```bash
claude --effort medium "Review this PR"
```

### **Agent Configuration:**
```json
{
  "name": "code-reviewer",
  "description": "Reviews pull requests",
  "effort": "high",
  "model": "opus"
}
```

### **Environment Variable:**
```bash
export CLAUDE_CODE_EFFORT_LEVEL=medium
```

---

## 📊 CONCLUSION

**OpenClaw Effort Levels Status:** ⚠️ **PARTIAL (40%)**

**What Works:**
- ✅ Schema exists (partial)
- ✅ Thinking levels implemented
- ✅ Model-specific thinking support

**What's Missing:**
- ❌ `max` effort level
- ❌ Environment variable
- ❌ CLI option
- ❌ Agent configuration
- ❌ Model declaration
- ❌ Validation logic
- ❌ UI integration
- ❌ Documentation

**Priority:** 🔴 **HIGH** - Effort levels are important for cost control and response quality tuning.

---

**Research Complete:** 2026-02-24
**Lines Analyzed:** 447,173 (Claude Code)
**Status:** ⚠️ **PARTIAL IMPLEMENTATION**
