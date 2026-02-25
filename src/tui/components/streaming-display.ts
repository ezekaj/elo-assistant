/**
 * OpenClaw TUI Streaming Display
 *
 * Handles streaming display in TUI for real-time token-by-token rendering.
 */

import type { SSEStreamEvent, TokenEventData, ToolStreamEventData } from "../../streaming/types.js";

/**
 * Streaming display for TUI
 */
export class StreamingDisplay {
  private buffer: string = "";
  private reasoningBuffer: string = "";
  private isThinking: boolean = false;
  private currentTool: string | null = null;

  /**
   * Handle SSE event
   */
  handleEvent(event: SSEStreamEvent): void {
    switch (event.type) {
      case "token":
        this.handleToken(event.data as TokenEventData);
        break;
      case "tool_start":
        this.handleToolStart(event.data as ToolStreamEventData);
        break;
      case "tool_chunk":
        this.handleToolChunk(event.data as ToolStreamEventData);
        break;
      case "tool_end":
        this.handleToolEnd(event.data as ToolStreamEventData);
        break;
      case "error":
        this.handleError(event.data as { message: string });
        break;
      case "done":
        this.handleDone();
        break;
    }
  }

  /**
   * Handle token event
   */
  private handleToken(data: TokenEventData): void {
    if (data.isThinking) {
      // Reasoning/thinking phase
      this.reasoningBuffer += data.content;
      this.isThinking = true;
    } else {
      // Response phase
      if (this.isThinking) {
        // Just finished thinking, start response
        this.isThinking = false;
      }
      this.buffer += data.content;
    }

    this.render();
  }

  /**
   * Render current buffer
   */
  private render(): void {
    // In real implementation, this would update the TUI
    // For now, just log to console
    if (this.reasoningBuffer) {
      process.stdout.write(`\r💭 Thinking: ${this.reasoningBuffer}`);
    }
    if (this.buffer) {
      process.stdout.write(`\r${this.buffer}`);
    }
  }

  /**
   * Handle tool start
   */
  private handleToolStart(data: ToolStreamEventData): void {
    this.currentTool = data.toolName;
    console.log(`\n🔧 Tool: ${data.toolName} (starting...)`);
  }

  /**
   * Handle tool chunk
   */
  private handleToolChunk(data: ToolStreamEventData): void {
    if (data.output) {
      process.stdout.write(data.output);
    }
  }

  /**
   * Handle tool end
   */
  private handleToolEnd(data: ToolStreamEventData): void {
    if (data.status === "complete") {
      console.log(`\n✅ Tool: ${data.toolName} (complete)`);
    } else if (data.status === "error") {
      console.log(`\n❌ Tool: ${data.toolName} (error: ${data.error})`);
    }
    this.currentTool = null;
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
    console.log("\n✅ Stream complete");
    this.buffer = "";
    this.reasoningBuffer = "";
    this.isThinking = false;
  }

  /**
   * Get current content
   */
  getContent(): string {
    return this.buffer;
  }

  /**
   * Get current reasoning
   */
  getReasoning(): string {
    return this.reasoningBuffer;
  }

  /**
   * Clear buffers
   */
  clear(): void {
    this.buffer = "";
    this.reasoningBuffer = "";
    this.isThinking = false;
    this.currentTool = null;
  }
}

/**
 * Create streaming display
 */
export function createStreamingDisplay(): StreamingDisplay {
  return new StreamingDisplay();
}
