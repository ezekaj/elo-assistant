/**
 * OpenClaw SSE Server
 *
 * Server-Sent Events server for streaming responses.
 * Enables real-time token-by-token display in TUI.
 */

import type { ServerResponse } from "node:http";
import type {
  SSEStreamEvent,
  StreamOptions,
  TokenEventData,
  ToolStreamEventData,
  ResponseStreamEventData,
  ErrorEventData,
} from "./types.js";

/**
 * SSE Server for streaming responses
 */
export class SSEServer {
  private response: ServerResponse;
  private sequence: number = 0;
  private closed: boolean = false;
  private streamId: string;

  constructor(response: ServerResponse, streamId: string, options: StreamOptions = {}) {
    this.response = response;
    this.streamId = streamId;

    // Set SSE headers
    this.response.setHeader("Content-Type", "text/event-stream");
    this.response.setHeader("Cache-Control", "no-cache");
    this.response.setHeader("Connection", "keep-alive");
    this.response.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
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
      type: "token",
      data: { content, tokenCount, isThinking } as TokenEventData,
      timestamp: Date.now(),
      sequence: this.sequence++,
    });
  }

  /**
   * Send tool event
   */
  sendToolEvent(
    toolName: string,
    toolId: string,
    status: ToolStreamEventData["status"],
    output?: string,
    error?: string,
  ): void {
    const eventType = status === "starting" || status === "running" ? "tool_chunk" : "tool_end";

    this.send({
      type: eventType,
      data: { toolName, toolId, status, output, error } as ToolStreamEventData,
      timestamp: Date.now(),
      sequence: this.sequence++,
    });
  }

  /**
   * Send response event
   */
  sendResponseEvent(
    content: string,
    reasoning?: string,
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
  ): void {
    this.send({
      type: content ? "response_start" : "response_end",
      data: { content, reasoning, usage } as ResponseStreamEventData,
      timestamp: Date.now(),
      sequence: this.sequence++,
    });
  }

  /**
   * Send error
   */
  sendError(error: Error): void {
    this.send({
      type: "error",
      data: {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      } as ErrorEventData,
      timestamp: Date.now(),
      sequence: this.sequence++,
    });
  }

  /**
   * Close stream
   */
  close(): void {
    if (this.closed) return;

    this.send({
      type: "done",
      data: null,
      timestamp: Date.now(),
      sequence: this.sequence++,
    });

    this.response.end();
    this.closed = true;
  }

  /**
   * Get stream ID
   */
  getStreamId(): string {
    return this.streamId;
  }

  /**
   * Check if stream is closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Create SSE server from HTTP response
 */
export function createSSEServer(
  response: ServerResponse,
  streamId: string,
  options?: StreamOptions,
): SSEServer {
  return new SSEServer(response, streamId, options);
}
