/**
 * Advanced Tool Analytics OLAP Tests
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ToolAnalyticsOLAP, trackToolExecution, type FeedbackLoop } from "./tool-analytics-olap.js";

describe("ToolAnalyticsOLAP", () => {
  let db: DatabaseSync;
  let analytics: ToolAnalyticsOLAP;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tool-analytics-olap-test-"));
    const dbPath = join(tempDir, "test.db");
    db = new DatabaseSync(dbPath);
    analytics = new ToolAnalyticsOLAP(db, {
      enabled: true,
      aggregationIntervalMs: 1000, // Fast for tests
    });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("Schema Initialization", () => {
    it("should create all required tables", () => {
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tool_analytics%'`,
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("tool_analytics_facts");
      expect(tableNames).toContain("tool_analytics_buckets");
      expect(tableNames).toContain("tool_analytics_feedback");
      expect(tableNames).toContain("tool_analytics_health_scores");
    });

    it("should create required indexes", () => {
      const indexes = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`)
        .all() as Array<{ name: string }>;

      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describe("Tracking", () => {
    it("should track basic tool execution", () => {
      analytics.track({
        tool: "test_tool",
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      });

      const result = db
        .prepare(`SELECT * FROM tool_analytics_facts WHERE tool = 'test_tool'`)
        .get() as { tool: string; success: number; duration_ms: number };

      expect(result).toBeDefined();
      expect(result.tool).toBe("test_tool");
      expect(result.success).toBe(1);
      expect(result.duration_ms).toBe(100);
    });

    it("should track with all optional fields", () => {
      const timestamp = Date.now();
      analytics.track({
        tool: "full_tool",
        skill: "test_skill",
        success: false,
        durationMs: 500,
        error: "Something went wrong",
        errorType: "TestError",
        paramsHash: "abc123",
        timestamp,
        sessionId: "session-123",
        agentId: "agent-456",
        metadata: { key: "value" },
      });

      const result = db
        .prepare(`SELECT * FROM tool_analytics_facts WHERE tool = 'full_tool'`)
        .get() as Record<string, unknown>;

      expect(result.tool).toBe("full_tool");
      expect(result.skill).toBe("test_skill");
      expect(result.success).toBe(0);
      expect(result.error).toBe("Something went wrong");
      expect(result.error_type).toBe("TestError");
      expect(result.params_hash).toBe("abc123");
      expect(result.session_id).toBe("session-123");
      expect(result.agent_id).toBe("agent-456");
      expect(result.metadata).toBe('{"key":"value"}');
    });

    it("should auto-classify error types", () => {
      const testCases = [
        { error: "Request timeout", expectedType: "timeout" },
        { error: "Permission denied", expectedType: "permission" },
        { error: "User not found", expectedType: "not_found" },
        { error: "Rate limit exceeded (429)", expectedType: "rate_limit" },
        { error: "Network connection failed", expectedType: "network" },
        { error: "Invalid input validation", expectedType: "validation" },
        { error: "Random error", expectedType: "unknown" },
      ];

      for (const tc of testCases) {
        analytics.track({
          tool: `tool_${tc.expectedType}`,
          success: false,
          durationMs: 100,
          error: tc.error,
          timestamp: Date.now(),
        });
      }

      for (const tc of testCases) {
        const result = db
          .prepare(`SELECT error_type FROM tool_analytics_facts WHERE tool = ?`)
          .get(`tool_${tc.expectedType}`) as { error_type: string };

        expect(result.error_type).toBe(tc.expectedType);
      }
    });

    it("should compute partition key for time-based partitioning", () => {
      const analyticsPartitioned = new ToolAnalyticsOLAP(db, {
        enabled: true,
        partitionConfig: {
          enabled: true,
          partitionBy: "time",
          partitionInterval: "day",
        },
      });

      const timestamp = Date.now();
      analyticsPartitioned.track({
        tool: "partitioned_tool",
        success: true,
        durationMs: 100,
        timestamp,
      });

      const result = db
        .prepare(`SELECT partition_key FROM tool_analytics_facts WHERE tool = 'partitioned_tool'`)
        .get() as { partition_key: string };

      // Should be start of day in ms
      const dayStart = new Date(new Date(timestamp).setHours(0, 0, 0, 0)).getTime();
      expect(result.partition_key).toBe(dayStart.toString());
    });
  });

  describe("Aggregation", () => {
    it("should aggregate data into time buckets on force", () => {
      const now = Date.now();

      // Add multiple records
      for (let i = 0; i < 10; i++) {
        analytics.track({
          tool: "aggregate_tool",
          skill: "test_skill",
          success: i % 3 !== 0, // 2/3 success rate
          durationMs: 100 + i * 10,
          timestamp: now - i * 1000,
          sessionId: `session-${i % 3}`,
        });
      }

      // Force aggregation
      analytics.forceAggregation();

      // Check buckets were created
      const buckets = db
        .prepare(`SELECT * FROM tool_analytics_buckets WHERE tool = 'aggregate_tool'`)
        .all() as Array<Record<string, unknown>>;

      expect(buckets.length).toBeGreaterThan(0);

      const bucket = buckets[0];
      expect(bucket.calls).toBeGreaterThan(0);
      expect(bucket.successes).toBeDefined();
      expect(bucket.failures).toBeDefined();
    });

    it("should calculate percentiles in buckets", () => {
      // Use a fixed timestamp in the middle of a minute to avoid boundary issues
      const baseTime = Math.floor(Date.now() / 60000) * 60000 + 30000; // 30 seconds into minute

      // Add records with varying durations (all within same minute bucket)
      const durations = [100, 150, 200, 250, 300, 400, 500, 800, 1200, 2000];
      for (let i = 0; i < durations.length; i++) {
        analytics.track({
          tool: "percentile_tool",
          success: true,
          durationMs: durations[i],
          timestamp: baseTime - i * 1000, // Spread over 10 seconds, all in same minute
        });
      }

      analytics.forceAggregation();

      const bucket = db
        .prepare(
          `SELECT durations_json FROM tool_analytics_buckets WHERE tool = 'percentile_tool' AND bucket_type = 'minute'`,
        )
        .get() as { durations_json: string };

      const storedDurations = JSON.parse(bucket.durations_json) as number[];
      expect(storedDurations).toHaveLength(10);
      // Verify durations are sorted ascending
      const sortedDurations = [...storedDurations].sort((a, b) => a - b);
      expect(storedDurations).toEqual(sortedDurations);
    });
  });

  describe("Insights", () => {
    beforeEach(() => {
      // Seed data for insights testing
      const now = Date.now();

      for (let i = 0; i < 50; i++) {
        analytics.track({
          tool: `tool_${i % 5}`,
          skill: i % 2 === 0 ? "skill_a" : "skill_b",
          success: i % 4 !== 0, // 75% success rate
          durationMs: 100 + (i % 10) * 100,
          error: i % 4 === 0 ? "Test error" : undefined,
          timestamp: now - i * 60 * 60 * 1000, // Hourly
        });
      }

      analytics.forceAggregation();
    });

    it("should return comprehensive insights", () => {
      const insights = analytics.getInsights();

      expect(insights.summary.totalCalls).toBeGreaterThan(0);
      expect(insights.summary.uniqueTools).toBe(5);
      expect(insights.topTools.length).toBeGreaterThan(0);
      expect(insights.summary.overallSuccessRate).toBeCloseTo(0.75, 1);
    });

    it("should identify top tools by call count", () => {
      const insights = analytics.getInsights();

      expect(insights.topTools[0].calls).toBeGreaterThanOrEqual(insights.topTools[1]?.calls ?? 0);
      expect(insights.topTools[0].successRate).toBeDefined();
      expect(insights.topTools[0].avgDuration).toBeDefined();
      expect(insights.topTools[0].trend).toBeDefined();
    });

    it("should identify failing tools", () => {
      const insights = analytics.getInsights();

      // Should have some failing tools with our 75% success rate
      if (insights.failingTools.length > 0) {
        expect(insights.failingTools[0].errorRate).toBeGreaterThan(0.1);
        expect(insights.failingTools[0].commonError).toBeDefined();
      }
    });

    it("should respect time range filters", () => {
      const now = Date.now();
      const hourAgo = now - 60 * 60 * 1000;

      const insights = analytics.getInsights({
        start: hourAgo,
        end: now,
      });

      // Should only include recent data
      expect(insights.summary.totalCalls).toBeLessThan(50);
    });

    it("should calculate trends", () => {
      const insights = analytics.getInsights();

      expect(insights.trends).toBeDefined();
      expect(insights.trends.successRateTrend).toBeGreaterThanOrEqual(-1);
      expect(insights.trends.successRateTrend).toBeLessThanOrEqual(1);
      expect(insights.trends.volumeTrend).toBeGreaterThanOrEqual(-1);
      expect(insights.trends.volumeTrend).toBeLessThanOrEqual(1);
      expect(insights.trends.performanceTrend).toBeGreaterThanOrEqual(-1);
      expect(insights.trends.performanceTrend).toBeLessThanOrEqual(1);
    });
  });

  describe("Slow Tools Detection", () => {
    it("should identify slow tools with percentiles", () => {
      const now = Date.now();

      // Add many records for statistical significance
      for (let i = 0; i < 100; i++) {
        analytics.track({
          tool: "slow_tool",
          success: true,
          durationMs: 5000 + Math.random() * 1000,
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const insights = analytics.getInsights();
      const slowTool = insights.slowTools.find((t) => t.tool === "slow_tool");

      expect(slowTool).toBeDefined();
      expect(slowTool!.avgDuration).toBeGreaterThan(4500);
      expect(slowTool!.p95Duration).toBeGreaterThan(slowTool!.avgDuration);
    });

    it("should count outliers correctly", () => {
      const now = Date.now();

      // Normal durations
      for (let i = 0; i < 50; i++) {
        analytics.track({
          tool: "outlier_tool",
          success: true,
          durationMs: 100 + Math.random() * 50,
          timestamp: now - i * 1000,
        });
      }

      // Add some extreme outliers
      for (let i = 0; i < 5; i++) {
        analytics.track({
          tool: "outlier_tool",
          success: true,
          durationMs: 5000,
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const insights = analytics.getInsights();
      const tool = insights.slowTools.find((t) => t.tool === "outlier_tool");

      expect(tool).toBeDefined();
      expect(tool!.outlierCount).toBeGreaterThan(0);
    });
  });

  describe("Feedback Loops", () => {
    it("should emit feedback for low success rate", () => {
      const feedbackReceived: FeedbackLoop[] = [];
      analytics.registerFeedbackCallback((fb) => feedbackReceived.push(fb));

      // Add failing calls
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        analytics.track({
          tool: "unreliable_tool",
          success: i < 12 ? false : true, // 40% success rate (< 50% triggers critical)
          durationMs: 100,
          error: i < 12 ? "Failed" : undefined,
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const reliabilityFeedback = feedbackReceived.find(
        (fb) => fb.type === "reliability" && fb.tool === "unreliable_tool",
      );

      expect(reliabilityFeedback).toBeDefined();
      expect(reliabilityFeedback!.severity).toBe("critical");
      expect(reliabilityFeedback!.recommendation).toBeDefined();
    });

    it("should emit feedback for slow tools", () => {
      const feedbackReceived: FeedbackLoop[] = [];
      analytics.registerFeedbackCallback((fb) => feedbackReceived.push(fb));

      const now = Date.now();
      for (let i = 0; i < 30; i++) {
        analytics.track({
          tool: "very_slow_tool",
          success: true,
          durationMs: 35000 + i * 100, // Use durations > 30000ms to trigger "critical" severity
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const perfFeedback = feedbackReceived.find(
        (fb) => fb.type === "performance" && fb.tool === "very_slow_tool",
      );

      expect(perfFeedback).toBeDefined();
      expect(perfFeedback!.severity).toBe("critical");
      expect(perfFeedback!.metrics.avgDuration).toBeGreaterThan(30000);
    });

    it("should store feedback in database", () => {
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        analytics.track({
          tool: "feedback_test_tool",
          success: false,
          durationMs: 100,
          error: "Error",
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const feedback = analytics.getFeedbackHistory(10);
      expect(feedback.length).toBeGreaterThan(0);
    });

    it("should acknowledge feedback", () => {
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        analytics.track({
          tool: "ack_tool",
          success: false,
          durationMs: 100,
          error: "Error",
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const unackBefore = analytics.getFeedbackHistory(100, true);
      if (unackBefore.length > 0) {
        const firstId = (
          db.prepare(`SELECT id FROM tool_analytics_feedback LIMIT 1`).get() as { id: number }
        )?.id;

        if (firstId) {
          analytics.acknowledgeFeedback(firstId);

          const unackAfter = analytics.getFeedbackHistory(100, true);
          expect(unackAfter.length).toBe(unackBefore.length - 1);
        }
      }
    });
  });

  describe("Health Scores", () => {
    it("should compute health scores for tools", () => {
      const now = Date.now();

      // Good tool
      for (let i = 0; i < 100; i++) {
        analytics.track({
          tool: "healthy_tool",
          success: true,
          durationMs: 50,
          timestamp: now - i * 1000,
        });
      }

      // Problematic tool
      for (let i = 0; i < 50; i++) {
        analytics.track({
          tool: "unhealthy_tool",
          success: i % 2 === 0,
          durationMs: 5000,
          error: i % 2 === 0 ? "Error" : undefined,
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const scores = analytics.getHealthScores();
      const healthyScore = scores.find((s) => s.tool === "healthy_tool");
      const unhealthyScore = scores.find((s) => s.tool === "unhealthy_tool");

      expect(healthyScore).toBeDefined();
      expect(unhealthyScore).toBeDefined();
      expect(healthyScore!.healthScore).toBeGreaterThan(unhealthyScore!.healthScore);
      expect(healthyScore!.reliabilityScore).toBe(1);
      expect(unhealthyScore!.reliabilityScore).toBeLessThan(1);
    });
  });

  describe("Utility Methods", () => {
    it("should hash params consistently", () => {
      const params = { foo: "bar", num: 123 };
      const hash1 = analytics.hashParams(params);
      const hash2 = analytics.hashParams(params);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it("should return undefined for null/undefined params", () => {
      expect(analytics.hashParams(null)).toBeUndefined();
      expect(analytics.hashParams(undefined)).toBeUndefined();
      expect(analytics.hashParams("")).toBeUndefined();
    });

    it("should get success rate for tool", () => {
      const now = Date.now();

      for (let i = 0; i < 10; i++) {
        analytics.track({
          tool: "rate_tool",
          success: i < 7,
          durationMs: 100,
          timestamp: now - i * 1000,
        });
      }

      analytics.forceAggregation();

      const rate = analytics.getSuccessRate("rate_tool", 1);
      expect(rate).toBeCloseTo(0.7, 1);
    });

    it("should get recent errors", () => {
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        analytics.track({
          tool: "error_tool",
          success: false,
          durationMs: 100,
          error: `Error ${i}`,
          timestamp: now - i * 1000,
        });
      }

      const errors = analytics.getRecentErrors("error_tool", 3);

      expect(errors).toHaveLength(3);
      expect(errors[0].error).toBe("Error 0"); // Most recent first
    });
  });

  describe("Data Cleanup", () => {
    it("should clear old data from both tables", () => {
      const now = Date.now();
      const oldTime = now - 100 * 24 * 60 * 60 * 1000; // 100 days ago

      // Old data
      analytics.track({
        tool: "old_tool",
        success: true,
        durationMs: 100,
        timestamp: oldTime,
      });

      // New data
      analytics.track({
        tool: "new_tool",
        success: true,
        durationMs: 100,
        timestamp: now,
      });

      analytics.forceAggregation();

      const cleared = analytics.clearOldData(90);

      expect(cleared.facts).toBeGreaterThanOrEqual(1);

      const remaining = db.prepare(`SELECT COUNT(*) as count FROM tool_analytics_facts`).get() as {
        count: number;
      };

      expect(remaining.count).toBe(1);
    });
  });

  describe("Disabled Mode", () => {
    it("should not track when disabled", () => {
      const disabledAnalytics = new ToolAnalyticsOLAP(db, { enabled: false });

      disabledAnalytics.track({
        tool: "disabled_tool",
        success: true,
        durationMs: 100,
        timestamp: Date.now(),
      });

      const result = db
        .prepare(`SELECT COUNT(*) as count FROM tool_analytics_facts WHERE tool = 'disabled_tool'`)
        .get() as { count: number };

      expect(result.count).toBe(0);
    });
  });
});

describe("trackToolExecution", () => {
  let db: DatabaseSync;
  let analytics: ToolAnalyticsOLAP;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tool-exec-olap-test-"));
    const dbPath = join(tempDir, "test.db");
    db = new DatabaseSync(dbPath);
    analytics = new ToolAnalyticsOLAP(db, { enabled: true });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should track successful async execution", async () => {
    const result = await trackToolExecution(
      analytics,
      "async_tool",
      "test_skill",
      { input: "data" },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "success";
      },
      { sessionId: "test-session" },
    );

    expect(result).toBe("success");

    const record = db
      .prepare(`SELECT * FROM tool_analytics_facts WHERE tool = 'async_tool'`)
      .get() as Record<string, unknown>;

    expect(record.success).toBe(1);
    expect(record.session_id).toBe("test-session");
    expect(record.duration_ms).toBeGreaterThanOrEqual(10);
  });

  it("should track failed async execution", async () => {
    await expect(
      trackToolExecution(analytics, "failing_async_tool", "test_skill", {}, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("Async failure");
      }),
    ).rejects.toThrow("Async failure");

    const record = db
      .prepare(`SELECT * FROM tool_analytics_facts WHERE tool = 'failing_async_tool'`)
      .get() as Record<string, unknown>;

    expect(record.success).toBe(0);
    expect(record.error).toBe("Async failure");
    expect(record.error_type).toBe("Error");
  });

  it("should work without analytics", async () => {
    const result = await trackToolExecution(
      null,
      "no_analytics_tool",
      "skill",
      {},
      async () => "ok",
    );

    expect(result).toBe("ok");

    const count = db.prepare(`SELECT COUNT(*) as count FROM tool_analytics_facts`).get() as {
      count: number;
    };

    expect(count.count).toBe(0);
  });
});
