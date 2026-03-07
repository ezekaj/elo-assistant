# 📋 SAMPLING TOOLS CAPABILITY - IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Implement full Sampling Tools capability matching Claude Code

---

## 🎯 EXECUTIVE SUMMARY

**Sampling Tools Capability** enables the model to use tools during generation (sampling). This is a **critical MCP capability** that must be:
1. Declared by the client
2. Validated before tool usage
3. Properly negotiated with servers

---

## 📊 CLAUDE CODE ARCHITECTURE

### **Capability Structure:**

```typescript
// Client Capabilities
{
  sampling?: {
    tools?: boolean;      // Can handle tools during sampling
    createMessage?: boolean; // Supports sampling/createMessage
  };
  elicitation?: {
    url?: boolean;
    form?: boolean;
  };
  roots?: {
    list?: boolean;
  };
}

// Server Capabilities
{
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}
```

### **Validation Points:**

| Location | Method | Check |
|----------|--------|-------|
| `createMessageStream` | Line 27381 | `!A?.sampling?.tools` |
| `createMessage` | Line 27655 | `!this._clientCapabilities?.sampling?.tools` |
| `assertCapabilityForMethod` | Line 27551 | `!this._clientCapabilities?.sampling` |

### **Error Messages:**

```javascript
"Client does not support sampling tools capability."
"Client does not support sampling (required for sampling/createMessage)"
```

---

## 🔧 IMPLEMENTATION PLAN

### **Phase 1: Add Capability Types**

#### **File: `src/mcp/client.ts`**

**Add to `McpCapabilities` interface:**

```typescript
export interface McpCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  // NEW: Sampling capability
  sampling?: {
    tools?: boolean;        // Can handle tools during sampling
    createMessage?: boolean; // Supports sampling/createMessage method
  };
  // NEW: Elicitation capability
  elicitation?: {
    url?: boolean;
    form?: boolean;
  };
  // NEW: Roots capability
  roots?: {
    list?: boolean;
  };
}
```

**Why:** This matches Claude Code's capability structure exactly.

---

### **Phase 2: Add Client Capability Declaration**

#### **File: `src/mcp/client.ts`**

**Update `McpServer.initialize()` to declare capabilities:**

```typescript
async initialize(): Promise<void> {
  // ... existing code ...

  // Declare client capabilities (matches Claude Code)
  this.capabilities = {
    sampling: {
      tools: true,        // We support tools during sampling
      createMessage: true, // We support sampling/createMessage
    },
    elicitation: {
      url: true,          // We support URL elicitation
      form: true,         // We support form elicitation
    },
    roots: {
      list: true,         // We support roots/list
    },
  };

  // ... rest of initialization ...
}
```

**Why:** Clients must declare what they support so servers know what features are available.

---

### **Phase 3: Add Capability Validation**

#### **File: `src/mcp/client.ts`**

**Add validation in `callTool()` method:**

```typescript
async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  // Validate sampling tools capability (matches Claude Code Line 27655)
  if (!this.capabilities.sampling?.tools) {
    throw new Error("Client does not support sampling tools capability.");
  }

  // ... proceed with tool call
}
```

**Add validation in `createMessage()` method:**

```typescript
async createMessage(params: CreateMessageParams): Promise<CreateMessageResult> {
  // Validate sampling capability (matches Claude Code Line 27551)
  if (params.tools || params.toolChoice) {
    if (!this.capabilities.sampling?.tools) {
      throw new Error("Client does not support sampling tools capability.");
    }
  }

  // ... proceed with message creation
}
```

**Why:** Prevents tool usage when capability is not supported.

---

### **Phase 4: Add ACP Client Capability**

#### **File: `src/acp/client.ts`**

**Update `createAcpClient()` to declare sampling capability:**

```typescript
await client.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
    terminal: true,
    // NEW: Sampling capability
    sampling: {
      tools: true,
    },
  },
  clientInfo: { name: "openclaw-acp-client", version: "1.0.0" },
});
```

**Why:** ACP clients also need to declare sampling capability.

---

### **Phase 5: Add Gateway Capability Declaration**

#### **File: `src/gateway/server-http.ts`** (or similar)

**Add server capability declaration:**

```typescript
// Server capabilities (what this server supports)
const serverCapabilities = {
  tools: {
    listChanged: true,
  },
  resources: {
    subscribe: true,
    listChanged: true,
  },
  prompts: {
    listChanged: true,
  },
  sampling: {
    createMessage: true,  // Server supports sampling/createMessage
  },
};
```

**Why:** Servers must also declare their capabilities for proper negotiation.

---

### **Phase 6: Add Capability Negotiation**

#### **File: `src/mcp/client.ts`**

**Add capability check during connection:**

```typescript
async connect(): Promise<void> {
  // ... connection code ...

  // Check server capabilities
  if (this.needsTools && !this.serverCapabilities?.tools) {
    throw new Error("Server does not support tools capability.");
  }

  // Check client capabilities (for server-side validation)
  if (!this.capabilities.sampling?.tools) {
    console.warn("Client does not support sampling tools - tools will be disabled");
  }

  // ... rest of connection ...
}
```

**Why:** Both client and server capabilities must be compatible.

---

### **Phase 7: Add Error Handling**

#### **File: `src/mcp/client.ts`**

**Add proper error types:**

```typescript
export class SamplingCapabilityError extends Error {
  constructor() {
    super("Client does not support sampling tools capability.");
    this.name = "SamplingCapabilityError";
  }
}

export class ElicitationCapabilityError extends Error {
  constructor(mode: 'url' | 'form') {
    super(`Client does not support ${mode} elicitation.`);
    this.name = "ElicitationCapabilityError";
  }
}
```

**Why:** Proper error types make debugging easier.

---

### **Phase 8: Add Capability Utilities**

#### **File: `src/mcp/capabilities.ts`** (NEW FILE)

**Create capability utility functions:**

```typescript
/**
 * Check if client supports sampling tools
 */
export function supportsSamplingTools(capabilities: McpCapabilities): boolean {
  return capabilities.sampling?.tools === true;
}

/**
 * Check if client supports elicitation
 */
export function supportsElicitation(
  capabilities: McpCapabilities,
  mode?: 'url' | 'form'
): boolean {
  if (!capabilities.elicitation) return false;
  if (!mode) return true;
  return capabilities.elicitation[mode] === true;
}

/**
 * Check if client supports roots listing
 */
export function supportsRoots(capabilities: McpCapabilities): boolean {
  return capabilities.roots?.list === true;
}

/**
 * Validate capabilities for tool usage
 */
export function validateToolCapabilities(
  capabilities: McpCapabilities,
  requireSampling?: boolean
): void {
  if (requireSampling && !supportsSamplingTools(capabilities)) {
    throw new SamplingCapabilityError();
  }
}
```

**Why:** Utility functions make capability checks consistent.

---

### **Phase 9: Wire Everything Together**

#### **Files to Update:**

1. **`src/mcp/client.ts`** - Core MCP client
2. **`src/acp/client.ts`** - ACP client
3. **`src/gateway/server-http.ts`** - Gateway server
4. **`src/agents/pi-embedded-subscribe.handlers.ts`** - Tool event handlers
5. **`src/agents/tool-execution-validator.ts`** - Tool validation

**Integration Points:**

```
MCP Client (declares capabilities)
    ↓
Gateway Server (validates capabilities)
    ↓
Tool Execution (checks capabilities)
    ↓
Tool Events (uses capabilities)
```

---

## 📝 FILES TO CREATE/MODIFY

### **New Files:**
1. `src/mcp/capabilities.ts` - Capability utilities
2. `src/mcp/errors.ts` - Capability error types

### **Modified Files:**
1. `src/mcp/client.ts` - Add capability types, validation, declaration
2. `src/acp/client.ts` - Add capability declaration
3. `src/gateway/server-http.ts` - Add server capability declaration
4. `src/agents/pi-embedded-subscribe.handlers.ts` - Add capability checks

---

## ✅ VERIFICATION CHECKLIST

- [ ] Capability types added to `McpCapabilities`
- [ ] Client capability declaration in `initialize()`
- [ ] Capability validation in `callTool()`
- [ ] Capability validation in `createMessage()`
- [ ] ACP client capability declaration
- [ ] Gateway server capability declaration
- [ ] Error types created
- [ ] Utility functions created
- [ ] All components wired together
- [ ] Build successful
- [ ] No TypeScript errors
- [ ] Tests pass

---

## 🎯 SUCCESS CRITERIA

**Implementation is complete when:**

1. ✅ Client declares `sampling.tools` capability
2. ✅ Server can validate client capability
3. ✅ Error thrown when capability missing
4. ✅ Tools work when capability present
5. ✅ Matches Claude Code behavior exactly

---

**Status:** Ready for implementation
