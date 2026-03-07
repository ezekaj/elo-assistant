# LSP Integration Plan for OpenClaw

**Goal:** Add LSP-based symbol search to OpenClaw, matching Claude Code's capabilities.

**Status:** 📋 Planning Phase

---

## Current State

### What OpenClaw Has
- ✅ `grep` tool (ripgrep) - text search
- ✅ `glob` tool - file pattern matching
- ✅ `memory_search` - hybrid BM25 + vector search for memory files
- ✅ File watching (chokidar) for memory indexing
- ✅ SQLite-based indexing with embeddings

### What's Missing
- ❌ LSP client integration
- ❌ Symbol extraction (functions, classes, variables)
- ❌ Go-to-definition
- ❌ Find references
- ❌ Code-aware search (syntax/AST based)

---

## Architecture Design

### Option A: Full LSP Client (Recommended)

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ LSP Manager │───▶│ LSP Clients │───▶│ Language    │  │
│  │             │    │             │    │ Servers     │  │
│  └─────────────┘    └─────────────┘    └─────────────┘  │
│         │                                      │        │
│         ▼                                      ▼        │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Symbol Index (SQLite)                  ││
│  │  • Functions  • Classes  • Variables  • Imports     ││
│  └─────────────────────────────────────────────────────┘│
│         │                                                │
│         ▼                                                │
│  ┌─────────────┐                                        │
│  │ Symbol Tool │ ◀── Agent queries                      │
│  │ (new tool)  │                                        │
│  └─────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

### Option B: Lightweight Tree-sitter Only

```
┌─────────────────────────────────────────┐
│            OpenClaw Gateway             │
├─────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐     │
│  │ Tree-sitter │───▶│ Symbol      │     │
│  │ Parser      │    │ Extractor   │     │
│  └─────────────┘    └─────────────┘     │
│                            │            │
│                            ▼            │
│                    ┌─────────────┐      │
│                    │ Symbol Tool │      │
│                    └─────────────┘      │
└─────────────────────────────────────────┘
```

### Recommendation: Option A (Full LSP)

**Why:**
- More accurate symbol resolution
- Supports go-to-definition, find references
- Works with complex languages (TypeScript, Python, Go)
- Industry standard (VS Code, Neovim use LSP)

---

## Implementation Phases

### Phase 1: Core LSP Infrastructure (Week 1)

#### 1.1 LSP Client Library
- **File:** `src/lsp/client.ts`
- **Purpose:** Generic LSP 3.17 client
- **Features:**
  - JSON-RPC over stdio/socket
  - Request/response handling
  - Event streaming (publishDiagnostics, etc.)
  - Connection lifecycle management

```typescript
// Conceptual API
interface LspClient {
  initialize(rootUri: string): Promise<InitializeResult>;
  shutdown(): Promise<void>;
  getSymbols(uri: string): Promise<SymbolInformation[]>;
  getDefinitions(uri: string, position: Position): Promise<Location[]>;
  getReferences(uri: string, position: Position): Promise<Location[]>;
}
```

#### 1.2 LSP Manager
- **File:** `src/lsp/manager.ts`
- **Purpose:** Manage multiple language servers
- **Features:**
  - Auto-detect language from file extension
  - Lazy-start language servers
  - Health monitoring
  - Restart on crash

```typescript
interface LspManager {
  getClient(language: string): Promise<LspClient | null>;
  getSupportedLanguages(): string[];
  indexProject(root: string): Promise<void>;
}
```

#### 1.3 Language Server Configurations
- **File:** `src/lsp/servers/`
- **Supported Languages (Phase 1):**
  - TypeScript/JavaScript: `typescript-language-server`
  - Python: `pyright` or `pylsp`
  - Go: `gopls`
  - Rust: `rust-analyzer`

```typescript
// Server config example
const serverConfigs = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  python: {
    command: 'pyright-langserver',
    args: ['--stdio'],
    fileExtensions: ['.py', '.pyi'],
  },
};
```

---

### Phase 2: Symbol Indexing (Week 2)

#### 2.1 Symbol Index Schema
- **File:** `src/lsp/symbol-index.ts`
- **Storage:** SQLite (same as memory system)

```sql
CREATE TABLE symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind INTEGER NOT NULL,  -- Function, Class, Variable, etc.
  file_path TEXT NOT NULL,
  start_line INTEGER,
  start_col INTEGER,
  end_line INTEGER,
  end_col INTEGER,
  container_name TEXT,     -- Parent class/function
  language TEXT,
  signature TEXT,
  docstring TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_file ON symbols(file_path);
CREATE INDEX idx_symbols_kind ON symbols(kind);
CREATE VIRTUAL TABLE symbols_fts USING fts5(name, signature, docstring);
```

#### 2.2 Symbol Extractor
- **File:** `src/lsp/symbol-extractor.ts`
- **Features:**
  - Batch extraction via LSP `textDocument/documentSymbol`
  - Workspace-wide via `workspace/symbol`
  - Incremental updates on file changes
  - Debounced reindexing

```typescript
interface SymbolExtractor {
  extractFileSymbols(filePath: string): Promise<SymbolInfo[]>;
  extractWorkspaceSymbols(query: string): Promise<SymbolInfo[]>;
  startIndexing(root: string, onProgress?: (p: number) => void): Promise<void>;
}
```

#### 2.3 File Watcher Integration
- **Reuse:** Existing chokidar watcher from memory system
- **Events:**
  - `add` → Extract symbols for new file
  - `change` → Re-extract symbols
  - `unlink` → Remove symbols from index

---

### Phase 3: Symbol Search Tool (Week 2-3)

#### 3.1 Tool Definition
- **File:** `src/agents/tools/symbol-tool.ts`
- **Tool Name:** `symbol`

```typescript
const symbolToolSchema = {
  name: 'symbol',
  description: 'Search for code symbols (functions, classes, variables)',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'definition', 'references', 'list', 'info'],
        description: 'Symbol action to perform'
      },
      query: {
        type: 'string',
        description: 'Symbol name or pattern to search'
      },
      kind: {
        type: 'string',
        enum: ['function', 'class', 'method', 'variable', 'interface', 'all'],
        description: 'Filter by symbol kind'
      },
      file: {
        type: 'string',
        description: 'Limit search to specific file'
      },
      language: {
        type: 'string',
        description: 'Filter by language (typescript, python, etc.)'
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 20)'
      }
    },
    required: ['action']
  }
};
```

#### 3.2 Tool Actions

| Action | Description | Example |
|--------|-------------|---------|
| `search` | Fuzzy search symbols by name | `{action: "search", query: "getUser"}` |
| `definition` | Go to symbol definition | `{action: "definition", query: "UserManager"}` |
| `references` | Find all references | `{action: "references", query: "parseConfig"}` |
| `list` | List symbols in file | `{action: "list", file: "src/app.ts"}` |
| `info` | Get symbol details | `{action: "info", query: "formatDate"}` |

#### 3.3 Result Format

```typescript
interface SymbolResult {
  name: string;
  kind: 'function' | 'class' | 'method' | 'variable' | 'interface';
  location: {
    file: string;
    line: number;
    column: number;
  };
  signature?: string;
  docstring?: string;
  container?: string;  // Parent class/function
  references?: number; // Reference count
}
```

---

### Phase 4: Advanced Features (Week 3-4)

#### 4.1 Semantic Symbol Search
- **Integration with memory system**
- Embed symbol signatures + docstrings
- Search by meaning, not just name

```typescript
// Hybrid search: text + semantic
const results = await hybridSymbolSearch({
  query: "function that parses JSON",
  mode: 'hybrid',  // 'text' | 'semantic' | 'hybrid'
});
```

#### 4.2 Call Hierarchy
- **LSP Extension:** `textDocument/prepareCallHierarchy`
- Show function call graph
- Find callers / callees

#### 4.3 Type Hierarchy
- **LSP Extension:** `textDocument/prepareTypeHierarchy`
- Show class inheritance
- Find subclasses / superclasses

#### 4.4 Code Actions
- **LSP Feature:** `textDocument/codeAction`
- Quick fixes
- Refactorings

---

### Phase 5: Configuration & UX (Week 4)

#### 5.1 Config Schema

```typescript
// Add to OpenClaw config
interface LspConfig {
  enabled: boolean;
  autoIndex: boolean;           // Index on project open
  languages: {
    [lang: string]: {
      enabled: boolean;
      serverPath?: string;      // Custom server path
      serverArgs?: string[];    // Custom args
    };
  };
  indexing: {
    debounceMs: number;         // File change debounce
    batchDelayMs: number;       // Batch indexing delay
    maxFileSize: number;        // Skip large files
    excludePatterns: string[];  // Glob patterns to exclude
  };
}
```

#### 5.2 Default Config

```json
{
  "lsp": {
    "enabled": true,
    "autoIndex": true,
    "languages": {
      "typescript": { "enabled": true },
      "python": { "enabled": true },
      "go": { "enabled": true },
      "rust": { "enabled": false }
    },
    "indexing": {
      "debounceMs": 500,
      "batchDelayMs": 2000,
      "maxFileSize": 1048576,
      "excludePatterns": ["node_modules/**", "**/*.min.js", "dist/**"]
    }
  }
}
```

#### 5.3 CLI Commands

```bash
# Index current project
openclaw lsp index

# Show LSP status
openclaw lsp status

# Reindex all
openclaw lsp reindex

# Search symbols
openclaw lsp search "getUser"

# Clear index
openclaw lsp clear
```

---

## File Structure

```
src/lsp/
├── client.ts              # LSP client implementation
├── manager.ts             # Multi-server manager
├── types.ts               # LSP types (from vscode-languageserver-protocol)
├── symbol-index.ts        # SQLite symbol storage
├── symbol-extractor.ts    # Symbol extraction logic
├── servers/
│   ├── index.ts           # Server registry
│   ├── typescript.ts      # TS/JS server config
│   ├── python.ts          # Python server config
│   ├── go.ts              # Go server config
│   └── rust.ts            # Rust server config
└── utils.ts               # Helpers

src/agents/tools/
└── symbol-tool.ts         # New symbol search tool
```

---

## Dependencies

### NPM Packages
```json
{
  "vscode-languageserver-protocol": "^3.17.5",
  "vscode-languageserver-types": "^3.17.5"
}
```

### External Language Servers (user-installed)
```bash
# TypeScript
npm install -g typescript-language-server typescript

# Python
pip install pyright

# Go
go install golang.org/x/tools/gopls@latest

# Rust
rustup component add rust-analyzer
```

---

## Performance Considerations

### Indexing Speed
- **Target:** 1000 files in < 10 seconds
- **Strategy:** Parallel LSP requests, batch SQLite writes
- **Fallback:** Tree-sitter for faster (but less accurate) indexing

### Memory Usage
- **Target:** < 100MB for index
- **Strategy:** Store only symbol metadata, not full AST

### Query Latency
- **Target:** < 50ms for symbol search
- **Strategy:** SQLite FTS5, in-memory cache

---

## Testing Strategy

### Unit Tests
- `client.test.ts` - LSP client mock tests
- `manager.test.ts` - Server lifecycle tests
- `symbol-index.test.ts` - SQLite operations
- `symbol-extractor.test.ts` - Extraction logic

### Integration Tests
- `lsp.integration.test.ts` - Real LSP servers
- Test projects in multiple languages

### E2E Tests
- `symbol-tool.test.ts` - Full tool workflow

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LSP server not installed | Graceful fallback, show install instructions |
| Large projects slow to index | Incremental indexing, background processing |
| LSP server crashes | Auto-restart, health checks |
| Memory bloat | Limit index size, prune old entries |
| Protocol version mismatch | Version negotiation, capability checks |

---

## Success Metrics

1. **Accuracy:** 95%+ correct symbol resolution
2. **Speed:** < 50ms query latency
3. **Coverage:** TS, Python, Go, Rust support
4. **Reliability:** < 1% crash rate

---

## Timeline

| Week | Phase | Deliverable |
|------|-------|-------------|
| 1 | Phase 1 | LSP client + manager working |
| 2 | Phase 2 | Symbol indexing operational |
| 3 | Phase 3 | Symbol tool available |
| 4 | Phase 4+5 | Advanced features + UX |

---

## Next Steps

1. **Review this plan** - Confirm architecture choice
2. **Create branch** - `feature/lsp-integration`
3. **Start Phase 1** - Implement LSP client
4. **Iterate** - Add tests, refine API

---

## Alternative: Tree-sitter Only

If full LSP is too complex, Tree-sitter offers:

**Pros:**
- No external server dependencies
- Faster startup
- Simpler architecture

**Cons:**
- No go-to-definition (only symbol extraction)
- No find references
- Less accurate for complex languages

**Decision needed:** Full LSP vs Tree-sitter?

---

*Created: 2026-02-27*
*Author: OpenClaw Planning*
