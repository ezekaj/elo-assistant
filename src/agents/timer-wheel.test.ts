import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TimerWheel,
  getGlobalTimerWheel,
  shutdownGlobalTimerWheel,
  scheduleTimeout,
  cancelTimeout,
} from "./timer-wheel.js";

describe("TimerWheel", () => {
  let wheel: TimerWheel;

  beforeEach(() => {
    wheel = new TimerWheel({ tickIntervalMs: 10 });
    wheel.start();
  });

  afterEach(() => {
    wheel.stop();
  });

  describe("basic scheduling", () => {
    it("should schedule and fire a timer", async () => {
      const callback = vi.fn();
      wheel.schedule("test-1", 50, callback);

      expect(callback).not.toHaveBeenCalled();
      await sleep(100);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should not fire cancelled timers", async () => {
      const callback = vi.fn();
      wheel.schedule("test-2", 50, callback);
      wheel.cancel("test-2");

      await sleep(100);
      expect(callback).not.toHaveBeenCalled();
    });

    it("should track timer existence", () => {
      wheel.schedule("test-3", 1000, () => {});
      expect(wheel.has("test-3")).toBe(true);
      expect(wheel.has("nonexistent")).toBe(false);
    });

    it("should replace existing timer with same ID", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      wheel.schedule("test-4", 100, callback1);
      wheel.schedule("test-4", 50, callback2);

      await sleep(80);
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("multiple timers", () => {
    it("should handle multiple concurrent timers", async () => {
      const callbacks = [vi.fn(), vi.fn(), vi.fn()];

      wheel.schedule("multi-1", 30, callbacks[0]!);
      wheel.schedule("multi-2", 60, callbacks[1]!);
      wheel.schedule("multi-3", 90, callbacks[2]!);

      await sleep(50);
      expect(callbacks[0]).toHaveBeenCalledTimes(1);
      expect(callbacks[1]).not.toHaveBeenCalled();
      expect(callbacks[2]).not.toHaveBeenCalled();

      await sleep(50);
      expect(callbacks[1]).toHaveBeenCalledTimes(1);
      expect(callbacks[2]).not.toHaveBeenCalled();

      await sleep(50);
      expect(callbacks[2]).toHaveBeenCalledTimes(1);
    });
  });

  describe("stats", () => {
    it("should track statistics", async () => {
      wheel.schedule("stats-1", 20, () => {});
      wheel.schedule("stats-2", 20, () => {});
      wheel.cancel("stats-2");

      const stats = wheel.stats();
      expect(stats.totalScheduled).toBe(2);
      expect(stats.totalCancelled).toBe(1);
      expect(stats.activeTimers).toBe(1);

      await sleep(50);

      const finalStats = wheel.stats();
      expect(finalStats.totalFired).toBe(1);
      expect(finalStats.activeTimers).toBe(0);
    });
  });

  describe("remaining time", () => {
    it("should return remaining time for active timers", () => {
      wheel.schedule("remain-1", 1000, () => {});

      const remaining = wheel.remaining("remain-1");
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(1000);
    });

    it("should return -1 for nonexistent timers", () => {
      expect(wheel.remaining("nonexistent")).toBe(-1);
    });
  });

  describe("flush", () => {
    it("should immediately fire all expired timers", () => {
      const callback = vi.fn();
      wheel.schedule("flush-1", 0, callback);

      wheel.flush();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should not crash on callback errors", async () => {
      const errorCallback = () => {
        throw new Error("Test error");
      };
      const successCallback = vi.fn();

      wheel.schedule("error-1", 10, errorCallback);
      wheel.schedule("error-2", 20, successCallback);

      await sleep(50);
      expect(successCallback).toHaveBeenCalledTimes(1);
    });
  });
});

describe("global timer wheel", () => {
  afterEach(() => {
    shutdownGlobalTimerWheel();
  });

  it("should provide singleton instance", () => {
    const wheel1 = getGlobalTimerWheel();
    const wheel2 = getGlobalTimerWheel();
    expect(wheel1).toBe(wheel2);
  });

  it("should schedule via convenience functions", async () => {
    const callback = vi.fn();
    scheduleTimeout("global-1", 30, callback);

    await sleep(100);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should cancel via convenience functions", async () => {
    const callback = vi.fn();
    scheduleTimeout("global-2", 50, callback);
    cancelTimeout("global-2");

    await sleep(100);
    expect(callback).not.toHaveBeenCalled();
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
