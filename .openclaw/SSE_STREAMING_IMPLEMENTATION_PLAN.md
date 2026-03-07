# 📡 OPENCLAW SSE STREAMING - COMPREHENSIVE IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Implement SSE streaming for real-time token-by-token display in OpenClaw TUI

---

## 🎯 EXECUTIVE SUMMARY

Implement **SSE (Server-Sent Events)** streaming architecture for OpenClaw to enable:
- Real-time token-by-token display
- Streaming tool execution results
- Progressive response rendering
- Better user experience with immediate feedback

**Architecture:** Server-Sent Events over HTTP
**Protocol:** `text/event-stream`
**Format:** Chunked JSON

---

## 📊 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPENCLAW STREAMING ARCHITECTURE               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   TUI        │    │   Gateway    │    │   Model      │      │
│  │   Client     │◀──▶│   SSE Server │◀──▶│   Provider   │      │
│  │              │    │              │    │   (API)      │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         │ SSE Stream        │ HTTP Stream       │ SSE Stream    │
│         │ text/event-stream │ application/json  │ text/event-stream
│         │                   │                   │               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 FILE STRUCTURE

### **New Files to Create:**

```
src/
├── streaming/
│   ├── types.ts                      # Streaming type definitions
│   ├── sse-server.ts                 # SSE server endpoint
│   ├── sse-client.ts                 # SSE client handler
│   ├── stream-chunker.ts             # Response chunking utility
│   ├── token-display.ts              # Token-by-token display
│   └── index.ts                      # Public exports
│
├── gateway/
│   └── server-streaming.ts           # NEW: Streaming endpoint handler
│
├── tui/
│   └── components/
│       └── streaming-display.ts      # NEW: Streaming display component
│
└── agents/
    └── tool-execution-stream.ts      # NEW: Streamed tool execution
```

### **Modified Files:**

```
src/
├── gateway/
│   ├── server-http.ts                # Add SSE endpoint route
│   └── tools-invoke-http.ts          # Add streaming support
│
├── tui/
│   ├── commands.ts                   # Add streaming commands
│   └── tui-command-handlers.ts       # Add streaming handlers
│
└── agents/
    └── openclaw-tools.ts             # Add streaming tool support
```

---

## 🔧 IMPLEMENTATION PHASES

### **Phase 1: Core Streaming Types** (Critical)

#### **1.1 Type Definitions** (`src/streaming/types.ts`)

```typescript
/**
 * SSE Stream Event Types
 */
export type SSEEventType = 
  | 'token'              // Single token/chunk
  | 'tool_start'         // Tool execution started
  | 'tool_chunk'         // Tool execution chunk
  | 'tool_end'           // Tool execution ended
  | 'response_start'     // Response started
  | 'response_end'       // Response ended
  | 'error'              // Error occurred
  | 'done';              // Stream complete

/**
 * SSE Stream Event
 */
export interface SSEStreamEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: number;
  sequence: number;
}

/**
 * Token Event Data
 */
export interface TokenEventData {
  content: string;
  tokenCount: number;
  isThinking?: boolean;  // For reasoning models
}

/**
 * Tool Stream Event Data
 */
export interface ToolStreamEventData {
  toolName: string;
  toolId: string;
  status: 'starting' | 'running' | 'complete' | 'error';
  output?: string;
  error?: string;
}

/**
 * Stream Options
 */
export interface StreamOptions {
  includeUsage?: boolean;
  includeReasoning?: boolean;
  chunkSize?: number;  // Characters per chunk
}

/**
 * Stream Controller
 */
export interface StreamController {
  enqueue(event: SSEStreamEvent): void;
  close(): void;
  error(error: Error): void;
}
```

---

### **Phase 2: SSE Server** (Critical)

#### **2.1 SSE Server Endpoint** (`src/streaming/sse-server.ts`)

```typescript
import type { ServerResponse } from 'node:http';
import type { SSEStreamEvent, StreamOptions } from './types.js';

/**
 * SSE Server for streaming responses
 */
export class SSEServer {
  private response: ServerResponse;
  private sequence: number = 0;
  private closed: boolean = false;

  constructor(response: ServerResponse, options: StreamOptions = {}) {
    this.response = response;
    
    // Set SSE headers
    this.response.setHeader('Content-Type', 'text/event-stream');
    this.response.setHeader('Cache-Control', 'no-cache');
    this.response.setHeader('Connection', 'keep-alive');
    this.response.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  }

  /**
   * Send SSE event
   */
  send(event: SSEStreamEvent): void {
    if (this.closed) return;

    event.sequence = this.sequence++;
    event.timestamp = Date.now();

    const data = `data: ${JSON.stringify(event)}\n\n`;
    this.response.write(data);
  }

  /**
   * Send token chunk
   */
  sendToken(content: string, tokenCount: number, isThinking?: boolean): void {
    this.send({
      type: 'token',
      data: { content, tokenCount, isThinking },
      timestamp: Date.now(),
      sequence: this.sequence++
    });
  }

  /**
   * Send tool event
   */
  sendToolEvent(
    toolName: string,
    toolId: string,
    status: ToolStreamEventData['status'],
    output?: string,
    error?: string
  ): void {
    this.send({
      type: status === 'starting' || status === 'running' ? 'tool_chunk' : 'tool_end',
      data: { toolName, toolId, status, output, error },
      timestamp: Date.now(),
      sequence: this.sequence++
    });
  }

  /**
   * Send error
   */
  sendError(error: Error): void {
    this.send({
      type: 'error',
      data: { message: error.message, stack: error.stack },
      timestamp: Date.now(),
      sequence: this.sequence++
    });
  }

  /**
   * Close stream
   */
  close(): void {
    if (this.closed) return;
    
    this.send({
      type: 'done',
      data: null,
      timestamp: Date.now(),
      sequence: this.sequence++
    });

    this.response.end();
    this.closed = true;
  }
}

/**
 * Create SSE server from HTTP response
 */
export function createSSEServer(
  response: ServerResponse,
  options?: StreamOptions
): SSEServer {
  return new SSEServer(response, options);
}
```

---

### **Phase 3: Streaming Client** (Critical)

#### **3.1 SSE Client Handler** (`src/streaming/sse-client.ts`)

```typescript
import type { SSEStreamEvent, StreamOptions } from './types.js';

/**
 * SSE Stream Reader
 */
export class SSEStreamReader {
  private controller: ReadableStreamDefaultController<SSEStreamEvent>;
  private buffer: string = '';

  constructor() {
    this.controller = null as any;
  }

  /**
   * Create readable stream from HTTP response
   */
  static fromResponse(response: Response): ReadableStream<SSEStreamEvent> {
    const reader = new SSEStreamReader();
    
    return new ReadableStream({
      start(controller) {
        reader.controller = controller;
        reader.readStream(response.body!);
      }
    });
  }

  /**
   * Read SSE stream
   */
  private async readStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        this.buffer += chunk;

        // Process complete lines
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              this.controller.close();
              return;
            }

            try {
              const event: SSEStreamEvent = JSON.parse(data);
              this.controller.enqueue(event);
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      this.controller.error(error);
    }
  }
}

/**
 * Async iterator for SSE stream
 */
export async function* streamSSE(response: Response): AsyncGenerator<SSEStreamEvent> {
  const stream = SSEStreamReader.fromResponse(response);
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
```

---

### **Phase 4: Gateway Integration** (High Priority)

#### **4.1 Streaming Endpoint** (`src/gateway/server-streaming.ts`)

```typescript
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSSEServer } from '../streaming/sse-server.js';
import { executeToolWithStreaming } from '../agents/tool-execution-stream.js';

/**
 * Handle streaming tool invocation
 */
export async function handleToolsInvokeStreaming(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Create SSE server
  const sse = createSSEServer(res, {
    includeUsage: true,
    includeReasoning: true
  });

  try {
    // Parse request body
    const body = await readJsonBody(req);
    const { tool, args, sessionKey } = body;

    // Execute tool with streaming
    await executeToolWithStreaming(
      tool,
      args,
      sessionKey,
      sse
    );

    // Close stream
    sse.close();
  } catch (error) {
    sse.sendError(error as Error);
    sse.close();
  }
}

/**
 * Read JSON from request body
 */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
```

---

### **Phase 5: Tool Execution Streaming** (High Priority)

#### **5.1 Streaming Tool Execution** (`src/agents/tool-execution-stream.ts`)

```typescript
import type { AnyAgentTool } from './tools/common.js';
import type { SSEServer } from '../streaming/sse-server.js';

/**
 * Execute tool with streaming output
 */
export async function executeToolWithStreaming(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  sessionKey: string,
  sse: SSEServer
): Promise<void> {
  // Send tool start event
  sse.sendToolEvent(tool.name, `tool_${Date.now()}`, 'starting');

  try {
    // Execute tool
    const result = await tool.call(args, {
      abortController: new AbortController(),
      getAppState: async () => ({})
    });

    // Send tool complete event
    sse.sendToolEvent(tool.name, `tool_${Date.now()}`, 'complete', JSON.stringify(result));
  } catch (error) {
    // Send tool error event
    sse.sendToolEvent(
      tool.name,
      `tool_${Date.now()}`,
      'error',
      undefined,
      (error as Error).message
    );
    throw error;
  }
}
```

---

### **Phase 6: TUI Integration** (High Priority)

#### **6.1 Streaming Display Component** (`src/tui/components/streaming-display.ts`)

```typescript
import type { SSEStreamEvent } from '../../streaming/types.js';

/**
 * Streaming display for TUI
 */
export class StreamingDisplay {
  private buffer: string = '';
  private cursorPosition: number = 0;

  /**
   * Handle SSE event
   */
  handleEvent(event: SSEStreamEvent): void {
    switch (event.type) {
      case 'token':
        this.handleToken(event.data as any);
        break;
      case 'tool_start':
        this.handleToolStart(event.data as any);
        break;
      case 'tool_chunk':
        this.handleToolChunk(event.data as any);
        break;
      case 'tool_end':
        this.handleToolEnd(event.data as any);
        break;
      case 'error':
        this.handleError(event.data as any);
        break;
      case 'done':
        this.handleDone();
        break;
    }
  }

  /**
   * Handle token event
   */
  private handleToken(data: { content: string; tokenCount: number }): void {
    this.buffer += data.content;
    this.render();
  }

  /**
   * Render current buffer
   */
  private render(): void {
    // Clear and redraw
    // In real implementation, this would update the TUI
    process.stdout.write(`\r${this.buffer}`);
  }

  /**
   * Handle tool events
   */
  private handleToolStart(data: any): void {
    console.log(`\n🔧 Tool: ${data.toolName} (starting...)`);
  }

  private handleToolChunk(data: any): void {
    if (data.output) {
      console.log(data.output);
    }
  }

  private handleToolEnd(data: any): void {
    if (data.status === 'complete') {
      console.log(`✅ Tool: ${data.toolName} (complete)`);
    } else if (data.status === 'error') {
      console.log(`❌ Tool: ${data.toolName} (error: ${data.error})`);
    }
  }

  /**
   * Handle error
   */
  private handleError(data: { message: string }): void {
    console.error(`\n❌ Error: ${data.message}`);
  }

  /**
   * Handle stream end
   */
  private handleDone(): void {
    console.log('\n✅ Stream complete');
  }
}
```

---

## ✅ VERIFICATION CHECKLIST

### **Code Quality:**
- [ ] All TypeScript types defined
- [ ] All functions have JSDoc comments
- [ ] All errors properly handled
- [ ] No circular dependencies

### **Feature Completeness:**
- [ ] SSE server working
- [ ] SSE client working
- [ ] Streaming endpoint working
- [ ] Tool execution streaming working
- [ ] TUI display working
- [ ] Token-by-token display working

### **Integration:**
- [ ] Gateway endpoint registered
- [ ] TUI commands registered
- [ ] TUI handlers implemented
- [ ] All components wired together

### **Testing:**
- [ ] Test SSE server
- [ ] Test SSE client
- [ ] Test streaming endpoint
- [ ] Test TUI display
- [ ] Test end-to-end streaming

---

## 📝 IMPLEMENTATION ORDER

1. **Phase 1:** Core Types
2. **Phase 2:** SSE Server
3. **Phase 3:** SSE Client
4. **Phase 4:** Gateway Integration
5. **Phase 5:** Tool Execution Streaming
6. **Phase 6:** TUI Integration
7. **Phase 7:** Testing & Verification

---

**Status:** Ready for implementation
**Estimated Lines:** ~1,500 new lines
**Estimated Files:** 8 new, 5 modified
