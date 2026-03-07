# 🔍 DEEP RESEARCH: Claude Code Edit Tool vs OpenClaw Edit Tool

**Date:** 2026-02-24  
**Analysis:** Complete feature-by-feature comparison

---

## 📊 EXECUTIVE SUMMARY

| Category | Claude Code | OpenClaw | Status |
|----------|-------------|----------|--------|
| **Total Features** | 15 | 6 | 🔴 9 gaps |
| **Basic Editing** | ✅ Full | ✅ Basic | ⚠️ Partial |
| **Multi-Edit Support** | ✅ Yes | ❌ No | 🔴 **MISSING** |
| **Replace All** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Read-Before-Edit** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Timestamp Validation** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Permission Checks** | ✅ Full | ⚠️ Basic | 🔴 Gaps |
| **LSP Integration** | ✅ Yes | ❌ No | 🔴 **MISSING** |
| **Git Diff** | ✅ Yes | ❌ No | 🔴 **MISSING** |
| **Notebook Support** | ✅ Yes | ❌ No | 🔴 **MISSING** |

---

## 📋 DETAILED FEATURE COMPARISON

### 1. BASIC PARAMETERS

| Parameter | Claude Code | OpenClaw | Gap |
|-----------|-------------|----------|-----|
| `file_path` (string, required) | ✅ Line 368469 | ✅ Line 172 | ✅ Parity |
| `old_string` (string, required) | ✅ Line 368469 | ✅ Line 175 | ✅ Parity |
| `new_string` (string, required) | ✅ Line 368469 | ✅ Line 178 | ✅ Parity |
| `replace_all` (boolean, optional) | ✅ Line 368588 | ✅ Line 181 | ✅ Parity |
| **`edits` (array, for multi-edit)** | ✅ Line 219123 | ❌ **MISSING** | 🔴 |
| **Input Aliases** | ✅ 7 aliases (line 368453) | ✅ 7 aliases (line 185) | ✅ Parity |

---

### 2. VALIDATION FEATURES

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| Empty change detection | ✅ Line 368478 | ✅ Line 228 | ✅ Parity |
| Permission context check | ✅ Line 368485 | ❌ **MISSING** | 🔴 |
| Network path handling | ✅ Line 368491 | ❌ **MISSING** | 🔴 |
| File exists check | ✅ Line 368501 | ✅ Line 243 | ✅ Parity |
| Typo suggestions | ✅ Line 368511 | ❌ **MISSING** | 🔴 |
| Notebook detection | ✅ Line 368526 | ❌ **MISSING** | 🔴 |
| **Read-before-edit check** | ✅ Line 368532 | ✅ Line 686 | ✅ Parity |
| **Timestamp validation** | ✅ Line 368537 | ✅ Line 711 | ✅ Parity |
| **Encoding detection** | ✅ Line 368543 (I2) | ❌ **MISSING** | 🔴 |
| **String not found check** | ✅ Line 368563 | ✅ Line 254 | ✅ Parity |
| **Multiple occurrences check** | ✅ Line 368573 | ✅ Line 267 | ✅ Parity |

---

### 3. MULTI-EDIT SUPPORT

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Multiple edits in one call** | ✅ Line 219123 | ❌ **MISSING** | 🔴 |
| **Edit ordering** | ✅ Sequential application | ❌ N/A | 🔴 |
| **Edit conflict detection** | ✅ Line 219141 | ❌ **MISSING** | 🔴 |
| **Batch LSP notification** | ✅ Single notification | ❌ N/A | 🔴 |

**Claude Code Multi-Edit Schema (line 283496):**
```typescript
{
  file_path: string,
  edits: [{
    old_string: string,
    new_string: string,
    replace_all: boolean
  }]
}
```

---

### 4. STRING MATCHING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Exact match** | ✅ Line 219043 (w7T) | ✅ Line 254 | ✅ Parity |
| **Smart quote handling** | ✅ Lines 219051-219099 (DQT, cy7, my7) | ❌ **MISSING** | 🔴 |
| **Quote normalization** | ✅ Converts smart quotes | ❌ **MISSING** | 🔴 |
| **Case sensitivity** | ✅ Case-sensitive | ✅ Case-sensitive | ✅ Parity |

**Claude Code Smart Quote Handling:**
```javascript
// Detects and handles smart quotes
const SMART_DOUBLE_QUOTES = ['"', '"'];  // U+201C, U+201D
const SMART_SINGLE_QUOTES = [''', '\''];  // U+2018, U+2019

function normalizeQuotes(str) {
  // Converts smart quotes to regular quotes for matching
  return str.replace(/[""]/g, '"').replace(/['']/g, "'");
}
```

---

### 5. FILE WRITING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Line ending detection** | ✅ Line 368625 (Xp) | ❌ **MISSING** | 🔴 |
| **Encoding detection** | ✅ Line 368626 (I2) | ❌ **MISSING** | 🔴 |
| **Line ending preservation** | ✅ Line 368627 (ye) | ❌ **MISSING** | 🔴 |
| **Directory creation** | ✅ Line 368622 | ✅ Via writeTool | ✅ Parity |
| **Atomic write** | ✅ Via ye function | ✅ Via writeTool | ✅ Parity |

---

### 6. INTEGRATION FEATURES

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **LSP notification** | ✅ Line 368631 | ❌ **MISSING** | 🔴 |
| **Git diff generation** | ✅ Line 368655 | ❌ **MISSING** | 🔴 |
| **Structured patch output** | ✅ Line 368618 (wvT) | ❌ **MISSING** | 🔴 |
| **File history tracking** | ✅ Line 368609 | ❌ **MISSING** | 🔴 |
| **Checkpoint support** | ✅ Line 368609 | ❌ **MISSING** | 🔴 |

---

### 7. OUTPUT/RESPONSE FORMAT

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Create vs Update** | ❌ Not distinguished | ❌ Not distinguished | ✅ Same |
| **Git diff in response** | ✅ Line 368658 | ❌ **MISSING** | 🔴 |
| **Structured patch** | ✅ Line 368618 | ❌ **MISSING** | 🔴 |
| **Original file content** | ✅ Line 368648 | ❌ **MISSING** | 🔴 |
| **User modified flag** | ✅ Line 368651 | ❌ **MISSING** | 🔴 |
| **Replace all flag** | ✅ Line 368652 | ❌ **MISSING** | 🔴 |

**Claude Code Output Schema (line 368645):**
```typescript
{
  filePath: string,
  oldString: string,
  newString: string,
  originalFile: string,
  structuredPatch: Patch[],
  userModified: boolean,
  replaceAll: boolean,
  gitDiff?: {
    filename: string,
    status: "modified" | "added",
    additions: number,
    deletions: number,
    changes: number,
    patch: string
  }
}
```

**OpenClaw Output:**
```typescript
{
  success: boolean,
  error?: string,
  error_code?: string,
  file_path?: string,
  suggestions?: string[]
}
```

---

### 8. NOTEBOOK EDITING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Notebook detection** | ✅ Line 368526 | ❌ **MISSING** | 🔴 |
| **Cell editing** | ✅ Separate NotebookEdit tool | ❌ **MISSING** | 🔴 |
| **Cell insertion** | ✅ edit_mode=insert | ❌ **MISSING** | 🔴 |
| **Cell deletion** | ✅ edit_mode=delete | ❌ **MISSING** | 🔴 |
| **Cell type conversion** | ✅ code/markdown | ❌ **MISSING** | 🔴 |

**Claude Code NotebookEdit Tool (line 368680):**
```typescript
{
  name: "NotebookEdit",
  parameters: {
    notebook_path: string,
    cell_id: string,
    new_source: string,
    cell_type: "code" | "markdown",
    edit_mode: "replace" | "insert" | "delete"
  }
}
```

---

### 9. ERROR HANDLING

| Error Type | Claude Code | OpenClaw | Gap |
|------------|-------------|----------|-----|
| No changes (same strings) | ✅ errorCode 1 (line 368478) | ✅ errorCode 1 (line 228) | ✅ Parity |
| Permission denied | ✅ errorCode 2 (line 368485) | ❌ **MISSING** | 🔴 |
| File exists error | ✅ errorCode 3 (line 368497) | ❌ **MISSING** | 🔴 |
| File not found | ✅ errorCode 4 (line 368511) | ✅ errorCode 4 (line 243) | ✅ Parity |
| Notebook error | ✅ errorCode 5 (line 368526) | ❌ **MISSING** | 🔴 |
| Not read yet | ✅ errorCode 6 (line 368532) | ✅ errorCode 6 (line 686) | ✅ Parity |
| File modified | ✅ errorCode 7 (line 368537) | ✅ errorCode 7 (line 718) | ✅ Parity |
| String not found | ✅ errorCode 8 (line 368563) | ✅ 'TEXT_NOT_FOUND' (line 254) | ✅ Parity |
| Multiple matches | ✅ errorCode 9 (line 368573) | ✅ 'MULTIPLE_OCCURRENCES' (line 267) | ✅ Parity |

---

## 🔴 MISSING FEATURES IN OPENCLAW

### CRITICAL (Core Functionality)

1. **Multi-Edit Support** (Claude Code line 219123)
   - **Why critical:** Allows multiple edits in a single tool call
   - **Implementation:** Array of edits instead of single edit
   - **Schema:** `{ file_path, edits: [{old_string, new_string, replace_all}] }`

2. **Smart Quote Handling** (Claude Code lines 219051-219099)
   - **Why critical:** Code often contains smart quotes from documentation
   - **Implementation:** Normalize smart quotes before matching
   - **Functions:** `DQT()`, `cy7()`, `my7()`

### HIGH (Data Integrity)

3. **Line Ending Detection/Preservation** (Claude Code line 368625)
   - **Why important:** Preserves CRLF/LF consistency
   - **Implementation:** Detect on edit, preserve on write

4. **Encoding Detection** (Claude Code line 368626)
   - **Why important:** Handles UTF-8, UTF-16 correctly
   - **Implementation:** Use I2() function

5. **Permission Context Validation** (Claude Code line 368485)
   - **Why important:** Enforces sandbox permissions
   - **Implementation:** Check against permission context

### MEDIUM (Integration)

6. **LSP Integration** (Claude Code line 368631)
   - Notify language servers of file changes

7. **Git Diff Generation** (Claude Code line 368655)
   - Generate structured diff output

8. **File State Tracking** (Claude Code line 368609)
   - Track edits for history/undo

### LOW (Nice to Have)

9. **Notebook Editing** (Claude Code line 368680)
   - Separate NotebookEdit tool for .ipynb files
   - Cell editing, insertion, deletion

10. **Typo Suggestions** (Claude Code line 368511)
    - Suggest similar file names on ENOENT

---

## 🟢 OPENCLAW ADVANTAGES

### What OpenClaw Has That Claude Code Doesn't:

**NONE IDENTIFIED** - Claude Code's Edit tool is more comprehensive in all aspects.

---

## 📝 SPECIFIC LINE NUMBER REFERENCES

### Claude Code Edit Tool (`/Users/tolga/Desktop/claude_readable_v2.js`):

| Feature | Line Numbers |
|---------|--------------|
| Tool definition (uQ object) | 368423-368680 |
| Input schema | 283471-283500 |
| Output schema | 283496-283520 |
| Input parameter aliases | 368453-368460 |
| Validation function | 368469-368599 |
| Read-before-edit check | 368532-368535 |
| Timestamp validation | 368537-368560 |
| String matching (w7T) | 219043-219049 |
| Quote normalization (DQT) | 219051-219063 |
| Smart quote handling (cy7) | 219068-219078 |
| Smart apostrophe handling (my7) | 219080-219099 |
| String replacement (dy7) | 219101-219110 |
| Multi-edit support | 219123-219160 |
| Patch generation (PvT) | 219123-219160 |
| Call function | 368601-368680 |
| LSP notification | 368631-368640 |
| Git diff generation | 368655-368660 |
| File history tracking | 368609 |

### OpenClaw Edit Tool (`/Users/tolga/.openclaw/workspace/openclaw/src/agents/tools/write.ts`):

| Feature | Line Numbers |
|---------|--------------|
| Schema definition | 171-184 |
| Input parameter aliases | 185-195 |
| Validation function | 207-243 |
| Call function | 245-309 |
| Read-before-edit check | 686 |
| Timestamp validation | 711-718 |
| String not found handling | 254-264 |
| Multiple occurrences handling | 267-280 |
| Write delegation | 770 |

---

## 🎯 RECOMMENDATIONS FOR OPENCLAW

### Phase 1: Critical Features

1. **Implement Multi-Edit Support**
   ```typescript
   const MultiEditSchema = Type.Object({
     file_path: Type.String({ ... }),
     edits: Type.Array(Type.Object({
       old_string: Type.String({ ... }),
       new_string: Type.String({ ... }),
       replace_all: Type.Optional(Type.Boolean({ ... }))
     }))
   });
   ```

2. **Add Smart Quote Handling**
   ```typescript
   const SMART_QUOTES = {
     '"': '"', '"': '"',
     ''': ''', '\'': '\''
   };
   
   function normalizeQuotes(str: string): string {
     return str.replace(/[""''']/g, m => SMART_QUOTES[m as keyof typeof SMART_QUOTES] || m);
   }
   ```

### Phase 2: Data Integrity

3. **Add Line Ending Detection**
   ```typescript
   function detectLineEnding(content: string): '\n' | '\r\n' {
     const crlfCount = (content.match(/\r\n/g) || []).length;
     const lfCount = (content.match(/\n/g) || []).length - crlfCount;
     return crlfCount > lfCount ? '\r\n' : '\n';
   }
   ```

4. **Add Encoding Detection**
   ```typescript
   function detectEncoding(buffer: Buffer): string {
     if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le';
     if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be';
     if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8';
     return 'utf-8';
   }
   ```

### Phase 3: Integration Features

5. **LSP Notification**
6. **Git Diff Generation**
7. **File State Tracking**

### Phase 4: Advanced Features

8. **Notebook Editing Tool**
   - Separate tool for .ipynb files
   - Cell editing, insertion, deletion

---

## 📊 FINAL COMPARISON

| Aspect | Claude Code | OpenClaw | Winner |
|--------|-------------|----------|--------|
| **Core Editing** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Claude Code |
| **Multi-Edit** | ⭐⭐⭐⭐⭐ | ❌ | Claude Code |
| **String Matching** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Claude Code |
| **Data Integrity** | ⭐⭐⭐⭐⭐ | ⭐⭐ | Claude Code |
| **Integration** | ⭐⭐⭐⭐⭐ | ⭐ | Claude Code |
| **Notebook Support** | ⭐⭐⭐⭐⭐ | ❌ | Claude Code |
| **Error Handling** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Claude Code |

---

## 🎉 CONCLUSION

**Claude Code's Edit tool is SIGNIFICANTLY more sophisticated** with:
- Multi-edit support (multiple edits in one call)
- Smart quote/apostrophe handling
- Line ending and encoding preservation
- LSP and Git integration
- Notebook editing support
- Comprehensive error codes

**OpenClaw's implementation is basic** with:
- Single edit only
- No smart quote handling
- No line ending/encoding preservation
- No LSP/Git integration
- No notebook support

**Recommendation:** Implement Phase 1 (Multi-edit, smart quotes) immediately for core functionality, then Phase 2 (line endings, encoding) for data integrity.

---

**Analysis Complete:** 2026-02-24  
**Lines Analyzed:** Claude Code (~260 lines), OpenClaw (~311 lines)
