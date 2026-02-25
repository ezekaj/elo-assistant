/**
 * Event Loop Lag Monitor
 *
 * Detects when the Node.js event loop is blocked, causing latency.
 * Exposes lag metrics for health checks.
 */

let lastCheck = process.hrtime.bigint();
let currentLagMs = 0;
let peakLagMs = 0;
let sampleCount = 0;
let totalLagMs = 0;

/** Sample interval in ms */
const SAMPLE_INTERVAL_MS = 1000;

/** Warn threshold in ms */
const LAG_WARN_THRESHOLD_MS = 100;

/** Critical threshold in ms */
const LAG_CRITICAL_THRESHOLD_MS = 500;

let sampleTimer: ReturnType<typeof setInterval> | null = null;
let onLagWarning: ((lagMs: number) => void) | null = null;

function sample() {
  const now = process.hrtime.bigint();
  const elapsedNs = Number(now - lastCheck);
  const elapsedMs = elapsedNs / 1_000_000;

  // Lag = actual elapsed - expected elapsed
  currentLagMs = Math.max(0, elapsedMs - SAMPLE_INTERVAL_MS);
  lastCheck = now;

  // Track stats
  sampleCount++;
  totalLagMs += currentLagMs;
  if (currentLagMs > peakLagMs) {
    peakLagMs = currentLagMs;
  }

  // Warn on high lag
  if (currentLagMs > LAG_WARN_THRESHOLD_MS && onLagWarning) {
    onLagWarning(currentLagMs);
  }
}

/**
 * Get current event loop lag in milliseconds.
 */
export function getEventLoopLagMs(): number {
  return currentLagMs;
}

/**
 * Get event loop lag statistics.
 */
export function getEventLoopStats(): {
  currentLagMs: number;
  peakLagMs: number;
  avgLagMs: number;
  sampleCount: number;
  status: "ok" | "warn" | "critical";
} {
  const avgLagMs = sampleCount > 0 ? totalLagMs / sampleCount : 0;

  let status: "ok" | "warn" | "critical" = "ok";
  if (currentLagMs > LAG_CRITICAL_THRESHOLD_MS) {
    status = "critical";
  } else if (currentLagMs > LAG_WARN_THRESHOLD_MS) {
    status = "warn";
  }

  return {
    currentLagMs: Math.round(currentLagMs * 100) / 100,
    peakLagMs: Math.round(peakLagMs * 100) / 100,
    avgLagMs: Math.round(avgLagMs * 100) / 100,
    sampleCount,
    status,
  };
}

/**
 * Start monitoring event loop lag.
 */
export function startEventLoopMonitor(opts?: { onWarning?: (lagMs: number) => void }): void {
  if (sampleTimer) return;

  onLagWarning = opts?.onWarning ?? null;
  lastCheck = process.hrtime.bigint();
  sampleTimer = setInterval(sample, SAMPLE_INTERVAL_MS);
  sampleTimer.unref();
}

/**
 * Stop monitoring event loop lag.
 */
export function stopEventLoopMonitor(): void {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  onLagWarning = null;
}

/**
 * Reset statistics (for testing).
 */
export function resetEventLoopStats(): void {
  currentLagMs = 0;
  peakLagMs = 0;
  sampleCount = 0;
  totalLagMs = 0;
  lastCheck = process.hrtime.bigint();
}
