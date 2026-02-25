/**
 * Hook Metrics Manager
 *
 * Tracks and aggregates hook execution metrics.
 * Matches Claude Code's hook metrics system.
 */

import type { HookMetrics, HookExecutionStats } from "../config/types.hook-metrics.js";
import { metricsToStats } from "../config/types.hook-metrics.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("hook-metrics");

// ============================================================================
// HOOK METRICS MANAGER CLASS
// ============================================================================

/**
 * Manages hook execution metrics
 */
export class HookMetricsManager {
  private metrics = new Map<string, HookMetrics>();
  private startTime = Date.now();
  private enabled = true;
  private maxHistoryHours = 24;

  constructor(enabled = true) {
    this.enabled = enabled;
    log.debug(
      `Hook metrics manager initialized (enabled: ${enabled}, maxHistory: ${this.maxHistoryHours}h)`,
    );
  }

  /**
   * Enable or disable metrics tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug(`Hook metrics manager ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if metrics tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record hook execution start
   *
   * @param hookName - Hook name
   * @returns Start timestamp
   */
  startRecording(hookName: string): number {
    if (!this.enabled) {
      return 0;
    }

    // Initialize metrics if not exists
    if (!this.metrics.has(hookName)) {
      this.metrics.set(hookName, {
        hookName,
        numCommands: 0,
        numSuccess: 0,
        numBlocking: 0,
        numNonBlockingError: 0,
        numCancelled: 0,
        totalDurationMs: 0,
      });
    }

    const hookMetrics = this.metrics.get(hookName)!;
    hookMetrics.numCommands++;

    return Date.now();
  }

  /**
   * Record hook execution end
   *
   * @param hookName - Hook name
   * @param startTime - Start timestamp from startRecording
   * @param success - Was execution successful
   * @param blocked - Did hook block execution (default: false)
   * @param cancelled - Was execution cancelled (default: false)
   */
  endRecording(
    hookName: string,
    startTime: number,
    success: boolean,
    blocked = false,
    cancelled = false,
  ): void {
    if (!this.enabled || startTime === 0) {
      return;
    }

    const hookMetrics = this.metrics.get(hookName);
    if (!hookMetrics) {
      log.warn(`Metrics not found for hook: ${hookName}`);
      return;
    }

    const durationMs = Date.now() - startTime;

    // Update counters
    if (success) {
      hookMetrics.numSuccess++;
      if (blocked) {
        hookMetrics.numBlocking++;
        log.debug(`Hook ${hookName} blocked execution (${durationMs}ms)`);
      }
    } else {
      if (cancelled) {
        hookMetrics.numCancelled++;
        log.debug(`Hook ${hookName} cancelled (${durationMs}ms)`);
      } else {
        hookMetrics.numNonBlockingError++;
        log.debug(`Hook ${hookName} failed (${durationMs}ms)`);
      }
    }

    // Update duration
    hookMetrics.totalDurationMs += durationMs;
    hookMetrics.lastExecuted = Date.now();

    // Clean old metrics (older than maxHistoryHours)
    this.cleanOldMetrics();
  }

  /**
   * Get metrics for hook
   *
   * @param hookName - Hook name (optional, returns all if not specified)
   * @returns Metrics or null if not found
   */
  getMetrics(hookName?: string): HookMetrics | HookMetrics[] | null {
    if (hookName) {
      return this.metrics.get(hookName) || null;
    }
    return Array.from(this.metrics.values());
  }

  /**
   * Get aggregated stats for all hooks
   *
   * @returns Array of hook stats
   */
  getStats(): HookExecutionStats[] {
    return Array.from(this.metrics.values()).map(metricsToStats);
  }

  /**
   * Get summary stats
   *
   * @returns Summary statistics
   */
  getSummary(): {
    totalExecutions: number;
    totalSuccesses: number;
    totalFailures: number;
    totalBlocking: number;
    successRate: number;
    avgDurationMs: number;
  } {
    const stats = this.getStats();
    const totalExecutions = stats.reduce((sum, s) => sum + s.executions, 0);
    const totalSuccesses = stats.reduce((sum, s) => sum + s.successes, 0);
    const totalFailures = stats.reduce((sum, s) => sum + s.failures);
    const totalBlocking = stats.reduce((sum, s) => sum + s.blocking);
    const successRate = totalExecutions > 0 ? (totalSuccesses / totalExecutions) * 100 : 0;
    const avgDurationMs =
      totalExecutions > 0
        ? stats.reduce((sum, s) => sum + s.avgDurationMs * s.executions, 0) / totalExecutions
        : 0;

    return {
      totalExecutions,
      totalSuccesses,
      totalFailures,
      totalBlocking,
      successRate,
      avgDurationMs,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
    log.info("Hook metrics reset");
  }

  /**
   * Export metrics to JSON
   *
   * @returns JSON string
   */
  export(): string {
    return JSON.stringify(
      {
        startTime: this.startTime,
        metrics: Array.from(this.metrics.entries()),
      },
      null,
      2,
    );
  }

  /**
   * Import metrics from JSON
   *
   * @param json - JSON string
   */
  import(json: string): void {
    try {
      const data = JSON.parse(json);
      this.startTime = data.startTime || Date.now();
      this.metrics = new Map(data.metrics);
      log.info(`Imported metrics for ${this.metrics.size} hooks`);
    } catch (error) {
      log.error(`Failed to import metrics: ${error}`);
      throw new Error(`Failed to import metrics: ${error}`);
    }
  }

  /**
   * Get manager stats
   */
  getManagerStats(): {
    hookCount: number;
    uptimeHours: number;
    enabled: boolean;
  } {
    return {
      hookCount: this.metrics.size,
      uptimeHours: (Date.now() - this.startTime) / (1000 * 60 * 60),
      enabled: this.enabled,
    };
  }

  /**
   * Clean old metrics (older than maxHistoryHours)
   */
  private cleanOldMetrics(): void {
    const maxAge = this.maxHistoryHours * 60 * 60 * 1000; // Convert to ms
    const now = Date.now();
    let cleaned = 0;

    for (const [hookName, metrics] of this.metrics.entries()) {
      if (metrics.lastExecuted && now - metrics.lastExecuted > maxAge) {
        this.metrics.delete(hookName);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug(`Cleaned ${cleaned} old hook metrics`);
    }
  }

  /**
   * Reset manager to initial state
   */
  resetManager(): void {
    this.metrics.clear();
    this.startTime = Date.now();
    this.enabled = true;
    log.debug("Reset hook metrics manager");
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: HookMetricsManager | null = null;

/**
 * Get or create hook metrics manager singleton
 */
export function getHookMetricsManager(): HookMetricsManager {
  if (!instance) {
    instance = new HookMetricsManager();
  }
  return instance;
}

/**
 * Reset hook metrics manager singleton (for testing)
 */
export function resetHookMetricsManager(): void {
  instance = null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create metrics manager with custom config
 */
export function createHookMetricsManager(config?: {
  enabled?: boolean;
  maxHistoryHours?: number;
}): HookMetricsManager {
  const manager = new HookMetricsManager(config?.enabled);
  if (config?.maxHistoryHours) {
    (manager as any).maxHistoryHours = config.maxHistoryHours;
  }
  return manager;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  HookMetricsManager,
  getHookMetricsManager,
  resetHookMetricsManager,
  createHookMetricsManager,
};
