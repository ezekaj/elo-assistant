# Complete Claude Code Tools Port to OpenClaw

## All Core Tools Being Ported

This document tracks the porting of ALL Claude Code core tools to OpenClaw.

---

## ✅ COMPLETED PORTS

### 1. Grep Tool (Complete ripgrep implementation)
**Status:** ✅ COMPLETE
**File:** `/src/agents/tools/grep.ts`
**Lines:** ~280

**Features Ported:**
- Full ripgrep with all parameters
- Three output modes (content, files_with_matches, count)
- Context lines (-A, -B, -C)
- Glob filtering
- Type filtering
- Pagination
- Case insensitive
- Multiline mode
- VCS exclusion
- Permission-based exclusions

---

### 2. Task Tool (Background operations)
**Status:** ✅ COMPLETE
**File:** `/src/agents/tools/task.ts`
**Lines:** ~350

**Features Ported:**
- Background execution
- Task ID tracking
- Output capture
- Timeout support
- Status management
- Cancellation
- Security validation
- 4 sub-tools (task, task_get, task_list, task_cancel)

---

### 3. MCP Client
**Status:** ✅ COMPLETE
**File:** `/src/mcp/client.ts`
**Lines:** ~300

**Features Ported:**
- MCP protocol 2024-11-05
- Multiple server support
- Auto tool registration
- JSON-RPC 2.0
- Timeout handling
- Reconnection logic

---

## 🔄 REMAINING TOOLS TO PORT

### 4. Read Tool
**Status:** ⏳ PENDING
**Claude Code Lines:** ~600
**Key Features:**
- File reading with line numbers
- Offset/limit pagination
- PDF support (page extraction)
- Image support (base64)
- Jupyter notebook support (.ipynb)
- Binary file detection
- Permission checking
- Content truncation
- Encoding detection

**Implementation Plan:**
```typescript
// /src/agents/tools/read.ts
- Read file with line numbers (cat -n format)
- Support offset/limit for large files
- Detect binary vs text
- Image base64 encoding
- PDF page extraction (1-20 pages)
- Notebook cell+output rendering
- Permission validation
- Max size enforcement (100KB result)
```

---

### 5. Write Tool
**Status:** ⏳ PENDING
**Claude Code Lines:** ~400
**Key Features:**
- File creation/overwriting
- Append mode
- Directory creation
- Permission checking
- Backup creation
- Atomic writes

**Implementation Plan:**
```typescript
// /src/agents/tools/write.ts
- Write file (overwrite by default)
- Append mode option
- Create parent directories
- Check write permissions
- Atomic write (temp + rename)
```

---

### 6. Edit Tool (MultiEdit)
**Status:** ⏳ PENDING
**Claude Code Lines:** ~800
**Key Features:**
- Search and replace
- Multiple edits in one call
- Diff viewing
- Undo support
- Line-based and block-based edits
- Validation

**Implementation Plan:**
```typescript
// /src/agents/tools/edit.ts
- Single edit (search/replace)
- MultiEdit (multiple operations)
- Diff output
- Line number tracking
- Validation (must read first)
```

---

### 7. Bash Tool
**Status:** ⏳ PENDING (OpenClaw has basic bash, needs enhancement)
**Claude Code Lines:** ~1000
**Key Features:**
- Timeout management (120s default, 10min max)
- Output truncation (200KB limit)
- Background execution
- Sandbox detection
- Permission checking
- Dangerous command detection
- Output streaming

**Implementation Plan:**
```typescript
// /src/agents/tools/bash.ts (enhance existing)
- Timeout enforcement
- Output limit (200KB)
- run_in_background parameter
- Sandbox detection
- Dangerous command blocking
- Description requirement
```

---

### 8. Glob Tool
**Status:** ⏳ PENDING
**Note:** Claude Code uses Grep with glob parameter, not separate tool
**Implementation:** Already covered by Grep tool

---

### 9. WebSearch Tool
**Status:** ✅ ALREADY IN OPENCLAW
**Note:** OpenClaw has better multi-provider search

---

### 10. WebFetch Tool
**Status:** ✅ ALREADY IN OPENCLAW (Better than Claude Code)
**Note:** OpenClaw has Firecrawl fallback, SSRF protection

---

### 11. Image Tool
**Status:** ✅ ALREADY IN OPENCLAW

---

### 12. NotebookEdit Tool
**Status:** ⏳ PENDING
**Claude Code Lines:** ~500
**Key Features:**
- Jupyter notebook editing
- Cell insertion/deletion/modification
- Output preservation
- Validation

**Implementation Plan:**
```typescript
// /src/agents/tools/notebook-edit.ts
- Read .ipynb JSON
- Cell operations (insert, delete, modify)
- Preserve outputs
- Validate cell structure
```

---

## 📊 PORTING PROGRESS

| Tool | Status | Lines | Priority |
|------|--------|-------|----------|
| Grep | ✅ Complete | 280 | DONE |
| Task | ✅ Complete | 350 | DONE |
| MCP Client | ✅ Complete | 300 | DONE |
| Read | ⏳ Pending | 600 | HIGH |
| Write | ⏳ Pending | 400 | HIGH |
| Edit/MultiEdit | ⏳ Pending | 800 | HIGH |
| Bash (enhanced) | ⏳ Pending | 1000 | MEDIUM |
| NotebookEdit | ⏳ Pending | 500 | LOW |

**Total Progress:** 3/9 tools complete (33%)
**Lines Written:** 930
**Lines Remaining:** ~3300

---

## 🎯 NEXT STEPS

### Immediate (HIGH Priority)
1. **Read Tool** - Most critical for file operations
2. **Write Tool** - Essential for file creation
3. **Edit Tool** - Core editing capability

### Short-term (MEDIUM Priority)
4. **Bash Enhancement** - Add timeout, background, sandbox features

### Long-term (LOW Priority)
5. **NotebookEdit** - Specialized for Jupyter

---

## 📝 IMPLEMENTATION NOTES

### Read Tool Considerations
- Must handle multiple file types (text, image, PDF, notebook)
- Line number formatting (cat -n style)
- Truncation at 100KB result limit
- PDF requires page range (max 20 pages)
- Images return base64
- Notebooks return cells+outputs

### Write Tool Considerations
- Default: overwrite existing
- Append mode as option
- Create parent dirs automatically
- Atomic writes for safety
- Check permissions first

### Edit Tool Considerations
- MUST read file first (validation)
- Search/replace with context
- Multiple edits in one call
- Return diff for display
- Track line number changes

### Bash Enhancement Considerations
- Respect existing OpenClaw bash
- Add timeout management
- Add background execution
- Add sandbox detection
- Add dangerous command detection
- Output truncation

---

## 🔧 CONFIGURATION NEEDED

### Read Tool Config
```json
{
  "tools": {
    "read": {
      "maxResultSizeChars": 100000,
      "maxLinesDefault": 2000,
      "maxLineLength": 2000,
      "supportedImages": ["png", "jpg", "jpeg", "gif", "webp", "svg"],
      "pdfMaxPages": 20
    }
  }
}
```

### Write Tool Config
```json
{
  "tools": {
    "write": {
      "createDirectories": true,
      "atomicWrites": true,
      "backupOnOverwrite": false
    }
  }
}
```

### Edit Tool Config
```json
{
  "tools": {
    "edit": {
      "maxEditsPerCall": 10,
      "requireReadFirst": true,
      "returnDiff": true
    }
  }
}
```

### Bash Enhancement Config
```json
{
  "tools": {
    "bash": {
      "defaultTimeoutMs": 120000,
      "maxTimeoutMs": 600000,
      "maxOutputChars": 200000,
      "dangerousCommands": [
        "rm -rf /",
        "mkfs",
        "dd if=/dev/zero",
        ":(){:|:&};:"
      ]
    }
  }
}
```

---

## ✅ TESTING CHECKLIST

For each tool:
- [ ] Type checking passes
- [ ] Unit tests written
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Documentation updated
- [ ] Config schema validated

---

**Last Updated:** 2026-02-23
**Target Completion:** All tools ported
**OpenClaw Version:** 2026.2.3
