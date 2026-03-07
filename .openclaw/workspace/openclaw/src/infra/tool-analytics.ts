/**
 * Tool Analytics System
 * Tracks tool execution success rates, errors, and performance
 */

import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tool-analytics");

export type ToolExecutionRecord = {
  tool: string;
  skill?: string;
  success: boolean;
  durationMs: number;
  error?: string;
  paramsHash?: string;
  timestamp: number;
};

export type ToolInsights = {
  topTools: Array<{ tool: string; calls: number; successRate: number; avgDuration: number }>;
  failingTools: Array<{
    tool: string;
    errorRate: number;
    commonError: string;
    occurrences: number;
  }>;
  slowTools: Array<{ tool: string; avgDuration: number; calls: number }>;
  summary: {
    totalCalls: number;
    overallSuccessRate: number;
    averageDuration: number;
    uniqueTools: number;
  };
};

export type TimeRange = {
  start?: number; // Unix timestamp in ms
  end?: number; // Unix timestamp in ms
};

/**
 * Tool Analytics Manager
 * Provides insights into tool usage, success rates, and performance
 */
export class ToolAnalyticsManager {
  private db: DatabaseSync;
  private enabled: boolean;

  constructor(db: DatabaseSync, enabled: boolean = true) {
    this.db = db;
    this.enabled = enabled;
    this.ensureSchema();
  }

  /**
   * Create the analytics schema
   */
  private ensureSchema(): void {
    if (!this.enabled) return;

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tool_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool TEXT NOT NULL,
          skill TEXT,
          success INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          error TEXT,
          params_hash TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tool_analytics_tool ON tool_analytics(tool);
        CREATE INDEX IF NOT EXISTS idx_tool_analytics_timestamp ON tool_analytics(timestamp);
        CREATE INDEX IF NOT EXISTS idx_tool_analytics_success ON tool_analytics(success);
        CREATE INDEX IF NOT EXISTS idx_tool_analytics_skill ON tool_analytics(skill);
      `);

      log.info("Tool analytics schema initialized");
    } catch (error) {
      log.error(`Failed to initialize tool analytics schema: ${error}`);
      this.enabled = false;
    }
  }

  /**
   * Track a tool execution
   */
  track(params: ToolExecutionRecord): void {
    if (!this.enabled) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO tool_analytics 
        (tool, skill, success, duration_ms, error, params_hash, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        params.tool,
        params.skill || null,
        params.success ? 1 : 0,
        params.durationMs,
        params.error || null,
        params.paramsHash || null,
        params.timestamp,
      );
    } catch (error) {
      log.error(`Failed to track tool execution: ${error}`);
    }
  }

  /**
   * Hash parameters for privacy-preserving tracking
   */
  hashParams(params: unknown): string | undefined {
    if (!params || typeof params !== "object") return undefined;

    try {
      return createHash("sha256").update(JSON.stringify(params)).digest("hex").substring(0, 16);
    } catch {
      return undefined;
    }
  }

  /**
   * Get success rate for a specific tool
   */
  getSuccessRate(tool: string, days: number = 7): number {
    if (!this.enabled) return 1;

    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const result = this.db
        .prepare(
          `
        SELECT 
          CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as rate
        FROM tool_analytics
        WHERE tool = ? AND timestamp > ?
      `,
        )
        .get(tool, since) as { rate: number | null };

      return result.rate ?? 1;
    } catch (error) {
      log.error(`Failed to get success rate: ${error}`);
      return 1;
    }
  }

  /**
   * Get comprehensive insights
   */
  getInsights(range?: TimeRange): ToolInsights {
    const start = range?.start ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const end = range?.end ?? Date.now();

    // Get top tools
    const topTools = this.db
      .prepare(
        `
      SELECT 
        tool,
        COUNT(*) as calls,
        AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as successRate,
        AVG(duration_ms) as avgDuration
      FROM tool_analytics
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY tool
      ORDER BY calls DESC
      LIMIT 20
    `,
      )
      .all(start, end) as Array<{
      tool: string;
      calls: number;
      successRate: number;
      avgDuration: number;
    }>;

    // Get failing tools
    const failingTools = this.db
      .prepare(
        `
      SELECT 
        tool,
        1.0 - AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as errorRate,
        error as commonError,
        COUNT(*) as occurrences
      FROM tool_analytics
      WHERE timestamp >= ? AND timestamp <= ? AND success = 0
      GROUP BY tool, error
      HAVING errorRate > 0.1
      ORDER BY occurrences DESC
      LIMIT 20
    `,
      )
      .all(start, end) as Array<{
      tool: string;
      errorRate: number;
      commonError: string;
      occurrences: number;
    }>;

    // Get slow tools
    const slowTools = this.db
      .prepare(
        `
      SELECT 
        tool,
        AVG(duration_ms) as avgDuration,
        COUNT(*) as calls
      FROM tool_analytics
      WHERE timestamp >= ? AND timestamp <= ?
      GROUP BY tool
      ORDER BY avgDuration DESC
      LIMIT 20
    `,
      )
      .all(start, end) as Array<{ tool: string; avgDuration: number; calls: number }>;

    // Get summary
    const summaryResult = this.db
      .prepare(
        `
      SELECT 
        COUNT(*) as totalCalls,
        AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as overallSuccessRate,
        AVG(duration_ms) as averageDuration,
        COUNT(DISTINCT tool) as uniqueTools
      FROM tool_analytics
      WHERE timestamp >= ? AND timestamp <= ?
    `,
      )
      .get(start, end) as {
      totalCalls: number;
      overallSuccessRate: number;
      averageDuration: number;
      uniqueTools: number;
    };

    return {
      topTools,
      failingTools,
      slowTools,
      summary: summaryResult || {
        totalCalls: 0,
        overallSuccessRate: 1,
        averageDuration: 0,
        uniqueTools: 0,
      },
    };
  }

  /**
   * Get recent errors for a tool
   */
  getRecentErrors(tool: string, limit: number = 10): Array<{ error: string; timestamp: number }> {
    return this.db
      .prepare(
        `
      SELECT error, timestamp
      FROM tool_analytics
      WHERE tool = ? AND success = 0 AND error IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    `,
      )
      .all(tool, limit) as Array<{ error: string; timestamp: number }>;
  }

  /**
   * Clear old analytics data
   */
  clearOldData(daysToKeep: number = 90): number {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    try {
      const result = this.db
        .prepare(
          `
        DELETE FROM tool_analytics
        WHERE timestamp < ?
      `,
        )
        .run(cutoff);

      log.info(`Cleared ${result.changes} old analytics records`);
      return Number(result.changes);
    } catch (error) {
      log.error(`Failed to clear old analytics: ${error}`);
      return 0;
    }
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Wrapper to track tool execution
 */
export function trackToolExecution(
  analytics: ToolAnalyticsManager | null,
  toolName: string,
  skillName: string | undefined,
  params: unknown,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  if (!analytics || !analytics.isEnabled()) {
    return fn();
  }

  const start = Date.now();

  return fn()
    .then((result) => {
      analytics.track({
        tool: toolName,
        skill: skillName,
        success: true,
        durationMs: Date.now() - start,
        paramsHash: analytics.hashParams(params),
        timestamp: Date.now(),
      });

      return result;
    })
    .catch((error) => {
      analytics.track({
        tool: toolName,
        skill: skillName,
        success: false,
        durationMs: Date.now() - start,
        error: error?.message || String(error),
        paramsHash: analytics.hashParams(params),
        timestamp: Date.now(),
      });

      throw error;
    });
}
