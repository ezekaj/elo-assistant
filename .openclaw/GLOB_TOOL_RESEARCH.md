# 🔍 GLOB TOOL DEEP RESEARCH REPORT

**Date:** 2026-02-24  
**Source:** Claude Code (claude_readable_v2.js)  
**Tool Name:** Glob (J1 constant at line 146311)

---

## 📊 EXECUTIVE SUMMARY

**Finding:** Claude Code's Glob tool is a **ripgrep-based file pattern matching tool** that provides fast, sorted file search with support for:
- Glob patterns (`**/*.ts`, `src/**/*.tsx`)
- Result limiting (default 100 files)
- Pagination via offset
- Hidden file support (configurable)
- Ignore file support (configurable)
- Results sorted by modification time

**Implementation:** Uses ripgrep (`rg`) command-line tool under the hood, NOT a JavaScript glob library.

---

## 🔍 TOOL DEFINITION

### Basic Information (Lines 283336-283465)

```typescript
const J1 = "Glob";  // Tool name (line 146311)

// Input Schema (lines 283336-283340)
{
  pattern: string,      // The glob pattern to match files against
  path?: string         // Optional directory to search in
}

// Output Schema (lines 283340-283345)
{
  durationMs: number,    // Time taken in milliseconds
  numFiles: number,      // Total number of files found
  filenames: string[],   // Array of matching file paths
  truncated: boolean     // Whether results were truncated (limited to 100)
}
```

---

## 📋 COMPLETE FEATURE ANALYSIS

### 1. INPUT PARAMETERS

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | ✅ Yes | The glob pattern to match (e.g., `**/*.ts`) |
| `path` | string | ❌ No | Directory to search (defaults to cwd) |

**Input Aliases (line 283365):**
```typescript
{
  directory: "path"  // Can use "directory" instead of "path"
}
```

**Path Handling (lines 283377-283384):**
```typescript
getPath({ path: T }) {
  return T ? sB(T) : getStoreSafe()  // Resolves to cwd if not provided
}
```

---

### 2. VALIDATION (lines 283384-283416)

**Validation Checks:**

```typescript
async validateInput({ path: T }) {
  if (T) {
    // 1. Check if path exists
    if (!R.existsSync(A)) {
      return {
        result: false,
        message: `Directory does not exist: ${T}.`,
        errorCode: 1
      };
    }
    
    // 2. Check if path is a directory
    if (!R.statSync(A).isDirectory()) {
      return {
        result: false,
        message: `Path is not a directory: ${T}`,
        errorCode: 2
      };
    }
  }
  return { result: true };
}
```

**Error Codes:**
| Code | Message |
|------|---------|
| 1 | Directory does not exist |
| 2 | Path is not a directory |

---

### 3. CORE IMPLEMENTATION (lines 404576-404606)

**Function Signature:**
```typescript
async function tCB(
  T: string,      // pattern
  R: string,      // base directory
  {
    limit: A,     // max results
    offset: _     // pagination offset
  },
  B: AbortSignal, // abort signal
  D: PermissionContext  // permission context
): Promise<{ files: string[], truncated: boolean }>
```

**Implementation:**
```typescript
async function tCB(T, R, { limit: A, offset: _ }, B, D) {
  // 1. Handle absolute paths in pattern
  let $ = R, H = T;
  if (X$.isAbsolute(T)) {
    let { baseDir: L, relativePattern: K } = Kz8(T);
    if (L) $ = L, H = K;
  }
  
  // 2. Get permission-based exclusions
  let q = WLT(hLT(D), $);  // Get excluded paths from permissions
  
  // 3. Configure ignore/hidden behavior
  let O = isTruthy(process.env.CLAUDE_CODE_GLOB_NO_IGNORE || "true");
  let G = isTruthy(process.env.CLAUDE_CODE_GLOB_HIDDEN || "true");
  
  // 4. Build ripgrep command
  let C = [
    "--files",           // List files only (no content search)
    "--glob", H,         // Glob pattern
    "--sort=modified",   // Sort by modification time
    ...O ? ["--no-ignore"] : [],   // Don't respect .gitignore etc
    ...G ? ["--hidden"] : []       // Include hidden files
  ];
  
  // 5. Add permission-based exclusions
  for (let L of q) C.push("--glob", `!${L}`);
  
  // 6. Execute ripgrep
  let W = (await AF(C, $, B)).map((L) => 
    X$.isAbsolute(L) ? L : X$.join($, L)
  );
  
  // 7. Apply pagination
  let h = W.length > _ + A;
  return {
    files: W.slice(_, _ + A),  // Apply offset and limit
    truncated: h
  };
}
```

---

### 4. RIPGREP COMMAND CONSTRUCTION

**Default Command:**
```bash
rg --files --glob "<pattern>" --sort=modified --no-ignore --hidden
```

**Command Flags:**
| Flag | Purpose | Default |
|------|---------|---------|
| `--files` | List files only (no content search) | Always |
| `--glob <pattern>` | Apply glob pattern | Always |
| `--sort=modified` | Sort by modification time | Always |
| `--no-ignore` | Don't respect .gitignore etc | env: `CLAUDE_CODE_GLOB_NO_IGNORE` |
| `--hidden` | Include hidden files | env: `CLAUDE_CODE_GLOB_HIDDEN` |
| `--glob '!<exclusion>'` | Exclude paths | From permissions |

**Environment Variables:**
```typescript
// Default: "true" - ignores are disabled by default
process.env.CLAUDE_CODE_GLOB_NO_IGNORE || "true"

// Default: "true" - hidden files are included by default  
process.env.CLAUDE_CODE_GLOB_HIDDEN || "true"
```

---

### 5. PERMISSION INTEGRATION

**Permission-Based Exclusions (line 404593):**
```typescript
let q = WLT(hLT(D), $);  // Get excluded paths
for (let L of q) C.push("--glob", `!${L}`);  // Add as exclusions
```

**How it works:**
1. Gets permission context from app state
2. Extracts denied paths for the Glob tool
3. Converts each to a ripgrep exclusion pattern (`!pattern`)
4. Adds to ripgrep command

---

### 6. RESULT LIMITING

**Default Limits (line 283428):**
```typescript
let $ = _?.maxResults ?? 100;  // Default: 100 files
```

**Pagination:**
```typescript
// Slice results with offset and limit
files: W.slice(_, _ + A),
truncated: W.length > _ + A
```

**Output includes:**
- `filenames`: Array of file paths (max 100 by default)
- `truncated`: Boolean indicating if more results exist
- `numFiles`: Actual number of results returned
- `durationMs`: Execution time in milliseconds

---

### 7. OUTPUT FORMATTING

**Result Mapping (lines 283453-283465):**
```typescript
mapToolResultToToolResultBlockParam(T, R) {
  if (T.filenames.length === 0) return {
    tool_use_id: R,
    type: "tool_result",
    content: "No files found"
  };
  
  return {
    tool_use_id: R,
    type: "tool_result",
    content: [
      ...T.filenames,
      ...T.truncated ? ["(Results are truncated. Consider using a more specific path or pattern.)"] : []
    ].join('\n')
  };
}
```

**Output Format:**
```
/path/to/file1.ts
/path/to/file2.ts
/path/to/file3.ts
(Results are truncated. Consider using a more specific path or pattern.)
```

---

### 8. TOOL DESCRIPTION & PROMPT

**Tool Description (line 146312):**
```
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds 
  of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response
```

**Usage Prompt (lines 283419-283422):**
```typescript
async prompt() {
  return w6A;  // Returns the description above
}
```

---

## 🔧 GLOB PATTERN SUPPORT

Since Claude Code uses **ripgrep** for glob matching, it supports all ripgrep glob patterns:

### Basic Patterns

| Pattern | Matches |
|---------|---------|
| `*.ts` | All TypeScript files in current directory |
| `**/*.ts` | All TypeScript files recursively |
| `src/**/*.ts` | TypeScript files under src/ |
| `*.{ts,tsx}` | TypeScript and TSX files |
| `**/*.test.ts` | All test files |

### Advanced Patterns

| Pattern | Matches |
|---------|---------|
| `**/node_modules/*` | Files in node_modules |
| `!**/node_modules/**` | Exclude node_modules |
| `**/src/**/*.{ts,tsx}` | TypeScript files in any src directory |
| `**/*.min.js` | Minified JavaScript files |

### Ripgrep-Specific Features

Since it uses ripgrep, these features are available:
- Brace expansion: `*.{js,ts,tsx}`
- Negation: `!**/vendor/**`
- Recursive matching: `**` matches any directory depth
- Case sensitivity: Controlled by ripgrep settings

---

## 📊 COMPARISON WITH OPENCLAW GLOB

### Current OpenClaw Implementation

**File:** `/src/agents/tools/grep.ts`

**Features:**
- ✅ Uses ripgrep (`rg`)
- ✅ Supports glob patterns via `--glob` flag
- ✅ Output modes: content, files_with_matches, count
- ✅ Type filtering (`--type`)
- ✅ Context lines (`-A`, `-B`, `-C`)
- ✅ Case insensitive (`-i`)
- ✅ Pagination (`head_limit`, `offset`)

**Missing vs Claude Code:**
- ❌ No dedicated Glob tool (uses Grep with glob parameter)
- ❌ No `--no-ignore` environment variable
- ❌ No `--hidden` environment variable
- ❌ No automatic sorting by modification time
- ❌ No built-in truncation at 100 results

---

## 🎯 RECOMMENDATIONS FOR OPENCLAW

### Option 1: Create Dedicated Glob Tool

**Create:** `/src/agents/tools/glob.ts`

```typescript
import { Type } from "@sinclair/typebox";
import { execa } from "execa";
import { jsonResult } from "./common.js";

const GlobSchema = Type.Object({
  pattern: Type.String({
    description: 'The glob pattern to match files against (e.g., "**/*.ts")'
  }),
  path: Type.Optional(Type.String({
    description: 'Directory to search (defaults to current working directory)'
  })),
  limit: Type.Optional(Type.Number({
    description: 'Maximum number of results (default: 100)',
    default: 100
  })),
  offset: Type.Optional(Type.Number({
    description: 'Pagination offset (default: 0)',
    default: 0
  })),
  includeHidden: Type.Optional(Type.Boolean({
    description: 'Include hidden files (default: true)',
    default: true
  })),
  respectIgnore: Type.Optional(Type.Boolean({
    description: 'Respect .gitignore and other ignore files (default: false)',
    default: false
  }))
});

export function createGlobTool(): AnyAgentTool {
  return {
    label: 'Glob',
    name: 'glob',
    description: 'Fast file pattern matching using ripgrep',
    parameters: GlobSchema,
    // ... implementation
  };
}
```

### Option 2: Enhance Existing Grep Tool

Add glob-specific parameters to existing Grep tool:
- `--sort=modified` flag
- `--no-ignore` flag (configurable)
- `--hidden` flag (configurable)
- Built-in 100 result limit with truncation notice

---

## 📝 IMPLEMENTATION DETAILS

### Key Functions from Claude Code

| Function | Line | Purpose |
|----------|------|---------|
| `tCB` | 404576 | Main glob implementation |
| `Kz8` | ~404560 | Parse absolute path to baseDir + pattern |
| `WLT` | ~397129 | Get permission-based exclusions |
| `AF` | ~380392 | Execute ripgrep command |
| `sB` | ~143897 | Resolve path to absolute |

### Environment Variables

```typescript
// Control ignore file behavior
process.env.CLAUDE_CODE_GLOB_NO_IGNORE  // Default: "true"

// Control hidden file inclusion
process.env.CLAUDE_CODE_GLOB_HIDDEN  // Default: "true"
```

### Permission Integration

```typescript
// Get excluded paths from permission context
let q = WLT(hLT(D), $);

// WLT function extracts deny rules for Glob tool
// hLT extracts tool permission context from app state
// D is the full permission context
```

---

## 🧪 TESTING RECOMMENDATIONS

### Test Cases for OpenClaw Glob

```typescript
describe('Glob Tool', () => {
  it('should find files matching pattern', async () => {
    const result = await glob({ pattern: '**/*.ts' });
    expect(result.filenames).toBeDefined();
    expect(result.filenames.length).toBeGreaterThan(0);
  });

  it('should respect limit parameter', async () => {
    const result = await glob({ pattern: '**/*.ts', limit: 10 });
    expect(result.filenames.length).toBeLessThanOrEqual(10);
  });

  it('should support pagination', async () => {
    const page1 = await glob({ pattern: '**/*.ts', limit: 10, offset: 0 });
    const page2 = await glob({ pattern: '**/*.ts', limit: 10, offset: 10 });
    expect(page1.filenames).not.toEqual(page2.filenames);
  });

  it('should indicate truncation', async () => {
    const result = await glob({ pattern: '**/*', limit: 5 });
    if (result.numFiles > 5) {
      expect(result.truncated).toBe(true);
    }
  });

  it('should handle hidden files', async () => {
    const withHidden = await glob({ pattern: '**/.*', includeHidden: true });
    const withoutHidden = await glob({ pattern: '**/.*', includeHidden: false });
    expect(withHidden.filenames.length).toBeGreaterThanOrEqual(
      withoutHidden.filenames.length
    );
  });
});
```

---

## 🎉 CONCLUSION

### Claude Code Glob Tool Summary

| Aspect | Implementation |
|--------|---------------|
| **Engine** | ripgrep (`rg --files`) |
| **Pattern Support** | Full glob syntax via ripgrep |
| **Sorting** | By modification time |
| **Limit** | 100 files (configurable) |
| **Pagination** | Via offset parameter |
| **Hidden Files** | Included by default (configurable) |
| **Ignore Files** | Ignored by default (configurable) |
| **Permissions** | Integrated with permission system |
| **Output** | Filenames array + truncation flag |

### Key Advantages

1. **Fast** - Uses ripgrep's optimized file search
2. **Sorted** - Results sorted by modification time (most recent first)
3. **Configurable** - Environment variables control behavior
4. **Permission-aware** - Respects file permission settings
5. **Pagination** - Built-in support for large result sets

---

**Research Complete:** 2026-02-24  
**Lines Analyzed:** 283336-283465, 404576-404606  
**Status:** ✅ **Complete Analysis**
