/**
 * Circuit Breaker Pattern Implementation
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Service is down, fast-fail all requests
 * - HALF_OPEN: Testing if service recovered
 *
 * Transitions:
 * - CLOSED → OPEN: After `failureThreshold` consecutive failures
 * - OPEN → HALF_OPEN: After `resetTimeoutMs` elapsed
 * - HALF_OPEN → CLOSED: On success
 * - HALF_OPEN → OPEN: On failure
 */

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Time to wait before trying again after opening (default: 30000ms) */
  resetTimeoutMs?: number;
  /** Time window to track failures (default: 60000ms) */
  failureWindowMs?: number;
};

type CircuitEntry = {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
};

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;
const DEFAULT_FAILURE_WINDOW_MS = 60_000;

const circuits = new Map<string, CircuitEntry>();

function getOrCreate(key: string): CircuitEntry {
  let entry = circuits.get(key);
  if (!entry) {
    entry = { state: "closed", failures: 0, lastFailureAt: 0, openedAt: 0 };
    circuits.set(key, entry);
  }
  return entry;
}

/**
 * Check if circuit allows request to proceed.
 * Returns true if request should proceed, false if circuit is open.
 */
export function circuitAllows(key: string, config?: CircuitBreakerConfig): boolean {
  const entry = getOrCreate(key);
  const resetTimeoutMs = config?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
  const now = Date.now();

  if (entry.state === "closed") {
    return true;
  }

  if (entry.state === "open") {
    // Check if enough time passed to try again
    if (now - entry.openedAt >= resetTimeoutMs) {
      entry.state = "half_open";
      return true;
    }
    return false;
  }

  // half_open: allow one request through to test
  return true;
}

/**
 * Record a successful request. Resets the circuit if in half_open state.
 */
export function circuitSuccess(key: string): void {
  const entry = getOrCreate(key);

  if (entry.state === "half_open") {
    // Service recovered
    entry.state = "closed";
    entry.failures = 0;
    entry.lastFailureAt = 0;
    entry.openedAt = 0;
  } else if (entry.state === "closed") {
    // Reset failure count on success
    entry.failures = 0;
  }
}

/**
 * Record a failed request. May open the circuit.
 */
export function circuitFailure(key: string, config?: CircuitBreakerConfig): void {
  const entry = getOrCreate(key);
  const failureThreshold = config?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const failureWindowMs = config?.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS;
  const now = Date.now();

  if (entry.state === "half_open") {
    // Failed during recovery test, back to open
    entry.state = "open";
    entry.openedAt = now;
    return;
  }

  // Check if previous failures are within the window
  if (now - entry.lastFailureAt > failureWindowMs) {
    // Reset if outside window
    entry.failures = 0;
  }

  entry.failures++;
  entry.lastFailureAt = now;

  if (entry.failures >= failureThreshold) {
    entry.state = "open";
    entry.openedAt = now;
  }
}

/**
 * Get current circuit state for monitoring/debugging.
 */
export function circuitState(key: string): CircuitState {
  return getOrCreate(key).state;
}

/**
 * Get circuit stats for monitoring.
 */
export function circuitStats(key: string): {
  state: CircuitState;
  failures: number;
  lastFailureAt: number;
  openedAt: number;
} {
  const entry = getOrCreate(key);
  return { ...entry };
}

/**
 * Reset a circuit (for testing or manual recovery).
 */
export function circuitReset(key: string): void {
  circuits.delete(key);
}

/**
 * Wrap an async function with circuit breaker protection.
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  config?: CircuitBreakerConfig,
): Promise<T> {
  if (!circuitAllows(key, config)) {
    throw new Error(`Circuit breaker open for ${key}`);
  }

  try {
    const result = await fn();
    circuitSuccess(key);
    return result;
  } catch (err) {
    circuitFailure(key, config);
    throw err;
  }
}

/**
 * List all active circuits (for monitoring).
 */
export function listCircuits(): Map<string, CircuitEntry> {
  return new Map(circuits);
}

/**
 * Clear all circuits (for testing).
 */
export function clearAllCircuits(): void {
  circuits.clear();
}
