# TUI Display Settings - Working Inside OpenClaw TUI

**Date:** 2026-02-24  
**Status:** ✅ CONFIGURED & WORKING

---

## What Was Changed

Updated `~/.openclaw/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "verboseDefault": "full",
      "thinkingDefault": "low"
    }
  }
}
```

---

## What You'll See Now

### Full Verbose Mode Shows:

1. **Tool Calls**
   ```
   [TOOL CALL] read_file
     path: /Users/tolga/Desktop/project
   ```

2. **Tool Results**
   ```
   [TOOL RESULT] 5 files found
   ```

3. **Reasoning/Thinking** (with GLM-5)
   ```
   [REASONING] Let me analyze this...
   ```

4. **Step-by-Step Execution**
   - Every tool call
   - Every result
   - Agent decisions
   - Intermediate steps

---

## Commands Available in TUI

### Toggle Tools Display:
```
/tools expanded    → Show all tool calls
/tools collapsed   → Hide tool calls
```

### Change Verbose Level:
```
/verbose off       → Minimal display
/verbose on        → Show steps
/verbose full      → Maximum detail (CURRENT)
```

### Toggle Reasoning:
```
/reasoning on      → Show thinking
/reasoning off     → Hide thinking
```

---

## Current Configuration

| Setting | Value | Effect |
|---------|-------|--------|
| `verboseDefault` | `full` | ✅ Maximum detail |
| `thinkingDefault` | `low` | ✅ Light reasoning |
| Tools | Auto-expand | ✅ Shows tool calls |

---

## Example Session

### What You'll See Now:

```
User: Check my project files

═══════════════════════════════════════════════════

[TOOL CALL] read_directory
  path: /Users/tolga/Desktop/project

[TOOL RESULT] 
Found 5 files:
  - src/index.ts
  - src/utils.ts  
  - package.json
  - README.md
  - tsconfig.json

[TOOL CALL] read_file
  path: /Users/tolga/Desktop/project/src/index.ts

[TOOL RESULT]
import { helper } from './utils';
console.log('Hello World');

[REASONING]
This is a TypeScript project. The main entry point
imports from utils and logs a message.

[AGENT RESPONSE]
I found 5 files in your project. It's a TypeScript
setup with the main file at src/index.ts...

═══════════════════════════════════════════════════
```

---

## TUI Status Bar

You'll see these indicators:

```
agent main | session main | zhipu/glm-5 | verbose full | thinking low
```

- `verbose full` → Maximum detail enabled ✅
- `thinking low` → Light reasoning mode ✅

---

## Keyboard Shortcuts (If Available)

Check if these work in your TUI:

- **`t`** - Toggle tools expand/collapse
- **`v`** - Cycle verbose levels
- **`?`** - Show help/shortcuts

---

## Troubleshooting

### Still Not Seeing Steps?

1. **Check current verbose level:**
   Look at status bar for `verbose full`

2. **Manually set verbose:**
   Type in TUI: `/verbose full`

3. **Expand tools:**
   Type in TUI: `/tools expanded`

### Want Even More Detail?

Type in TUI:
```
/verbose full
/tools expanded
/reasoning on
```

---

## Verification

✅ Config updated  
✅ TUI restarted  
✅ No config errors  
✅ Gateway connected  
✅ Full verbose enabled  

---

**You should now see EVERYTHING: tool calls, results, reasoning, and all steps!** 🎯
