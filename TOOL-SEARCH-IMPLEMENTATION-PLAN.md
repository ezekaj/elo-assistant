# 🔍 TOOL SEARCH TOOL - DEEP IMPLEMENTATION PLAN

**Based on:** Claude Code `tool_search_tool_regex_20251119` & `tool_search_tool_bm25_20251119`  
**Date:** 2026-02-24  
**Status:** Ready for Implementation  

---

## 📋 EXECUTIVE SUMMARY

This plan implements **Claude Code's Tool Search Tool** for OpenClaw - enabling support for **hundreds or thousands of tools** with **85%+ context savings** and **improved tool selection accuracy**.

### **Key Benefits:**
- ✅ Support 100-10,000 tools without context bloat
- ✅ Reduce tool definition tokens by 85%+
- ✅ Improve tool selection accuracy (maintains high accuracy beyond 50 tools)
- ✅ Enable large-scale MCP integrations (200+ MCP tools)
- ✅ On-demand tool loading (load only what's needed)

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW AGENT                           │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Tool Search Tool (NEW)                               │ │
│  │  - Searches tool catalog                              │ │
│  │  - Returns tool references                            │ │
│  │  - Auto-expands to full definitions                   │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Deferred Tools (Existing + NEW)                      │ │
│  │  - Marked with defer_loading: true                    │ │
│  │  - Not loaded initially                               │ │
│  │  - Loaded on-demand via search                        │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              TOOL CATALOG SYSTEM (NEW)                      │
│  - Tool registry with metadata                              │
│  - Searchable index (regex + BM25)                          │
│  - Supports 10,000+ tools                                   │
│  - Fast search (<100ms)                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### **PHASE 1: CORE INFRASTRUCTURE**

#### **1.1 Tool Catalog**
**File:** `src/agents/tools/tool-catalog.ts`

**Responsibilities:**
- Register tools with metadata
- Maintain searchable index
- Support regex + BM25 search
- Cache tool definitions

**Key Interfaces:**
```typescript
interface ToolCatalogEntry {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  deferLoading?: boolean;
  definition: AgentToolDefinition;
  searchMetadata: {
    keywords: string[];
    regexPattern?: string;
  };
}

interface ToolCatalog {
  register(entry: ToolCatalogEntry): void;
  unregister(name: string): void;
  search(query: string, options?: SearchOptions): ToolCatalogEntry[];
  get(name: string): ToolCatalogEntry | undefined;
  getAll(): ToolCatalogEntry[];
  getCount(): number;
}
```

**Key Functions:**
```typescript
- createToolCatalog(): ToolCatalog
- registerTool(tool: AnyAgentTool, options?: ToolOptions): void
- searchTools(query: string, variant: 'regex' | 'bm25'): ToolReference[]
- expandToolReference(ref: ToolReference): AnyAgentTool | null
```

#### **1.2 Tool Reference System**
**File:** `src/agents/tools/tool-reference.ts`

**Responsibilities:**
- Tool reference format
- Reference expansion
- Lazy loading

**Key Types:**
```typescript
type ToolReference = {
  type: 'tool_reference';
  tool_name: string;
  metadata?: {
    description: string;
    category?: string;
    confidence?: number;
  };
};

type ToolSearchResult = {
  type: 'tool_search_tool_search_result';
  tool_references: ToolReference[];
};
```

---

### **PHASE 2: SEARCH VARIANTS**

#### **2.1 Regex Search (tool_search_tool_regex_20251119)**
**File:** `src/agents/tools/tool-search-regex.ts`

**Implements:**
- Python regex pattern matching
- Tool name matching
- Description matching
- Tag matching

**Tool Definition:**
```typescript
export const ToolSearchRegexTool: AnyAgentTool = {
  name: 'tool_search_tool_regex',
  description: 'Search for tools by regex pattern. Use patterns like "weather", "get_.*_data", etc.',
  parameters: {
    query: { type: 'string', description: 'Regex pattern to match tool names/descriptions' }
  },
  execute: async (params) => {
    const pattern = readStringParam(params, 'query', { required: true });
    const catalog = getToolCatalog();
    const results = catalog.search(pattern, { variant: 'regex' });
    return jsonResult({
      type: 'tool_search_tool_search_result',
      tool_references: results.slice(0, 5).map(toToolReference)
    });
  }
};
```

**Features:**
- Case-insensitive matching
- Wildcard support (`.*`)
- Multiple pattern support
- Max 200 character patterns

#### **2.2 BM25 Search (tool_search_tool_bm25_20251119)**
**File:** `src/agents/tools/tool-search-bm25.ts`

**Implements:**
- BM25 text search algorithm
- Natural language queries
- TF-IDF scoring
- Relevance ranking

**Dependencies:**
```bash
pnpm add bm25
```

**Tool Definition:**
```typescript
export const ToolSearchBM25Tool: AnyAgentTool = {
  name: 'tool_search_tool_bm25',
  description: 'Search for tools using natural language. Describe what you need in plain English.',
  parameters: {
    query: { type: 'string', description: 'Natural language description of tools needed' }
  },
  execute: async (params) => {
    const query = readStringParam(params, 'query', { required: true });
    const catalog = getToolCatalog();
    const results = catalog.search(query, { variant: 'bm25' });
    return jsonResult({
      type: 'tool_search_tool_search_result',
      tool_references: results.slice(0, 5).map(toToolReference)
    });
  }
};
```

**BM25 Index:**
```typescript
interface BM25Index {
  documents: Map<string, string>;  // tool_name -> searchable_text
  index: BM25;  // BM25 index instance
  
  add(toolName: string, text: string): void;
  remove(toolName: string): void;
  search(query: string, k: number): string[];  // Returns tool names
}
```

---

### **PHASE 3: DEFERRED LOADING**

#### **3.1 Deferred Tool Wrapper**
**File:** `src/agents/tools/deferred-tool-wrapper.ts`

**Responsibilities:**
- Wrap tools with deferred loading
- Placeholder until expanded
- Auto-expansion on use

**Implementation:**
```typescript
interface DeferredToolConfig {
  name: string;
  description: string;
  input_schema: object;
  defer_loading: true;
  catalog_entry_id: string;
}

export function createDeferredTool(config: DeferredToolConfig): AnyAgentTool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.input_schema,
    execute: async () => {
      throw new Error('Deferred tool must be expanded first');
    },
    metadata: {
      deferred: true,
      catalog_entry_id: config.catalog_entry_id
    }
  };
}

export function expandDeferredTool(tool: AnyAgentTool): AnyAgentTool | null {
  if (!tool.metadata?.deferred) return tool;
  
  const catalog = getToolCatalog();
  const entry = catalog.get(tool.metadata.catalog_entry_id);
  return entry?.definition ?? null;
}
```

#### **3.2 Tool Loading Strategy**
**File:** `src/agents/tools/tool-loading-strategy.ts`

**Responsibilities:**
- Initial tool loading
- On-demand loading
- Caching

**Strategy:**
```typescript
interface ToolLoadingStrategy {
  // Tools always loaded initially
  eagerTools: string[];
  
  // Tools loaded on-demand
  deferredTools: string[];
  
  // Maximum tools in context at once
  maxContextTools: number;
  
  // Cache TTL for loaded tools
  cacheTTL: number;
}

const defaultStrategy: ToolLoadingStrategy = {
  eagerTools: ['message', 'memory_search', 'web_search'],  // Core tools
  deferredTools: [],  // All other tools
  maxContextTools: 50,  // Optimal for accuracy
  cacheTTL: 300000  // 5 minutes
};
```

---

### **PHASE 4: INTEGRATION**

#### **4.1 Tool Registration Enhancement**
**File:** `src/agents/pi-tools.ts`

**Changes:**
```typescript
// BEFORE
export function getCoreTools(options): AnyAgentTool[] {
  return [
    createMessageTool(),
    createMemorySearchTool(),
    createWebSearchTool(),
    // ... all tools loaded immediately
  ];
}

// AFTER
export function getCoreTools(options): AnyAgentTool[] {
  const catalog = createToolCatalog();
  
  // Register all tools in catalog
  registerAllTools(catalog);
  
  // Return only eager tools + search tools
  return [
    ...getEagerTools(catalog),  // 5-10 core tools
    createToolSearchRegexTool(catalog),
    createToolSearchBM25Tool(catalog),
  ];
}
```

#### **4.2 Agent Runner Integration**
**File:** `src/agents/runner.ts`

**Changes:**
```typescript
// Add tool expansion before execution
async function executeToolCall(toolCall: ToolCall) {
  let tool = getTool(toolCall.name);
  
  // Expand deferred tool if needed
  if (tool.metadata?.deferred) {
    tool = await expandDeferredTool(tool);
    if (!tool) {
      throw new Error(`Tool ${toolCall.name} not found`);
    }
  }
  
  return await tool.execute(toolCall.id, toolCall.input);
}
```

#### **4.3 Config Enhancement**
**File:** `src/config/types.agent-runtime.ts`

**New Config:**
```typescript
export const ToolSearchSchema = z.object({
  enabled: z.boolean().optional(),
  maxResults: z.number().min(1).max(10).optional(),
  variants: z.array(z.enum(['regex', 'bm25'])).optional(),
  maxDeferredTools: z.number().optional(),
});

export const ToolsSchema = z.object({
  // ... existing fields
  search: ToolSearchSchema.optional(),
});
```

---

## 🔧 IMPLEMENTATION STEPS

### **Step 1: Create Tool Catalog**
```bash
# Create new files
touch src/agents/tools/tool-catalog.ts
touch src/agents/tools/tool-reference.ts
touch src/agents/tools/tool-catalog.test.ts
```

**Implementation:**
```typescript
// src/agents/tools/tool-catalog.ts
import type { AnyAgentTool } from './common.js';

export interface ToolCatalogEntry {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
  deferLoading?: boolean;
  definition: AnyAgentTool;
  searchMetadata: {
    keywords: string[];
    regexPattern?: string;
  };
}

export class ToolCatalog {
  private entries = new Map<string, ToolCatalogEntry>();
  private searchIndex = new Map<string, string>();
  
  register(entry: ToolCatalogEntry): void {
    this.entries.set(entry.name, entry);
    this.searchIndex.set(entry.name, `${entry.name} ${entry.description} ${entry.tags?.join(' ')}`);
  }
  
  search(query: string, options?: { variant?: 'regex' | 'bm25', limit?: number }): ToolCatalogEntry[] {
    // Implementation
  }
  
  get(name: string): ToolCatalogEntry | undefined {
    return this.entries.get(name);
  }
  
  getAll(): ToolCatalogEntry[] {
    return Array.from(this.entries.values());
  }
  
  getCount(): number {
    return this.entries.size;
  }
}

export function createToolCatalog(): ToolCatalog {
  return new ToolCatalog();
}
```

### **Step 2: Create Search Tools**
```bash
touch src/agents/tools/tool-search-regex.ts
touch src/agents/tools/tool-search-bm25.ts
```

**Implementation:**
```typescript
// src/agents/tools/tool-search-regex.ts
export function createToolSearchRegexTool(catalog: ToolCatalog): AnyAgentTool {
  return {
    name: 'tool_search_tool_regex',
    description: 'Search for tools by regex pattern',
    parameters: {
      query: { type: 'string', description: 'Regex pattern' }
    },
    execute: async (params) => {
      const query = readStringParam(params, 'query', { required: true });
      const results = catalog.search(query, { variant: 'regex', limit: 5 });
      return jsonResult({
        type: 'tool_search_tool_search_result',
        tool_references: results.map(r => ({
          type: 'tool_reference',
          tool_name: r.name,
          metadata: {
            description: r.description,
            confidence: 1.0
          }
        }))
      });
    }
  };
}
```

### **Step 3: Create Deferred Loading**
```bash
touch src/agents/tools/deferred-tool-wrapper.ts
```

**Implementation:**
```typescript
// src/agents/tools/deferred-tool-wrapper.ts
export function createDeferredTool(entry: ToolCatalogEntry): AnyAgentTool {
  return {
    name: entry.name,
    description: entry.description,
    parameters: entry.definition.parameters,
    execute: async () => {
      throw new Error('Deferred tool must be expanded via tool_search first');
    },
    metadata: {
      deferred: true,
      catalog_entry_id: entry.name
    }
  };
}
```

### **Step 4: Integrate with Existing Tools**
```typescript
// src/agents/pi-tools.ts - MODIFIED
import { createToolCatalog, registerTool } from './tools/tool-catalog.js';
import { createToolSearchRegexTool, createToolSearchBM25Tool } from './tools/tool-search.js';

export function getToolsWithSearch(options): AnyAgentTool[] {
  const catalog = createToolCatalog();
  
  // Register all existing tools
  const allTools = getCoreTools(options);
  allTools.forEach(tool => {
    catalog.register({
      name: tool.name,
      description: tool.description,
      definition: tool,
      deferLoading: true,  // Defer all except core
      searchMetadata: {
        keywords: extractKeywords(tool),
        regexPattern: createRegexPattern(tool)
      }
    });
  });
  
  // Return search tools + core tools only
  return [
    createMessageTool(),  // Always available
    createMemorySearchTool(),  // Always available
    createToolSearchRegexTool(catalog),
    createToolSearchBM25Tool(catalog),
  ];
}
```

### **Step 5: Add Config Support**
```typescript
// src/config/types.agent-runtime.ts - MODIFIED
export const ToolSearchSchema = z.object({
  enabled: z.boolean().optional().default(true),
  maxResults: z.number().min(1).max(10).optional().default(5),
  variants: z.array(z.enum(['regex', 'bm25'])).optional().default(['regex', 'bm25']),
});

// Add to ToolsSchema
search: ToolSearchSchema.optional(),
```

---

## 📊 EXPECTED RESULTS

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Max Tools** | 30-50 | 10,000 | +20,000% |
| **Context Tokens** | 55,000 | 5,000 | -91% |
| **Tool Selection Accuracy** | 60% (100 tools) | 95% (any size) | +58% |
| **Initial Load Time** | 5s (100 tools) | 0.5s (5 tools) | -90% |
| **Search Latency** | N/A | <100ms | NEW |

---

## ✅ VERIFICATION CHECKLIST

- [ ] Tool catalog created
- [ ] Registry system working
- [ ] Regex search implemented
- [ ] BM25 search implemented
- [ ] Deferred loading working
- [ ] Tool expansion working
- [ ] Integration with existing tools
- [ ] Config support added
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] Documentation complete

---

## 🎯 SUCCESS CRITERIA

1. ✅ Can register 1,000+ tools
2. ✅ Search returns relevant results in <100ms
3. ✅ Deferred tools expand correctly
4. ✅ Context token usage reduced by 85%+
5. ✅ Tool selection accuracy >90%
6. ✅ No breaking changes to existing tools
7. ✅ Backwards compatible

---

**READY FOR IMPLEMENTATION** 🚀
