/**
 * OpenClaw Gateway Streaming Handler
 *
 * Handles streaming tool invocation via SSE.
 * Enables real-time token-by-token display in TUI.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createOpenClawTools } from "../agents/openclaw-tools.js";
import { executeToolWithStreaming } from "../agents/tool-execution-stream.js";
import { loadConfig } from "../config/config.js";
import { createSSEServer } from "../streaming/sse-server.js";

/**
 * Handle streaming tool invocation
 */
export async function handleToolsInvokeStreaming(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Create SSE server
  const streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const sse = createSSEServer(res, streamId, {
    includeUsage: true,
    includeReasoning: true,
  });

  try {
    // Parse request body
    const body = await readJsonBody(req);
    const {
      tool: toolName,
      args,
      sessionKey,
    } = body as {
      tool: string;
      args: Record<string, unknown>;
      sessionKey?: string;
    };

    if (!toolName) {
      throw new Error("Missing tool name");
    }

    if (!args) {
      throw new Error("Missing tool arguments");
    }

    // Get tool from OpenClaw tools
    const config = loadConfig();
    const tools = createOpenClawTools({ config });
    const tool = tools.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // Execute tool with streaming
    await executeToolWithStreaming(tool, args, sessionKey || "unknown", sse);

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
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();

      // Limit body size to 1MB
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });

    req.on("end", () => {
      try {
        if (!body) {
          resolve({});
          return;
        }
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error(`Invalid JSON: ${(e as Error).message}`));
      }
    });

    req.on("error", reject);
  });
}

/**
 * Register streaming routes
 */
export function registerStreamingRoutes(
  routes: Map<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>,
): void {
  routes.set("/api/tools/invoke-stream", handleToolsInvokeStreaming);
}
