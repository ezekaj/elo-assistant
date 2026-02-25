/**
 * Stream Backpressure System
 *
 * Provides backpressure handling for streaming responses to prevent:
 * - UI freezing when consumer is slow
 * - Memory buildup from unbounded queues
 * - Dropped chunks under load
 *
 * Uses time-slicing (yield control every N ms) and queue management.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("stream-backpressure");

export interface BackpressureConfig {
  /** Max time in ms before yielding control (default: 16ms for 60fps) */
  frameTimeBudget?: number;
  /** Max queued chunks before applying backpressure (default: 100) */
  highWaterMark?: number;
  /** Resume normal flow when queue drops below this (default: 50) */
  lowWaterMark?: number;
  /** Max ms to wait when backpressure is applied (default: 100) */
  maxBackpressureDelay?: number;
}

export interface StreamMetrics {
  chunksEmitted: number;
  chunksDropped: number;
  backpressureEvents: number;
  totalYields: number;
  avgChunkLatency: number;
}

type ChunkHandler<T> = (chunk: T) => void | Promise<void>;

/**
 * Wraps a stream handler with backpressure support.
 * Yields control periodically to keep UI responsive.
 */
export class BackpressureController<T = string> {
  private queue: T[] = [];
  private processing = false;
  private lastYield = 0;
  private metrics: StreamMetrics = {
    chunksEmitted: 0,
    chunksDropped: 0,
    backpressureEvents: 0,
    totalYields: 0,
    avgChunkLatency: 0,
  };
  private chunkLatencies: number[] = [];
  private readonly config: Required<BackpressureConfig>;
  private readonly handler: ChunkHandler<T>;
  private paused = false;
  private resumePromise: Promise<void> | null = null;
  private resumeResolve: (() => void) | null = null;

  constructor(handler: ChunkHandler<T>, config: BackpressureConfig = {}) {
    this.handler = handler;
    this.config = {
      frameTimeBudget: config.frameTimeBudget ?? 16,
      highWaterMark: config.highWaterMark ?? 100,
      lowWaterMark: config.lowWaterMark ?? 50,
      maxBackpressureDelay: config.maxBackpressureDelay ?? 100,
    };
    this.lastYield = Date.now();
  }

  /**
   * Push a chunk to the queue. Returns true if accepted, false if dropped.
   */
  async push(chunk: T): Promise<boolean> {
    // Check if we need to apply backpressure
    if (this.queue.length >= this.config.highWaterMark) {
      this.metrics.backpressureEvents++;

      // Wait for queue to drain
      const backpressureStart = Date.now();
      while (this.queue.length >= this.config.lowWaterMark) {
        if (Date.now() - backpressureStart > this.config.maxBackpressureDelay) {
          // Timeout - drop oldest chunks to make room
          const toDrop = Math.ceil((this.queue.length - this.config.lowWaterMark) / 2);
          this.queue.splice(0, toDrop);
          this.metrics.chunksDropped += toDrop;
          log.warn(`Dropped ${toDrop} chunks due to backpressure timeout`);
          break;
        }
        await this.yieldControl();
      }
    }

    this.queue.push(chunk);

    // Start processing if not already
    if (!this.processing) {
      void this.processQueue();
    }

    return true;
  }

  /**
   * Process queued chunks with time-slicing
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        // Check if we should yield control
        const now = Date.now();
        if (now - this.lastYield >= this.config.frameTimeBudget) {
          await this.yieldControl();
        }

        // Check if paused
        if (this.paused && this.resumePromise) {
          await this.resumePromise;
        }

        const chunk = this.queue.shift();
        if (chunk === undefined) continue;

        const chunkStart = Date.now();
        try {
          await this.handler(chunk);
          this.metrics.chunksEmitted++;

          // Track latency
          const latency = Date.now() - chunkStart;
          this.chunkLatencies.push(latency);
          if (this.chunkLatencies.length > 100) {
            this.chunkLatencies.shift();
          }
          this.metrics.avgChunkLatency =
            this.chunkLatencies.reduce((a, b) => a + b, 0) / this.chunkLatencies.length;
        } catch (err) {
          log.error(`Chunk handler error: ${err}`);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Yield control to allow other tasks to run
   */
  private async yieldControl(): Promise<void> {
    this.metrics.totalYields++;
    this.lastYield = Date.now();

    // Use setImmediate if available (Node.js), otherwise setTimeout
    if (typeof setImmediate !== "undefined") {
      await new Promise<void>((resolve) => setImmediate(resolve));
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * Pause processing (for when UI is not visible, etc.)
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.resumePromise = new Promise((resolve) => {
      this.resumeResolve = resolve;
    });
  }

  /**
   * Resume processing
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.resumeResolve?.();
    this.resumePromise = null;
    this.resumeResolve = null;
  }

  /**
   * Flush all pending chunks immediately (bypasses backpressure)
   */
  async flush(): Promise<void> {
    this.resume(); // Ensure not paused
    while (this.queue.length > 0 || this.processing) {
      await this.yieldControl();
    }
  }

  /**
   * Clear the queue without processing
   */
  clear(): void {
    const dropped = this.queue.length;
    this.queue = [];
    this.metrics.chunksDropped += dropped;
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current queue depth
   */
  get queueDepth(): number {
    return this.queue.length;
  }

  /**
   * Check if backpressure is currently active
   */
  get isBackpressured(): boolean {
    return this.queue.length >= this.config.highWaterMark;
  }
}

/**
 * Create a backpressure-aware stream transform.
 * Wraps an async iterator with backpressure control.
 */
export function createBackpressuredStream<T>(
  source: AsyncIterable<T>,
  handler: ChunkHandler<T>,
  config?: BackpressureConfig,
): {
  start: () => Promise<void>;
  controller: BackpressureController<T>;
} {
  const controller = new BackpressureController(handler, config);

  const start = async () => {
    for await (const chunk of source) {
      await controller.push(chunk);
    }
    await controller.flush();
  };

  return { start, controller };
}

/**
 * Rate-limited emitter for high-frequency updates.
 * Coalesces rapid updates into batched emissions.
 */
export class CoalescingEmitter<T> {
  private pending: T | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly handler: ChunkHandler<T>;
  private readonly delayMs: number;

  constructor(handler: ChunkHandler<T>, delayMs = 16) {
    this.handler = handler;
    this.delayMs = delayMs;
  }

  /**
   * Emit a value. If called rapidly, only the last value is emitted.
   */
  emit(value: T): void {
    this.pending = value;

    if (!this.timeout) {
      this.timeout = setTimeout(() => {
        this.timeout = null;
        if (this.pending !== null) {
          void this.handler(this.pending);
          this.pending = null;
        }
      }, this.delayMs);
    }
  }

  /**
   * Force immediate emission of pending value
   */
  flush(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.pending !== null) {
      void this.handler(this.pending);
      this.pending = null;
    }
  }

  /**
   * Cancel pending emission
   */
  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.pending = null;
  }
}
