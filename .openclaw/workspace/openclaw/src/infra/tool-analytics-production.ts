/**
 * Unified Tool Analytics System
 * Production-grade analytics with Pinot, ClickHouse, and RL-based tool selection
 */

import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type {
  AnalyticsConfig,
  AnalyticsBackend,
  ToolExecutionRecord,
  ToolInsights,
  ToolRecommendation,
  TimeRange,
  ToolContext,
} from "./tool-analytics-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { ClickHouseAnalyticsBackend } from "./tool-analytics-clickhouse.js";
import { PinotAnalyticsBackend } from "./tool-analytics-pinot.js";
import { AdaptiveToolSelector } from "./tool-analytics-rl.js";
import { ToolAnalyticsManager as SQLiteAnalyticsManager } from "./tool-analytics.js";

const log = createSubsystemLogger("analytics:unified");

/**
 * Unified Tool Analytics Manager
 * Coordinates multiple backends for optimal performance
 */
export class UnifiedToolAnalytics {
  private sqliteBackend: SQLiteAnalyticsManager | null = null;
  private pinotBackend: PinotAnalyticsBackend | null = null;
  private clickhouseBackend: ClickHouseAnalyticsBackend | null = null;
  private rlSelector: AdaptiveToolSelector | null = null;
  private config: AnalyticsConfig;
  private initialized = false;

  constructor(config: AnalyticsConfig, sqliteDb?: DatabaseSync) {
    this.config = config;

    // Always initialize SQLite as fallback
    if (sqliteDb) {
      this.sqliteBackend = new SQLiteAnalyticsManager(sqliteDb, config.enabled);
    }

    // Initialize Pinot for real-time queries
    if (config.pinot && (config.backend === "pinot" || config.backend === "hybrid")) {
      this.pinotBackend = new PinotAnalyticsBackend(config.pinot);
    }

    // Initialize ClickHouse for materialized views
    if (config.clickhouse && (config.backend === "clickhouse" || config.backend === "hybrid")) {
      this.clickhouseBackend = new ClickHouseAnalyticsBackend(config.clickhouse);
    }

    // Initialize RL selector
    if (config.rl?.enabled) {
      this.rlSelector = new AdaptiveToolSelector({
        enabled: true,
        learningRate: config.rl.learningRate || 0.001,
        explorationRate: config.rl.explorationRate || 0.1,
        batchSize: config.rl.batchSize || 1000,
      });
    }
  }

  /**
   * Initialize all backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const initPromises: Promise<void>[] = [];

    if (this.pinotBackend) {
      initPromises.push(
        this.pinotBackend.initialize().catch((e) => {
          log.warn(`Pinot initialization failed: ${e}`);
        }),
      );
    }

    if (this.clickhouseBackend) {
      initPromises.push(
        this.clickhouseBackend.initialize().catch((e) => {
          log.warn(`ClickHouse initialization failed: ${e}`);
        }),
      );
    }

    await Promise.all(initPromises);
    this.initialized = true;

    log.info("Unified analytics initialized", {
      sqlite: this.sqliteBackend?.isEnabled() ?? false,
      pinot: this.pinotBackend?.isAvailable() ?? false,
      clickhouse: this.clickhouseBackend?.isAvailable() ?? false,
      rl: this.rlSelector?.isEnabled() ?? false,
    });
  }

  /**
   * Track tool execution across all backends
   */
  async track(record: ToolExecutionRecord): Promise<void> {
    if (!this.config.enabled) return;

    // Track in SQLite immediately (synchronous, local)
    if (this.sqliteBackend) {
      this.sqliteBackend.track({
        tool: record.tool,
        skill: record.skill,
        success: record.success,
        durationMs: record.durationMs,
        error: record.error,
        paramsHash: record.paramsHash,
        timestamp: record.timestamp,
      });
    }

    // Parallel write to distributed backends
    const promises: Promise<void>[] = [];

    if (this.pinotBackend?.isAvailable()) {
      promises.push(this.pinotBackend.track(record));
    }

    if (this.clickhouseBackend?.isAvailable()) {
      promises.push(this.clickhouseBackend.track(record));
    }

    // Don't await distributed writes - fire and forget for latency
    Promise.all(promises).catch((e) => {
      log.debug(`Background tracking failed: ${e}`);
    });
  }

  /**
   * Track execution with automatic timing
   */
  async trackExecution<T>(
    toolName: string,
    skillName: string | undefined,
    params: unknown,
    context: {
      agentId: string;
      sessionId: string;
      context?: Record<string, unknown>;
    },
    execution: () => Promise<T>,
  ): Promise<T> {
    if (!this.config.enabled) {
      return execution();
    }

    const startTime = performance.now();

    try {
      const result = await execution();
      const duration = performance.now() - startTime;

      await this.track({
        tool: toolName,
        skill: skillName,
        success: true,
        durationMs: duration,
        paramsHash: this.hashParams(params),
        timestamp: Date.now(),
        agentId: context.agentId,
        sessionId: context.sessionId,
        context: context.context,
      });

      // Update RL policy
      if (this.rlSelector) {
        await this.rlSelector.updatePolicy(
          {
            query: toolName,
            availableTools: [toolName],
            recentTools: [],
            memory: [],
            taskComplexity: this.assessComplexity(params),
          },
          toolName,
          { success: true, duration },
        );
      }

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.track({
        tool: toolName,
        skill: skillName,
        success: false,
        durationMs: duration,
        error: errorMessage,
        paramsHash: this.hashParams(params),
        timestamp: Date.now(),
        agentId: context.agentId,
        sessionId: context.sessionId,
        context: context.context,
      });

      // Update RL policy with failure
      if (this.rlSelector) {
        await this.rlSelector.updatePolicy(
          {
            query: toolName,
            availableTools: [toolName],
            recentTools: [],
            memory: [],
            taskComplexity: this.assessComplexity(params),
          },
          toolName,
          { success: false, duration, error: errorMessage },
        );
      }

      throw error;
    }
  }

  /**
   * Get optimal tool recommendation using RL + historical data
   */
  async getOptimalTool(
    query: string,
    availableTools: string[],
    context: {
      agentId: string;
      recentTools?: string[];
      memory?: string[];
      context?: Record<string, unknown>;
    },
  ): Promise<{
    tool: string;
    confidence: number;
    reason: string;
    historicalRate: number;
  }> {
    // Get RL recommendation
    let policy = {
      tool: availableTools[0] || "",
      confidence: 0.5,
      expectedReward: 0.5,
      explorationBonus: 0,
    };

    if (this.rlSelector) {
      policy = await this.rlSelector.selectTool({
        query,
        availableTools,
        recentTools: context.recentTools || [],
        memory: context.memory || [],
        taskComplexity: this.assessComplexity(query),
      });
    }

    // Get historical performance from Pinot
    let historical: ToolRecommendation[] = [];
    if (this.pinotBackend?.isAvailable() && context.context) {
      historical = await this.pinotBackend.getAdaptiveToolInsights(
        context.agentId,
        context.context,
      );
    }

    // Combine signals
    let combined = {
      ...policy,
      historicalRate: 0.5,
    };

    if (this.rlSelector && historical.length > 0) {
      combined = this.rlSelector.combineSignals(historical, policy);
    }

    return {
      tool: combined.tool,
      confidence: combined.confidence,
      historicalRate: combined.historicalRate,
      reason:
        `RL expected reward: ${combined.expectedReward.toFixed(2)}, ` +
        `Historical success: ${(combined.historicalRate * 100).toFixed(1)}%` +
        (combined.explorationBonus > 0
          ? `, Exploration bonus: ${combined.explorationBonus.toFixed(3)}`
          : ""),
    };
  }

  /**
   * Get tool success rate
   */
  async getSuccessRate(tool: string, timeRange: TimeRange = "24h"): Promise<number> {
    // Prefer Pinot for real-time queries
    if (this.pinotBackend?.isAvailable()) {
      return this.pinotBackend.getToolSuccessRate(tool, timeRange);
    }

    // Fallback to ClickHouse
    if (this.clickhouseBackend?.isAvailable()) {
      return this.clickhouseBackend.getToolSuccessRate(tool, timeRange);
    }

    // Fallback to SQLite
    if (this.sqliteBackend) {
      const days = this.timeRangeToDays(timeRange);
      return this.sqliteBackend.getSuccessRate(tool, days);
    }

    return 1.0;
  }

  /**
   * Get comprehensive insights
   */
  async getInsights(timeRange: TimeRange = "7d"): Promise<ToolInsights> {
    // Prefer ClickHouse for materialized view queries
    if (this.clickhouseBackend?.isAvailable()) {
      return this.clickhouseBackend.getInsights(timeRange);
    }

    // Fallback to SQLite
    if (this.sqliteBackend) {
      const days = this.timeRangeToDays(timeRange);
      const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
      return this.sqliteBackend.getInsights({ start: startTime });
    }

    return this.getEmptyInsights();
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get backend status
   */
  getStatus(): {
    enabled: boolean;
    sqlite: boolean;
    pinot: boolean;
    clickhouse: boolean;
    rl: boolean;
    rlStats?: ReturnType<AdaptiveToolSelector["getStats"]>;
  } {
    return {
      enabled: this.config.enabled,
      sqlite: this.sqliteBackend?.isEnabled() ?? false,
      pinot: this.pinotBackend?.isAvailable() ?? false,
      clickhouse: this.clickhouseBackend?.isAvailable() ?? false,
      rl: this.rlSelector?.isEnabled() ?? false,
      rlStats: this.rlSelector?.getStats(),
    };
  }

  /**
   * Shutdown connections
   */
  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.pinotBackend) {
      promises.push(this.pinotBackend.shutdown());
    }

    await Promise.all(promises);
    log.info("Unified analytics shutdown complete");
  }

  /**
   * Save RL model
   */
  async saveModel(path: string): Promise<void> {
    if (this.rlSelector) {
      await this.rlSelector.save(path);
    }
  }

  /**
   * Load RL model
   */
  async loadModel(path: string): Promise<void> {
    if (this.rlSelector) {
      await this.rlSelector.load(path);
    }
  }

  // Private helpers

  private hashParams(params: unknown): string | undefined {
    if (!params || typeof params !== "object") return undefined;

    try {
      return createHash("sha256").update(JSON.stringify(params)).digest("hex").substring(0, 16);
    } catch {
      return undefined;
    }
  }

  private assessComplexity(input: unknown): number {
    if (typeof input === "string") {
      // Simple heuristic: longer = more complex
      return Math.min(10, Math.floor(input.length / 100));
    }
    if (typeof input === "object" && input !== null) {
      // Count nested properties
      const str = JSON.stringify(input);
      return Math.min(10, Math.floor(str.length / 200));
    }
    return 5; // Default medium complexity
  }

  private timeRangeToDays(range: TimeRange): number {
    const map: Record<TimeRange, number> = {
      "1h": 1 / 24,
      "24h": 1,
      "7d": 7,
      "30d": 30,
      "90d": 90,
    };
    return map[range];
  }

  private getEmptyInsights(): ToolInsights {
    return {
      topTools: [],
      failingTools: [],
      slowTools: [],
      summary: {
        totalCalls: 0,
        overallSuccessRate: 1,
        averageDuration: 0,
        uniqueTools: 0,
      },
    };
  }
}

/**
 * Factory function to create analytics instance
 */
export function createToolAnalytics(
  config: AnalyticsConfig,
  sqliteDb?: DatabaseSync,
): UnifiedToolAnalytics {
  return new UnifiedToolAnalytics(config, sqliteDb);
}

/**
 * Default configuration for development
 */
export function getDefaultAnalyticsConfig(): AnalyticsConfig {
  return {
    enabled: true,
    backend: "sqlite",
    retention: {
      hotDays: 7,
      coldDays: 90,
    },
    rl: {
      enabled: false,
      learningRate: 0.001,
      explorationRate: 0.1,
      batchSize: 1000,
    },
  };
}

/**
 * Production configuration template
 */
export function getProductionAnalyticsConfig(): AnalyticsConfig {
  return {
    enabled: true,
    backend: "hybrid",
    pinot: {
      brokerUrl: process.env.PINOT_BROKER_URL || "http://localhost:8099",
      kafkaBrokers: process.env.KAFKA_BROKERS || "localhost:9092",
    },
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || "http://localhost:8123",
      database: process.env.CLICKHOUSE_DATABASE || "tool_analytics",
      username: process.env.CLICKHOUSE_USER || "default",
      password: process.env.CLICKHOUSE_PASSWORD || "",
    },
    retention: {
      hotDays: 7,
      coldDays: 365,
    },
    rl: {
      enabled: true,
      learningRate: 0.001,
      explorationRate: 0.1,
      batchSize: 1000,
    },
  };
}

// Re-export types
export type {
  AnalyticsConfig,
  ToolExecutionRecord,
  ToolInsights,
  ToolRecommendation,
  TimeRange,
  ToolContext,
} from "./tool-analytics-types.js";
