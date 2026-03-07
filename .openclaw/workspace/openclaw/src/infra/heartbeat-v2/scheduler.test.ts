// Tests for Heartbeat Scheduler

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import { HeartbeatScheduler, type HeartbeatSchedulerOptions } from "./scheduler.js";
import { DEFAULT_SCHEDULER_CONFIG } from "./types.js";

describe("HeartbeatScheduler", () => {
  let scheduler: HeartbeatScheduler;
  let tempDir: string;
  let mockConfig: OpenClawConfig;
  let executionHandler: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "scheduler-test-"));

    mockConfig = {
      agents: {
        defaults: {
          heartbeat: {
            every: "5m",
          },
        },
      },
    } as unknown as OpenClawConfig;

    executionHandler = vi.fn().mockResolvedValue({
      status: "ok",
      durationMs: 100,
    });

    const options: HeartbeatSchedulerOptions = {
      config: mockConfig,
      dbPath: join(tempDir, "scheduler.db"),
      schedulerConfig: {
        scheduler: {
          ...DEFAULT_SCHEDULER_CONFIG.scheduler,
          imminentWindowMs: 5000, // 5 seconds for tests
        },
        queue: DEFAULT_SCHEDULER_CONFIG.queue,
      },
      onExecute: executionHandler,
    };

    scheduler = new HeartbeatScheduler(options);
    await scheduler.initialize();
  });

  afterEach(async () => {
    await scheduler.stop();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should initialize and start", async () => {
    await scheduler.start();

    const status = await scheduler.getStatus();
    expect(status.isRunning).toBe(true);
  });

  it("should register an agent", async () => {
    const scheduleId = await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 10000,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    expect(scheduleId).toBe("heartbeat-test-agent");
  });

  it("should execute heartbeat on schedule", async () => {
    await scheduler.start();

    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 100, // 100ms for quick test
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    // Wait for execution
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(executionHandler).toHaveBeenCalled();
    expect(executionHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "test-agent",
        reason: "initial",
      }),
    );
  });

  it("should trigger immediate heartbeat", async () => {
    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 60000,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    await scheduler.start();
    await scheduler.triggerNow("test-agent", "manual");

    // Wait a bit for async execution
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(executionHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "test-agent",
        reason: "manual",
      }),
    );
  });

  it("should pause and resume heartbeats", async () => {
    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 100,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    await scheduler.start();

    // Let one heartbeat run
    await new Promise((resolve) => setTimeout(resolve, 150));
    executionHandler.mockClear();

    // Pause
    await scheduler.pause("test-agent", "testing");

    // Wait for potential heartbeat
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should not have executed while paused
    expect(executionHandler).not.toHaveBeenCalled();

    // Resume
    await scheduler.resume("test-agent");

    // Wait for next heartbeat
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should have executed again
    expect(executionHandler).toHaveBeenCalled();
  });

  it("should unregister an agent", async () => {
    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 100,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    await scheduler.start();

    await scheduler.unregisterAgent("test-agent");

    // Wait for potential heartbeat
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should not have executed
    expect(executionHandler).not.toHaveBeenCalled();
  });

  it("should handle execution errors with retry", async () => {
    const error = new Error("Test error");
    let callCount = 0;

    executionHandler.mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw error;
      }
      return { status: "ok", durationMs: 100 };
    });

    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 60000,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    await scheduler.start();
    await scheduler.triggerNow("test-agent", "test");

    // Wait for retry
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have retried
    expect(callCount).toBeGreaterThan(1);
  });

  it("should return correct status", async () => {
    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 60000,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    await scheduler.start();

    const status = await scheduler.getStatus();

    expect(status.isRunning).toBe(true);
    expect(status.activeTimers).toBeGreaterThanOrEqual(0);
    expect(status.activeExecutions).toBe(0);
  });

  it("should get analytics", async () => {
    await scheduler.registerAgent({
      agentId: "test-agent",
      intervalMs: 100,
      visibility: { showOk: true, showAlerts: true, useIndicator: true },
    });

    await scheduler.start();

    // Wait for a few executions
    await new Promise((resolve) => setTimeout(resolve, 400));

    const analytics = await scheduler.getAnalytics("test-agent", "1h");

    expect(analytics).not.toBeNull();
    expect(analytics?.agentId).toBe("test-agent");
    expect(analytics?.timeRange).toBe("1h");
  });
});
