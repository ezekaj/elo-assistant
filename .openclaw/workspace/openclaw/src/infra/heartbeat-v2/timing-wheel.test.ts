// Tests for Hierarchical Timing Wheel

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HierarchicalTimingWheel } from "./timing-wheel.js";

describe("HierarchicalTimingWheel", () => {
  let wheel: HierarchicalTimingWheel;

  beforeEach(() => {
    wheel = new HierarchicalTimingWheel(10); // 10ms tick for faster tests
  });

  afterEach(() => {
    wheel.stop();
    wheel.clear();
  });

  it("should add and fire a timer", async () => {
    const callback = vi.fn();

    wheel.start();
    wheel.addTimer("test-1", 50, callback);

    // Wait for timer to fire
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should cancel a timer", async () => {
    const callback = vi.fn();

    wheel.start();
    wheel.addTimer("test-2", 50, callback);
    wheel.cancelTimer("test-2");

    // Wait for timer to potentially fire
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).not.toHaveBeenCalled();
  });

  it("should handle multiple timers", async () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const callback3 = vi.fn();

    wheel.start();
    wheel.addTimer("timer-1", 30, callback1);
    wheel.addTimer("timer-2", 60, callback2);
    wheel.addTimer("timer-3", 90, callback3);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
    expect(callback3).toHaveBeenCalledTimes(1);
  });

  it("should fire timers in order", async () => {
    const order: number[] = [];

    wheel.start();
    wheel.addTimer("timer-1", 60, () => order.push(3));
    wheel.addTimer("timer-2", 20, () => order.push(1));
    wheel.addTimer("timer-3", 40, () => order.push(2));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(order).toEqual([1, 2, 3]);
  });

  it("should replace timer with same id", async () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    wheel.start();
    wheel.addTimer("same-id", 50, callback1);
    wheel.addTimer("same-id", 100, callback2);

    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledTimes(1);
  });

  it("should handle async callbacks", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    wheel.start();
    wheel.addTimer("async-timer", 30, callback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should handle callback errors gracefully", async () => {
    const errorCallback = vi.fn().mockImplementation(() => {
      throw new Error("Callback error");
    });
    const normalCallback = vi.fn();

    wheel.start();
    wheel.addTimer("error-timer", 30, errorCallback);
    wheel.addTimer("normal-timer", 50, normalCallback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errorCallback).toHaveBeenCalledTimes(1);
    expect(normalCallback).toHaveBeenCalledTimes(1);
  });

  it("should handle timers with zero delay", async () => {
    const callback = vi.fn();

    wheel.start();
    wheel.addTimer("immediate", 0, callback);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should track timer count", () => {
    wheel.addTimer("timer-1", 100, () => {});
    wheel.addTimer("timer-2", 200, () => {});

    expect(wheel.getTimerCount()).toBe(2);

    wheel.cancelTimer("timer-1");

    expect(wheel.getTimerCount()).toBe(1);
  });

  it("should clear all timers", () => {
    wheel.addTimer("timer-1", 100, () => {});
    wheel.addTimer("timer-2", 200, () => {});

    expect(wheel.getTimerCount()).toBe(2);

    wheel.clear();

    expect(wheel.getTimerCount()).toBe(0);
  });

  it("should handle long delays (cascading between levels)", async () => {
    const callback = vi.fn();

    wheel.start();
    wheel.addTimer("long-timer", 5000, callback);

    // Wait just over 5 seconds
    await new Promise((resolve) => setTimeout(resolve, 5100));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should return next deadline", () => {
    const now = Date.now();

    wheel.addTimer("timer-1", 100, () => {});
    wheel.addTimer("timer-2", 50, () => {});

    const deadline = wheel.getNextDeadline();

    expect(deadline).toBeGreaterThanOrEqual(now + 50);
    expect(deadline).toBeLessThanOrEqual(now + 100);
  });
});
