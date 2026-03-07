// Tests for Heartbeat State Manager

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HeartbeatStateManager } from "./state-manager.js";
import { DEFAULT_SCHEDULER_CONFIG } from "./types.js";

describe("HeartbeatStateManager", () => {
  let manager: HeartbeatStateManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "heartbeat-test-"));
    manager = new HeartbeatStateManager(join(tempDir, "test.db"), DEFAULT_SCHEDULER_CONFIG);
    await manager.initialize();
  });

  afterEach(async () => {
    manager.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("schedule operations", () => {
    it("should create a schedule", () => {
      manager.createSchedule({
        id: "heartbeat-default",
        agentId: "default",
        intervalMs: 30000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });

      const schedule = manager.getSchedule("default");

      expect(schedule).not.toBeNull();
      expect(schedule?.id).toBe("heartbeat-default");
      expect(schedule?.agentId).toBe("default");
      expect(schedule?.intervalMs).toBe(30000);
      expect(schedule?.state).toBe("active");
    });

    it("should update schedule next run time", () => {
      manager.createSchedule({
        id: "test-schedule",
        agentId: "agent-1",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });

      const nextRunAt = Date.now() + 60000;
      manager.updateScheduleNextRun("test-schedule", nextRunAt);

      const schedule = manager.getSchedule("agent-1");
      expect(schedule?.nextRunAt).toBe(nextRunAt);
    });

    it("should set schedule state", () => {
      manager.createSchedule({
        id: "test-schedule",
        agentId: "agent-1",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });

      manager.setScheduleState("test-schedule", "paused");

      const schedule = manager.getSchedule("agent-1");
      expect(schedule?.state).toBe("paused");
    });

    it("should get due schedules", () => {
      manager.createSchedule({
        id: "due-schedule",
        agentId: "agent-due",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });

      // Set next run to now
      manager.updateScheduleNextRun("due-schedule", Date.now());

      // Create another schedule that's not due yet
      manager.createSchedule({
        id: "future-schedule",
        agentId: "agent-future",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });
      manager.updateScheduleNextRun("future-schedule", Date.now() + 3600000);

      const dueSchedules = manager.getDueSchedules(60000);

      expect(dueSchedules.length).toBe(1);
      expect(dueSchedules[0].agentId).toBe("agent-due");
    });
  });

  describe("state operations", () => {
    it("should return null for non-existent state", () => {
      const state = manager.getState("non-existent");
      expect(state).toBeNull();
    });

    it("should update and retrieve state", () => {
      const state = {
        agentId: "agent-1",
        lastRunAt: Date.now(),
        nextRunAt: Date.now() + 60000,
        lastResult: "ok" as const,
        consecutiveFailures: 0,
        totalRuns: 1,
        totalAlerts: 0,
      };

      manager.updateState(state);

      const retrieved = manager.getState("agent-1");

      expect(retrieved).toMatchObject(state);
    });

    it("should use cached state", () => {
      const state = {
        agentId: "agent-1",
        lastRunAt: Date.now(),
        nextRunAt: Date.now() + 60000,
        lastResult: "ok" as const,
        consecutiveFailures: 0,
        totalRuns: 1,
        totalAlerts: 0,
      };

      manager.updateState(state);

      // First retrieval should use cache
      const cached = manager.getState("agent-1");
      expect(cached).not.toBeNull();
    });

    it("should clear cache", () => {
      const state = {
        agentId: "agent-1",
        lastRunAt: Date.now(),
        nextRunAt: Date.now() + 60000,
        lastResult: "ok" as const,
        consecutiveFailures: 0,
        totalRuns: 1,
        totalAlerts: 0,
      };

      manager.updateState(state);
      manager.clearCache("agent-1");

      // Cache should be cleared
      const retrieved = manager.getState("agent-1");
      expect(retrieved).not.toBeNull();
    });
  });

  describe("run recording", () => {
    beforeEach(() => {
      manager.createSchedule({
        id: "test-schedule",
        agentId: "agent-1",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });
    });

    it("should record a heartbeat run", () => {
      const startedAt = Date.now();

      const runId = manager.recordRun({
        scheduleId: "test-schedule",
        agentId: "agent-1",
        status: "ok",
        startedAt,
        completedAt: startedAt + 150,
        durationMs: 150,
        message: "All good",
      });

      expect(runId).toMatch(/^test-schedule-/);

      const state = manager.getState("agent-1");
      expect(state).not.toBeNull();
      expect(state?.lastRunAt).toBe(startedAt);
      expect(state?.lastResult).toBe("ok");
      expect(state?.totalRuns).toBe(1);
    });

    it("should track consecutive failures", () => {
      // Record 3 failures
      for (let i = 0; i < 3; i++) {
        manager.recordRun({
          scheduleId: "test-schedule",
          agentId: "agent-1",
          status: "error",
          startedAt: Date.now(),
          completedAt: Date.now(),
          durationMs: 0,
          error: `Error ${i + 1}`,
        });
      }

      const state = manager.getState("agent-1");
      expect(state?.consecutiveFailures).toBe(3);
    });

    it("should reset consecutive failures on success", () => {
      // Record a failure
      manager.recordRun({
        scheduleId: "test-schedule",
        agentId: "agent-1",
        status: "error",
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        error: "Error",
      });

      // Then a success
      manager.recordRun({
        scheduleId: "test-schedule",
        agentId: "agent-1",
        status: "ok",
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
      });

      const state = manager.getState("agent-1");
      expect(state?.consecutiveFailures).toBe(0);
    });
  });

  describe("analytics", () => {
    beforeEach(() => {
      manager.createSchedule({
        id: "test-schedule",
        agentId: "agent-1",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });

      // Record some runs
      const statuses: Array<"ok" | "alert" | "skipped" | "error"> = [
        "ok",
        "ok",
        "alert",
        "skipped",
        "ok",
      ];

      for (const status of statuses) {
        manager.recordRun({
          scheduleId: "test-schedule",
          agentId: "agent-1",
          status,
          startedAt: Date.now(),
          completedAt: Date.now(),
          durationMs: 100,
        });
      }
    });

    it("should return analytics", () => {
      const analytics = manager.getAnalytics("agent-1", "24h");

      expect(analytics).not.toBeNull();
      expect(analytics?.agentId).toBe("agent-1");
      expect(analytics?.timeRange).toBe("24h");
      expect(analytics?.totalRuns).toBe(5);
      expect(analytics?.alertCount).toBe(1);
      expect(analytics?.okCount).toBe(3);
      expect(analytics?.skippedCount).toBe(1);
    });
  });

  describe("signals", () => {
    beforeEach(() => {
      manager.createSchedule({
        id: "test-schedule",
        agentId: "agent-1",
        intervalMs: 60000,
        visibility: { showOk: true, showAlerts: true, useIndicator: true },
      });
    });

    it("should add and retrieve signals", () => {
      manager.addSignal({
        scheduleId: "test-schedule",
        signal: "pause",
        reason: "maintenance",
      });

      const signals = manager.getPendingSignals("test-schedule");

      expect(signals.length).toBe(1);
      expect(signals[0].signal).toBe("pause");
      expect(signals[0].reason).toBe("maintenance");
    });

    it("should mark signals as processed", () => {
      manager.addSignal({
        scheduleId: "test-schedule",
        signal: "pause",
      });

      manager.markSignalsProcessed("test-schedule");

      const signals = manager.getPendingSignals("test-schedule");
      expect(signals.length).toBe(0);
    });
  });
});
