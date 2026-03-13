# TUI Display Settings: See All Steps & Tool Calls

**Issue:** You only see the first and last answer, not the tool calls and step-by-step execution in between.

**Cause:** Tools are collapsed and verbose is off by default.

---

## Quick Fix - Type These in TUI

### 1. Expand Tools (See Tool Calls)
```
/tools expanded
```
Shows all tool calls: `read_file`, `write_file`, `exec`, etc.

### 2. Enable Verbose (See All Steps)
```
/verbose on
```
Shows intermediate steps and agent decisions.

### 3. Enable Reasoning (See Thinking)
```
/reasoning on
```
Shows model's reasoning/thinking process.

### 4. OR Use Full Verbose (Everything)
```
/verbose full
```
Maximum detail - shows everything.

---

## What Each Setting Does

| Command | Shows |
|---------|-------|
| `/tools expanded` | All tool calls, file operations, commands |
| `/verbose on` | Intermediate steps, agent decisions |
| `/verbose full` | Maximum detail, everything visible |
| `/reasoning on` | Model's thinking/reasoning content |

---

## Example Output

### BEFORE (Minimal Display):
```
User: Check the files in my project

Agent: Here are the files I found...
```

### AFTER (/verbose full + /tools expanded):
```
User: Check the files in my project

[TOOL CALL] read_directory
  path: /Users/tolga/Desktop/project

[TOOL RESULT] 5 files found:
  - src/index.ts
  - src/utils.ts
  - package.json
  - README.md
  - tsconfig.json

[TOOL CALL] read_file
  path: /Users/tolga/Desktop/project/src/index.ts

[TOOL RESULT] 
import { helper } from './utils';
console.log('Hello');

[REASONING] 
Let me analyze the project structure. 
This appears to be a TypeScript project with...

Agent: Here are the files I found in your project...
```

---

## Permanent Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "verboseDefault": "full",
      "reasoningDefault": "on"
    }
  }
}
```

Then restart TUI.

---

## TUI Keyboard Shortcuts (If Available)

- **`t`** - Toggle tools expand/collapse
- **`v`** - Toggle verbose level
- **Check settings overlay** - May have UI toggles

---

## Try It Now

In your TUI, type:

```
/verbose full
/tools expanded
```

Then ask a question that requires tool use, like:
```
Can you check what files are in my Desktop/project folder?
```

You should now see:
1. ✅ Tool call to read directory
2. ✅ Tool results
3. ✅ Any additional file reads
4. ✅ Reasoning steps
5. ✅ Final answer

---

## Status Indicators

You'll see these in the status bar:

- `tools expanded` → Tool calls visible
- `tools collapsed` → Tool calls hidden
- `verbose full` → Maximum detail
- `verbose on` → Some detail
- `verbose off` → Minimal display

---

**Now you can see EVERYTHING the AI does step-by-step!** 🎯
