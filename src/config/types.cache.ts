/**
 * Prompt Caching Types
 *
 * Defines cache control types, TTL options, and provider configurations
 * for fine-grained prompt caching with breakpoints.
 */

// ============================================================================
// CACHE CONTROL TYPES
// ============================================================================

/**
 * Cache TTL (Time-To-Live) options
 * - 5m: Default, 5-minute cache (1.25× base input price)
 * - 1h: Extended, 1-hour cache (2× base input price)
 */
export type CacheTTL = "5m" | "1h";

/**
 * Cache control configuration for a content block
 */
export interface CacheControl {
  type: "ephemeral";
  ttl?: CacheTTL;
}

/**
 * Cache breakpoint definition
 */
export interface CacheBreakpoint {
  /** Position in the prompt (0 = tools, 1 = system, -1 = messages end) */
  position: number;
  /** TTL for this breakpoint */
  ttl: CacheTTL;
  /** Optional description for debugging */
  description?: string;
}

// ============================================================================
// CACHE METRICS
// ============================================================================

/**
 * Cache performance metrics
 */
export interface CacheMetrics {
  /** Tokens retrieved from cache */
  cacheReadTokens: number;
  /** Tokens written to cache */
  cacheCreationTokens: number;
  /** Tokens not cached (processed fresh) */
  inputTokens: number;
  /** Cache hit rate (0.0 - 1.0) */
  hitRate: number;
  /** Estimated cost savings in USD */
  estimatedSavings: number;
}

/**
 * API usage data from response
 */
export interface APIUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

/**
 * Provider-specific cache pricing (per million tokens)
 */
export interface CachePricing {
  baseInput: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/**
 * Provider-specific cache configuration
 */
export interface ProviderCacheConfig {
  /** Is prompt caching supported? */
  supported: boolean;
  /** Maximum breakpoints per request */
  maxBreakpoints: number;
  /** Minimum tokens required for caching */
  minCacheableTokens: number;
  /** Available TTL options */
  ttlOptions: CacheTTL[];
  /** Beta header required (if any) */
  betaHeader?: string;
  /** Pricing information */
  pricing: CachePricing;
}

/**
 * Provider cache configurations
 *
 * Pricing as of 2026-02-24 (USD per million tokens)
 */
export const PROVIDER_CACHE_CONFIGS: Record<string, ProviderCacheConfig> = {
  // Claude (Anthropic)
  claude: {
    supported: true,
    maxBreakpoints: 4,
    minCacheableTokens: 1024,
    ttlOptions: ["5m", "1h"],
    betaHeader: "prompt-caching-scope-2026-01-05",
    pricing: {
      baseInput: 5, // Opus 4.6 base
      cacheWrite5m: 6.25, // 1.25× base
      cacheWrite1h: 10, // 2× base
      cacheRead: 0.5, // 0.1× base
    },
  },

  // Zhipu (GLM models) - Not supported yet
  zhipu: {
    supported: false,
    maxBreakpoints: 0,
    minCacheableTokens: 0,
    ttlOptions: [],
    pricing: {
      baseInput: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
    },
  },

  // OpenRouter (Gemini, Grok, etc.) - Not supported yet
  openrouter: {
    supported: false,
    maxBreakpoints: 0,
    minCacheableTokens: 0,
    ttlOptions: [],
    pricing: {
      baseInput: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
    },
  },

  // LM Studio (local) - Not applicable
  lmstudio: {
    supported: false,
    maxBreakpoints: 0,
    minCacheableTokens: 0,
    ttlOptions: [],
    pricing: {
      baseInput: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
    },
  },

  // Default/Unknown
  default: {
    supported: false,
    maxBreakpoints: 0,
    minCacheableTokens: 0,
    ttlOptions: [],
    pricing: {
      baseInput: 0,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      cacheRead: 0,
    },
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get cache config for a provider
 */
export function getProviderCacheConfig(provider: string): ProviderCacheConfig {
  return PROVIDER_CACHE_CONFIGS[provider] || PROVIDER_CACHE_CONFIGS["default"];
}

/**
 * Check if provider supports caching
 */
export function isCachingSupported(provider: string): boolean {
  return getProviderCacheConfig(provider).supported;
}

/**
 * Get beta header for provider
 */
export function getCacheBetaHeader(provider: string): string | undefined {
  return getProviderCacheConfig(provider).betaHeader;
}

/**
 * Calculate cache hit rate
 */
export function calculateCacheHitRate(usage: APIUsage): number {
  const total =
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    usage.input_tokens;

  return total > 0 ? (usage.cache_read_input_tokens || 0) / total : 0;
}

/**
 * Calculate estimated cost savings
 */
export function calculateCacheSavings(usage: APIUsage, provider: string): number {
  const pricing = getProviderCacheConfig(provider).pricing;

  // Cost without caching
  const totalTokens =
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    usage.input_tokens;
  const costWithoutCache = (totalTokens * pricing.baseInput) / 1000000;

  // Cost with caching
  const costWithCache =
    ((usage.cache_read_input_tokens || 0) * pricing.cacheRead +
      (usage.cache_creation_input_tokens || 0) * pricing.cacheWrite5m +
      usage.input_tokens * pricing.baseInput) /
    1000000;

  return costWithoutCache - costWithCache;
}

/**
 * Validate TTL ordering (longer TTLs must come first)
 */
export function validateTTLOrdering(ttls: CacheTTL[]): boolean {
  let lastTTL: CacheTTL | null = null;

  for (const ttl of ttls) {
    if (lastTTL === "5m" && ttl === "1h") {
      return false; // 1h cannot come after 5m
    }
    lastTTL = ttl;
  }

  return true;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CacheTTL,
  CacheControl,
  CacheBreakpoint,
  CacheMetrics,
  APIUsage,
  CachePricing,
  ProviderCacheConfig,
  PROVIDER_CACHE_CONFIGS,
  getProviderCacheConfig,
  isCachingSupported,
  getCacheBetaHeader,
  calculateCacheHitRate,
  calculateCacheSavings,
  validateTTLOrdering,
};
