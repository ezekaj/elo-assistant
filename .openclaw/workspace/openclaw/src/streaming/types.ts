/**
 * OpenClaw Streaming Types
 *
 * Type definitions for SSE streaming architecture.
 * Enables real-time token-by-token display in TUI.
 */

/**
 * SSE Stream Event Types
 */
export type SSEEventType =
  | "token" // Single token/chunk
  | "tool_start" // Tool execution started
  | "tool_chunk" // Tool execution chunk
  | "tool_end" // Tool execution ended
  | "response_start" // Response started
  | "response_end" // Response ended
  | "error" // Error occurred
  | "done"; // Stream complete

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
  isThinking?: boolean; // For reasoning models
}

/**
 * Tool Stream Event Data
 */
export interface ToolStreamEventData {
  toolName: string;
  toolId: string;
  status: "starting" | "running" | "complete" | "error";
  output?: string;
  error?: string;
}

/**
 * Response Stream Event Data
 */
export interface ResponseStreamEventData {
  content: string;
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Error Event Data
 */
export interface ErrorEventData {
  message: string;
  stack?: string;
  code?: string;
}

/**
 * Stream Options
 */
export interface StreamOptions {
  includeUsage?: boolean;
  includeReasoning?: boolean;
  chunkSize?: number; // Characters per chunk
}

/**
 * Stream Controller Interface
 */
export interface StreamController {
  enqueue(event: SSEStreamEvent): void;
  close(): void;
  error(error: Error): void;
}

/**
 * Streaming Tool Result
 */
export interface StreamingToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  streamId: string;
}
