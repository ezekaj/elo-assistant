/**
 * Connection Rate Limiter
 *
 * Prevents resource exhaustion from clients opening too many connections.
 * Uses sliding window per IP with automatic cleanup.
 */

type RateWindow = {
  count: number;
  windowStart: number;
};

const ipWindows = new Map<string, RateWindow>();

/** Window duration in ms (1 minute) */
const WINDOW_MS = 60_000;

/** Max connections per IP per window */
const MAX_CONNECTIONS_PER_WINDOW = 30;

/** Cleanup interval (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/**
 * Check if a connection from this IP is allowed.
 * Returns true if allowed, false if rate limited.
 */
export function checkConnectionRate(ip: string | undefined): boolean {
  if (!ip) return true;

  const now = Date.now();
  const entry = ipWindows.get(ip);

  // New IP or window expired - allow and start new window
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return true;
  }

  // Increment and check
  entry.count++;
  return entry.count <= MAX_CONNECTIONS_PER_WINDOW;
}

/**
 * Get current rate limit stats for an IP (for debugging/monitoring).
 */
export function getRateLimitStats(ip: string): {
  count: number;
  remaining: number;
  resetInMs: number;
} | null {
  const entry = ipWindows.get(ip);
  if (!entry) return null;

  const now = Date.now();
  const elapsed = now - entry.windowStart;

  if (elapsed > WINDOW_MS) return null;

  return {
    count: entry.count,
    remaining: Math.max(0, MAX_CONNECTIONS_PER_WINDOW - entry.count),
    resetInMs: WINDOW_MS - elapsed,
  };
}

/**
 * Get all rate limit entries (for monitoring).
 */
export function getAllRateLimitStats(): Map<string, RateWindow> {
  return new Map(ipWindows);
}

// Cleanup old entries periodically
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function cleanupExpired() {
  const now = Date.now();
  const cutoff = now - WINDOW_MS * 2;

  for (const [ip, entry] of ipWindows) {
    if (entry.windowStart < cutoff) {
      ipWindows.delete(ip);
    }
  }
}

/**
 * Start the cleanup timer. Call once at gateway startup.
 */
export function startRateLimitCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref(); // Don't block process exit
}

/**
 * Stop the cleanup timer. Call at gateway shutdown.
 */
export function stopRateLimitCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Reset all rate limits (for testing).
 */
export function resetRateLimits(): void {
  ipWindows.clear();
}
