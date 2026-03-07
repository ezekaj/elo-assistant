# 📋 EDIT TOOL IMPLEMENTATION PLAN

**Date:** 2026-02-24  
**Goal:** Implement all Claude Code Edit tool features in OpenClaw

---

## 🎯 IMPLEMENTATION PHASES

### Phase 1: Core Features (CRITICAL)
1. Multi-edit support (edits array)
2. Smart quote/apostrophe handling
3. Enhanced error codes

### Phase 2: Data Integrity (HIGH)
4. Line ending detection/preservation
5. Encoding detection
6. Permission context validation

### Phase 3: Integration (MEDIUM)
7. LSP notification
8. Git diff generation
9. File state tracking

### Phase 4: Advanced Features (LOW)
10. Notebook editing tool
11. Typo suggestions

---

## 📦 DEPENDENCIES

```json
{
  "dependencies": {
    "diff": "^5.1.0"
  }
}
```

**Install:**
```bash
cd /Users/tolga/.openclaw/workspace/openclaw
pnpm add -w diff
```

---

## 🔧 FILE MODIFICATIONS

### Primary File: `/src/agents/tools/write.ts`

**Current State:**
- Edit tool embedded in write.ts (lines 609-775)
- Single edit only
- Basic string matching
- No smart quote handling
- No line ending/encoding preservation

**Target State:**
- Separate Edit tool file: `/src/agents/tools/edit.ts`
- Multi-edit support
- Smart quote handling
- Line ending/encoding preservation
- LSP/Git integration
- Structured output

---

## 📝 IMPLEMENTATION DETAILS

### Phase 1: Core Features

#### 1. Multi-Edit Support

**Schema Change:**
```typescript
const EditSchema = Type.Object({
  file_path: Type.String({ ... }),
  // SINGLE EDIT (backward compatible)
  old_string: Type.Optional(Type.String({ ... })),
  new_string: Type.Optional(Type.String({ ... })),
  replace_all: Type.Optional(Type.Boolean({ ... })),
  // MULTI-EDIT (new)
  edits: Type.Optional(Type.Array(Type.Object({
    old_string: Type.String({ ... }),
    new_string: Type.String({ ... }),
    replace_all: Type.Optional(Type.Boolean({ ... }))
  })))
});
```

**Implementation:**
```typescript
async call(args, context) {
  const params = args as Record<string, unknown>;
  
  // Support both single edit and multi-edit
  const edits: EditOperation[] = [];
  
  if (params.edits && Array.isArray(params.edits)) {
    // Multi-edit mode
    edits.push(...params.edits);
  } else if (params.old_string && params.new_string) {
    // Single edit mode (backward compatible)
    edits.push({
      old_string: params.old_string as string,
      new_string: params.new_string as string,
      replace_all: params.replace_all as boolean ?? false
    });
  }
  
  // Apply all edits sequentially
  let content = originalContent;
  for (const edit of edits) {
    content = applyEdit(content, edit);
  }
}
```

---

#### 2. Smart Quote Handling

**Implementation:**
```typescript
// Smart quote characters (Unicode)
const SMART_QUOTES: Record<string, string> = {
  '"': '"',  // U+201C → "
  '"': '"',  // U+201D → "
  ''': ''',  // U+2018 → '
  '\'': '\'',  // U+2019 → '
  '–': '-',  // U+2013 → - (en dash)
  '—': '-',  // U+2014 → - (em dash)
  '…': '...', // U+2026 → ... (ellipsis)
};

function normalizeQuotes(str: string): string {
  return str.replace(/[""''–—…]/g, match => 
    SMART_QUOTES[match] || match
  );
}

function findStringWithQuoteNormalization(
  content: string, 
  searchString: string
): string | null {
  // Try exact match first
  if (content.includes(searchString)) {
    return searchString;
  }
  
  // Try with normalized quotes
  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedContent = normalizeQuotes(content);
  
  if (normalizedContent.includes(normalizedSearch)) {
    // Find the original substring in content
    const index = normalizedContent.indexOf(normalizedSearch);
    return content.substring(index, index + searchString.length);
  }
  
  return null;
}
```

---

#### 3. Enhanced Error Codes

**Error Code Mapping:**
```typescript
const EDIT_ERROR_CODES = {
  // Existing codes
  1: 'No changes (old_string === new_string)',
  2: 'Permission denied',
  3: 'Cannot create file (already exists)',
  4: 'File not found',
  5: 'Notebook file (use NotebookEdit)',
  6: 'File not read yet',
  7: 'File modified externally',
  8: 'String not found',
  9: 'Multiple occurrences (replace_all=false)',
  
  // New codes
  10: 'Edit conflict (overlapping edits)',
  11: 'Invalid edit sequence',
  12: 'Encoding detection failed',
  13: 'Line ending preservation failed',
  14: 'LSP notification failed',
  15: 'Git diff generation failed'
} as const;
```

---

### Phase 2: Data Integrity

#### 4. Line Ending Detection/Preservation

```typescript
function detectLineEnding(content: string): '\n' | '\r\n' {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/\n/g) || []).length - crlfCount;
  return crlfCount > lfCount ? '\r\n' : '\n';
}

function preserveLineEndings(
  content: string, 
  originalEnding: '\n' | '\r\n'
): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (originalEnding === '\r\n') {
    return normalized.replace(/\n/g, '\r\n');
  }
  return normalized;
}
```

---

#### 5. Encoding Detection

```typescript
function detectEncoding(buffer: Buffer): string {
  if (buffer.length >= 2) {
    // UTF-16 LE BOM
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      return 'utf-16le';
    }
    // UTF-16 BE BOM
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
      return 'utf-16be';
    }
    // UTF-8 BOM
    if (buffer.length >= 3 && 
        buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return 'utf-8';
    }
  }
  return 'utf-8';
}
```

---

#### 6. Permission Context Validation

```typescript
async validateInput({ file_path, edits }) {
  // ... existing validation ...
  
  // Check permission context
  const resolved = path.resolve(file_path);
  const permissionContext = await getPermissionContext();
  
  if (isPathDenied(resolved, permissionContext.denyEdit)) {
    return {
      result: false,
      message: 'File is in a directory that is denied by your permission settings.',
      errorCode: 2
    };
  }
}
```

---

### Phase 3: Integration

#### 7. LSP Notification

```typescript
async function notifyLSP(filePath: string, newContent: string) {
  try {
    const lspClient = context?.lspClient;
    if (lspClient) {
      await lspClient.notifyFileChanged?.(filePath);
      await lspClient.saveFile?.(filePath);
    }
  } catch (lspError) {
    console.warn(`LSP notification failed: ${lspError}`);
    // Don't fail the edit - just log
  }
}
```

---

#### 8. Git Diff Generation

```typescript
interface GitDiff {
  filename: string;
  status: 'modified' | 'added';
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
}

function generateGitDiff(
  filePath: string,
  originalContent: string | null,
  newContent: string
): GitDiff {
  const originalLines = originalContent ? originalContent.split('\n') : [];
  const newLines = newContent.split('\n');
  
  let additions = 0;
  let deletions = 0;
  const patch: string[] = [];
  
  if (!originalContent) {
    additions = newLines.length;
    patch.push('--- /dev/null', '+++ b/' + filePath);
    for (const line of newLines) {
      patch.push('+' + line);
    }
  } else {
    patch.push('--- a/' + filePath, '+++ b/' + filePath);
    // Simple diff algorithm
    const maxLen = Math.max(originalLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const orig = originalLines[i];
      const newLine = newLines[i];
      if (orig === undefined) {
        patch.push('+' + newLine);
        additions++;
      } else if (newLine === undefined) {
        patch.push('-' + orig);
        deletions++;
      } else if (orig !== newLine) {
        patch.push('-' + orig, '+' + newLine);
        additions++;
        deletions++;
      }
    }
  }
  
  return {
    filename: filePath,
    status: originalContent ? 'modified' : 'added',
    additions,
    deletions,
    changes: additions + deletions,
    patch: patch.join('\n')
  };
}
```

---

#### 9. File State Tracking

```typescript
// Already implemented in write.ts
// Just need to call updateFileState after edit
updateFileState(resolved, newContent, stats.mtimeMs);
```

---

### Phase 4: Advanced Features

#### 10. Notebook Editing Tool

**Separate Tool:** `/src/agents/tools/notebook-edit.ts`

```typescript
const NotebookEditSchema = Type.Object({
  notebook_path: Type.String({ ... }),
  cell_id: Type.Optional(Type.String({ ... })),
  new_source: Type.String({ ... }),
  cell_type: Type.Optional(Type.Union([
    Type.Literal('code'),
    Type.Literal('markdown')
  ])),
  edit_mode: Type.Optional(Type.Union([
    Type.Literal('replace'),
    Type.Literal('insert'),
    Type.Literal('delete')
  ]))
});
```

---

#### 11. Typo Suggestions

```typescript
async function findSimilarFiles(filePath: string, cwd: string): Promise<string | null> {
  // Already implemented in read.ts
  // Can be reused here
}
```

---

## 🧪 TESTING PLAN

### Unit Tests (`edit.test.ts`)

```typescript
describe('Edit Tool', () => {
  describe('Multi-Edit', () => {
    test('should apply multiple edits sequentially', async () => {
      // Test multi-edit functionality
    });
    
    test('should detect edit conflicts', async () => {
      // Test overlapping edit detection
    });
  });
  
  describe('Smart Quote Handling', () => {
    test('should match strings with smart quotes', async () => {
      // Test smart quote normalization
    });
    
    test('should handle smart apostrophes', async () => {
      // Test apostrophe handling
    });
  });
  
  describe('Line Ending Preservation', () => {
    test('should preserve CRLF line endings', async () => {
      // Test CRLF preservation
    });
    
    test('should preserve LF line endings', async () => {
      // Test LF preservation
    });
  });
  
  describe('Encoding Detection', () => {
    test('should detect UTF-8 with BOM', async () => {
      // Test UTF-8 BOM detection
    });
    
    test('should detect UTF-16 LE', async () => {
      // Test UTF-16 LE detection
    });
  });
  
  describe('Error Handling', () => {
    test('should return error code 10 for edit conflicts', async () => {
      // Test edit conflict detection
    });
    
    test('should return error code 6 for unread file', async () => {
      // Test read-before-edit check
    });
  });
});
```

---

## 📊 SUCCESS CRITERIA

| Feature | Test | Pass Criteria |
|---------|------|---------------|
| Multi-Edit | Apply 3 edits | All 3 applied correctly |
| Smart Quotes | Match "smart quote" | Found and replaced |
| Line Endings | Edit CRLF file | CRLF preserved |
| Encoding | Edit UTF-16 file | Encoding preserved |
| LSP | Edit file | LSP notified |
| Git Diff | Edit file | Diff generated |
| Error Codes | All 15 codes | Correct codes returned |

---

## 🚀 ROLLOUT PLAN

1. **Day 1:** Implement Phase 1 (multi-edit, smart quotes)
2. **Day 2:** Implement Phase 2 (line endings, encoding)
3. **Day 3:** Implement Phase 3 (LSP, Git diff)
4. **Day 4:** Write unit tests
5. **Day 5:** Write integration tests
6. **Day 6:** Bug fixes + documentation
7. **Day 7:** Final verification

---

**Status:** Ready for implementation
