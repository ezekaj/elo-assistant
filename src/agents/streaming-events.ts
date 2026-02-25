/**
 * Streaming Events Manager
 *
 * Manages streaming events for SDK integration.
 * Extracted from Claude Code v2.1.50
 */

import { EventEmitter } from "node:events";
import type {
  StreamingEvent,
  StreamingEventHandler,
  AnyStreamingEvent,
} from "./streaming-events.types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { generateEventId, isStreamingEvent } from "./streaming-events.types.js";

const log = createSubsystemLogger("streaming-events");

// ============================================================================
// STREAMING EMITTER
// ============================================================================

/**
 * Streaming events emitter
 * Extends EventEmitter for event handling
 */
export class StreamingEventsEmitter extends EventEmitter {
  private sessionId: string;
  private enabled: boolean = true;

  constructor(sessionId: string = "default") {
    super();
    this.sessionId = sessionId;
  }

  /**
   * Set session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Enable or disable streaming
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug(`Streaming events ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Emit a streaming event
   */
  emitEvent(event: AnyStreamingEvent): boolean {
    if (!this.enabled) {
      return false;
    }

    try {
      this.emit("event", event);

      // Also emit specific event type
      if (isStreamingEvent(event)) {
        this.emit(event.event.type, event);
      } else {
        this.emit(event.type, event);
      }

      return true;
    } catch (error) {
      log.error(`Error emitting event: ${error}`);
      return false;
    }
  }

  /**
   * Subscribe to all events
   */
  onEvent(handler: StreamingEventHandler): () => void {
    this.on("event", handler);
    return () => this.off("event", handler);
  }

  /**
   * Subscribe to specific event type
   */
  onEventType<T extends AnyStreamingEvent>(
    eventType: string,
    handler: StreamingEventHandler<T>,
  ): () => void {
    this.on(eventType, handler);
    return () => this.off(eventType, handler);
  }

  /**
   * Subscribe to message start events
   */
  onMessageStart(handler: StreamingEventHandler<StreamingEvent>): () => void {
    return this.onEventType("message_start", handler);
  }

  /**
   * Subscribe to content block delta events
   */
  onContentDelta(handler: StreamingEventHandler<StreamingEvent>): () => void {
    return this.onEventType("content_block_delta", handler);
  }

  /**
   * Subscribe to message stop events
   */
  onMessageStop(handler: StreamingEventHandler<StreamingEvent>): () => void {
    return this.onEventType("message_stop", handler);
  }
}

// ============================================================================
// STREAMING CONTEXT
// ============================================================================

/**
 * Streaming context for tracking current stream state
 */
export class StreamingContext {
  private messageId: string | null = null;
  private model: string | null = null;
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private contentBlocks: Array<{
    type: "text" | "tool_use";
    text?: string;
    toolName?: string;
    toolInput?: string;
  }> = [];
  private currentBlockIndex: number = -1;
  private ttftMs: number | null = null;
  private startTime: number | null = null;

  /**
   * Start a new message stream
   */
  startMessage(messageId: string, model: string, inputTokens: number): void {
    this.messageId = messageId;
    this.model = model;
    this.inputTokens = inputTokens;
    this.outputTokens = 0;
    this.contentBlocks = [];
    this.currentBlockIndex = -1;
    this.startTime = Date.now();
    this.ttftMs = null;
  }

  /**
   * Start a new content block
   */
  startBlock(type: "text" | "tool_use", toolName?: string): number {
    const index = this.contentBlocks.length;
    this.contentBlocks.push({
      type,
      text: "",
      toolName,
      toolInput: "",
    });
    this.currentBlockIndex = index;
    return index;
  }

  /**
   * Append text to current block
   */
  appendText(text: string): void {
    if (this.currentBlockIndex >= 0) {
      const block = this.contentBlocks[this.currentBlockIndex];
      if (block.type === "text") {
        block.text = (block.text || "") + text;
      }
    }

    // Track TTFT
    if (this.ttftMs === null && this.startTime !== null) {
      this.ttftMs = Date.now() - this.startTime;
    }
  }

  /**
   * Append JSON to current tool use block
   */
  appendJson(partialJson: string): void {
    if (this.currentBlockIndex >= 0) {
      const block = this.contentBlocks[this.currentBlockIndex];
      if (block.type === "tool_use") {
        block.toolInput = (block.toolInput || "") + partialJson;
      }
    }
  }

  /**
   * End current content block
   */
  endBlock(): void {
    this.currentBlockIndex = -1;
  }

  /**
   * End message stream
   */
  endMessage(outputTokens: number): void {
    this.outputTokens = outputTokens;
  }

  /**
   * Get TTFT (time to first token)
   */
  getTtftMs(): number | null {
    return this.ttftMs;
  }

  /**
   * Get current message info
   */
  getMessageInfo(): {
    messageId: string | null;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    blockCount: number;
  } {
    return {
      messageId: this.messageId,
      model: this.model,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      blockCount: this.contentBlocks.length,
    };
  }

  /**
   * Get accumulated text
   */
  getAccumulatedText(): string {
    return this.contentBlocks
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");
  }

  /**
   * Reset context
   */
  reset(): void {
    this.messageId = null;
    this.model = null;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.contentBlocks = [];
    this.currentBlockIndex = -1;
    this.ttftMs = null;
    this.startTime = null;
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

let globalEmitter: StreamingEventsEmitter | null = null;

/**
 * Get global streaming events emitter
 */
export function getStreamingEmitter(sessionId?: string): StreamingEventsEmitter {
  if (!globalEmitter) {
    globalEmitter = new StreamingEventsEmitter(sessionId);
  } else if (sessionId) {
    globalEmitter.setSessionId(sessionId);
  }
  return globalEmitter;
}

/**
 * Reset global emitter (for testing)
 */
export function resetStreamingEmitter(): void {
  if (globalEmitter) {
    globalEmitter.removeAllListeners();
    globalEmitter = null;
  }
}

// ============================================================================
// STREAM HELPER
// ============================================================================

/**
 * Stream adapter for converting API streams to events
 */
export async function* adaptStreamToEvents(
  stream: AsyncIterable<any>,
  sessionId: string,
  emitter?: StreamingEventsEmitter,
): AsyncGenerator<AnyStreamingEvent> {
  const em = emitter || getStreamingEmitter(sessionId);
  const context = new StreamingContext();

  let messageStarted = false;
  let blockIndex = -1;

  for await (const chunk of stream) {
    // Handle different stream formats
    // This is a generic adapter - adapt to specific API format

    // Message start
    if (!messageStarted) {
      const startEvent: StreamingEvent = {
        type: "stream_event",
        event: {
          type: "message_start",
          message: {
            id: generateEventId(),
            role: "assistant",
            model: chunk.model || "unknown",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: {
              input_tokens: chunk.usage?.input_tokens || 0,
              output_tokens: 0,
            },
          },
        },
        uuid: generateEventId(),
        session_id: sessionId,
      };

      const msgStart = startEvent.event as import("./streaming-events.types.js").MessageStartEvent;
      context.startMessage(
        msgStart.message.id,
        msgStart.message.model,
        msgStart.message.usage.input_tokens,
      );

      messageStarted = true;
      em.emitEvent(startEvent);
      yield startEvent;
    }

    // Content delta
    if (chunk.delta?.text) {
      // Start text block if needed
      if (blockIndex < 0) {
        blockIndex = context.startBlock("text");

        const blockStartEvent: StreamingEvent = {
          type: "stream_event",
          event: {
            type: "content_block_start",
            index: blockIndex,
            content_block: {
              type: "text",
              text: "",
            },
          },
          uuid: generateEventId(),
          session_id: sessionId,
        };

        em.emitEvent(blockStartEvent);
        yield blockStartEvent;
      }

      context.appendText(chunk.delta.text);

      const deltaEvent: StreamingEvent = {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: blockIndex,
          delta: {
            type: "text_delta",
            text: chunk.delta.text,
          },
        },
        uuid: generateEventId(),
        session_id: sessionId,
      };

      em.emitEvent(deltaEvent);
      yield deltaEvent;
    }

    // Message complete
    if (chunk.done || chunk.stop_reason) {
      // End content block
      if (blockIndex >= 0) {
        const blockStopEvent: StreamingEvent = {
          type: "stream_event",
          event: {
            type: "content_block_stop",
            index: blockIndex,
          },
          uuid: generateEventId(),
          session_id: sessionId,
        };

        em.emitEvent(blockStopEvent);
        yield blockStopEvent;
      }

      // Message delta
      const outputTokens =
        chunk.usage?.output_tokens || Math.ceil(context.getAccumulatedText().length / 4);
      context.endMessage(outputTokens);

      const deltaEvent: StreamingEvent = {
        type: "stream_event",
        event: {
          type: "message_delta",
          delta: {
            stop_reason: chunk.stop_reason || "end_turn",
            stop_sequence: null,
          },
          usage: {
            output_tokens: outputTokens,
          },
        },
        uuid: generateEventId(),
        session_id: sessionId,
      };

      em.emitEvent(deltaEvent);
      yield deltaEvent;

      // Message stop
      const stopEvent: StreamingEvent = {
        type: "stream_event",
        event: {
          type: "message_stop",
        },
        uuid: generateEventId(),
        session_id: sessionId,
      };

      em.emitEvent(stopEvent);
      yield stopEvent;
    }
  }
}
