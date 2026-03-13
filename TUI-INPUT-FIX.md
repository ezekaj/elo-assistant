# TUI Input Fix: No More Need for `/` Prefix

**Date:** 2026-02-24  
**Issue:** Messages starting with `/` (like file paths) were silently ignored  
**Status:** ✅ FIXED

---

## The Problem

When you typed messages like:
```
/Users/tolga/Desktop/sofia-website can you look here
```

The TUI would:
1. See the `/` prefix
2. Parse it as a command: `name="users"`, `args="tolga/Desktop/sofia-website..."`
3. Look for a "users" command (doesn't exist)
4. **Silently do nothing** ❌

You had to add a space or other character to make it work.

---

## Root Cause

**File:** `src/tui/tui-command-handlers.ts`

```typescript
const handleCommand = async (raw: string) => {
  const { name, args } = parseCommand(raw);  // "/Users/..." → name="users"
  if (!name) {
    return;
  }
  switch (name) {
    case "help": ...
    case "model": ...
    // No case for "users" → SILENT FAILURE ❌
  }
};
```

**Issue:** Unknown commands were ignored instead of being sent as messages.

---

## The Fix

Added intelligent command detection:

```typescript
const handleCommand = async (raw: string) => {
  const { name, args } = parseCommand(raw);
  if (!name) {
    return;
  }
  
  // FIX: Detect file paths and unknown commands
  const knownCommands = [
    "help", "status", "agent", "model", "think", ...
  ];
  
  // If name contains path separators, send as message
  if (name.includes("/") || name.includes("\\") || name.includes(".")) {
    await sendMessage(raw);  // ✅ Send as message
    return;
  }
  
  // If name doesn't match known commands, send as message
  if (!knownCommands.includes(name)) {
    await sendMessage(raw);  // ✅ Send as message
    return;
  }
  
  // Only process actual commands
  switch (name) {
    ...
  }
};
```

---

## What's Fixed Now

### ✅ File Paths Work Without Prefix
```
/Users/tolga/Desktop/project  → Sent as message ✅
./src/index.ts                → Sent as message ✅
../config.json                → Sent as message ✅
```

### ✅ Unknown "Commands" Work
```
/foobar test                  → Sent as message ✅
/randomtext                   → Sent as message ✅
```

### ✅ Real Commands Still Work
```
/model gemini-2.0-flash       → Sets model ✅
/think low                    → Sets thinking ✅
/status                       → Shows status ✅
```

---

## Testing

### Before Fix:
```
User: /Users/tolga/Desktop/test
[Nothing happens] ❌

User: /Users/tolga/Desktop/test
[Still nothing] ❌
```

### After Fix:
```
User: /Users/tolga/Desktop/test
Agent: I'll check that directory... ✅

User: ./src/index.ts
Agent: Let me read that file... ✅
```

---

## Known Commands (Still Work)

The following are still treated as commands:

| Command | Description |
|---------|-------------|
| `/help` | Show command help |
| `/status` | Gateway status |
| `/agent <name>` | Switch agent |
| `/model <name>` | Set model |
| `/think <level>` | Set thinking mode |
| `/verbose on/off` | Toggle verbose |
| `/session <key>` | Switch session |
| `/memory` | Memory commands |
| `/compact` | Compact context |
| `/clear` | Clear session |
| `/tools expand` | Expand tools |
| ...and 20+ more |

---

## Detection Logic

1. **Contains `/` or `\`** → File path → Send as message
2. **Contains `.`** → Likely path/filename → Send as message
3. **Not in known commands list** → Unknown command → Send as message
4. **In known commands list** → Execute command

---

## Files Modified

- `src/tui/tui-command-handlers.ts` - Added intelligent command detection

---

## Backwards Compatibility

✅ **100% Backwards Compatible**

- All existing commands still work
- No breaking changes
- Messages that failed before now work
- No configuration needed

---

## Benefit

**You can now type naturally without worrying about `/` prefix!**

```
✅ /Users/tolga/Desktop/project
✅ ./src/index.ts  
✅ ../config.json
✅ /random text that's not a command
```

All work without any special handling! 🎉
