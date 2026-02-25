/**
 * Cache Metrics Tracker
 *
 * Tracks and calculates cache performance metrics.
 * Monitors cache hit rates and cost savings.
 */

import type { CacheMetrics, APIUsage } from "../config/types.cache.js";
import {
  calculateCacheHitRate,
  calculateCacheSavings,
  getProviderCacheConfig,
} from "../config/types.cache.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("cache-metrics-tracker");

// ============================================================================
// CACHE METRICS TRACKER CLASS
// ============================================================================

/**
 * Tracks cache performance metrics
 */
export class CacheMetricsTracker {
  private totalReadTokens = 0;
  private totalCreationTokens = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private requestCount = 0;
  private enabled = true;

  constructor(enabled = true) {
    this.enabled = enabled;
    log.debug(`Cache metrics tracker initialized (enabled: ${enabled})`);
  }

  /**
   * Enable or disable tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug(`Cache metrics tracker ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record metrics from API response
   *
   * @param usage - Usage data from API response
   * @param provider - Provider name for pricing
   */
  recordMetrics(usage: APIUsage, provider = "claude"): void {
    if (!this.enabled) {
      return;
    }

    this.totalReadTokens += usage.cache_read_input_tokens || 0;
    this.totalCreationTokens += usage.cache_creation_input_tokens || 0;
    this.totalInputTokens += usage.input_tokens;
    this.totalOutputTokens += usage.output_tokens;
    this.requestCount++;

    const hitRate = calculateCacheHitRate(usage);
    log.debug(
      `Recorded metrics: read=${usage.cache_read_input_tokens || 0}, creation=${usage.cache_creation_input_tokens || 0}, input=${usage.input_tokens}, hitRate=${(hitRate * 100).toFixed(1)}%`,
    );
  }

  /**
   * Get current metrics
   *
   * @param provider - Provider name for pricing (default: 'claude')
   * @returns Current cache metrics
   */
  getMetrics(provider = "claude"): CacheMetrics {
    const total = this.totalReadTokens + this.totalCreationTokens + this.totalInputTokens;
    const hitRate = total > 0 ? this.totalReadTokens / total : 0;

    // Calculate savings
    const pricing = getProviderCacheConfig(provider).pricing;
    const costWithoutCache = (total * pricing.baseInput) / 1000000;
    const costWithCache =
      (this.totalReadTokens * pricing.cacheRead +
        this.totalCreationTokens * pricing.cacheWrite5m +
        this.totalInputTokens * pricing.baseInput) /
      1000000;
    const estimatedSavings = costWithoutCache - costWithCache;

    return {
      cacheReadTokens: this.totalReadTokens,
      cacheCreationTokens: this.totalCreationTokens,
      inputTokens: this.totalInputTokens,
      hitRate,
      estimatedSavings,
    };
  }

  /**
   * Get cache hit rate
   *
   * @returns Hit rate (0.0 - 1.0)
   */
  getHitRate(): number {
    const total = this.totalReadTokens + this.totalCreationTokens + this.totalInputTokens;
    return total > 0 ? this.totalReadTokens / total : 0;
  }

  /**
   * Get total tokens processed
   *
   * @returns Total tokens (read + creation + input)
   */
  getTotalTokens(): number {
    return this.totalReadTokens + this.totalCreationTokens + this.totalInputTokens;
  }

  /**
   * Get total cost without caching
   *
   * @param provider - Provider name for pricing
   * @returns Cost in USD
   */
  getCostWithoutCache(provider = "claude"): number {
    const pricing = getProviderCacheConfig(provider).pricing;
    const total = this.getTotalTokens();
    return (total * pricing.baseInput) / 1000000;
  }

  /**
   * Get total cost with caching
   *
   * @param provider - Provider name for pricing
   * @returns Cost in USD
   */
  getCostWithCache(provider = "claude"): number {
    const pricing = getProviderCacheConfig(provider).pricing;
    return (
      (this.totalReadTokens * pricing.cacheRead +
        this.totalCreationTokens * pricing.cacheWrite5m +
        this.totalInputTokens * pricing.baseInput) /
      1000000
    );
  }

  /**
   * Calculate cost savings
   *
   * @param provider - Provider name for pricing
   * @returns Savings in USD
   */
  calculateSavings(provider = "claude"): number {
    return this.getCostWithoutCache(provider) - this.getCostWithCache(provider);
  }

  /**
   * Get request count
   *
   * @returns Number of requests tracked
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.totalReadTokens = 0;
    this.totalCreationTokens = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.requestCount = 0;
    log.debug("Reset cache metrics");
  }

  /**
   * Get tracker stats
   */
  getStats(): {
    requestCount: number;
    totalTokens: number;
    hitRate: number;
    savings: number;
    enabled: boolean;
  } {
    return {
      requestCount: this.requestCount,
      totalTokens: this.getTotalTokens(),
      hitRate: this.getHitRate(),
      savings: this.calculateSavings(),
      enabled: this.enabled,
    };
  }

  /**
   * Format metrics for display
   *
   * @param provider - Provider name for pricing
   * @returns Formatted metrics string
   */
  formatMetrics(provider = "claude"): string {
    const metrics = this.getMetrics(provider);

    return [
      `Cache Metrics:`,
      `  Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%`,
      `  Read Tokens: ${metrics.cacheReadTokens.toLocaleString()}`,
      `  Creation Tokens: ${metrics.cacheCreationTokens.toLocaleString()}`,
      `  Input Tokens: ${metrics.inputTokens.toLocaleString()}`,
      `  Total Tokens: ${this.getTotalTokens().toLocaleString()}`,
      `  Requests: ${this.requestCount}`,
      `  Savings: $${metrics.estimatedSavings.toFixed(4)}`,
    ].join("\n");
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: CacheMetricsTracker | null = null;

/**
 * Get or create cache metrics tracker singleton
 */
export function getCacheMetricsTracker(): CacheMetricsTracker {
  if (!instance) {
    instance = new CacheMetricsTracker();
  }
  return instance;
}

/**
 * Reset cache metrics tracker singleton (for testing)
 */
export function resetCacheMetricsTracker(): void {
  instance = null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create tracker with auto-logging
 *
 * Logs metrics every N requests
 */
export function createAutoLoggingTracker(logInterval = 10): CacheMetricsTracker {
  const tracker = new CacheMetricsTracker();

  const originalRecord = tracker.recordMetrics.bind(tracker);
  tracker.recordMetrics = (usage: APIUsage, provider = "claude") => {
    originalRecord(usage, provider);

    if (tracker.getRequestCount() % logInterval === 0) {
      log.info(tracker.formatMetrics(provider));
    }
  };

  return tracker;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CacheMetricsTracker,
  getCacheMetricsTracker,
  resetCacheMetricsTracker,
  createAutoLoggingTracker,
};
