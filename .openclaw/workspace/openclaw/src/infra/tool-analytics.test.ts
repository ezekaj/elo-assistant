/**
 * Tool Analytics Tests
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach } from "vitest";
import { ToolAnalyticsManager, trackToolExecution } from "./tool-analytics.js";

describe("ToolAnalyticsManager", () => {
  let db: DatabaseSync;
  let analytics: ToolAnalyticsManager;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tool-analytics-test-"));
    const dbPath = join(tempDir, "test.db");
    db = new DatabaseSync(dbPath);
    analytics = new ToolAnalyticsManager(db, true);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("track", () => {
    it("should track successful tool execution", () => {
      analytics.track({
        tool: "test_tool",
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      });

      const insights = analytics.getInsights();
      expect(insights.summary.totalCalls).toBe(1);
      expect(insights.summary.overallSuccessRate).toBe(1);
      expect(insights.topTools).toHaveLength(1);
      expect(insights.topTools[0].tool).toBe("test_tool");
    });

    it("should track failed tool execution", () => {
      analytics.track({
        tool: "test_tool",
        success: false,
        durationMs: 100,
        error: "Test error",
        timestamp: Date.now(),
      });

      const insights = analytics.getInsights();
      expect(insights.summary.totalCalls).toBe(1);
      expect(insights.summary.overallSuccessRate).toBe(0);
      expect(insights.failingTools).toHaveLength(1);
      expect(insights.failingTools[0].commonError).toBe("Test error");
    });

    it("should track with skill name", () => {
      analytics.track({
        tool: "test_tool",
        skill: "test_skill",
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      });

      const insights = analytics.getInsights();
      expect(insights.topTools[0].tool).toBe("test_tool");
    });

    it("should track with params hash", () => {
      const params = { foo: "bar" };
      const paramsHash = analytics.hashParams(params);

      analytics.track({
        tool: "test_tool",
        success: true,
        durationMs: 100,
        paramsHash,
        timestamp: Date.now(),
      });

      const insights = analytics.getInsights();
      expect(insights.summary.totalCalls).toBe(1);
    });
  });

  describe("getSuccessRate", () => {
    it("should return 1 for no data", () => {
      const rate = analytics.getSuccessRate("nonexistent");
      expect(rate).toBe(1);
    });

    it("should calculate success rate correctly", () => {
      const now = Date.now();

      // Track 3 successes and 1 failure
      for (let i = 0; i < 3; i++) {
        analytics.track({
          tool: "test_tool",
          success: true,
          durationMs: 100,
          timestamp: now - i * 1000,
        });
      }

      analytics.track({
        tool: "test_tool",
        success: false,
        durationMs: 100,
        timestamp: now - 4000,
      });

      const rate = analytics.getSuccessRate("test_tool");
      expect(rate).toBe(0.75);
    });
  });

  describe("getInsights", () => {
    it("should return comprehensive insights", () => {
      const now = Date.now();

      // Add multiple tool calls
      analytics.track({ tool: "tool1", success: true, durationMs: 100, timestamp: now });
      analytics.track({ tool: "tool1", success: true, durationMs: 150, timestamp: now - 1000 });
      analytics.track({ tool: "tool2", success: false, durationMs: 5000, timestamp: now - 2000 });
      analytics.track({ tool: "tool2", success: true, durationMs: 3000, timestamp: now - 3000 });

      const insights = analytics.getInsights();

      expect(insights.summary.totalCalls).toBe(4);
      expect(insights.summary.uniqueTools).toBe(2);
      expect(insights.topTools).toHaveLength(2);
      expect(insights.slowTools).toHaveLength(2);
    });

    it("should respect time range", () => {
      const now = Date.now();

      analytics.track({
        tool: "old_tool",
        success: true,
        durationMs: 100,
        timestamp: now - 8 * 24 * 60 * 60 * 1000, // 8 days ago
      });

      analytics.track({
        tool: "new_tool",
        success: true,
        durationMs: 100,
        timestamp: now,
      });

      // Default: last 7 days
      const defaultInsights = analytics.getInsights();
      expect(defaultInsights.summary.totalCalls).toBe(1);

      // Custom range: last 10 days
      const customInsights = analytics.getInsights({
        start: now - 10 * 24 * 60 * 60 * 1000,
      });
      expect(customInsights.summary.totalCalls).toBe(2);
    });
  });

  describe("getRecentErrors", () => {
    it("should return recent errors for a tool", () => {
      const now = Date.now();

      analytics.track({
        tool: "test_tool",
        success: false,
        durationMs: 100,
        error: "Error 1",
        timestamp: now,
      });

      analytics.track({
        tool: "test_tool",
        success: false,
        durationMs: 100,
        error: "Error 2",
        timestamp: now - 1000,
      });

      const errors = analytics.getRecentErrors("test_tool", 10);
      expect(errors).toHaveLength(2);
      expect(errors[0].error).toBe("Error 1"); // Most recent first
    });
  });

  describe("clearOldData", () => {
    it("should clear old data", () => {
      const now = Date.now();

      // Old data
      analytics.track({
        tool: "old_tool",
        success: true,
        durationMs: 100,
        timestamp: now - 100 * 24 * 60 * 60 * 1000, // 100 days ago
      });

      // Recent data
      analytics.track({
        tool: "new_tool",
        success: true,
        durationMs: 100,
        timestamp: now,
      });

      const cleared = analytics.clearOldData(90);
      expect(cleared).toBe(1);

      const insights = analytics.getInsights();
      expect(insights.summary.totalCalls).toBe(1);
      expect(insights.topTools[0].tool).toBe("new_tool");
    });
  });

  describe("hashParams", () => {
    it("should hash parameters consistently", () => {
      const params = { foo: "bar", baz: 123 };
      const hash1 = analytics.hashParams(params);
      const hash2 = analytics.hashParams(params);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16); // We truncate to 16 chars
    });

    it("should return undefined for empty params", () => {
      expect(analytics.hashParams(null)).toBeUndefined();
      expect(analytics.hashParams(undefined)).toBeUndefined();
      expect(analytics.hashParams("")).toBeUndefined();
    });
  });

  describe("disabled mode", () => {
    it("should not track when disabled", () => {
      const disabledAnalytics = new ToolAnalyticsManager(db, false);

      disabledAnalytics.track({
        tool: "test_tool",
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      });

      const insights = disabledAnalytics.getInsights();
      expect(insights.summary.totalCalls).toBe(0);
    });
  });
});

describe("trackToolExecution", () => {
  let db: DatabaseSync;
  let analytics: ToolAnalyticsManager;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tool-exec-test-"));
    const dbPath = join(tempDir, "test.db");
    db = new DatabaseSync(dbPath);
    analytics = new ToolAnalyticsManager(db, true);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should track successful execution", async () => {
    const result = await trackToolExecution(
      analytics,
      "test_tool",
      "test_skill",
      { foo: "bar" },
      async () => "success",
    );

    expect(result).toBe("success");

    const insights = analytics.getInsights();
    expect(insights.summary.totalCalls).toBe(1);
    expect(insights.summary.overallSuccessRate).toBe(1);
  });

  it("should track failed execution", async () => {
    await expect(
      trackToolExecution(analytics, "test_tool", "test_skill", { foo: "bar" }, async () => {
        throw new Error("Test error");
      }),
    ).rejects.toThrow("Test error");

    const insights = analytics.getInsights();
    expect(insights.summary.totalCalls).toBe(1);
    expect(insights.summary.overallSuccessRate).toBe(0);
    expect(insights.failingTools[0].commonError).toBe("Test error");
  });

  it("should work without analytics", async () => {
    const result = await trackToolExecution(
      null,
      "test_tool",
      "test_skill",
      {},
      async () => "success",
    );

    expect(result).toBe("success");
  });
});

// Import afterEach for cleanup
import { afterEach } from "vitest";
