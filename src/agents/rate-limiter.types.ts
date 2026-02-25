/**
 * Rate Limiter Types
 *
 * Types for API rate limiting and throttling.
 * Extracted from Claude Code v2.1.50
 */

// ============================================================================
// RATE LIMIT TYPES
// ============================================================================

/**
 * Rate limit type identifier
 */
export type RateLimitType =
  | "five_hour" // Session limit
  | "seven_day" // Weekly limit
  | "seven_day_opus" // Opus-specific weekly limit
  | "seven_day_sonnet" // Sonnet-specific weekly limit
  | "overage" // Extra usage
  | "request" // Per-request limit
  | "token" // Token-based limit
  | "custom"; // Custom limit

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Type of rate limit */
  type: RateLimitType;
  /** Current utilization (0-1) */
  utilization?: number;
  /** When the limit resets */
  resetsAt?: Date;
  /** Whether limit is exceeded */
  exceeded: boolean;
  /** Whether approaching limit (>80%) */
  approaching: boolean;
  /** Human-readable message */
  message?: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests?: number;
  /** Maximum tokens per window */
  maxTokens?: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Minimum delay between requests (ms) */
  minDelay?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs?: number;
  /** Maximum delay for exponential backoff (ms) */
  maxDelayMs?: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Jitter factor (0-1) */
  jitterFactor?: number;
}

/**
 * Throttling error types
 */
export const THROTTLING_ERROR_NAMES = [
  "BandwidthLimitExceeded",
  "EC2ThrottledException",
  "LimitExceededException",
  "PriorRequestNotComplete",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "RequestThrottled",
  "RequestThrottledException",
  "SlowDown",
  "ThrottledException",
  "Throttling",
  "ThrottlingException",
  "TooManyRequestsException",
  "TransactionInProgressException",
] as const;

/**
 * Transient error types (retryable)
 */
export const TRANSIENT_ERROR_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
] as const;

/**
 * Retryable HTTP status codes
 */
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504] as const;

// ============================================================================
// TOKEN BUCKET TYPES
// ============================================================================

/**
 * Token bucket state
 */
export interface TokenBucketState {
  /** Current token count */
  tokens: number;
  /** Maximum token capacity */
  maxCapacity: number;
  /** Token fill rate per second */
  fillRate: number;
  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Token bucket configuration
 */
export interface TokenBucketConfig {
  /** Maximum token capacity */
  maxCapacity: number;
  /** Token fill rate per second */
  fillRate: number;
  /** Initial token count */
  initialTokens?: number;
  /** Minimum fill rate when throttled */
  minFillRate?: number;
  /** Minimum capacity when throttled */
  minCapacity?: number;
}

// ============================================================================
// RETRY TYPES
// ============================================================================

/**
 * Retry decision
 */
export interface RetryDecision {
  /** Whether to retry */
  shouldRetry: boolean;
  /** Delay before retry (ms) */
  delayMs: number;
  /** Current attempt number */
  attempt: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Reason for decision */
  reason: string;
}

/**
 * Retry strategy type
 */
export type RetryStrategyType = "standard" | "adaptive" | "exponential";

/**
 * Retry strategy configuration
 */
export interface RetryStrategyConfig {
  /** Strategy type */
  type: RetryStrategyType;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier for exponential */
  backoffMultiplier?: number;
  /** Cubic throttling beta (0-1) */
  cubicBeta?: number;
  /** Cubic scale constant */
  cubicScaleConstant?: number;
  /** Smoothing factor for rate measurement */
  smoothingFactor?: number;
}

// ============================================================================
// CUBIC BACKOFF TYPES
// ============================================================================

/**
 * Cubic backoff state
 */
export interface CubicBackoffState {
  /** Last measured transmission rate */
  measuredTxRate: number;
  /** Last maximum rate before throttle */
  lastMaxRate: number;
  /** Time of last throttle */
  lastThrottleTime: number;
  /** Calculated time window */
  timeWindow: number;
  /** Whether throttling is active */
  isThrottled: boolean;
  /** Current fill rate */
  currentFillRate: number;
}

/**
 * Cubic backoff configuration
 */
export interface CubicBackoffConfig {
  /** Beta factor (default 0.7) */
  beta: number;
  /** Scale constant (default 0.4) */
  scaleConstant: number;
  /** Smoothing factor (default 0.8) */
  smooth: number;
  /** Minimum fill rate */
  minFillRate: number;
  /** Minimum capacity */
  minCapacity: number;
}

// ============================================================================
// RATE LIMITER INTERFACE
// ============================================================================

/**
 * Rate limiter interface
 */
export interface RateLimiter {
  /** Get token to send request */
  getSendToken(): Promise<void>;
  /** Update rate based on response */
  updateClientSendingRate(response: unknown): void;
  /** Check if rate limited */
  isRateLimited(): boolean;
  /** Get current status */
  getStatus(): RateLimitStatus;
  /** Reset limiter */
  reset(): void;
}

/**
 * Retry strategy interface
 */
export interface RetryStrategy {
  /** Acquire initial retry token */
  acquireInitialRetryToken(context?: unknown): Promise<RetryToken>;
  /** Refresh token for retry */
  refreshRetryTokenForRetry(token: RetryToken, error: unknown): Promise<RetryToken>;
  /** Record success */
  recordSuccess(token: RetryToken): void;
}

/**
 * Retry token
 */
export interface RetryToken {
  /** Get retry count */
  getRetryCount(): number;
  /** Get retry delay */
  getRetryDelay(): number;
  /** Get retry cost */
  getRetryCost(): number;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/**
 * Default rate limiter constants
 */
export const DEFAULT_RATE_LIMIT_CONSTANTS = {
  /** Default maximum retry attempts */
  DEFAULT_MAX_ATTEMPTS: 3,
  /** Default retry delay base (ms) */
  DEFAULT_RETRY_DELAY_BASE: 100,
  /** Maximum retry delay (ms) */
  MAXIMUM_RETRY_DELAY: 20000,
  /** Throttling retry delay base (ms) */
  THROTTLING_RETRY_DELAY_BASE: 500,
  /** Initial retry tokens */
  INITIAL_RETRY_TOKENS: 500,
  /** Cost of a retry */
  RETRY_COST: 5,
  /** Cost of a timeout retry */
  TIMEOUT_RETRY_COST: 10,
  /** No retry increment */
  NO_RETRY_INCREMENT: 1,
  /** Default cubic beta */
  DEFAULT_CUBIC_BETA: 0.7,
  /** Default cubic scale constant */
  DEFAULT_CUBIC_SCALE: 0.4,
  /** Default smoothing factor */
  DEFAULT_SMOOTH: 0.8,
  /** Default minimum fill rate */
  DEFAULT_MIN_FILL_RATE: 0.5,
  /** Default minimum capacity */
  DEFAULT_MIN_CAPACITY: 1,
} as const;
