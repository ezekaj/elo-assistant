/**
 * Hook Metrics CLI Commands
 *
 * Provides commands for viewing and managing hook metrics.
 */

import { formatStatsSummary, formatHookMetrics } from "../config/types.hook-metrics.js";
import { getHookMetricsManager } from "../hooks/hook-metrics-manager.js";

/**
 * Show hook execution metrics
 */
export async function hooksMetricsCommand(): Promise<void> {
  const manager = getHookMetricsManager();
  const stats = manager.getStats();

  if (stats.length === 0) {
    console.log("No hook metrics available. Execute some hooks first.");
    return;
  }

  console.log(formatStatsSummary(stats));
}

/**
 * Reset hook metrics
 */
export async function hooksMetricsResetCommand(): Promise<void> {
  const manager = getHookMetricsManager();
  manager.reset();
  console.log("✓ Hook metrics reset successfully");
}

/**
 * Show detailed metrics for a specific hook
 *
 * @param hookName - Hook name
 */
export async function hooksMetricsDetailsCommand(hookName: string): Promise<void> {
  const manager = getHookMetricsManager();
  const metrics = manager.getMetrics(hookName);

  if (!metrics) {
    console.log(`✗ No metrics found for hook: ${hookName}`);
    return;
  }

  const m = Array.isArray(metrics) ? metrics[0] : metrics;
  console.log(formatHookMetrics(m));
}

/**
 * Export hook metrics to JSON
 *
 * @param outputPath - Output file path (optional)
 */
export async function hooksMetricsExportCommand(outputPath?: string): Promise<void> {
  const manager = getHookMetricsManager();
  const json = manager.export();

  if (outputPath) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(outputPath, json, "utf-8");
    console.log(`✓ Hook metrics exported to: ${outputPath}`);
  } else {
    console.log(json);
  }
}

/**
 * Import hook metrics from JSON
 *
 * @param inputPath - Input file path
 */
export async function hooksMetricsImportCommand(inputPath: string): Promise<void> {
  const fs = await import("node:fs/promises");

  try {
    const json = await fs.readFile(inputPath, "utf-8");
    const manager = getHookMetricsManager();
    manager.import(json);
    console.log(`✓ Hook metrics imported from: ${inputPath}`);
  } catch (error: any) {
    console.log(`✗ Failed to import metrics: ${error.message}`);
  }
}

/**
 * Show hook metrics summary
 */
export async function hooksMetricsSummaryCommand(): Promise<void> {
  const manager = getHookMetricsManager();
  const summary = manager.getSummary();
  const managerStats = manager.getManagerStats();

  console.log(
    `
Hook Metrics Summary
═══════════════════════════════════════
├─ Hooks Tracked: ${managerStats.hookCount}
├─ Uptime: ${managerStats.uptimeHours.toFixed(1)}h
├─ Total Executions: ${summary.totalExecutions}
├─ Success Rate: ${summary.successRate.toFixed(1)}%
├─ Successful: ${summary.totalSuccesses}
├─ Failed: ${summary.totalFailures}
├─ Blocking: ${summary.totalBlocking}
└─ Avg Duration: ${Math.round(summary.avgDurationMs)}ms
`.trim(),
  );
}
