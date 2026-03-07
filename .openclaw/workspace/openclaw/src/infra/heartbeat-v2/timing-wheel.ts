// Hierarchical Timing Wheel for Heartbeat Scheduling
// Based on Meta's FOQS architecture - efficiently handles millions of timers

/**
 * A hierarchical timing wheel provides O(1) operations for adding, removing,
 * and firing timers, making it ideal for high-throughput scheduling.
 *
 * This implementation uses a multi-level wheel:
 * - Level 0: Milliseconds (20 slots, 50ms each = 1 second resolution)
 * - Level 1: Seconds (60 slots, 1 second each = 1 minute resolution)
 * - Level 2: Minutes (60 slots, 1 minute each = 1 hour resolution)
 * - Level 3: Hours (24 slots, 1 hour each = 1 day resolution)
 *
 * For delays longer than a day, timers cascade down from higher levels.
 */

export interface TimerCallback {
  (): void | Promise<void>;
}

export interface TimerEntry {
  id: string;
  callback: TimerCallback;
  deadline: number;
  cancelled: boolean;
}

interface WheelSlot {
  timers: Map<string, TimerEntry>;
}

interface WheelLevel {
  slots: WheelSlot[];
  currentIndex: number;
  slotDuration: number; // ms per slot
  numSlots: number;
}

export class HierarchicalTimingWheel {
  private levels: WheelLevel[];
  private allTimers: Map<string, TimerEntry>;
  private lastTickMs: number;
  private readonly tickIntervalMs: number;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(tickIntervalMs: number = 50) {
    this.tickIntervalMs = tickIntervalMs;
    this.lastTickMs = Date.now();
    this.allTimers = new Map();

    // Initialize wheel levels
    // Level 0: 50ms slots, 20 slots = 1 second total
    // Level 1: 1 second slots, 60 slots = 1 minute total
    // Level 2: 1 minute slots, 60 slots = 1 hour total
    // Level 3: 1 hour slots, 24 slots = 1 day total
    this.levels = [
      this.createLevel(20, 50), // 0 - 1 second
      this.createLevel(60, 1000), // 1 second - 1 minute
      this.createLevel(60, 60000), // 1 minute - 1 hour
      this.createLevel(24, 3600000), // 1 hour - 24 hours
    ];
  }

  private createLevel(numSlots: number, slotDuration: number): WheelLevel {
    const slots: WheelSlot[] = [];
    for (let i = 0; i < numSlots; i++) {
      slots.push({ timers: new Map() });
    }
    return {
      slots,
      currentIndex: 0,
      slotDuration,
      numSlots,
    };
  }

  /**
   * Add a timer with the given delay in milliseconds
   */
  addTimer(id: string, delayMs: number, callback: TimerCallback): void {
    if (delayMs < 0) {
      delayMs = 0;
    }

    const deadline = Date.now() + delayMs;
    const entry: TimerEntry = {
      id,
      callback,
      deadline,
      cancelled: false,
    };

    // Remove existing timer with same id
    this.cancelTimer(id);

    this.allTimers.set(id, entry);
    this.insertIntoWheel(entry, delayMs);
  }

  private insertIntoWheel(entry: TimerEntry, delayMs: number): void {
    // Determine which level and slot
    let remainingMs = delayMs;
    let level: WheelLevel | null = null;

    for (let i = 0; i < this.levels.length; i++) {
      const lv = this.levels[i];
      const wheelDuration = lv.slotDuration * lv.numSlots;

      if (remainingMs < wheelDuration) {
        level = lv;
        const slotOffset = Math.floor(remainingMs / lv.slotDuration);
        const slotIndex = (lv.currentIndex + slotOffset) % lv.numSlots;
        lv.slots[slotIndex].timers.set(entry.id, entry);
        return;
      }

      remainingMs = remainingMs % wheelDuration;
    }

    // For delays longer than 24 hours, put in the last slot of last level
    // These will cascade down as time passes
    const lastLevel = this.levels[this.levels.length - 1];
    const lastSlot = (lastLevel.currentIndex + lastLevel.numSlots - 1) % lastLevel.numSlots;
    lastLevel.slots[lastSlot].timers.set(entry.id, entry);
  }

  /**
   * Cancel a timer by id
   */
  cancelTimer(id: string): boolean {
    const entry = this.allTimers.get(id);
    if (entry) {
      entry.cancelled = true;
      this.allTimers.delete(id);
      // Note: we don't remove from wheel slots, just mark as cancelled
      // The cancelled timers will be skipped during processing
      return true;
    }
    return false;
  }

  /**
   * Check if a timer exists
   */
  hasTimer(id: string): boolean {
    return this.allTimers.has(id);
  }

  /**
   * Get the number of active timers
   */
  getTimerCount(): number {
    return this.allTimers.size;
  }

  /**
   * Start the timing wheel
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickMs = Date.now();

    this.tickInterval = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);

    // Prevent the interval from keeping the process alive
    if (this.tickInterval.unref) {
      this.tickInterval.unref();
    }
  }

  /**
   * Stop the timing wheel
   */
  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Process one tick of the wheel
   */
  private tick(): void {
    const now = Date.now();
    const elapsed = now - this.lastTickMs;

    if (elapsed < this.tickIntervalMs) {
      return;
    }

    this.lastTickMs = now;

    // Process level 0 (millisecond level)
    this.processLevel(0, now);
  }

  private processLevel(levelIndex: number, now: number): void {
    const level = this.levels[levelIndex];

    // Process current slot
    const slot = level.slots[level.currentIndex];
    const timersToFire: TimerEntry[] = [];

    for (const entry of Array.from(slot.timers.values())) {
      if (entry.cancelled) {
        continue;
      }

      if (entry.deadline <= now) {
        timersToFire.push(entry);
        this.allTimers.delete(entry.id);
      } else {
        // Re-insert if not due yet (shouldn't happen often)
        slot.timers.delete(entry.id);
        const remainingMs = entry.deadline - now;
        this.insertIntoWheel(entry, remainingMs);
      }
    }

    slot.timers.clear();

    // Fire timers (async, non-blocking)
    for (const entry of timersToFire) {
      try {
        const result = entry.callback();
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`Timer callback error for ${entry.id}:`, err);
          });
        }
      } catch (err) {
        console.error(`Timer callback error for ${entry.id}:`, err);
      }
    }

    // Advance to next slot
    level.currentIndex = (level.currentIndex + 1) % level.numSlots;

    // If we've wrapped around, cascade timers from next level
    if (level.currentIndex === 0 && levelIndex < this.levels.length - 1) {
      this.cascadeFromLevel(levelIndex + 1, now);
    }
  }

  private cascadeFromLevel(levelIndex: number, now: number): void {
    const level = this.levels[levelIndex];
    const slot = level.slots[level.currentIndex];
    const timersToReinsert: TimerEntry[] = [];

    for (const entry of Array.from(slot.timers.values())) {
      if (entry.cancelled) {
        continue;
      }
      timersToReinsert.push(entry);
    }

    slot.timers.clear();

    // Re-insert into appropriate wheel level
    for (const entry of timersToReinsert) {
      const remainingMs = entry.deadline - now;
      if (remainingMs <= 0) {
        // Fire immediately
        try {
          const result = entry.callback();
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error(`Timer callback error for ${entry.id}:`, err);
            });
          }
        } catch (err) {
          console.error(`Timer callback error for ${entry.id}:`, err);
        }
        this.allTimers.delete(entry.id);
      } else {
        // Find correct level and slot
        this.insertIntoWheel(entry, remainingMs);
      }
    }

    // Advance to next slot
    level.currentIndex = (level.currentIndex + 1) % level.numSlots;

    // Cascade further if needed
    if (level.currentIndex === 0 && levelIndex < this.levels.length - 1) {
      this.cascadeFromLevel(levelIndex + 1, now);
    }
  }

  /**
   * Get next timer deadline (for scheduling purposes)
   */
  getNextDeadline(): number | null {
    if (this.allTimers.size === 0) return null;

    let earliest: number | null = null;
    for (const entry of Array.from(this.allTimers.values())) {
      if (earliest === null || entry.deadline < earliest) {
        earliest = entry.deadline;
      }
    }
    return earliest;
  }

  /**
   * Clear all timers
   */
  clear(): void {
    for (const level of this.levels) {
      for (const slot of level.slots) {
        slot.timers.clear();
      }
    }
    this.allTimers.clear();
  }
}

// Singleton timing wheel for heartbeat scheduling
let globalTimingWheel: HierarchicalTimingWheel | null = null;

export function getGlobalTimingWheel(): HierarchicalTimingWheel {
  if (!globalTimingWheel) {
    globalTimingWheel = new HierarchicalTimingWheel(50);
  }
  return globalTimingWheel;
}

export function scheduleTimer(id: string, delayMs: number, callback: TimerCallback): void {
  const wheel = getGlobalTimingWheel();
  wheel.start();
  wheel.addTimer(id, delayMs, callback);
}

export function cancelTimer(id: string): boolean {
  if (!globalTimingWheel) return false;
  return globalTimingWheel.cancelTimer(id);
}

export function shutdownTimingWheel(): void {
  if (globalTimingWheel) {
    globalTimingWheel.stop();
    globalTimingWheel.clear();
    globalTimingWheel = null;
  }
}
