/**
 * OpenClaw SSE Client
 *
 * Server-Sent Events client for reading streaming responses.
 * Enables real-time token-by-token display in TUI.
 */

import type { SSEStreamEvent, StreamOptions } from "./types.js";

/**
 * SSE Stream Reader
 */
export class SSEStreamReader {
  private buffer: string = "";

  /**
   * Create readable stream from HTTP response
   */
  static fromResponse(response: Response): ReadableStream<SSEStreamEvent> {
    return new ReadableStream({
      async start(controller) {
        if (!response.body) {
          controller.error(new Error("No response body"));
          return;
        }

        const reader = new SSEStreamReader();
        await reader.readStream(response.body, controller);
      },
    });
  }

  /**
   * Read SSE stream
   */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    controller: ReadableStreamDefaultController<SSEStreamEvent>,
  ): Promise<void> {
    const decoder = new TextDecoder();
    const reader = body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        this.buffer += chunk;

        // Process complete lines
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";

        for (const line of lines) {
          const event = this.parseSSELine(line);
          if (event) {
            controller.enqueue(event);

            // Check for done event
            if (event.type === "done") {
              controller.close();
              return;
            }
          }
        }
      }
    } catch (error) {
      controller.error(error);
    }
  }

  /**
   * Parse SSE line
   */
  private parseSSELine(line: string): SSEStreamEvent | null {
    if (!line.startsWith("data: ")) {
      return null;
    }

    const data = line.slice(6);

    // Check for done marker
    if (data === "[DONE]") {
      return {
        type: "done",
        data: null,
        timestamp: Date.now(),
        sequence: -1,
      };
    }

    try {
      const event: SSEStreamEvent = JSON.parse(data);
      return event;
    } catch {
      // Skip invalid JSON
      return null;
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

/**
 * Collect all tokens from SSE stream
 */
export async function collectTokens(response: Response): Promise<{
  content: string;
  reasoning: string;
  events: SSEStreamEvent[];
}> {
  let content = "";
  let reasoning = "";
  const events: SSEStreamEvent[] = [];

  for await (const event of streamSSE(response)) {
    events.push(event);

    if (event.type === "token") {
      const data = event.data as { content?: string; isThinking?: boolean };
      if (data.isThinking) {
        reasoning += data.content || "";
      } else {
        content += data.content || "";
      }
    }
  }

  return { content, reasoning, events };
}
