/**
 * Rate Limiter Implementation
 *
 * Implements token bucket rate limiting with cubic backoff.
 * Extracted from Claude Code v2.1.50
 */

import type {
  RateLimitConfig,
  RateLimitStatus,
  RateLimiter,
  TokenBucketState,
  TokenBucketConfig,
  RetryStrategy,
  RetryToken,
  RetryDecision,
  RetryStrategyConfig,
  CubicBackoffState,
  CubicBackoffConfig,
} from "./rate-limiter.types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  DEFAULT_RATE_LIMIT_CONSTANTS,
  THROTTLING_ERROR_NAMES,
  TRANSIENT_ERROR_CODES,
  RETRYABLE_STATUS_CODES,
} from "./rate-limiter.types.js";

const log = createSubsystemLogger("rate-limiter");

// ============================================================================
// DEFAULT RATE LIMITER (TOKEN BUCKET WITH CUBIC BACKOFF)
// ============================================================================

/**
 * Default Rate Limiter
 *
 * Implements token bucket algorithm with cubic backoff for adaptive rate limiting.
 * Based on AWS SDK's DefaultRateLimiter.
 */
export class DefaultRateLimiter implements RateLimiter {
  // Configuration
  private beta: number;
  private minCapacity: number;
  private minFillRate: number;
  private scaleConstant: number;
  private smooth: number;

  // Token bucket state
  private currentCapacity: number = 0;
  private enabled: boolean = false;
  private lastMaxRate: number = 0;
  private measuredTxRate: number = 0;
  private requestCount: number = 0;
  private fillRate: number;
  private lastThrottleTime: number;
  private lastTimestamp: number = 0;
  private lastTxRateBucket: number;
  private maxCapacity: number;
  private timeWindow: number = 0;

  // Rate limit tracking
  private rateLimitType: string | null = null;
  private rateLimitResetsAt: Date | null = null;
  private rateLimitUtilization: number = 0;

  constructor(config?: Partial<CubicBackoffConfig>) {
    this.beta = config?.beta ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_CUBIC_BETA;
    this.minCapacity = config?.minCapacity ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_MIN_CAPACITY;
    this.minFillRate = config?.minFillRate ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_MIN_FILL_RATE;
    this.scaleConstant = config?.scaleConstant ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_CUBIC_SCALE;
    this.smooth = config?.smooth ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_SMOOTH;

    const now = this.getCurrentTimeInSeconds();
    this.lastThrottleTime = now;
    this.lastTxRateBucket = Math.floor(now);
    this.fillRate = this.minFillRate;
    this.maxCapacity = this.minCapacity;
  }

  /**
   * Get current time in seconds
   */
  private getCurrentTimeInSeconds(): number {
    return Date.now() / 1000;
  }

  /**
   * Get send token (wait if necessary)
   */
  async getSendToken(): Promise<void> {
    return this.acquireTokenBucket(1);
  }

  /**
   * Acquire tokens from bucket
   */
  private async acquireTokenBucket(tokens: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.refillTokenBucket();

    if (tokens > this.currentCapacity) {
      const waitMs = ((tokens - this.currentCapacity) / this.fillRate) * 1000;
      log.debug(`Rate limited: waiting ${waitMs}ms for token bucket refill`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.currentCapacity = this.currentCapacity - tokens;
  }

  /**
   * Refill token bucket based on elapsed time
   */
  private refillTokenBucket(): void {
    const now = this.getCurrentTimeInSeconds();

    if (!this.lastTimestamp) {
      this.lastTimestamp = now;
      return;
    }

    const elapsed = now - this.lastTimestamp;
    const refill = elapsed * this.fillRate;

    this.currentCapacity = Math.min(this.maxCapacity, this.currentCapacity + refill);
    this.lastTimestamp = now;
  }

  /**
   * Update client sending rate based on response
   */
  updateClientSendingRate(response: unknown): void {
    let newRate: number;

    this.updateMeasuredRate();

    if (this.isThrottlingError(response)) {
      const rateToUse = !this.enabled
        ? this.measuredTxRate
        : Math.min(this.measuredTxRate, this.fillRate);

      this.lastMaxRate = rateToUse;
      this.calculateTimeWindow();
      this.lastThrottleTime = this.getCurrentTimeInSeconds();
      newRate = this.cubicThrottle(rateToUse);
      this.enableTokenBucket();

      log.warn(`Throttled: reducing rate to ${newRate.toFixed(2)} req/s`);
    } else {
      this.calculateTimeWindow();
      newRate = this.cubicSuccess(this.getCurrentTimeInSeconds());
    }

    // Cap at 2x measured rate
    const cappedRate = Math.min(newRate, 2 * this.measuredTxRate);
    this.updateTokenBucketRate(cappedRate);
  }

  /**
   * Calculate time window for cubic algorithm
   */
  private calculateTimeWindow(): void {
    this.timeWindow = this.getPrecise(
      Math.pow((this.lastMaxRate * (1 - this.beta)) / this.scaleConstant, 0.3333333333333333),
    );
  }

  /**
   * Cubic throttle function
   */
  private cubicThrottle(rate: number): number {
    return this.getPrecise(rate * this.beta);
  }

  /**
   * Cubic success function
   */
  private cubicSuccess(time: number): number {
    return this.getPrecise(
      this.scaleConstant * Math.pow(time - this.lastThrottleTime - this.timeWindow, 3) +
        this.lastMaxRate,
    );
  }

  /**
   * Enable token bucket
   */
  private enableTokenBucket(): void {
    this.enabled = true;
  }

  /**
   * Update token bucket rate
   */
  private updateTokenBucketRate(newRate: number): void {
    this.refillTokenBucket();
    this.fillRate = Math.max(newRate, this.minFillRate);
    this.maxCapacity = Math.max(newRate, this.minCapacity);
    this.currentCapacity = Math.min(this.currentCapacity, this.maxCapacity);
  }

  /**
   * Update measured transmission rate
   */
  private updateMeasuredRate(): void {
    const now = this.getCurrentTimeInSeconds();
    const bucket = Math.floor(now * 2) / 2; // 0.5 second buckets

    this.requestCount++;

    if (bucket > this.lastTxRateBucket) {
      const rate = this.requestCount / (bucket - this.lastTxRateBucket);
      this.measuredTxRate = this.getPrecise(
        rate * this.smooth + this.measuredTxRate * (1 - this.smooth),
      );
      this.requestCount = 0;
      this.lastTxRateBucket = bucket;
    }
  }

  /**
   * Get precise number (8 decimal places)
   */
  private getPrecise(value: number): number {
    return parseFloat(value.toFixed(8));
  }

  /**
   * Check if response is a throttling error
   */
  private isThrottlingError(response: unknown): boolean {
    if (!response) return false;

    const error = response as Record<string, unknown>;

    // Check HTTP status code
    const statusCode = (error.$metadata as Record<string, number>)?.httpStatusCode;
    if (statusCode === 429) return true;

    // Check error name
    const name = error.name as string;
    if (THROTTLING_ERROR_NAMES.includes(name as (typeof THROTTLING_ERROR_NAMES)[number])) {
      return true;
    }

    // Check retryable trait
    const retryable = error.$retryable as Record<string, unknown>;
    if (retryable?.throttling === true) return true;

    return false;
  }

  /**
   * Check if rate limited
   */
  isRateLimited(): boolean {
    return this.enabled && this.currentCapacity < 1;
  }

  /**
   * Get current rate limit status
   */
  getStatus(): RateLimitStatus {
    const utilization = this.enabled ? 1 - this.currentCapacity / this.maxCapacity : 0;

    return {
      type: "custom",
      utilization: Math.max(0, Math.min(1, utilization)),
      resetsAt: this.rateLimitResetsAt || undefined,
      exceeded: this.isRateLimited(),
      approaching: utilization > 0.8,
      message: this.getStatusMessage(),
    };
  }

  /**
   * Get status message
   */
  private getStatusMessage(): string {
    if (!this.enabled) {
      return "Rate limiting not active";
    }

    const utilizationPct = Math.floor((1 - this.currentCapacity / this.maxCapacity) * 100);

    if (this.isRateLimited()) {
      return `Rate limited (${utilizationPct}% utilized)`;
    }

    if (utilizationPct > 80) {
      return `Approaching rate limit (${utilizationPct}% utilized)`;
    }

    return `Rate limit: ${utilizationPct}% utilized`;
  }

  /**
   * Reset rate limiter
   */
  reset(): void {
    this.enabled = false;
    this.currentCapacity = 0;
    this.measuredTxRate = 0;
    this.requestCount = 0;
    this.lastMaxRate = 0;
    this.fillRate = this.minFillRate;
    this.maxCapacity = this.minCapacity;
    this.rateLimitType = null;
    this.rateLimitResetsAt = null;
    this.rateLimitUtilization = 0;

    log.info("Rate limiter reset");
  }
}

// ============================================================================
// STANDARD RETRY STRATEGY
// ============================================================================

/**
 * Standard Retry Strategy
 *
 * Implements exponential backoff with jitter.
 */
export class StandardRetryStrategy implements RetryStrategy {
  private maxAttempts: number;
  private baseDelayMs: number;
  private maxDelayMs: number;
  private backoffMultiplier: number;
  private jitterFactor: number;
  private capacity: number;

  constructor(config?: Partial<RetryStrategyConfig>) {
    this.maxAttempts = config?.maxAttempts ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = config?.baseDelayMs ?? DEFAULT_RATE_LIMIT_CONSTANTS.DEFAULT_RETRY_DELAY_BASE;
    this.maxDelayMs = config?.maxDelayMs ?? DEFAULT_RATE_LIMIT_CONSTANTS.MAXIMUM_RETRY_DELAY;
    this.backoffMultiplier = config?.backoffMultiplier ?? 2;
    this.jitterFactor = 0.2; // 20% jitter
    this.capacity = DEFAULT_RATE_LIMIT_CONSTANTS.INITIAL_RETRY_TOKENS;
  }

  async acquireInitialRetryToken(context?: unknown): Promise<RetryToken> {
    return this.createToken(0, 0, 0);
  }

  async refreshRetryTokenForRetry(token: RetryToken, error: unknown): Promise<RetryToken> {
    const retryCount = token.getRetryCount() + 1;
    const delayMs = this.calculateDelay(retryCount);
    const cost = this.getRetryCost(error);

    return this.createToken(retryCount, delayMs, cost);
  }

  recordSuccess(token: RetryToken): void {
    // Refill capacity on success
    this.capacity = Math.min(
      DEFAULT_RATE_LIMIT_CONSTANTS.INITIAL_RETRY_TOKENS,
      this.capacity + DEFAULT_RATE_LIMIT_CONSTANTS.NO_RETRY_INCREMENT,
    );
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateDelay(retryCount: number): number {
    // Exponential backoff
    const exponentialDelay = this.baseDelayMs * Math.pow(this.backoffMultiplier, retryCount);

    // Add jitter
    const jitter = exponentialDelay * this.jitterFactor * Math.random();

    // Cap at max delay
    return Math.min(this.maxDelayMs, Math.floor(exponentialDelay + jitter));
  }

  /**
   * Get cost of retry based on error type
   */
  private getRetryCost(error: unknown): number {
    const err = error as Record<string, unknown>;
    if (err?.name === "TimeoutError") {
      return DEFAULT_RATE_LIMIT_CONSTANTS.TIMEOUT_RETRY_COST;
    }
    return DEFAULT_RATE_LIMIT_CONSTANTS.RETRY_COST;
  }

  /**
   * Check if retry is possible
   */
  hasRetryTokens(error: unknown): boolean {
    const cost = this.getRetryCost(error);
    return this.capacity >= cost;
  }

  /**
   * Create retry token
   */
  private createToken(retryCount: number, delayMs: number, cost: number): RetryToken {
    return {
      getRetryCount: () => retryCount,
      getRetryDelay: () => delayMs,
      getRetryCost: () => cost,
    };
  }
}

// ============================================================================
// ADAPTIVE RETRY STRATEGY
// ============================================================================

/**
 * Adaptive Retry Strategy
 *
 * Combines standard retry with rate limiting.
 */
export class AdaptiveRetryStrategy extends StandardRetryStrategy {
  private rateLimiter: DefaultRateLimiter;

  constructor(config?: Partial<RetryStrategyConfig>) {
    super(config);
    this.rateLimiter = new DefaultRateLimiter();
  }

  async acquireInitialRetryToken(context?: unknown): Promise<RetryToken> {
    await this.rateLimiter.getSendToken();
    return super.acquireInitialRetryToken(context);
  }

  async refreshRetryTokenForRetry(token: RetryToken, error: unknown): Promise<RetryToken> {
    this.rateLimiter.updateClientSendingRate(error);
    return super.refreshRetryTokenForRetry(token, error);
  }

  recordSuccess(token: RetryToken): void {
    this.rateLimiter.updateClientSendingRate({});
    super.recordSuccess(token);
  }

  getRateLimiter(): DefaultRateLimiter {
    return this.rateLimiter;
  }
}

// ============================================================================
// RETRY HELPERS
// ============================================================================

/**
 * Check if error is a throttling error
 */
export function isThrottlingError(error: unknown): boolean {
  if (!error) return false;

  const err = error as Record<string, unknown>;

  // Check HTTP status code
  const statusCode = (err.$metadata as Record<string, number>)?.httpStatusCode;
  if (statusCode === 429) return true;

  // Check error name
  const name = err.name as string;
  if (THROTTLING_ERROR_NAMES.includes(name as (typeof THROTTLING_ERROR_NAMES)[number])) {
    return true;
  }

  // Check retryable trait
  const retryable = err.$retryable as Record<string, unknown>;
  if (retryable?.throttling === true) return true;

  return false;
}

/**
 * Check if error is transient (retryable)
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  const err = error as Record<string, unknown>;

  // Check error codes
  const code = err.code as string;
  if (TRANSIENT_ERROR_CODES.includes(code as (typeof TRANSIENT_ERROR_CODES)[number])) {
    return true;
  }

  // Check HTTP status codes
  const statusCode = (err.$metadata as Record<string, number>)?.httpStatusCode;
  if (RETRYABLE_STATUS_CODES.includes(statusCode as (typeof RETRYABLE_STATUS_CODES)[number])) {
    return true;
  }

  // Check error names
  const name = err.name as string;
  if (["TimeoutError", "RequestTimeout", "RequestTimeoutException"].includes(name)) {
    return true;
  }

  // Check retryable trait
  const retryable = err.$retryable as Record<string, unknown>;
  if (retryable !== undefined) return true;

  return false;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return isThrottlingError(error) || isTransientError(error);
}

/**
 * Parse Retry-After header
 */
export function parseRetryAfter(header: string | undefined): number {
  if (!header) return 0;

  // Check if it's a number (seconds)
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Check if it's a date
  const date = new Date(header);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return 0;
}

/**
 * Create default retry decision
 */
export function createRetryDecision(
  shouldRetry: boolean,
  attempt: number,
  maxAttempts: number,
  delayMs: number,
  reason: string,
): RetryDecision {
  return {
    shouldRetry,
    delayMs,
    attempt,
    maxAttempts,
    reason,
  };
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalRateLimiter: DefaultRateLimiter | null = null;

/**
 * Get global rate limiter
 */
export function getRateLimiter(): DefaultRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new DefaultRateLimiter();
  }
  return globalRateLimiter;
}

/**
 * Reset global rate limiter
 */
export function resetRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.reset();
  }
  globalRateLimiter = null;
}
