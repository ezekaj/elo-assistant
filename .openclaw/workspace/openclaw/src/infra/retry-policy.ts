/**
 * Enhanced Retry Policy with Adaptive Rate Limiting
 *
 * Combines simple retry with advanced token bucket rate limiting.
 * Provides proactive rate limit prevention + reactive retry handling.
 *
 * @module @openclaw/retry-policy
 */

import { RateLimitError } from "@buape/carbon";
import {
  DefaultRateLimiter,
  AdaptiveRetryStrategy,
  isThrottlingError,
  isTransientError,
} from "../agents/rate-limiter.js";
import { formatErrorMessage } from "./errors.js";
import { type RetryConfig, resolveRetryConfig, retryAsync } from "./retry.js";

export type RetryRunner = <T>(fn: () => Promise<T>, label?: string) => Promise<T>;

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DISCORD_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 0.1,
};

export const TELEGRAM_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 400,
  maxDelayMs: 30_000,
  jitter: 0.1,
};

export const GATEWAY_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 300,
  maxDelayMs: 20_000,
  jitter: 0.15,
};

export const WEBFETCH_RETRY_DEFAULTS = {
  attempts: 3,
  minDelayMs: 200,
  maxDelayMs: 15_000,
  jitter: 0.2,
};

const TELEGRAM_RETRY_RE = /429|timeout|connect|reset|closed|unavailable|temporarily/i;

// ============================================================================
// GLOBAL RATE LIMITERS (Singleton per service)
// ============================================================================

const rateLimiters = new Map<string, AdaptiveRetryStrategy>();

/**
 * Get or create adaptive rate limiter for a service
 */
function getRateLimiter(service: string): AdaptiveRetryStrategy {
  if (!rateLimiters.has(service)) {
    rateLimiters.set(
      service,
      new AdaptiveRetryStrategy({
        maxAttempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 30000,
      }),
    );
  }
  return rateLimiters.get(service)!;
}

/**
 * Reset rate limiter for a service
 */
export function resetRateLimiter(service: string): void {
  const limiter = rateLimiters.get(service);
  if (limiter) {
    limiter.getRateLimiter().reset();
  }
}

/**
 * Reset all rate limiters
 */
export function resetAllRateLimiters(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.getRateLimiter().reset();
  }
  rateLimiters.clear();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTelegramRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const candidate =
    "parameters" in err && err.parameters && typeof err.parameters === "object"
      ? (err.parameters as { retry_after?: unknown }).retry_after
      : "response" in err &&
          err.response &&
          typeof err.response === "object" &&
          "parameters" in err.response
        ? (
            err.response as {
              parameters?: { retry_after?: unknown };
            }
          ).parameters?.retry_after
        : "error" in err && err.error && typeof err.error === "object" && "parameters" in err.error
          ? (err.error as { parameters?: { retry_after?: unknown } }).parameters?.retry_after
          : undefined;
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate * 1000 : undefined;
}

function isTelegramRetryable(err: unknown): boolean {
  return TELEGRAM_RETRY_RE.test(formatErrorMessage(err));
}

// ============================================================================
// ENHANCED RETRY RUNNERS (with adaptive rate limiting)
// ============================================================================

/**
 * Create Discord retry runner with adaptive rate limiting
 *
 * Features:
 * - Proactive rate limiting (token bucket)
 * - Reactive retry (exponential backoff)
 * - Automatic adaptation to rate limits
 * - Retry-After header support
 */
export function createDiscordRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
  useAdaptive?: boolean; // Enable adaptive rate limiting
}): RetryRunner {
  const useAdaptive = params.useAdaptive ?? true; // Default to adaptive

  if (!useAdaptive) {
    // Fall back to simple retry (legacy behavior)
    const retryConfig = resolveRetryConfig(DISCORD_RETRY_DEFAULTS, {
      ...params.configRetry,
      ...params.retry,
    });
    return <T>(fn: () => Promise<T>, label?: string) =>
      retryAsync(fn, {
        ...retryConfig,
        label,
        shouldRetry: (err) => err instanceof RateLimitError,
        retryAfterMs: (err) => (err instanceof RateLimitError ? err.retryAfter * 1000 : undefined),
        onRetry: params.verbose
          ? (info) => {
              const labelText = info.label ?? "request";
              const maxRetries = Math.max(1, info.maxAttempts - 1);
              console.warn(
                `discord ${labelText} rate limited, retry ${info.attempt}/${maxRetries} in ${info.delayMs}ms`,
              );
            }
          : undefined,
      });
  }

  // Use adaptive rate limiting (new default)
  const rateLimiter = getRateLimiter("discord");
  const retryConfig = resolveRetryConfig(DISCORD_RETRY_DEFAULTS, {
    ...params.configRetry,
    ...params.retry,
  });

  return async <T>(fn: () => Promise<T>, label?: string): Promise<T> => {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
      try {
        // Acquire token from rate limiter (proactive)
        await rateLimiter.acquireInitialRetryToken();

        // Execute request
        const result = await fn();

        // Record success (adaptive learning)
        rateLimiter.recordSuccess({
          getRetryCount: () => attempt - 1,
          getRetryDelay: () => 0,
          getRetryCost: () => 1,
        });

        return result;
      } catch (err) {
        lastErr = err;

        // Update rate limiter based on error (adaptive learning)
        rateLimiter.refreshRetryTokenForRetry(
          {
            getRetryCount: () => attempt,
            getRetryDelay: () => 0,
            getRetryCost: () => 1,
          },
          err,
        );

        // Check if we should retry
        const isRateLimit = err instanceof RateLimitError;
        const isTransient = isTransientError(err);

        if (attempt >= retryConfig.attempts || (!isRateLimit && !isTransient)) {
          break;
        }

        // Calculate delay
        let delayMs: number;
        if (isRateLimit) {
          delayMs = (err as RateLimitError).retryAfter * 1000;
        } else {
          const baseDelay = retryConfig.minDelayMs * Math.pow(2, attempt - 1);
          const jitter = baseDelay * retryConfig.jitter * Math.random();
          delayMs = Math.min(baseDelay + jitter, retryConfig.maxDelayMs);
        }

        if (params.verbose) {
          const labelText = label ?? "request";
          const maxRetries = Math.max(1, retryConfig.attempts - 1);
          console.warn(
            `discord ${labelText} rate limited, retry ${attempt}/${maxRetries} in ${delayMs}ms`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastErr ?? new Error("Retry failed");
  };
}

/**
 * Create Telegram retry runner with adaptive rate limiting
 *
 * Features:
 * - Proactive rate limiting (token bucket)
 * - Reactive retry (exponential backoff)
 * - Automatic adaptation to rate limits
 * - Retry-After header support (Telegram API)
 */
export function createTelegramRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
  useAdaptive?: boolean; // Enable adaptive rate limiting
}): RetryRunner {
  const useAdaptive = params.useAdaptive ?? true; // Default to adaptive

  if (!useAdaptive) {
    // Fall back to simple retry (legacy behavior)
    const retryConfig = resolveRetryConfig(TELEGRAM_RETRY_DEFAULTS, {
      ...params.configRetry,
      ...params.retry,
    });
    const shouldRetry = params.shouldRetry
      ? (err: unknown) => params.shouldRetry?.(err) || isTelegramRetryable(err)
      : (err: unknown) => isTelegramRetryable(err);

    return <T>(fn: () => Promise<T>, label?: string) =>
      retryAsync(fn, {
        ...retryConfig,
        label,
        shouldRetry,
        retryAfterMs: getTelegramRetryAfterMs,
        onRetry: params.verbose
          ? (info) => {
              const maxRetries = Math.max(1, info.maxAttempts - 1);
              console.warn(
                `telegram send retry ${info.attempt}/${maxRetries} for ${info.label ?? label ?? "request"} in ${info.delayMs}ms: ${formatErrorMessage(info.err)}`,
              );
            }
          : undefined,
      });
  }

  // Use adaptive rate limiting (new default)
  const rateLimiter = getRateLimiter("telegram");
  const retryConfig = resolveRetryConfig(TELEGRAM_RETRY_DEFAULTS, {
    ...params.configRetry,
    ...params.retry,
  });

  return async <T>(fn: () => Promise<T>, label?: string): Promise<T> => {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
      try {
        // Acquire token from rate limiter (proactive)
        await rateLimiter.acquireInitialRetryToken();

        // Execute request
        const result = await fn();

        // Record success (adaptive learning)
        rateLimiter.recordSuccess({
          getRetryCount: () => attempt - 1,
          getRetryDelay: () => 0,
          getRetryCost: () => 1,
        });

        return result;
      } catch (err) {
        lastErr = err;

        // Update rate limiter based on error (adaptive learning)
        rateLimiter.refreshRetryTokenForRetry(
          {
            getRetryCount: () => attempt,
            getRetryDelay: () => 0,
            getRetryCost: () => 1,
          },
          err,
        );

        // Check if we should retry
        const isRetryable = isTelegramRetryable(err);

        if (attempt >= retryConfig.attempts || !isRetryable) {
          break;
        }

        // Calculate delay
        let delayMs = getTelegramRetryAfterMs(err);
        if (delayMs === undefined) {
          const baseDelay = retryConfig.minDelayMs * Math.pow(2, attempt - 1);
          const jitter = baseDelay * retryConfig.jitter * Math.random();
          delayMs = Math.min(baseDelay + jitter, retryConfig.maxDelayMs);
        }

        if (params.verbose) {
          const maxRetries = Math.max(1, retryConfig.attempts - 1);
          console.warn(
            `telegram send retry ${attempt}/${maxRetries} for ${label ?? "request"} in ${delayMs}ms: ${formatErrorMessage(err)}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastErr ?? new Error("Retry failed");
  };
}

/**
 * Create Gateway retry runner with adaptive rate limiting
 */
export function createGatewayRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
  useAdaptive?: boolean;
}): RetryRunner {
  const useAdaptive = params.useAdaptive ?? true;

  if (!useAdaptive) {
    const retryConfig = resolveRetryConfig(GATEWAY_RETRY_DEFAULTS, {
      ...params.configRetry,
      ...params.retry,
    });
    return <T>(fn: () => Promise<T>, label?: string) =>
      retryAsync(fn, {
        ...retryConfig,
        label,
      });
  }

  const rateLimiter = getRateLimiter("gateway");
  const retryConfig = resolveRetryConfig(GATEWAY_RETRY_DEFAULTS, {
    ...params.configRetry,
    ...params.retry,
  });

  return async <T>(fn: () => Promise<T>, label?: string): Promise<T> => {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
      try {
        await rateLimiter.acquireInitialRetryToken();
        const result = await fn();
        rateLimiter.recordSuccess({
          getRetryCount: () => attempt - 1,
          getRetryDelay: () => 0,
          getRetryCost: () => 1,
        });
        return result;
      } catch (err) {
        lastErr = err;
        rateLimiter.refreshRetryTokenForRetry(
          {
            getRetryCount: () => attempt,
            getRetryDelay: () => 0,
            getRetryCost: () => 1,
          },
          err,
        );

        if (attempt >= retryConfig.attempts || !isTransientError(err)) {
          break;
        }

        const baseDelay = retryConfig.minDelayMs * Math.pow(2, attempt - 1);
        const jitter = baseDelay * retryConfig.jitter * Math.random();
        const delayMs = Math.min(baseDelay + jitter, retryConfig.maxDelayMs);

        if (params.verbose) {
          console.warn(
            `gateway ${label ?? "request"} retry ${attempt}/${retryConfig.attempts} in ${delayMs}ms`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastErr ?? new Error("Retry failed");
  };
}

/**
 * Create WebFetch retry runner with adaptive rate limiting
 */
export function createWebFetchRetryRunner(params: {
  retry?: RetryConfig;
  configRetry?: RetryConfig;
  verbose?: boolean;
  useAdaptive?: boolean;
}): RetryRunner {
  const useAdaptive = params.useAdaptive ?? true;

  if (!useAdaptive) {
    const retryConfig = resolveRetryConfig(WEBFETCH_RETRY_DEFAULTS, {
      ...params.configRetry,
      ...params.retry,
    });
    return <T>(fn: () => Promise<T>, label?: string) =>
      retryAsync(fn, {
        ...retryConfig,
        label,
      });
  }

  const rateLimiter = getRateLimiter("webfetch");
  const retryConfig = resolveRetryConfig(WEBFETCH_RETRY_DEFAULTS, {
    ...params.configRetry,
    ...params.retry,
  });

  return async <T>(fn: () => Promise<T>, label?: string): Promise<T> => {
    let lastErr: unknown;

    for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
      try {
        await rateLimiter.acquireInitialRetryToken();
        const result = await fn();
        rateLimiter.recordSuccess({
          getRetryCount: () => attempt - 1,
          getRetryDelay: () => 0,
          getRetryCost: () => 1,
        });
        return result;
      } catch (err) {
        lastErr = err;
        rateLimiter.refreshRetryTokenForRetry(
          {
            getRetryCount: () => attempt,
            getRetryDelay: () => 0,
            getRetryCost: () => 1,
          },
          err,
        );

        if (attempt >= retryConfig.attempts || !isTransientError(err)) {
          break;
        }

        const baseDelay = retryConfig.minDelayMs * Math.pow(2, attempt - 1);
        const jitter = baseDelay * retryConfig.jitter * Math.random();
        const delayMs = Math.min(baseDelay + jitter, retryConfig.maxDelayMs);

        if (params.verbose) {
          console.warn(
            `webfetch ${label ?? "request"} retry ${attempt}/${retryConfig.attempts} in ${delayMs}ms`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastErr ?? new Error("Retry failed");
  };
}

// ============================================================================
// EXPORTS FOR DIRECT RATE LIMITER ACCESS
// ============================================================================

export {
  DefaultRateLimiter,
  AdaptiveRetryStrategy,
  isThrottlingError,
  isTransientError,
  isRetryableError,
} from "../agents/rate-limiter.js";

export type {
  RateLimitStatus,
  RateLimitConfig,
  RetryStrategyConfig,
} from "../agents/rate-limiter.types.js";
