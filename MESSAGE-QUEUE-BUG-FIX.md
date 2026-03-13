# Message Queue Bug Fix - CRITICAL

**Date:** 2026-02-24  
**Issue:** Normal messages not being sent, only slash commands worked  
**Status:** ✅ FIXED

---

## The CRITICAL Bug

### What Was Happening:

```
User types: "Hello"
  → sendMessage("Hello") called
  → messageQueue.push("Hello")
  → processMessageQueue() called
  → isSending = false, so processes message
  → sendMessageInternal("Hello") starts
  → isSending = true
  → Client sends message...
  → AWAITS response (can take 30+ seconds)
  → isSending STILL TRUE while waiting

User types: "Are you there?"
  → sendMessage("Are you there?") called
  → messageQueue.push("Are you there?")
  → processMessageQueue() called
  → isSending = true, so RETURNS EARLY ❌
  → Message stays in queue FOREVER ❌
```

### Root Cause:

The `processMessageQueue()` function would:
1. Check `if (isSending) return;`
2. If true, return immediately
3. **Never re-process the queue** when the current message finished!

Messages would pile up in the queue but never get sent.

---

## The Fix

### Added `finally` Block:

```typescript
const sendMessageInternal = async (text: string) => {
  try {
    // ... send message ...
    await client.sendChat({...});
  } catch (err) {
    // ... handle error ...
  } finally {
    isSending = false;
    // Process any remaining messages in queue
    if (messageQueue.length > 0) {
      queueMicrotask(processMessageQueue);
    }
  }
};
```

### Changed sendMessage:

```typescript
const sendMessage = async (text: string) => {
  messageQueue.push(text);
  // Use queueMicrotask to ensure async processing
  queueMicrotask(processMessageQueue);
};
```

---

## How It Works Now

```
User: "Hello"
  → Queue: ["Hello"]
  → processMessageQueue()
  → isSending = false, processes
  → Sends "Hello"
  → AWAITS response...
  → Response received
  → finally block runs:
    - isSending = false
    - Queue has more? No → Done

User: "Message 1" (while AI thinking)
  → Queue: ["Message 1"]
  → processMessageQueue()
  → isSending = true, returns
  → Message waits in queue

AI finishes thinking
  → finally block runs:
    - isSending = false
    - Queue has messages? YES!
    - queueMicrotask(processMessageQueue)
  → processMessageQueue() runs again
  → Sends "Message 1"
  → Loop continues...
```

---

## Key Changes

| Before | After |
|--------|-------|
| `isSending` never reset on await | Reset in `finally` block |
| No re-processing after send | `queueMicrotask` triggers re-process |
| Messages stuck in queue | Queue auto-processes when free |
| `await processMessageQueue()` | `queueMicrotask(processMessageQueue)` |

---

## Testing

### Before Fix:
```
User: Test 1
[AI thinking 30s...]
User: Test 2
User: Test 3

Result: Only Test 1 sent, Test 2 & 3 lost ❌
```

### After Fix:
```
User: Test 1
[AI thinking 30s...]
User: Test 2
User: Test 3

Result: Test 1 sent, then Test 2, then Test 3 ✅
```

---

## Files Modified

- `src/tui/tui-command-handlers.ts`
  - Added `finally` block to `sendMessageInternal`
  - Changed `sendMessage` to use `queueMicrotask`
  - Queue now auto-processes when `isSending` becomes false

---

## Why Slash Commands Worked

Slash commands like `/help`, `/verbose` don't use `sendMessage`:

```typescript
case "help":
  chatLog.addSystem(helpText({...}));  // Direct display, no await
  break;
```

They display immediately without waiting for AI response, so they bypassed the broken queue.

---

## Impact

✅ **Normal messages now work**  
✅ **Multiple messages queue properly**  
✅ **No messages lost**  
✅ **Slash commands still work**  

---

**This was a CRITICAL bug that broke all normal messaging!** 🎯
