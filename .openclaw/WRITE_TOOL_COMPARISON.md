# 🔍 DEEP RESEARCH: Claude Code Write Tool vs OpenClaw Write Tool

**Date:** 2026-02-24  
**Analysis:** Complete feature-by-feature comparison

---

## 📊 EXECUTIVE SUMMARY

| Category | Claude Code | OpenClaw | Status |
|----------|-------------|----------|--------|
| **Total Features** | 20 | 8 | 🔴 12 gaps |
| **Basic Writing** | ✅ Full | ✅ Full | ✅ Parity |
| **Atomic Writes** | ✅ Yes | ✅ Yes | ✅ Parity |
| **Security** | ✅ Advanced | ⚠️ Basic | 🔴 Gaps |
| **File State Tracking** | ✅ Full | ❌ None | 🔴 **MISSING** |
| **Encoding Detection** | ✅ Auto | ❌ UTF-8 only | 🔴 **MISSING** |
| **Line Ending Handling** | ✅ Auto-detect/preserve | ❌ None | 🔴 **MISSING** |
| **Permission Handling** | ✅ Full preservation | ❌ None | 🔴 **MISSING** |
| **LSP Integration** | ✅ Yes | ❌ None | 🔴 **MISSING** |
| **Git Diff** | ✅ Yes | ❌ None | 🔴 **MISSING** |

---

## 📋 DETAILED FEATURE COMPARISON

### 1. BASIC PARAMETERS

| Parameter | Claude Code | OpenClaw | Notes |
|-----------|-------------|----------|-------|
| `file_path` (string, required) | ✅ Line 310643 | ✅ Line 6 | Equivalent |
| `content` (string, required) | ✅ Line 310644 | ✅ Line 9 | Equivalent |
| `append` (boolean, optional) | ❌ **NOT SUPPORTED** | ✅ Lines 11-14 | 🏆 **OpenClaw Exclusive** |
| `create_directories` (boolean) | ❌ Auto-created | ✅ Lines 15-18 | 🏆 **OpenClaw Exclusive** |
| **Input Aliases** | ✅ filePath, filepath, path | ✅ Same + content, text | Equivalent |

---

### 2. PATH HANDLING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| Absolute path enforcement | ✅ Line 310643 "must be absolute" | ✅ Line 6 | ✅ Parity |
| Path resolution (relative to cwd) | ✅ Line 310721 (sB function) | ✅ Lines 66-67 | ✅ Parity |
| **Symlink resolution** | ✅ Lines 404788-404795 | ❌ **MISSING** | 🔴 |
| **Network path handling (UNC)** | ✅ Lines 310730-310732 | ❌ **MISSING** | 🔴 |

---

### 3. DIRECTORY CREATION

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| Auto-create parent directories | ✅ Line 310782 (`O.mkdirSync`) | ✅ Lines 103-109 | ✅ Parity |
| **Configurable creation** | ❌ Always auto-creates | ✅ Optional parameter | 🏆 OpenClaw better |

---

### 4. ATOMIC WRITE IMPLEMENTATION

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| Temp file + rename pattern | ✅ Lines 404797-404814 | ✅ Lines 115-124 | ✅ Parity |
| Temp file naming | ✅ `${path}.tmp.${pid}.${timestamp}` | ✅ `${path}.tmp.${timestamp}` | Claude Code includes PID (safer) |
| **Fallback on failure** | ✅ Lines 404816-404828 | ❌ **MISSING** | 🔴 |
| **Temp file cleanup on error** | ✅ Yes | ❌ **MISSING** | 🔴 |

---

### 5. FILE PERMISSIONS

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Permission preservation** | ✅ Lines 404803-404808 | ❌ **MISSING** | 🔴 |
| **Mode setting for new files** | ✅ Lines 404805-404806 | ❌ **MISSING** | 🔴 |
| Read-only file check | ✅ Via permission context | ✅ Lines 87-95 | ✅ Parity |

---

### 6. LINE ENDING HANDLING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Line ending detection** | ✅ Lines 404668-404682 (Xp function) | ❌ **MISSING** | 🔴 |
| **Line ending preservation** | ✅ Lines 404617-404622 (ye function) | ❌ **MISSING** | 🔴 |
| **CRLF/LF auto-detection** | ✅ Lines 404674-404682 (Nz8 function) | ❌ **MISSING** | 🔴 |

**Claude Code Implementation:**
```javascript
// Detect line endings (Xp function)
function detectLineEndings(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/\n/g) || []).length - crlfCount;
  return crlfCount > lfCount ? '\r\n' : '\n';
}

// Preserve line endings when writing (ye function)
function writeFileWithLineEndings(filePath, content, lineEnding) {
  const normalized = content.replace(/\r?\n/g, lineEnding);
  fs.writeFileSync(filePath, normalized, 'utf-8');
}
```

---

### 7. ENCODING DETECTION

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Auto-detect file encoding** | ✅ Lines 404640-404665 (I2 function) | ❌ Always UTF-8 | 🔴 |
| **BOM detection (UTF-16, UTF-8)** | ✅ Lines 404652-404660 | ❌ **MISSING** | 🔴 |

**Claude Code Implementation:**
```javascript
// Encoding detection (I2 function)
function detectEncoding(filePath) {
  const buffer = fs.readFileSync(filePath);
  // Check for BOM markers
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le';
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be';
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8';
  return 'utf-8'; // Default
}
```

---

### 8. VALIDATION & SECURITY

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| Path validation | ✅ Lines 310721-310744 | ✅ Lines 56-96 | ✅ Parity |
| **Read-before-write enforcement** | ✅ Lines 310732-310744 | ❌ **NOT REQUIRED** | 🔴 Different security model |
| **Timestamp check (external mods)** | ✅ Lines 310737-310743 | ❌ **MISSING** | 🔴 |
| Directory permission check | ✅ Via KW function | ✅ Lines 70-84 | Different approaches |
| **Permission context validation** | ✅ Lines 310724-310729 | ❌ **MISSING** | 🔴 |

**Claude Code Security Model:**
```javascript
// Read-before-write check
let fileState = readFileState.get(filePath);
if (!fileState) {
  return {
    result: false,
    message: "File has not been read yet. Read it first before writing to it.",
    errorCode: 2
  };
}

// Timestamp validation (detect external modifications)
if (getMtime(filePath) > fileState.timestamp) {
  return {
    result: false,
    message: "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.",
    errorCode: 3
  };
}
```

---

### 9. FILE STATE TRACKING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **File history tracking** | ✅ Line 310777 (`trackFileEditInHistory`) | ❌ **MISSING** | 🔴 |
| **Checkpoint support** | ✅ Lines 310775-310777 | ❌ **MISSING** | 🔴 |
| **Original content tracking** | ✅ Lines 310779-310780 | ❌ **MISSING** | 🔴 |
| **File state in memory** | ✅ `readFileState` Map | ❌ **MISSING** | 🔴 |

---

### 10. INTEGRATION FEATURES

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **LSP notification** | ✅ Lines 310785-310792 | ❌ **MISSING** | 🔴 |
| **Git diff generation** | ✅ Lines 310807-310825 | ❌ **MISSING** | 🔴 |
| **Structured patch output** | ✅ Output schema line 310649 | ❌ **MISSING** | 🔴 |
| **File watched notification** | ✅ `vYR()` call | ❌ **MISSING** | 🔴 |

---

### 11. OUTPUT/RESPONSE FORMAT

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Create vs Update distinction** | ✅ Lines 310807-310850 | ❌ Single format | 🔴 |
| **Git diff in response** | ✅ Optional in output | ❌ **MISSING** | 🔴 |
| **Structured patch in response** | ✅ Included | ❌ **MISSING** | 🔴 |
| **Original file content** | ✅ `originalFile` field | ❌ **MISSING** | 🔴 |

**Claude Code Output Schema:**
```typescript
{
  type: "create" | "update",
  filePath: string,
  content: string,
  structuredPatch: Patch[],  // Diff patch
  originalFile: string | null,  // Original content
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
  file_path: string,
  bytes_written: number,
  file_size: number,
  operation: "append" | "write",
  message: string
}
```

---

### 12. ERROR HANDLING

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| Error codes | ✅ Lines 310727, 310735, 310742 | ✅ Lines 62, 68, 75, 82, 89 | ✅ Parity |
| **Fallback write mechanism** | ✅ Lines 404816-404828 | ❌ **MISSING** | 🔴 |
| **Specific error messages** | ✅ Detailed | ✅ Good | ✅ Parity |

---

## 🔴 MISSING FEATURES IN OPENCLAW (Priority Order)

### CRITICAL (Security/Safety)

1. **Read-Before-Write Enforcement** (Lines 310732-310744)
   - **Why critical:** Prevents accidental overwrites of unread files
   - **Implementation:** Track which files have been read in session state
   - **Error message:** "File has not been read yet. Read it first before writing to it."

2. **External Modification Detection** (Lines 310737-310743)
   - **Why critical:** Detects if file was modified by user/linter between read and write
   - **Implementation:** Compare file mtime with stored read timestamp
   - **Error message:** "File has been modified since read... Read it again"

3. **Permission Context Validation** (Lines 310724-310729)
   - **Why critical:** Enforces sandbox/file permissions
   - **Implementation:** Check against permission context before writing

### HIGH (Data Integrity)

4. **Line Ending Detection & Preservation** (Lines 404617-404682)
   - **Why important:** Preserves CRLF/LF consistency on Windows/cross-platform
   - **Implementation:** Detect on read, preserve on write

5. **Encoding Auto-Detection** (Lines 404640-404665)
   - **Why important:** Handles UTF-16, BOM markers correctly
   - **Implementation:** Check BOM markers, detect encoding

6. **Permission Preservation** (Lines 404803-404808)
   - **Why important:** Maintains file permissions after overwrite
   - **Implementation:** Store original mode, restore after write

### MEDIUM (Integration)

7. **LSP Integration** (Lines 310785-310792)
   - Notify language servers of file changes
   - Trigger file save events

8. **Git Diff Generation** (Lines 310807-310825)
   - Generate structured diff output
   - Show additions/deletions

9. **File State Tracking** (Line 310777)
   - Track edits for history/undo
   - Support checkpointing

### LOW (Nice to Have)

10. **Fallback Write Mechanism** (Lines 404816-404828)
    - Non-atomic fallback if atomic fails
    - Clean up temp files on error

11. **Symlink Resolution** (Lines 404788-404795)
    - Follow symlinks when writing
    - Log symlink resolution

12. **Network Path Handling** (Lines 310730-310732)
    - Handle UNC paths (\\server\share)
    - Windows network share support

---

## 🟢 OPENCLAW ADVANTAGES

### What OpenClaw Has That Claude Code Doesn't:

1. **Append Mode** (Lines 11-14, 118)
   - Very useful for log files and incremental updates
   - Uses 'a' flag when writing

2. **Configurable Directory Creation** (Lines 15-18)
   - Can disable auto-creation for security
   - More control over file system operations

3. **Simpler Output Format**
   - Easier to parse programmatically
   - Less overhead for simple use cases

---

## 📝 SPECIFIC LINE NUMBER REFERENCES

### Claude Code Write Tool (`/Users/tolga/Desktop/claude_readable_v2.js`):

| Feature | Line Numbers |
|---------|--------------|
| Input schema definition | 310643-310645 |
| Output schema definition | 310647-310656 |
| Tool definition (bW object) | 310658-310870 |
| Input parameter aliases | 310693-310696 |
| Validation function | 310718-310745 |
| **Read-before-write check** | 310732-310735 |
| **Timestamp validation** | 310737-310743 |
| Call function (main logic) | 310746-310850 |
| Directory creation | 310782 |
| **Line ending detection call** | 310781 |
| **File write (ye function)** | 310782 |
| **LSP notification** | 310785-310792 |
| **Git diff generation** | 310807-310825 |
| **Atomic write (Zz function)** | 404782-404829 |
| **Symlink resolution** | 404788-404795 |
| **Permission preservation** | 404803-404808 |
| **Line ending detection (Xp)** | 404668-404682 |
| **Encoding detection (I2)** | 404640-404665 |
| **Line ending conversion (ye)** | 404617-404622 |
| **File history tracking** | 310777 |
| **Checkpoint support** | 310775-310777 |

### OpenClaw Write Tool (`/Users/tolga/.openclaw/workspace/openclaw/src/agents/tools/write.ts`):

| Feature | Line Numbers |
|---------|--------------|
| Schema definition | 6-19 |
| Input parameter aliases | 20-26 |
| Validation function | 53-96 |
| Path resolution | 66-67 |
| Directory access check | 70-84 |
| File permission check | 87-95 |
| Call function | 98-145 |
| Directory creation | 103-109 |
| Atomic write (temp + rename) | 115-124 |
| Append mode | 118 |
| Edit tool schema | 171-184 |
| Edit tool validation | 207-243 |
| Edit tool call | 245-309 |

---

## 🎯 RECOMMENDATIONS FOR OPENCLAW

### Phase 1: Critical Security Features

1. **Implement Read-Before-Write**
   ```typescript
   // Add to validateInput
   const fileState = readFileState.get(resolved);
   if (!fileState) {
     return {
       result: false,
       message: "File has not been read yet. Read it first before writing to it.",
       errorCode: 6
     };
   }
   ```

2. **Add Timestamp Validation**
   ```typescript
   // Check if file was modified externally
   const stats = await fs.promises.stat(resolved);
   if (stats.mtimeMs > fileState.timestamp) {
     return {
       result: false,
       message: "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.",
       errorCode: 7
     };
   }
   ```

### Phase 2: Data Integrity

3. **Line Ending Detection/Preservation**
   ```typescript
   function detectLineEnding(content: string): string {
     const crlfCount = (content.match(/\r\n/g) || []).length;
     const lfCount = (content.match(/\n/g) || []).length - crlfCount;
     return crlfCount > lfCount ? '\r\n' : '\n';
   }
   
   function preserveLineEndings(content: string, originalEnding: string): string {
     return content.replace(/\r?\n/g, originalEnding);
   }
   ```

4. **Encoding Detection**
   ```typescript
   function detectEncoding(buffer: Buffer): string {
     if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le';
     if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be';
     if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return 'utf-8';
     return 'utf-8';
   }
   ```

5. **Permission Preservation**
   ```typescript
   // Store original permissions
   const originalStats = await fs.promises.stat(resolved);
   const originalMode = originalStats.mode;
   
   // After write, restore permissions
   await fs.promises.chmod(resolved, originalMode);
   ```

### Phase 3: Integration Features

6. **LSP Notification**
   ```typescript
   // Notify LSP servers of file change
   if (lspClient) {
     await lspClient.notifyFileChanged(filePath);
   }
   ```

7. **Git Diff Generation**
   ```typescript
   // Generate diff
   const diff = await generateGitDiff(originalContent, newContent);
   ```

8. **Enhanced Output Schema**
   ```typescript
   const output = {
     type: isCreate ? 'create' : 'update',
     filePath,
     content,
     structuredPatch: generatePatch(original, newContent),
     originalFile: originalContent,
     gitDiff: diff
   };
   ```

---

## 📊 FINAL COMPARISON

| Aspect | Claude Code | OpenClaw | Winner |
|--------|-------------|----------|--------|
| **Security** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Claude Code |
| **Data Integrity** | ⭐⭐⭐⭐⭐ | ⭐⭐ | Claude Code |
| **Integration** | ⭐⭐⭐⭐⭐ | ⭐ | Claude Code |
| **Simplicity** | ⭐⭐ | ⭐⭐⭐⭐⭐ | OpenClaw |
| **Append Mode** | ❌ | ✅ | OpenClaw |
| **Configurable** | ❌ | ✅ | OpenClaw |

---

## 🎉 CONCLUSION

**Claude Code's Write tool is SIGNIFICANTLY more sophisticated** with:
- Extensive security checks (read-before-write, timestamp validation)
- File state tracking and checkpointing
- Encoding and line ending preservation
- LSP and Git integration
- Structured output with diffs

**OpenClaw's implementation is simpler but has advantages:**
- Append mode (useful for logs)
- Configurable directory creation
- Simpler output format (easier to parse)

**Recommendation:** Implement Phase 1 (Critical Security) features immediately for safety, then Phase 2 (Data Integrity) for cross-platform compatibility.

---

**Analysis Complete:** 2026-02-24  
**Lines Analyzed:** Claude Code (~230 lines), OpenClaw (~343 lines)
