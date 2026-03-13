# 🔧 TOOL-EXAMPLES-2025-10-29 - COMPLETE ANALYSIS

**Based on:** Deep search of Claude Code source (447k lines)  
**Date:** 2026-02-24  
**Beta Header:** `tool-examples-2025-10-29`

---

## 📋 EXECUTIVE SUMMARY

**`tool-examples-2025-10-29`** is a **beta feature** in Claude Code that enables **tool examples in prompts** - allowing Claude to see examples of how tools should be used directly in the system prompt.

### **Key Points:**
- **Beta Date:** October 29, 2025
- **Purpose:** Include tool usage examples in prompts
- **Status:** Experimental/Optional feature
- **Control:** Environment variable `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`
- **Internal Codename:** `tengu_scarf_coffee`

---

## 🔍 WHAT IT DOES

### **Without Tool Examples:**
```
System: You have access to these tools:
- read_file: Read a file
- write_file: Write a file
- exec: Execute a command

User: Read the config file
```

### **With Tool Examples (tool-examples-2025-10-29):**
```
System: You have access to these tools:
- read_file: Read a file
  Example: read_file({"path": "config.json"})
- write_file: Write a file
  Example: write_file({"path": "output.txt", "content": "Hello"})
- exec: Execute a command
  Example: exec({"command": "ls -la"})

User: Read the config file
```

**Key Difference:** Tool examples show Claude **exactly how to call each tool**, improving accuracy and reducing errors.

---

## 🔧 HOW IT WORKS (From Source Code)

### **1. Beta Header Definition**

From Claude Code source (line 1735):
```javascript
iaT = "tool-examples-2025-10-29"
```

### **2. Beta Header Set**

From source (line 1744):
```javascript
lSR = new Set([
  "interleaved-thinking-2025-05-14",
  "context-1m-2025-08-07",
  "tool-search-tool-2025-10-19",
  "tool-examples-2025-10-29"  // ← This feature
])
```

**`lSR`** = List of beta headers that are **filtered out for Bedrock** (AWS doesn't support these betas).

### **3. Conditional Activation**

From source (line 65860):
```javascript
if (B && A9("tengu_scarf_coffee", !1)) R.push(iaT);
```

**Translation:**
```javascript
// B = some condition (likely model support check)
// A9("tengu_scarf_coffee", false) = check if feature enabled
// R.push(iaT) = add beta header to list
```

**Internal Codename:** `tengu_scarf_coffee`

### **4. Environment Variable Control**

From GitHub issue #11960:
```bash
# Disable all experimental betas including tool-examples
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
```

**Note:** This only works as a command-line environment variable, NOT in `settings.json`.

---

## 📊 API FORMAT

### **With Beta Header:**

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: tool-examples-2025-10-29" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Read the config file"}],
    "tools": [...]
  }'
```

### **Without Beta Header:**

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Read the config file"}],
    "tools": [...]
  }'
```

---

## 🎯 WHEN IT'S USED

### **From Source Code Analysis:**

```javascript
// Line 65860
if (B && A9("tengu_scarf_coffee", !1)) R.push(iaT);
```

**Conditions:**
1. **`B`** = Some condition (likely model support or feature flag)
2. **`A9("tengu_scarf_coffee", false)`** = Internal feature flag check
   - `A9` = Feature flag getter function
   - `tengu_scarf_coffee` = Internal codename for tool examples feature
   - `false` = Default value if flag not set

**Translation:** Tool examples are added when:
- Model supports it (`B`)
- Feature flag is enabled (`tengu_scarf_coffee`)

---

## 🚫 KNOWN ISSUES

### **1. Google Vertex AI Incompatibility**

From GitHub issue #11960:

**Error:**
```
API Error: 400 - {
  'type': 'invalid_request_error',
  'message': 'Unexpected value(s) `tool-examples-2025-10-29` 
              for the `anthropic-beta` header...'
}
```

**Cause:** Vertex AI doesn't support this beta header.

**Workaround:**
```bash
export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
```

### **2. Settings.json Not Honored**

**Bug:** Setting `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` in `settings.json` doesn't work.

**Only Works As:**
```bash
# Command line
CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 claude -p "..."
```

---

## 📈 BENEFITS

### **Pros:**
✅ **Better tool understanding** - Claude sees exact usage examples  
✅ **Reduced errors** - Fewer malformed tool calls  
✅ **Faster learning** - Claude learns tool patterns faster  
✅ **Consistent formatting** - Tool calls follow examples  

### **Cons:**
❌ **Increased token usage** - Examples add to prompt size  
❌ **Not universally supported** - Vertex AI rejects it  
❌ **Experimental** - May change or be removed  
❌ **Hard to disable** - Requires env var, not config file  

---

## 🔮 OPENCLAW INTEGRATION STATUS

### **Current Status:**

OpenClaw **does NOT currently support** `tool-examples-2025-10-29`.

**What OpenClaw Has:**
- ✅ Basic tool support
- ✅ Tool definitions
- ✅ Tool execution
- ❌ Tool examples in prompts
- ❌ Beta header management
- ❌ Feature flag system

### **What's Needed:**

#### **1. Beta Header Support**

```typescript
// src/config/types.agent-runtime.ts
export const ToolsConfigSchema = z.object({
  // ... existing fields
  examples: z.object({
    enabled: z.boolean().optional(),
    betaHeader: z.string().optional().default('tool-examples-2025-10-29')
  }).optional()
});
```

#### **2. Feature Flag System**

```typescript
// src/agents/feature-flags.ts
export const FEATURE_FLAGS = {
  toolExamples: {
    codename: 'tengu_scarf_coffee',
    enabled: () => process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS !== '1',
    betaHeader: 'tool-examples-2025-10-29'
  }
};
```

#### **3. Tool Example Generation**

```typescript
// src/agents/tools/tool-examples.ts
export function generateToolExamples(tools: AgentTool[]): string {
  return tools.map(tool => {
    const example = getToolExample(tool.name);
    return `${tool.name}: ${tool.description}\n  Example: ${example}`;
  }).join('\n');
}
```

---

## 📝 IMPLEMENTATION RECOMMENDATION

### **Priority:** MEDIUM

**Why:**
- ✅ Improves tool accuracy
- ✅ Reduces errors
- ⚠️ Increases token usage
- ⚠️ Not supported by all providers

### **Implementation Steps:**

1. **Add beta header support** (LOW effort)
2. **Add feature flag system** (MEDIUM effort)
3. **Add tool example generation** (HIGH effort)
4. **Add environment variable control** (LOW effort)

### **Timeline:**
- Phase 1: 1-2 days
- Phase 2: 2-3 days
- Phase 3: 5-7 days
- Phase 4: 1 day

**Total:** 9-13 days

---

## 🎯 CONCLUSION

**`tool-examples-2025-10-29`** is an **experimental beta feature** that:

- ✅ Adds tool usage examples to prompts
- ✅ Improves tool call accuracy
- ❌ Increases token usage
- ❌ Not supported by all providers (Vertex AI)
- ⚠️ Can be disabled via environment variable

**For OpenClaw:**
- Currently NOT implemented
- Would require beta header support
- Would require feature flag system
- Would require tool example generation

**Recommendation:** Implement after core thinking support is complete.

---

**ANALYSIS COMPLETE** 🎯
