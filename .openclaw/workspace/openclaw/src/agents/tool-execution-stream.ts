/**
 * OpenClaw Streaming Tool Execution
 *
 * Enables streaming tool execution with real-time output.
 * Works with SSE server for token-by-token display.
 */

import type { SSEServer } from "../streaming/sse-server.js";
import type { AnyAgentTool } from "./tools/common.js";

/**
 * Execute tool with streaming output
 */
export async function executeToolWithStreaming(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  sessionKey: string,
  sse: SSEServer,
): Promise<unknown> {
  const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Send tool start event
  sse.sendToolEvent(tool.name, toolId, "starting");

  try {
    // Execute tool
    const result = await tool.call(args, {
      abortController: new AbortController(),
      getAppState: async () => ({}),
    });

    // Send tool complete event
    sse.sendToolEvent(tool.name, toolId, "complete", JSON.stringify(result));

    return result;
  } catch (error) {
    // Send tool error event
    sse.sendToolEvent(tool.name, toolId, "error", undefined, (error as Error).message);
    throw error;
  }
}

/**
 * Stream tool output chunk by chunk
 */
export async function streamToolOutput(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  sse: SSEServer,
  chunkSize: number = 10,
): Promise<unknown> {
  const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Send tool start event
  sse.sendToolEvent(tool.name, toolId, "starting");

  try {
    // Execute tool
    const result = await tool.call(args, {
      abortController: new AbortController(),
      getAppState: async () => ({}),
    });

    // Stream result as chunks
    const resultStr = JSON.stringify(result);

    for (let i = 0; i < resultStr.length; i += chunkSize) {
      const chunk = resultStr.slice(i, i + chunkSize);
      sse.sendToolEvent(tool.name, toolId, "running", chunk);

      // Small delay for streaming effect
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Send tool complete event
    sse.sendToolEvent(tool.name, toolId, "complete");

    return result;
  } catch (error) {
    // Send tool error event
    sse.sendToolEvent(tool.name, toolId, "error", undefined, (error as Error).message);
    throw error;
  }
}
