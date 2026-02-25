/**
 * Hook Metrics Types
 *
 * Defines types for hook execution metrics tracking.
 * Matches Claude Code's hook metrics system.
 */

// ============================================================================
// HOOK METRICS
// ============================================================================

/**
 * Hook execution metrics
 */
export interface HookMetrics {
  /** Hook name */
  hookName: string;
  /** Number of hook commands executed */
  numCommands: number;
  /** Number of successful executions */
  numSuccess: number;
  /** Number of executions that blocked */
  numBlocking: number;
  /** Number of non-blocking errors */
  numNonBlockingError: number;
  /** Number of cancelled executions */
  numCancelled: number;
  /** Total execution duration in milliseconds */
  totalDurationMs: number;
  /** Last execution timestamp */
  lastExecuted?: number;
}

/**
 * Hook execution statistics (aggregated)
 */
export interface HookExecutionStats {
  /** Hook name */
  hookName: string;
  /** Total executions */
  executions: number;
  /** Successful executions */
  successes: number;
  /** Failed executions */
  failures: number;
  /** Executions that blocked */
  blocking: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Last run timestamp */
  lastRun?: number;
  /** Error rate percentage */
  errorRate: number;
}

/**
 * Hook metrics store
 */
export interface HookMetricsStore {
  /** Metrics by hook name */
  metrics: Map<string, HookMetrics>;
  /** Store start time */
  startTime: number;
  /** Is store resettable */
  resettable: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate success rate
 */
export function calculateSuccessRate(metrics: HookMetrics): number {
  if (metrics.numCommands === 0) {
    return 0;
  }
  return (metrics.numSuccess / metrics.numCommands) * 100;
}

/**
 * Calculate error rate
 */
export function calculateErrorRate(metrics: HookMetrics): number {
  if (metrics.numCommands === 0) {
    return 0;
  }
  return ((metrics.numNonBlockingError + metrics.numCancelled) / metrics.numCommands) * 100;
}

/**
 * Calculate average duration
 */
export function calculateAvgDuration(metrics: HookMetrics): number {
  if (metrics.numCommands === 0) {
    return 0;
  }
  return Math.round(metrics.totalDurationMs / metrics.numCommands);
}

/**
 * Convert metrics to stats
 */
export function metricsToStats(metrics: HookMetrics): HookExecutionStats {
  return {
    hookName: metrics.hookName,
    executions: metrics.numCommands,
    successes: metrics.numSuccess,
    failures: metrics.numNonBlockingError + metrics.numCancelled,
    blocking: metrics.numBlocking,
    avgDurationMs: calculateAvgDuration(metrics),
    lastRun: metrics.lastExecuted,
    errorRate: calculateErrorRate(metrics),
  };
}

/**
 * Format metrics for display
 */
export function formatHookMetrics(metrics: HookMetrics): string {
  const successRate = calculateSuccessRate(metrics);
  const avgDuration = calculateAvgDuration(metrics);
  const errorRate = calculateErrorRate(metrics);

  return `
Hook: ${metrics.hookName}
═══════════════════════════════════════
├─ Commands: ${metrics.numCommands}
├─ Successes: ${metrics.numSuccess}
├─ Blocking: ${metrics.numBlocking}
├─ Non-Blocking Errors: ${metrics.numNonBlockingError}
├─ Cancelled: ${metrics.numCancelled}
├─ Total Duration: ${metrics.totalDurationMs}ms
├─ Avg Duration: ${avgDuration}ms
├─ Success Rate: ${successRate.toFixed(1)}%
├─ Error Rate: ${errorRate.toFixed(1)}%
└─ Last Executed: ${
    metrics.lastExecuted ? new Date(metrics.lastExecuted).toLocaleString() : "Never"
  }
`.trim();
}

/**
 * Format stats summary for display
 */
export function formatStatsSummary(stats: HookExecutionStats[]): string {
  const totalExecutions = stats.reduce((sum, s) => sum + s.executions, 0);
  const totalSuccesses = stats.reduce((sum, s) => sum + s.successes, 0);
  const totalFailures = stats.reduce((sum, s) => sum + s.failures);
  const totalBlocking = stats.reduce((sum, s) => sum + s.blocking);
  const successRate =
    totalExecutions > 0 ? ((totalSuccesses / totalExecutions) * 100).toFixed(1) : "0.0";
  const avgDuration =
    totalExecutions > 0
      ? Math.round(
          stats.reduce((sum, s) => sum + s.avgDurationMs * s.executions, 0) / totalExecutions,
        )
      : 0;

  return `
Hook Metrics (Last 24h)
═══════════════════════════════════════
├─ Total Executions: ${totalExecutions}
├─ Success Rate: ${successRate}%
├─ Successful: ${totalSuccesses}
├─ Failed: ${totalFailures}
├─ Blocking: ${totalBlocking}
└─ Avg Duration: ${avgDuration}ms

Per-Hook Stats:
───────────────────────────────────────
${stats
  .map(
    (h) => `
${h.hookName}:
  ├─ Executions: ${h.executions}
  ├─ Successes: ${h.successes}
  ├─ Failures: ${h.failures}
  ├─ Blocking: ${h.blocking}
  ├─ Error Rate: ${h.errorRate.toFixed(1)}%
  └─ Avg Duration: ${h.avgDurationMs}ms
`,
  )
  .join("\n")}
`.trim();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  HookMetrics,
  HookExecutionStats,
  HookMetricsStore,
  calculateSuccessRate,
  calculateErrorRate,
  calculateAvgDuration,
  metricsToStats,
  formatHookMetrics,
  formatStatsSummary,
};
