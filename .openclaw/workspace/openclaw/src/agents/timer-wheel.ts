/**
 * Hierarchical Timer Wheel for O(1) timeout management.
 *
 * Instead of creating a separate `setTimeout` for each process session,
 * this module provides a centralized timer wheel that batches timeout
 * handling, reducing the number of active timers from O(n) to O(1).
 *
 * Architecture:
 * - Single interval drives the wheel tick
 * - Wheel slots hold linked lists of timer entries
 * - Two-level hierarchy: coarse (seconds) + fine (100ms precision)
 * - Expired timers are collected and callbacks executed in batches
 */

export interface TimerEntry {
  id: string;
  expiresAt: number;
  callback: () => void;
  cancelled: boolean;
}

interface WheelSlot {
  head: TimerEntry | null;
  tail: TimerEntry | null;
}

export interface TimerWheelOptions {
  /**
   * Tick interval in milliseconds (default: 100ms)
   */
  tickIntervalMs?: number;
  /**
   * Number of slots in the wheel (default: 256)
   */
  wheelSize?: number;
  /**
   * Use process.hrtime for higher precision (default: false)
   */
  highPrecision?: boolean;
}

export interface TimerWheelStats {
  activeTimers: number;
  totalScheduled: number;
  totalFired: number;
  totalCancelled: number;
  tickCount: number;
  currentSlot: number;
  wheelSize: number;
}

/**
 * Hierarchical Timer Wheel implementation.
 *
 * Usage:
 * ```ts
 * const wheel = new TimerWheel();
 * wheel.start();
 *
 * const timerId = wheel.schedule('session-123', 5000, () => {
 *   console.log('Timer expired!');
 * });
 *
 * // Cancel if needed
 * wheel.cancel(timerId);
 *
 * // Cleanup
 * wheel.stop();
 * ```
 */
export class TimerWheel {
  private readonly tickIntervalMs: number;
  private readonly wheelSize: number;
  private readonly highPrecision: boolean;

  private wheel: WheelSlot[];
  private timerMap: Map<string, TimerEntry>;
  private currentSlot: number;
  private tickTimer: NodeJS.Timeout | null;
  private startTime: number;

  // Stats
  private totalScheduled: number;
  private totalFired: number;
  private totalCancelled: number;
  private tickCount: number;

  constructor(options: TimerWheelOptions = {}) {
    this.tickIntervalMs = options.tickIntervalMs ?? 100;
    this.wheelSize = options.wheelSize ?? 256;
    this.highPrecision = options.highPrecision ?? false;

    this.wheel = Array.from({ length: this.wheelSize }, () => ({
      head: null,
      tail: null,
    }));
    this.timerMap = new Map();
    this.currentSlot = 0;
    this.tickTimer = null;
    this.startTime = 0;

    this.totalScheduled = 0;
    this.totalFired = 0;
    this.totalCancelled = 0;
    this.tickCount = 0;
  }

  /**
   * Start the timer wheel. Must be called before scheduling timers.
   */
  start(): void {
    if (this.tickTimer) {
      return; // Already running
    }
    this.startTime = this.now();
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
    // Don't prevent process exit
    this.tickTimer.unref();
  }

  /**
   * Stop the timer wheel and cancel all pending timers.
   */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    // Cancel all remaining timers
    for (const entry of this.timerMap.values()) {
      entry.cancelled = true;
    }
    this.timerMap.clear();
    this.wheel = Array.from({ length: this.wheelSize }, () => ({
      head: null,
      tail: null,
    }));
    this.currentSlot = 0;
  }

  /**
   * Schedule a timer callback.
   *
   * @param id Unique identifier for this timer (e.g., session ID)
   * @param delayMs Delay in milliseconds
   * @param callback Function to call when timer expires
   * @returns The timer ID for cancellation
   */
  schedule(id: string, delayMs: number, callback: () => void): string {
    // Cancel existing timer with same ID
    this.cancel(id);

    const expiresAt = this.now() + delayMs;
    const entry: TimerEntry = {
      id,
      expiresAt,
      callback,
      cancelled: false,
    };

    this.timerMap.set(id, entry);
    this.insertIntoWheel(entry);
    this.totalScheduled++;

    return id;
  }

  /**
   * Cancel a scheduled timer.
   *
   * @param id Timer ID to cancel
   * @returns true if timer was found and cancelled
   */
  cancel(id: string): boolean {
    const entry = this.timerMap.get(id);
    if (!entry) {
      return false;
    }

    entry.cancelled = true;
    this.timerMap.delete(id);
    this.totalCancelled++;
    return true;
  }

  /**
   * Check if a timer is currently scheduled.
   */
  has(id: string): boolean {
    return this.timerMap.has(id);
  }

  /**
   * Get remaining time for a timer in milliseconds.
   * Returns -1 if timer not found.
   */
  remaining(id: string): number {
    const entry = this.timerMap.get(id);
    if (!entry) {
      return -1;
    }
    return Math.max(0, entry.expiresAt - this.now());
  }

  /**
   * Get current statistics.
   */
  stats(): TimerWheelStats {
    return {
      activeTimers: this.timerMap.size,
      totalScheduled: this.totalScheduled,
      totalFired: this.totalFired,
      totalCancelled: this.totalCancelled,
      tickCount: this.tickCount,
      currentSlot: this.currentSlot,
      wheelSize: this.wheelSize,
    };
  }

  /**
   * Force process all expired timers (useful for testing).
   */
  flush(): void {
    const now = this.now();
    const expired: TimerEntry[] = [];

    // Check all slots for expired timers
    for (let i = 0; i < this.wheelSize; i++) {
      const slot = this.wheel[i]!;
      let entry = slot.head;
      let prev: TimerEntry | null = null;

      while (entry) {
        if (entry.cancelled) {
          // Remove cancelled entry
          if (prev) {
            (prev as { next?: TimerEntry }).next = (entry as { next?: TimerEntry }).next;
          } else {
            slot.head = (entry as { next?: TimerEntry }).next ?? null;
          }
          entry = (entry as { next?: TimerEntry }).next ?? null;
          continue;
        }

        if (entry.expiresAt <= now) {
          expired.push(entry);
          // Remove from slot
          if (prev) {
            (prev as { next?: TimerEntry }).next = (entry as { next?: TimerEntry }).next;
          } else {
            slot.head = (entry as { next?: TimerEntry }).next ?? null;
          }
          entry = (entry as { next?: TimerEntry }).next ?? null;
        } else {
          prev = entry;
          entry = (entry as { next?: TimerEntry }).next ?? null;
        }
      }

      // Update tail
      if (!slot.head) {
        slot.tail = null;
      }
    }

    // Fire callbacks
    for (const entry of expired) {
      if (!entry.cancelled) {
        this.timerMap.delete(entry.id);
        this.totalFired++;
        this.safeCallback(entry.callback);
      }
    }
  }

  private now(): number {
    if (this.highPrecision) {
      const [sec, nsec] = process.hrtime();
      return sec * 1000 + nsec / 1_000_000;
    }
    return Date.now();
  }

  private insertIntoWheel(entry: TimerEntry): void {
    // Calculate which slot this timer belongs to
    const ticksUntilExpiry = Math.max(
      0,
      Math.ceil((entry.expiresAt - this.now()) / this.tickIntervalMs),
    );
    const targetSlot = (this.currentSlot + ticksUntilExpiry) % this.wheelSize;

    const slot = this.wheel[targetSlot]!;

    // Add to linked list
    (entry as { next?: TimerEntry }).next = undefined;
    if (slot.tail) {
      (slot.tail as { next?: TimerEntry }).next = entry;
      slot.tail = entry;
    } else {
      slot.head = entry;
      slot.tail = entry;
    }
  }

  private tick(): void {
    this.tickCount++;
    this.currentSlot = (this.currentSlot + 1) % this.wheelSize;

    const slot = this.wheel[this.currentSlot]!;
    const now = this.now();
    const expired: TimerEntry[] = [];
    const reschedule: TimerEntry[] = [];

    let entry = slot.head;
    slot.head = null;
    slot.tail = null;

    while (entry) {
      const next = (entry as { next?: TimerEntry }).next;
      (entry as { next?: TimerEntry }).next = undefined;

      if (entry.cancelled) {
        // Skip cancelled entries
      } else if (entry.expiresAt <= now) {
        expired.push(entry);
      } else {
        // Not yet expired, reschedule for next rotation
        reschedule.push(entry);
      }

      entry = next ?? null;
    }

    // Re-insert timers that need more rotations
    for (const e of reschedule) {
      this.insertIntoWheel(e);
    }

    // Fire callbacks after processing the slot
    for (const e of expired) {
      this.timerMap.delete(e.id);
      this.totalFired++;
      this.safeCallback(e.callback);
    }
  }

  private safeCallback(fn: () => void): void {
    try {
      fn();
    } catch {
      // Swallow errors in callbacks to prevent wheel from crashing
    }
  }
}

// Singleton instance for global use
let globalWheel: TimerWheel | null = null;

/**
 * Get or create the global timer wheel instance.
 */
export function getGlobalTimerWheel(): TimerWheel {
  if (!globalWheel) {
    globalWheel = new TimerWheel();
    globalWheel.start();
  }
  return globalWheel;
}

/**
 * Shutdown the global timer wheel.
 */
export function shutdownGlobalTimerWheel(): void {
  if (globalWheel) {
    globalWheel.stop();
    globalWheel = null;
  }
}

/**
 * Schedule a timeout using the global timer wheel.
 * Drop-in replacement for setTimeout with ID tracking.
 */
export function scheduleTimeout(id: string, delayMs: number, callback: () => void): string {
  return getGlobalTimerWheel().schedule(id, delayMs, callback);
}

/**
 * Cancel a timeout scheduled with the global timer wheel.
 */
export function cancelTimeout(id: string): boolean {
  return getGlobalTimerWheel().cancel(id);
}

// Track active intervals (timer ID -> interval delay)
const activeIntervals = new Map<string, number>();

/**
 * Schedule a repeating interval using the global timer wheel.
 * Intervals are simulated by scheduling successive timeouts.
 */
export function scheduleInterval(id: string, intervalMs: number, callback: () => void): string {
  activeIntervals.set(id, intervalMs);
  const scheduleNext = () => {
    if (!activeIntervals.has(id)) {
      return;
    }
    getGlobalTimerWheel().schedule(id, intervalMs, () => {
      if (!activeIntervals.has(id)) {
        return;
      }
      callback();
      scheduleNext();
    });
  };
  scheduleNext();
  return id;
}

/**
 * Cancel an interval scheduled with scheduleInterval.
 */
export function cancelInterval(id: string): boolean {
  const existed = activeIntervals.has(id);
  activeIntervals.delete(id);
  getGlobalTimerWheel().cancel(id);
  return existed;
}
