/**
 * Advanced Tool Analytics with OLAP Features
 * - Real-time OLAP storage with time-bucketed aggregations
 * - Materialized views for fast queries
 * - Cost-efficient architecture with lazy evaluation
 * - Self-improving feedback loops
 * - Foundation for distributed OLAP
 */

import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tool-analytics-olap");

// ============================================================================
// Types
// ============================================================================

export type ToolExecutionRecord = {
  tool: string;
  skill?: string;
  success: boolean;
  durationMs: number;
  error?: string;
  errorType?: string;
  paramsHash?: string;
  timestamp: number;
  sessionId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
};

export type TimeBucket = "minute" | "hour" | "day" | "week" | "month";

export type AggregatedMetrics = {
  tool: string;
  bucket: TimeBucket;
  bucketStart: number;
  calls: number;
  successes: number;
  failures: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  uniqueSessions: number;
  errorTypes: Record<string, number>;
};

export type MaterializedView = {
  name: string;
  query: string;
  refreshIntervalMs: number;
  lastRefresh: number;
  stale: boolean;
};

export type ToolInsights = {
  topTools: Array<{
    tool: string;
    calls: number;
    successRate: number;
    avgDuration: number;
    trend: "up" | "down" | "stable";
  }>;
  failingTools: Array<{
    tool: string;
    errorRate: number;
    commonError: string;
    occurrences: number;
    firstSeen: number;
    lastSeen: number;
  }>;
  slowTools: Array<{
    tool: string;
    avgDuration: number;
    p95Duration: number;
    calls: number;
    outlierCount: number;
  }>;
  summary: {
    totalCalls: number;
    overallSuccessRate: number;
    averageDuration: number;
    uniqueTools: number;
    callsPerHour: number;
  };
  trends: {
    successRateTrend: number; // -1 to 1
    volumeTrend: number; // -1 to 1
    performanceTrend: number; // -1 to 1 (positive = faster)
  };
};

export type FeedbackLoop = {
  type: "performance" | "reliability" | "usage" | "cost";
  severity: "info" | "warning" | "critical";
  tool: string;
  message: string;
  recommendation: string;
  metrics: Record<string, number>;
  timestamp: number;
};

export type TimeRange = {
  start?: number;
  end?: number;
  bucket?: TimeBucket;
};

export type PartitionConfig = {
  enabled: boolean;
  partitionBy: "time" | "tool" | "session";
  partitionInterval?: TimeBucket;
};

// ============================================================================
// Time Utilities
// ============================================================================

function getBucketStart(timestamp: number, bucket: TimeBucket): number {
  const date = new Date(timestamp);

  switch (bucket) {
    case "minute":
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
      ).getTime();
    case "hour":
      return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
      ).getTime();
    case "day":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    case "week":
      const dayOfWeek = date.getDay();
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOfWeek).getTime();
    case "month":
      return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    default:
      return timestamp;
  }
}

function getBucketDuration(bucket: TimeBucket): number {
  const durations: Record<TimeBucket, number> = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };
  return durations[bucket];
}

// ============================================================================
// Main Class
// ============================================================================

export class ToolAnalyticsOLAP {
  private db: DatabaseSync;
  private enabled: boolean;
  private partitionConfig: PartitionConfig;
  private materializedViews: Map<string, MaterializedView> = new Map();
  private feedbackCallbacks: Array<(feedback: FeedbackLoop) => void> = [];
  private lastAggregation: number = 0;
  private aggregationIntervalMs: number = 60 * 1000; // 1 minute

  constructor(
    db: DatabaseSync,
    options: {
      enabled?: boolean;
      partitionConfig?: PartitionConfig;
      aggregationIntervalMs?: number;
    } = {},
  ) {
    this.db = db;
    this.enabled = options.enabled ?? true;
    this.partitionConfig = options.partitionConfig ?? { enabled: false, partitionBy: "time" };
    this.aggregationIntervalMs = options.aggregationIntervalMs ?? 60 * 1000;

    if (this.enabled) {
      this.ensureSchema();
      this.initializeMaterializedViews();
      this.scheduleAggregations();
    }
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  private ensureSchema(): void {
    try {
      // Enable WAL mode for better concurrent access (prevents "database is locked" errors)
      this.db.exec(`PRAGMA journal_mode = WAL`);
      this.db.exec(`PRAGMA busy_timeout = 5000`);

      // Main fact table (raw events)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tool_analytics_facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool TEXT NOT NULL,
          skill TEXT,
          success INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          error TEXT,
          error_type TEXT,
          params_hash TEXT,
          timestamp INTEGER NOT NULL,
          session_id TEXT,
          agent_id TEXT,
          metadata TEXT,
          partition_key TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_facts_tool ON tool_analytics_facts(tool);
        CREATE INDEX IF NOT EXISTS idx_facts_timestamp ON tool_analytics_facts(timestamp);
        CREATE INDEX IF NOT EXISTS idx_facts_success ON tool_analytics_facts(success);
        CREATE INDEX IF NOT EXISTS idx_facts_skill ON tool_analytics_facts(skill);
        CREATE INDEX IF NOT EXISTS idx_facts_session ON tool_analytics_facts(session_id);
        CREATE INDEX IF NOT EXISTS idx_facts_partition ON tool_analytics_facts(partition_key);
      `);

      // Pre-aggregated time buckets (materialized view storage)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tool_analytics_buckets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool TEXT NOT NULL,
          skill TEXT,
          bucket_type TEXT NOT NULL,
          bucket_start INTEGER NOT NULL,
          calls INTEGER NOT NULL DEFAULT 0,
          successes INTEGER NOT NULL DEFAULT 0,
          failures INTEGER NOT NULL DEFAULT 0,
          total_duration_ms INTEGER NOT NULL DEFAULT 0,
          durations_json TEXT,
          unique_sessions INTEGER NOT NULL DEFAULT 0,
          error_types_json TEXT,
          updated_at INTEGER NOT NULL,
          UNIQUE(tool, skill, bucket_type, bucket_start)
        );

        CREATE INDEX IF NOT EXISTS idx_buckets_tool ON tool_analytics_buckets(tool);
        CREATE INDEX IF NOT EXISTS idx_buckets_type_start ON tool_analytics_buckets(bucket_type, bucket_start);
      `);

      // Feedback loop storage
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tool_analytics_feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          tool TEXT NOT NULL,
          message TEXT NOT NULL,
          recommendation TEXT NOT NULL,
          metrics_json TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          acknowledged INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_feedback_tool ON tool_analytics_feedback(tool);
        CREATE INDEX IF NOT EXISTS idx_feedback_severity ON tool_analytics_feedback(severity);
      `);

      // Tool health scores (computed metrics)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tool_analytics_health_scores (
          tool TEXT PRIMARY KEY,
          health_score REAL NOT NULL,
          reliability_score REAL NOT NULL,
          performance_score REAL NOT NULL,
          usage_score REAL NOT NULL,
          computed_at INTEGER NOT NULL
        );
      `);

      log.info("OLAP analytics schema initialized");
    } catch (error) {
      log.error(`Failed to initialize OLAP schema: ${error}`);
      this.enabled = false;
    }
  }

  // ============================================================================
  // Materialized Views
  // ============================================================================

  private initializeMaterializedViews(): void {
    const views: Array<Omit<MaterializedView, "lastRefresh" | "stale">> = [
      {
        name: "mv_hourly_tool_stats",
        query: `
          SELECT 
            tool, skill,
            'hour' as bucket_type,
            (timestamp / 3600000) * 3600000 as bucket_start,
            COUNT(*) as calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
            SUM(duration_ms) as total_duration_ms
          FROM tool_analytics_facts
          WHERE timestamp > ?
          GROUP BY tool, skill, bucket_start
        `,
        refreshIntervalMs: 5 * 60 * 1000, // 5 minutes
      },
      {
        name: "mv_daily_tool_stats",
        query: `
          SELECT 
            tool, skill,
            'day' as bucket_type,
            (timestamp / 86400000) * 86400000 as bucket_start,
            COUNT(*) as calls,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
            SUM(duration_ms) as total_duration_ms
          FROM tool_analytics_facts
          WHERE timestamp > ?
          GROUP BY tool, skill, bucket_start
        `,
        refreshIntervalMs: 60 * 60 * 1000, // 1 hour
      },
    ];

    for (const view of views) {
      this.materializedViews.set(view.name, {
        ...view,
        lastRefresh: 0,
        stale: true,
      });
    }
  }

  private scheduleAggregations(): void {
    // Run aggregation every minute
    setInterval(() => {
      this.runAggregation();
    }, this.aggregationIntervalMs);
  }

  private runAggregation(force = false): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (!force && now - this.lastAggregation < this.aggregationIntervalMs) return;

    this.lastAggregation = now;

    try {
      // Aggregate into time buckets
      this.aggregateTimeBuckets("minute", now - 5 * 60 * 1000);
      this.aggregateTimeBuckets("hour", now - 24 * 60 * 60 * 1000);

      // Refresh materialized views
      for (const [name, view] of this.materializedViews) {
        if (now - view.lastRefresh >= view.refreshIntervalMs) {
          this.refreshMaterializedView(name);
        }
      }

      // Run feedback loop analysis
      this.analyzeFeedbackLoops();

      // Update health scores
      this.updateHealthScores();
    } catch (error) {
      log.error(`Aggregation failed: ${error}`);
    }
  }

  private aggregateTimeBuckets(bucket: TimeBucket, since: number): void {
    const bucketDuration = getBucketDuration(bucket);

    // Get unprocessed records
    const records = this.db
      .prepare(
        `
      SELECT 
        tool, skill, success, duration_ms, error, error_type, session_id, timestamp
      FROM tool_analytics_facts
      WHERE timestamp >= ?
      ORDER BY timestamp
    `,
      )
      .all(since) as Array<{
      tool: string;
      skill: string | null;
      success: number;
      duration_ms: number;
      error: string | null;
      error_type: string | null;
      session_id: string | null;
      timestamp: number;
    }>;

    // Group by bucket
    const bucketGroups = new Map<string, typeof records>();

    for (const record of records) {
      const bucketStart = getBucketStart(record.timestamp, bucket);
      const key = `${record.tool}|${record.skill || ""}|${bucketStart}`;

      if (!bucketGroups.has(key)) {
        bucketGroups.set(key, []);
      }
      bucketGroups.get(key)!.push(record);
    }

    // Upsert aggregated data
    const stmt = this.db.prepare(`
      INSERT INTO tool_analytics_buckets 
        (tool, skill, bucket_type, bucket_start, calls, successes, failures, 
         total_duration_ms, durations_json, unique_sessions, error_types_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tool, skill, bucket_type, bucket_start) DO UPDATE SET
        calls = excluded.calls,
        successes = excluded.successes,
        failures = excluded.failures,
        total_duration_ms = excluded.total_duration_ms,
        durations_json = excluded.durations_json,
        unique_sessions = excluded.unique_sessions,
        error_types_json = excluded.error_types_json,
        updated_at = excluded.updated_at
    `);

    for (const [key, group] of bucketGroups) {
      const [tool, skill, bucketStartStr] = key.split("|");
      const bucketStart = parseInt(bucketStartStr);

      const calls = group.length;
      const successes = group.filter((r) => r.success === 1).length;
      const failures = calls - successes;
      const totalDuration = group.reduce((sum, r) => sum + r.duration_ms, 0);
      const durations = group.map((r) => r.duration_ms).sort((a, b) => a - b);
      const uniqueSessions = new Set(group.map((r) => r.session_id).filter(Boolean)).size;

      const errorTypes: Record<string, number> = {};
      for (const r of group) {
        if (r.error_type) {
          errorTypes[r.error_type] = (errorTypes[r.error_type] || 0) + 1;
        }
      }

      stmt.run(
        tool,
        skill || null,
        bucket,
        bucketStart,
        calls,
        successes,
        failures,
        totalDuration,
        JSON.stringify(durations),
        uniqueSessions,
        Object.keys(errorTypes).length > 0 ? JSON.stringify(errorTypes) : null,
        Date.now(),
      );
    }
  }

  private refreshMaterializedView(name: string): void {
    const view = this.materializedViews.get(name);
    if (!view) return;

    try {
      const lastRefresh = view.lastRefresh;
      this.db.prepare(view.query).all(lastRefresh);
      view.lastRefresh = Date.now();
      view.stale = false;
      log.debug(`Refreshed materialized view: ${name}`);
    } catch (error) {
      log.error(`Failed to refresh view ${name}: ${error}`);
      view.stale = true;
    }
  }

  // ============================================================================
  // Tracking
  // ============================================================================

  track(params: ToolExecutionRecord): void {
    if (!this.enabled) return;

    try {
      const partitionKey = this.computePartitionKey(params);

      const stmt = this.db.prepare(`
        INSERT INTO tool_analytics_facts 
          (tool, skill, success, duration_ms, error, error_type, params_hash, 
           timestamp, session_id, agent_id, metadata, partition_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        params.tool,
        params.skill || null,
        params.success ? 1 : 0,
        params.durationMs,
        params.error || null,
        params.errorType || this.classifyError(params.error),
        params.paramsHash || null,
        params.timestamp,
        params.sessionId || null,
        params.agentId || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        partitionKey,
      );

      // Check if immediate aggregation needed
      this.checkImmediateAggregation();
    } catch (error) {
      log.error(`Failed to track execution: ${error}`);
    }
  }

  private computePartitionKey(params: ToolExecutionRecord): string {
    if (!this.partitionConfig.enabled) return "default";

    switch (this.partitionConfig.partitionBy) {
      case "time":
        const bucket = this.partitionConfig.partitionInterval || "day";
        return getBucketStart(params.timestamp, bucket).toString();
      case "tool":
        return params.tool;
      case "session":
        return params.sessionId || "no-session";
      default:
        return "default";
    }
  }

  private classifyError(error: string | undefined): string | null {
    if (!error) return null;

    const lowerError = error.toLowerCase();

    if (lowerError.includes("timeout")) return "timeout";
    if (lowerError.includes("permission") || lowerError.includes("unauthorized"))
      return "permission";
    if (lowerError.includes("not found") || lowerError.includes("404")) return "not_found";
    if (lowerError.includes("rate limit") || lowerError.includes("429")) return "rate_limit";
    if (lowerError.includes("network") || lowerError.includes("connection")) return "network";
    if (lowerError.includes("invalid") || lowerError.includes("validation")) return "validation";

    return "unknown";
  }

  private checkImmediateAggregation(): void {
    // Trigger aggregation if we've accumulated many records
    const pendingCount = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM tool_analytics_facts
      WHERE timestamp > ?
    `,
      )
      .get(this.lastAggregation) as { count: number };

    if (pendingCount.count > 1000) {
      this.runAggregation();
    }
  }

  // ============================================================================
  // Query Interface
  // ============================================================================

  getInsights(range?: TimeRange): ToolInsights {
    const start = range?.start ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const end = range?.end ?? Date.now();

    // Use pre-aggregated buckets for efficiency
    const bucketType = range?.bucket ?? "hour";

    // Top tools
    const topTools = this.db
      .prepare(
        `
      SELECT
        tool,
        SUM(calls) as calls,
        SUM(successes) as successes,
        SUM(total_duration_ms) as total_duration,
        CAST(SUM(successes) AS REAL) / NULLIF(SUM(calls), 0) as avg_success_rate
      FROM tool_analytics_buckets
      WHERE bucket_type = ? AND bucket_start >= ? AND bucket_start <= ?
      GROUP BY tool
      ORDER BY calls DESC
      LIMIT 20
    `,
      )
      .all(bucketType, start, end) as Array<{
      tool: string;
      calls: number;
      successes: number;
      total_duration: number;
      avg_success_rate: number;
    }>;

    // Calculate trends
    const previousPeriodStart = start - (end - start);
    const trends = this.calculateTrends(start, end, previousPeriodStart, start);

    // Failing tools
    const failingTools = this.db
      .prepare(
        `
      SELECT
        tool,
        1.0 - (CAST(SUM(successes) AS REAL) / NULLIF(SUM(calls), 0)) as error_rate,
        error_types_json,
        MIN(bucket_start) as first_seen,
        MAX(bucket_start) as last_seen,
        SUM(failures) as occurrences
      FROM tool_analytics_buckets
      WHERE bucket_type = ? AND bucket_start >= ? AND bucket_start <= ? AND failures > 0
      GROUP BY tool
      HAVING error_rate > 0.1
      ORDER BY occurrences DESC
      LIMIT 20
    `,
      )
      .all(bucketType, start, end) as Array<{
      tool: string;
      error_rate: number;
      error_types_json: string | null;
      first_seen: number;
      last_seen: number;
      occurrences: number;
    }>;

    // Slow tools - need raw data for percentiles
    const slowTools = this.getSlowTools(start, end);

    // Summary
    const summaryResult = this.db
      .prepare(
        `
      SELECT 
        SUM(calls) as total_calls,
        SUM(successes) as total_successes,
        SUM(total_duration_ms) as total_duration,
        COUNT(DISTINCT tool) as unique_tools
      FROM tool_analytics_buckets
      WHERE bucket_type = ? AND bucket_start >= ? AND bucket_start <= ?
    `,
      )
      .get(bucketType, start, end) as
      | {
          total_calls: number;
          total_successes: number;
          total_duration: number;
          unique_tools: number;
        }
      | undefined;

    const totalCalls = summaryResult?.total_calls ?? 0;
    const totalSuccesses = summaryResult?.total_successes ?? 0;
    const totalDuration = summaryResult?.total_duration ?? 0;

    const hoursInRange = (end - start) / (60 * 60 * 1000);

    return {
      topTools: topTools.map((t) => ({
        tool: t.tool,
        calls: t.calls,
        successRate: t.avg_success_rate,
        avgDuration: t.calls > 0 ? t.total_duration / t.calls : 0,
        trend: trends.byTool[t.tool] || "stable",
      })),
      failingTools: failingTools.map((f) => ({
        tool: f.tool,
        errorRate: f.error_rate,
        commonError: this.extractMostCommonError(f.error_types_json),
        occurrences: f.occurrences,
        firstSeen: f.first_seen,
        lastSeen: f.last_seen,
      })),
      slowTools,
      summary: {
        totalCalls,
        overallSuccessRate: totalCalls > 0 ? totalSuccesses / totalCalls : 1,
        averageDuration: totalCalls > 0 ? totalDuration / totalCalls : 0,
        uniqueTools: summaryResult?.unique_tools ?? 0,
        callsPerHour: hoursInRange > 0 ? totalCalls / hoursInRange : 0,
      },
      trends: trends.overall,
    };
  }

  private getSlowTools(
    start: number,
    end: number,
  ): Array<{
    tool: string;
    avgDuration: number;
    p95Duration: number;
    calls: number;
    outlierCount: number;
  }> {
    // Get raw durations for percentile calculation
    const rawDurations = this.db
      .prepare(
        `
      SELECT tool, duration_ms
      FROM tool_analytics_facts
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY tool, duration_ms
    `,
      )
      .all(start, end) as Array<{ tool: string; duration_ms: number }>;

    // Group by tool
    const toolDurations = new Map<string, number[]>();
    for (const row of rawDurations) {
      if (!toolDurations.has(row.tool)) {
        toolDurations.set(row.tool, []);
      }
      toolDurations.get(row.tool)!.push(row.duration_ms);
    }

    const results: Array<{
      tool: string;
      avgDuration: number;
      p95Duration: number;
      calls: number;
      outlierCount: number;
    }> = [];

    for (const [tool, durations] of toolDurations) {
      if (durations.length < 5) continue; // Need enough data

      durations.sort((a, b) => a - b);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95 =
        durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1] ?? 0;

      // Count outliers (> 2 std devs from mean)
      const stdDev = Math.sqrt(
        durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length,
      );
      const outlierCount = durations.filter((d) => Math.abs(d - avg) > 2 * stdDev).length;

      results.push({
        tool,
        avgDuration: avg,
        p95Duration: p95,
        calls: durations.length,
        outlierCount,
      });
    }

    return results.sort((a, b) => b.avgDuration - a.avgDuration).slice(0, 20);
  }

  private calculateTrends(
    currentStart: number,
    currentEnd: number,
    previousStart: number,
    previousEnd: number,
  ): { overall: ToolInsights["trends"]; byTool: Record<string, "up" | "down" | "stable"> } {
    const getStats = (start: number, end: number) => {
      const result = this.db
        .prepare(
          `
        SELECT 
          SUM(calls) as calls,
          SUM(successes) as successes,
          SUM(total_duration_ms) as total_duration
        FROM tool_analytics_buckets
        WHERE bucket_type = 'hour' AND bucket_start >= ? AND bucket_start <= ?
      `,
        )
        .get(start, end) as
        | {
            calls: number;
            successes: number;
            total_duration: number;
          }
        | undefined;

      return {
        calls: result?.calls ?? 0,
        successRate: result?.calls ? (result.successes ?? 0) / result.calls : 1,
        avgDuration: result?.calls ? (result.total_duration ?? 0) / result.calls : 0,
      };
    };

    const current = getStats(currentStart, currentEnd);
    const previous = getStats(previousStart, previousEnd);

    const calcTrend = (curr: number, prev: number): number => {
      if (prev === 0) return 0;
      return Math.max(-1, Math.min(1, (curr - prev) / prev));
    };

    // Calculate per-tool trends
    const byTool: Record<string, "up" | "down" | "stable"> = {};
    const toolTrends = this.db
      .prepare(
        `
      SELECT 
        tool,
        SUM(CASE WHEN bucket_start >= ? AND bucket_start <= ? THEN calls ELSE 0 END) as current_calls,
        SUM(CASE WHEN bucket_start >= ? AND bucket_start <= ? THEN calls ELSE 0 END) as previous_calls
      FROM tool_analytics_buckets
      WHERE bucket_type = 'hour'
      GROUP BY tool
    `,
      )
      .all(currentStart, currentEnd, previousStart, previousEnd) as Array<{
      tool: string;
      current_calls: number;
      previous_calls: number;
    }>;

    for (const t of toolTrends) {
      const change =
        t.previous_calls > 0 ? (t.current_calls - t.previous_calls) / t.previous_calls : 0;
      byTool[t.tool] = change > 0.1 ? "up" : change < -0.1 ? "down" : "stable";
    }

    return {
      overall: {
        successRateTrend: calcTrend(current.successRate, previous.successRate),
        volumeTrend: calcTrend(current.calls, previous.calls),
        performanceTrend: -calcTrend(current.avgDuration, previous.avgDuration), // Negative because lower is better
      },
      byTool,
    };
  }

  private extractMostCommonError(errorTypesJson: string | null): string {
    if (!errorTypesJson) return "Unknown";

    try {
      const errorTypes = JSON.parse(errorTypesJson) as Record<string, number>;
      const sorted = Object.entries(errorTypes).sort((a, b) => b[1] - a[1]);
      return sorted[0]?.[0] ?? "Unknown";
    } catch {
      return "Unknown";
    }
  }

  // ============================================================================
  // Feedback Loops (Self-Improving)
  // ============================================================================

  registerFeedbackCallback(callback: (feedback: FeedbackLoop) => void): void {
    this.feedbackCallbacks.push(callback);
  }

  private analyzeFeedbackLoops(): void {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // Get current stats - use "minute" bucket for more granular analysis
    const insights = this.getInsights({ start: dayAgo, end: now, bucket: "minute" });

    // Analyze each tool for issues
    for (const tool of insights.topTools) {
      // Check reliability
      if (tool.successRate < 0.8) {
        this.emitFeedback({
          type: "reliability",
          severity: tool.successRate < 0.5 ? "critical" : "warning",
          tool: tool.tool,
          message: `Tool "${tool.tool}" has ${((1 - tool.successRate) * 100).toFixed(1)}% failure rate`,
          recommendation: this.getReliabilityRecommendation(tool.tool, insights.failingTools),
          metrics: { successRate: tool.successRate, calls: tool.calls },
          timestamp: now,
        });
      }

      // Check performance
      const slowTool = insights.slowTools.find((s) => s.tool === tool.tool);
      if (slowTool && slowTool.avgDuration > 5000) {
        this.emitFeedback({
          type: "performance",
          severity: slowTool.avgDuration > 30000 ? "critical" : "warning",
          tool: tool.tool,
          message: `Tool "${tool.tool}" is slow: avg ${slowTool.avgDuration.toFixed(0)}ms, p95 ${slowTool.p95Duration.toFixed(0)}ms`,
          recommendation:
            "Consider caching, parallelization, or optimizing the tool implementation",
          metrics: {
            avgDuration: slowTool.avgDuration,
            p95Duration: slowTool.p95Duration,
            outlierCount: slowTool.outlierCount,
          },
          timestamp: now,
        });
      }

      // Check for timeout patterns
      this.checkTimeoutPatterns(tool.tool, dayAgo, now);

      // Check for cost optimization opportunities
      this.checkCostOptimization(tool.tool, insights);
    }

    // Check overall system health
    if (insights.summary.overallSuccessRate < 0.9) {
      this.emitFeedback({
        type: "reliability",
        severity: "warning",
        tool: "_system",
        message: `Overall system success rate is ${(insights.summary.overallSuccessRate * 100).toFixed(1)}%`,
        recommendation: "Review failing tools and implement circuit breakers or retries",
        metrics: { successRate: insights.summary.overallSuccessRate },
        timestamp: now,
      });
    }
  }

  private checkTimeoutPatterns(tool: string, start: number, end: number): void {
    const timeoutErrors = this.db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM tool_analytics_facts
      WHERE tool = ? AND timestamp >= ? AND timestamp <= ? 
        AND error_type = 'timeout'
    `,
      )
      .get(tool, start, end) as { count: number };

    if (timeoutErrors.count > 5) {
      this.emitFeedback({
        type: "performance",
        severity: "warning",
        tool,
        message: `Tool "${tool}" has ${timeoutErrors.count} timeout errors in the last 24h`,
        recommendation:
          "Consider increasing timeout threshold or implementing graceful degradation",
        metrics: { timeoutCount: timeoutErrors.count },
        timestamp: Date.now(),
      });
    }
  }

  private checkCostOptimization(tool: string, insights: ToolInsights): void {
    const toolData = insights.topTools.find((t) => t.tool === tool);
    if (!toolData || toolData.calls < 100) return;

    // Check if tool is called very frequently - might be cacheable
    if (toolData.calls > 1000 && insights.summary.callsPerHour > 50) {
      this.emitFeedback({
        type: "cost",
        severity: "info",
        tool,
        message: `Tool "${tool}" is called frequently (${toolData.calls} times)`,
        recommendation: "Consider implementing caching to reduce redundant calls",
        metrics: { calls: toolData.calls, callsPerHour: insights.summary.callsPerHour },
        timestamp: Date.now(),
      });
    }
  }

  private getReliabilityRecommendation(
    tool: string,
    failingTools: ToolInsights["failingTools"],
  ): string {
    const failing = failingTools.find((f) => f.tool === tool);
    if (!failing) return "Monitor the tool for patterns";

    const errorType = failing.commonError.toLowerCase();

    if (errorType.includes("timeout")) return "Implement retry logic with exponential backoff";
    if (errorType.includes("rate_limit")) return "Implement rate limiting on the client side";
    if (errorType.includes("permission")) return "Review and update authentication credentials";
    if (errorType.includes("network")) return "Add circuit breaker pattern for network failures";
    if (errorType.includes("validation")) return "Review input validation and add schema checks";

    return "Review error logs and implement appropriate error handling";
  }

  private emitFeedback(feedback: FeedbackLoop): void {
    // Store feedback
    try {
      this.db
        .prepare(`
        INSERT INTO tool_analytics_feedback 
          (type, severity, tool, message, recommendation, metrics_json, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .run(
          feedback.type,
          feedback.severity,
          feedback.tool,
          feedback.message,
          feedback.recommendation,
          JSON.stringify(feedback.metrics),
          feedback.timestamp,
        );
    } catch (error) {
      log.error(`Failed to store feedback: ${error}`);
    }

    // Notify callbacks
    for (const callback of this.feedbackCallbacks) {
      try {
        callback(feedback);
      } catch (error) {
        log.error(`Feedback callback failed: ${error}`);
      }
    }
  }

  getFeedbackHistory(limit: number = 50, unacknowledgedOnly: boolean = false): FeedbackLoop[] {
    const query = unacknowledgedOnly
      ? `SELECT * FROM tool_analytics_feedback WHERE acknowledged = 0 ORDER BY timestamp DESC LIMIT ?`
      : `SELECT * FROM tool_analytics_feedback ORDER BY timestamp DESC LIMIT ?`;

    const rows = this.db.prepare(query).all(limit) as Array<{
      type: string;
      severity: string;
      tool: string;
      message: string;
      recommendation: string;
      metrics_json: string;
      timestamp: number;
    }>;

    return rows.map((r) => ({
      type: r.type as FeedbackLoop["type"],
      severity: r.severity as FeedbackLoop["severity"],
      tool: r.tool,
      message: r.message,
      recommendation: r.recommendation,
      metrics: JSON.parse(r.metrics_json) as Record<string, number>,
      timestamp: r.timestamp,
    }));
  }

  acknowledgeFeedback(id: number): void {
    this.db.prepare(`UPDATE tool_analytics_feedback SET acknowledged = 1 WHERE id = ?`).run(id);
  }

  // ============================================================================
  // Health Scores
  // ============================================================================

  private updateHealthScores(): void {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // Use "minute" bucket for more granular analysis (also works better with tests)
    const toolStats = this.db
      .prepare(
        `
      SELECT
        tool,
        SUM(calls) as calls,
        SUM(successes) as successes,
        SUM(total_duration_ms) as total_duration
      FROM tool_analytics_buckets
      WHERE bucket_type = 'minute' AND bucket_start >= ?
      GROUP BY tool
    `,
      )
      .all(dayAgo) as Array<{
      tool: string;
      calls: number;
      successes: number;
      total_duration: number;
    }>;

    for (const stat of toolStats) {
      const reliabilityScore = stat.calls > 0 ? stat.successes / stat.calls : 1;
      const avgDuration = stat.calls > 0 ? stat.total_duration / stat.calls : 0;

      // Performance score: 1 for <100ms, 0.5 for 1s, 0 for >10s
      const performanceScore = Math.max(0, Math.min(1, 1 - Math.log10(avgDuration / 100 + 1) / 2));

      // Usage score: normalized by max calls
      const maxCalls = Math.max(...toolStats.map((t) => t.calls));
      const usageScore = maxCalls > 0 ? stat.calls / maxCalls : 0;

      // Combined health score (weighted)
      const healthScore = reliabilityScore * 0.5 + performanceScore * 0.3 + usageScore * 0.2;

      this.db
        .prepare(
          `
        INSERT INTO tool_analytics_health_scores (tool, health_score, reliability_score, performance_score, usage_score, computed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tool) DO UPDATE SET
          health_score = excluded.health_score,
          reliability_score = excluded.reliability_score,
          performance_score = excluded.performance_score,
          usage_score = excluded.usage_score,
          computed_at = excluded.computed_at
      `,
        )
        .run(stat.tool, healthScore, reliabilityScore, performanceScore, usageScore, now);
    }
  }

  getHealthScores(): Array<{
    tool: string;
    healthScore: number;
    reliabilityScore: number;
    performanceScore: number;
    usageScore: number;
  }> {
    const rows = this.db
      .prepare(
        `
      SELECT tool, health_score, reliability_score, performance_score, usage_score
      FROM tool_analytics_health_scores
      ORDER BY health_score DESC
    `,
      )
      .all() as Array<{
      tool: string;
      health_score: number;
      reliability_score: number;
      performance_score: number;
      usage_score: number;
    }>;

    // Map snake_case SQLite columns to camelCase
    return rows.map((row) => ({
      tool: row.tool,
      healthScore: row.health_score,
      reliabilityScore: row.reliability_score,
      performanceScore: row.performance_score,
      usageScore: row.usage_score,
    }));
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  hashParams(params: unknown): string | undefined {
    if (!params || typeof params !== "object") return undefined;

    try {
      return createHash("sha256").update(JSON.stringify(params)).digest("hex").substring(0, 16);
    } catch {
      return undefined;
    }
  }

  getSuccessRate(tool: string, days: number = 7): number {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const result = this.db
      .prepare(
        `
      SELECT 
        SUM(successes) as successes,
        SUM(calls) as calls
      FROM tool_analytics_buckets
      WHERE tool = ? AND bucket_start > ?
    `,
      )
      .get(tool, since) as { successes: number; calls: number } | undefined;

    if (!result || result.calls === 0) return 1;
    return result.successes / result.calls;
  }

  getRecentErrors(
    tool: string,
    limit: number = 10,
  ): Array<{ error: string; errorType: string; timestamp: number }> {
    return this.db
      .prepare(
        `
      SELECT error, error_type, timestamp
      FROM tool_analytics_facts
      WHERE tool = ? AND success = 0 AND error IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    `,
      )
      .all(tool, limit) as Array<{ error: string; error_type: string; timestamp: number }>;
  }

  clearOldData(daysToKeep: number = 90): { facts: number; buckets: number } {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const factsResult = this.db
      .prepare(`DELETE FROM tool_analytics_facts WHERE timestamp < ?`)
      .run(cutoff);
    const bucketsResult = this.db
      .prepare(`DELETE FROM tool_analytics_buckets WHERE bucket_start < ?`)
      .run(cutoff);

    log.info(`Cleared ${factsResult.changes} facts and ${bucketsResult.changes} buckets`);
    return { facts: Number(factsResult.changes), buckets: Number(bucketsResult.changes) };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  forceAggregation(): void {
    this.runAggregation(true);
  }
}

// ============================================================================
// Wrapper Function
// ============================================================================

export async function trackToolExecution<T>(
  analytics: ToolAnalyticsOLAP | null,
  toolName: string,
  skillName: string | undefined,
  params: unknown,
  fn: () => Promise<T>,
  context?: { sessionId?: string; agentId?: string },
): Promise<T> {
  if (!analytics || !analytics.isEnabled()) {
    return fn();
  }

  const start = Date.now();

  try {
    const result = await fn();

    analytics.track({
      tool: toolName,
      skill: skillName,
      success: true,
      durationMs: Date.now() - start,
      paramsHash: analytics.hashParams(params),
      timestamp: Date.now(),
      sessionId: context?.sessionId,
      agentId: context?.agentId,
    });

    return result;
  } catch (error) {
    const err = error as Error;

    analytics.track({
      tool: toolName,
      skill: skillName,
      success: false,
      durationMs: Date.now() - start,
      error: err.message,
      errorType: err.constructor.name,
      paramsHash: analytics.hashParams(params),
      timestamp: Date.now(),
      sessionId: context?.sessionId,
      agentId: context?.agentId,
    });

    throw error;
  }
}
