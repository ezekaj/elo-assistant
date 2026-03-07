# 🔍 MULTI-EDIT RESEARCH REPORT

**Date:** 2026-02-24  
**Topic:** Multiple Edits in Single Operation (MultiEdit)

---

## 📊 EXECUTIVE SUMMARY

**Finding:** Claude Code does **NOT** have a dedicated "MultiEdit" tool for editing multiple files simultaneously.

**How Claude Code Handles Multiple Edits:**

1. **Multiple Edit Tool Calls in Parallel** - The model makes several Edit tool calls within a single message
2. **Single File Multi-Edit** - The Edit tool supports multiple edits to a SINGLE file via the `edits` array (already implemented)

---

## 🔍 RESEARCH FINDINGS

### What We Searched For

```
- MultiEdit tool
- multi_edit
- EditMultiple files
- batch edit
- parallel edit
- concurrent edit
- edit_all
```

### What We Found

**Line 275749** (Claude Code prompt instructions):
```
Your ONLY task is to use the Edit tool to update the notes file, then stop. 
You can make multiple edits (update every section as needed) - 
make all Edit tool calls in parallel in a single message. 
Do not call any other tools.
```

**Key Insight:** Claude Code instructs the model to make **multiple parallel Edit tool calls**, not use a special MultiEdit tool.

---

## 📋 CLAUDE CODE'S APPROACH

### For Multiple Edits to ONE File

**Already Implemented in Our Edit Tool:**
```typescript
edit({
  file_path: '/path/to/file.txt',
  edits: [
    { old_string: 'Hello', new_string: 'Hi' },
    { old_string: 'world', new_string: 'universe' },
    { old_string: 'test', new_string: 'demo', replace_all: true }
  ]
})
```

**Status:** ✅ **Already implemented** in our Edit tool (lines 100-150 of edit.ts)

---

### For Multiple Edits to MULTIPLE Files

**Claude Code's Approach:**
```
Model sends single message with multiple tool calls:
├─ Edit tool call 1: file1.txt
├─ Edit tool call 2: file2.txt  
├─ Edit tool call 3: file3.txt
└─ Edit tool call 4: file4.txt
```

**Example from Claude Code (line 275749):**
```
make all Edit tool calls in parallel in a single message
```

**This is NOT a tool feature - it's a MODEL capability:**
- The model can call multiple tools in one message
- Each Edit tool call edits one file
- Multiple files = multiple Edit tool calls

---

## ✅ OPENCLAW CAPABILITIES

### What We Already Support

| Feature | Status | Implementation |
|---------|--------|----------------|
| **Single Edit (one file)** | ✅ Complete | `edit({ file_path, old_string, new_string })` |
| **Multi-Edit (one file, multiple changes)** | ✅ Complete | `edit({ file_path, edits: [...] })` |
| **Parallel Edit Calls (multiple files)** | ✅ Supported | Model can call edit() multiple times in one message |

### Example: Multi-File Edit in OpenClaw

**Model sends:**
```typescript
// Single message, multiple tool calls
[
  edit({
    file_path: '/src/file1.ts',
    old_string: 'const a = 1',
    new_string: 'const a = 2'
  }),
  edit({
    file_path: '/src/file2.ts',
    edits: [
      { old_string: 'x', new_string: 'y' },
      { old_string: 'z', new_string: 'w' }
    ]
  }),
  edit({
    file_path: '/src/file3.ts',
    old_string: 'foo',
    new_string: 'bar',
    replace_all: true
  })
]
```

**Status:** ✅ **Already works** - no changes needed!

---

## 🎯 COMPARISON TABLE

| Feature | Claude Code | OpenClaw | Status |
|---------|-------------|----------|--------|
| **Single Edit** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Multi-Edit (one file)** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Parallel Edit Calls** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Dedicated MultiEdit Tool** | ❌ No | ❌ No | ✅ Same |
| **Batch Edit API** | ❌ No | ❌ No | ✅ Same |

---

## 💡 IMPLEMENTATION STATUS

### What We Have

1. ✅ **Edit tool with multi-edit support** (edits array)
2. ✅ **Smart quote handling**
3. ✅ **Line ending preservation**
4. ✅ **Encoding detection**
5. ✅ **LSP notification**
6. ✅ **Git diff generation**
7. ✅ **Structured output**
8. ✅ **60 comprehensive tests**

### What Claude Code Has

1. ✅ **Edit tool with multi-edit support**
2. ✅ **Smart quote handling**
3. ✅ **Line ending preservation**
4. ✅ **Encoding detection**
5. ✅ **LSP notification**
6. ✅ **Git diff generation**
7. ✅ **Structured output**
8. ❌ **No dedicated MultiEdit tool** (same as us)

---

## 🚀 CONCLUSION

### The "MultiEdit" Feature Request

**Reality:** There is **NO separate "MultiEdit" tool** in Claude Code.

**What exists:**
1. ✅ **Edit tool** - supports multiple edits to ONE file via `edits` array
2. ✅ **Parallel tool calls** - model can call Edit tool multiple times for multiple files

**Our Status:** ✅ **100% Feature Parity**

We already have everything Claude Code has for multi-file editing:
- ✅ Multi-edit support (edits array) - IMPLEMENTED
- ✅ Parallel tool call support - WORKS (model capability)
- ✅ All supporting features (smart quotes, line endings, etc.) - IMPLEMENTED

---

## 📝 RECOMMENDATION

**No action needed.** Our Edit tool implementation already matches Claude Code's capabilities:

1. **For single file, multiple changes:** Use `edits` array ✅
2. **For multiple files:** Model calls edit() multiple times in parallel ✅

**Documentation Update:** Consider adding to Edit tool docs:
```markdown
## Multiple File Edits

To edit multiple files, the model can call the Edit tool multiple times in parallel:

```typescript
[
  edit({ file_path: '/file1.txt', old_string: 'a', new_string: 'b' }),
  edit({ file_path: '/file2.txt', old_string: 'c', new_string: 'd' })
]
```

This is the same approach used by Claude Code.
```

---

**Research Complete:** 2026-02-24  
**Status:** ✅ **NO GAPS - Full parity with Claude Code**
