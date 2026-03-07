/**
 * Real-time Metrics Display
 *
 * Tracks and displays:
 * - Tokens per second
 * - Response latency
 * - Cost estimation
 * - Cache hit rate
 */

import chalk from "chalk";

export interface MetricsData {
  // Token metrics
  tokensPerSecond: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  
  // Latency metrics
  lastResponseMs: number | null;
  avgResponseMs: number | null;
  
  // Cost metrics (USD)
  estimatedCost: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  
  // Cache metrics
  cacheHitRate: number;
  cacheSavedTokens: number;
}

export class MetricsTracker {
  private responseTimes: number[] = [];
  private tokenTimestamps: Array<{ timestamp: number; tokens: number }> = [];
  private sessionStart: number = Date.now();
  
  private data: MetricsData = {
    tokensPerSecond: null,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastResponseMs: null,
    avgResponseMs: null,
    estimatedCost: 0,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    cacheHitRate: 0,
    cacheSavedTokens: 0,
  };

  /**
   * Record a response
   */
  recordResponse(inputTokens: number, outputTokens: number, durationMs: number): void {
    // Update totals
    this.data.totalInputTokens += inputTokens;
    this.data.totalOutputTokens += outputTokens;
    
    // Track response times (keep last 10)
    this.responseTimes.push(durationMs);
    if (this.responseTimes.length > 10) {
      this.responseTimes.shift();
    }
    
    // Calculate average latency
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    this.data.avgResponseMs = sum / this.responseTimes.length;
    this.data.lastResponseMs = durationMs;
    
    // Track token timestamps for tokens/sec calculation
    const now = Date.now();
    this.tokenTimestamps.push({ timestamp: now, tokens: outputTokens });
    
    // Keep only last 30 seconds of data
    const cutoff = now - 30000;
    this.tokenTimestamps = this.tokenTimestamps.filter(t => t.timestamp > cutoff);
    
    // Calculate tokens per second
    if (this.tokenTimestamps.length > 1) {
      const totalTokens = this.tokenTimestamps.reduce((sum, t) => sum + t.tokens, 0);
      const duration = (now - this.tokenTimestamps[0].timestamp) / 1000;
      this.data.tokensPerSecond = totalTokens / duration;
    }
    
    // Calculate cost
    const inputCost = (this.data.totalInputTokens / 1000) * this.data.inputCostPer1k;
    const outputCost = (this.data.totalOutputTokens / 1000) * this.data.outputCostPer1k;
    this.data.estimatedCost = inputCost + outputCost;
  }

  /**
   * Set pricing (per 1k tokens)
   */
  setPricing(inputCostPer1k: number, outputCostPer1k: number): void {
    this.data.inputCostPer1k = inputCostPer1k;
    this.data.outputCostPer1k = outputCostPer1k;
    
    // Recalculate cost
    const inputCost = (this.data.totalInputTokens / 1000) * inputCostPer1k;
    const outputCost = (this.data.totalOutputTokens / 1000) * outputCostPer1k;
    this.data.estimatedCost = inputCost + outputCost;
  }

  /**
   * Update cache metrics
   */
  updateCacheMetrics(hitRate: number, savedTokens: number): void {
    this.data.cacheHitRate = hitRate;
    this.data.cacheSavedTokens = savedTokens;
  }

  /**
   * Get current metrics
   */
  getMetrics(): MetricsData {
    return { ...this.data };
  }

  /**
   * Reset session metrics
   */
  reset(): void {
    this.responseTimes = [];
    this.tokenTimestamps = [];
    this.sessionStart = Date.now();
    this.data = {
      tokensPerSecond: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      lastResponseMs: null,
      avgResponseMs: null,
      estimatedCost: 0,
      inputCostPer1k: this.data.inputCostPer1k,
      outputCostPer1k: this.data.outputCostPer1k,
      cacheHitRate: 0,
      cacheSavedTokens: 0,
    };
  }
}

/**
 * Format metrics for display
 */
export function formatMetrics(metrics: MetricsData): string {
  const parts: string[] = [];
  
  // Tokens/sec
  if (metrics.tokensPerSecond !== null && metrics.tokensPerSecond > 0) {
    const tps = metrics.tokensPerSecond.toFixed(1);
    const color = metrics.tokensPerSecond > 50 ? chalk.green : 
                  metrics.tokensPerSecond > 20 ? chalk.yellow : chalk.red;
    parts.push(`⚡ ${color(tps)} tok/s`);
  }
  
  // Latency
  if (metrics.avgResponseMs !== null) {
    const latency = metrics.avgResponseMs < 1000 ? 
      `${Math.round(metrics.avgResponseMs)}ms` :
      `${(metrics.avgResponseMs / 1000).toFixed(1)}s`;
    const color = metrics.avgResponseMs < 2000 ? chalk.green :
                  metrics.avgResponseMs < 5000 ? chalk.yellow : chalk.red;
    parts.push(`⏱ ${color(latency)}`);
  }
  
  // Cost
  if (metrics.estimatedCost > 0) {
    const cost = metrics.estimatedCost < 0.01 ? 
      `$${(metrics.estimatedCost * 100).toFixed(2)}¢` :
      `$${metrics.estimatedCost.toFixed(2)}`;
    parts.push(`💰 ${chalk.cyan(cost)}`);
  }
  
  // Cache
  if (metrics.cacheHitRate > 0) {
    const rate = (metrics.cacheHitRate * 100).toFixed(0);
    parts.push(`💾 ${chalk.green(rate)}% cached`);
  }
  
  return parts.join(" · ");
}

/**
 * Format detailed metrics panel
 */
export function formatDetailedMetrics(metrics: MetricsData): string {
  const lines: string[] = [];
  
  lines.push(chalk.bold.cyan("📊 Session Metrics"));
  lines.push(chalk.gray("─".repeat(40)));
  
  // Token stats
  lines.push(`Total tokens: ${chalk.yellow(metrics.totalInputTokens + metrics.totalOutputTokens)} ` +
    `(in: ${metrics.totalInputTokens}, out: ${metrics.totalOutputTokens})`);
  
  // Performance
  if (metrics.tokensPerSecond !== null) {
    lines.push(`Speed: ${chalk.green(metrics.tokensPerSecond.toFixed(1))} tokens/sec`);
  }
  
  if (metrics.avgResponseMs !== null) {
    lines.push(`Avg latency: ${chalk.cyan(Math.round(metrics.avgResponseMs))}ms`);
  }
  
  // Cost
  if (metrics.estimatedCost > 0) {
    lines.push(`Estimated cost: ${chalk.cyan(`$${metrics.estimatedCost.toFixed(4)}`)}`);
  }
  
  // Cache
  if (metrics.cacheHitRate > 0) {
    lines.push(`Cache: ${chalk.green((metrics.cacheHitRate * 100).toFixed(0))}% hit rate ` +
      `(${Math.round(metrics.cacheSavedTokens / 1000)}k tokens saved)`);
  }
  
  return lines.join("\n");
}

// Singleton instance
let metricsTrackerInstance: MetricsTracker | null = null;

export function getMetricsTracker(): MetricsTracker {
  if (!metricsTrackerInstance) {
    metricsTrackerInstance = new MetricsTracker();
  }
  return metricsTrackerInstance;
}
