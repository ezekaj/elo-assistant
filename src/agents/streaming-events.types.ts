/**
 * Streaming Events Types
 *
 * Standardized streaming events for SDK integration.
 * Extracted from Claude Code v2.1.50
 */

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Base streaming event
 */
export interface StreamingEvent {
  /** Event type */
  type: "stream_event";
  /** Event payload */
  event: StreamEventPayload;
  /** Parent tool use ID (if applicable) */
  parent_tool_use_id?: string | null;
  /** Unique event ID */
  uuid: string;
  /** Session ID */
  session_id: string;
}

/**
 * Stream event payload types
 */
export type StreamEventPayload =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent;

/**
 * Message start event
 */
export interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    role: "assistant";
    model: string;
    content: [];
    stop_reason: null;
    stop_sequence: null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

/**
 * Message delta event
 */
export interface MessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason?: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
    stop_sequence?: string | null;
  };
  usage: {
    output_tokens: number;
  };
}

/**
 * Message stop event
 */
export interface MessageStopEvent {
  type: "message_stop";
}

/**
 * Content block start event
 */
export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

/**
 * Content block delta event
 */
export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta" | "input_json_delta";
    text?: string;
    partial_json?: string;
  };
}

/**
 * Content block stop event
 */
export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

// ============================================================================
// CONTROL EVENTS
// ============================================================================

/**
 * Control response event
 */
export interface ControlResponseEvent {
  type: "control_response";
  response: {
    subtype: "success" | "error";
    request_id: string;
    response?: unknown;
    error?: string;
  };
}

/**
 * Control request event
 */
export interface ControlRequestEvent {
  type: "control_request";
  request: {
    subtype: string;
    [key: string]: unknown;
  };
}

/**
 * Control cancel event
 */
export interface ControlCancelEvent {
  type: "control_cancel";
  request_id: string;
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

/**
 * Compact boundary event (for summarization)
 */
export interface CompactBoundaryEvent {
  type: "system";
  subtype: "compact_boundary";
  compact_metadata: {
    trigger: "manual" | "auto";
    pre_tokens: number;
  };
  uuid: string;
  session_id: string;
}

/**
 * Keep alive event
 */
export interface KeepAliveEvent {
  type: "keep_alive";
}

// ============================================================================
// UNION TYPES
// ============================================================================

/**
 * All possible streaming event types
 */
export type AnyStreamingEvent =
  | StreamingEvent
  | ControlResponseEvent
  | ControlRequestEvent
  | ControlCancelEvent
  | CompactBoundaryEvent
  | KeepAliveEvent;

/**
 * Event handler function type
 */
export type StreamingEventHandler<T extends AnyStreamingEvent = AnyStreamingEvent> = (
  event: T,
) => void | Promise<void>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if event is a streaming event
 */
export function isStreamingEvent(event: AnyStreamingEvent): event is StreamingEvent {
  return event.type === "stream_event";
}

/**
 * Check if event is a message start
 */
export function isMessageStartEvent(event: StreamingEvent): boolean {
  return event.event.type === "message_start";
}

/**
 * Check if event is a content block delta
 */
export function isContentBlockDeltaEvent(event: StreamingEvent): boolean {
  return event.event.type === "content_block_delta";
}

/**
 * Check if event is a text delta
 */
export function isTextDeltaEvent(event: StreamingEvent): boolean {
  return (
    event.event.type === "content_block_delta" &&
    (event.event as ContentBlockDeltaEvent).delta.type === "text_delta"
  );
}

/**
 * Generate unique event ID
 */
export function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a message start event
 */
export function createMessageStartEvent(
  messageId: string,
  model: string,
  inputTokens: number,
  sessionId: string,
): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "message_start",
      message: {
        id: messageId,
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: inputTokens,
          output_tokens: 0,
        },
      },
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}

/**
 * Create a content block start event (text)
 */
export function createTextBlockStartEvent(index: number, sessionId: string): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      index,
      content_block: {
        type: "text",
        text: "",
      },
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}

/**
 * Create a content block start event (tool use)
 */
export function createToolUseBlockStartEvent(
  index: number,
  toolId: string,
  toolName: string,
  sessionId: string,
): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "content_block_start",
      index,
      content_block: {
        type: "tool_use",
        id: toolId,
        name: toolName,
        input: {},
      },
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}

/**
 * Create a text delta event
 */
export function createTextDeltaEvent(
  index: number,
  text: string,
  sessionId: string,
): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index,
      delta: {
        type: "text_delta",
        text,
      },
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}

/**
 * Create a content block stop event
 */
export function createContentBlockStopEvent(index: number, sessionId: string): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "content_block_stop",
      index,
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}

/**
 * Create a message delta event
 */
export function createMessageDeltaEvent(
  outputTokens: number,
  stopReason?: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use",
  sessionId: string = "default",
): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "message_delta",
      delta: {
        stop_reason: stopReason || null,
        stop_sequence: null,
      },
      usage: {
        output_tokens: outputTokens,
      },
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}

/**
 * Create a message stop event
 */
export function createMessageStopEvent(sessionId: string): StreamingEvent {
  return {
    type: "stream_event",
    event: {
      type: "message_stop",
    },
    uuid: generateEventId(),
    session_id: sessionId,
  };
}
