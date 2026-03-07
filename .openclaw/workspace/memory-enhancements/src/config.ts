/**
 * OpenClaw Memory Enhancements - Configuration
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  EnhancedSearchConfig,
  HybridSearchConfig,
  TemporalConfig,
  RerankConfig,
  AutoIndexConfig,
  EmbeddingConfig,
  QueryConfig,
} from "./types.js";

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_HYBRID_CONFIG: HybridSearchConfig = {
  enabled: true,
  vectorWeight: 0.6,
  bm25Weight: 0.4,
  rrfK: 60,
  candidateMultiplier: 4,
};

export const DEFAULT_TEMPORAL_CONFIG: TemporalConfig = {
  enabled: true,
  decayProfile: "moderate",
  minWeight: 0.3,
};

export const DEFAULT_RERANK_CONFIG: RerankConfig = {
  enabled: true,
  provider: "llm",
  candidateCount: 20,
  finalCount: 6,
  model: "qwen2.5-coder-1.5b-instruct", // Small model for local reranking
  timeoutMs: 30000,
  minScore: 0.1,
};

export const DEFAULT_AUTO_INDEX_CONFIG: AutoIndexConfig = {
  enabled: true,
  watchPaths: [join(homedir(), ".openclaw", "workspace")],
  debounceMs: 1500,
  ignorePatterns: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/*.min.*",
  ],
  maxFileSizeBytes: 1024 * 1024, // 1MB
  extensions: [".md"],
};

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: "openai",
  model: "text-embedding-nomic-embed-text-v1.5",
  baseUrl: "http://127.0.0.1:1234/v1",
  apiKey: "lm-studio",
  dimensions: 768,
};

export const DEFAULT_QUERY_CONFIG: QueryConfig = {
  maxResults: 6,
  minScore: 0.35,
  sources: ["memory", "sessions"],
};

export const DEFAULT_CONFIG: EnhancedSearchConfig = {
  hybrid: DEFAULT_HYBRID_CONFIG,
  temporal: DEFAULT_TEMPORAL_CONFIG,
  rerank: DEFAULT_RERANK_CONFIG,
  autoIndex: DEFAULT_AUTO_INDEX_CONFIG,
  embedding: DEFAULT_EMBEDDING_CONFIG,
  query: DEFAULT_QUERY_CONFIG,
};

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Resolve a path that may contain ~ for home directory
 */
export function resolveUserPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Get the OpenClaw config file path
 */
export function getConfigPath(): string {
  return resolveUserPath("~/.openclaw/openclaw.json");
}

/**
 * Get the memory database path
 */
export function getMemoryDbPath(): string {
  return resolveUserPath("~/.openclaw/memory/main.sqlite");
}

/**
 * Load OpenClaw configuration file
 */
export function loadOpenClawConfig(): Record<string, unknown> | null {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load OpenClaw config: ${error}`);
    return null;
  }
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends object>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as object,
        sourceValue as object
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Extract memory enhancement config from OpenClaw config
 */
function extractEnhancementConfig(
  openclawConfig: Record<string, unknown>
): Partial<EnhancedSearchConfig> {
  const config: Partial<EnhancedSearchConfig> = {};

  // Extract from agents.defaults.memorySearch
  const agents = openclawConfig.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const memorySearch = defaults?.memorySearch as Record<string, unknown> | undefined;

  if (memorySearch) {
    // Extract embedding config
    if (memorySearch.provider || memorySearch.model || memorySearch.remote) {
      config.embedding = {
        provider: (memorySearch.provider as EmbeddingConfig["provider"]) || DEFAULT_EMBEDDING_CONFIG.provider,
        model: (memorySearch.model as string) || DEFAULT_EMBEDDING_CONFIG.model,
        baseUrl: (memorySearch.remote as Record<string, string>)?.baseUrl || DEFAULT_EMBEDDING_CONFIG.baseUrl,
        apiKey: (memorySearch.remote as Record<string, string>)?.apiKey || DEFAULT_EMBEDDING_CONFIG.apiKey,
        dimensions: DEFAULT_EMBEDDING_CONFIG.dimensions,
      };
    }

    // Extract query config
    const query = memorySearch.query as Record<string, unknown> | undefined;
    if (query) {
      config.query = {
        maxResults: (query.maxResults as number) || DEFAULT_QUERY_CONFIG.maxResults,
        minScore: (query.minScore as number) || DEFAULT_QUERY_CONFIG.minScore,
        sources: (memorySearch.sources as string[]) || DEFAULT_QUERY_CONFIG.sources,
      };
    }

    // Extract hybrid config from existing hybrid settings
    const hybridSettings = memorySearch.hybrid as Record<string, unknown> | undefined;
    if (hybridSettings) {
      config.hybrid = {
        enabled: hybridSettings.enabled !== false,
        vectorWeight: (hybridSettings.vectorWeight as number) || DEFAULT_HYBRID_CONFIG.vectorWeight,
        bm25Weight: (hybridSettings.textWeight as number) || DEFAULT_HYBRID_CONFIG.bm25Weight,
        rrfK: DEFAULT_HYBRID_CONFIG.rrfK,
        candidateMultiplier: (hybridSettings.candidateMultiplier as number) || DEFAULT_HYBRID_CONFIG.candidateMultiplier,
      };
    }
  }

  // Extract memory enhancement specific settings
  const enhancements = openclawConfig.memoryEnhancements as Record<string, unknown> | undefined;
  if (enhancements) {
    if (enhancements.hybrid) {
      config.hybrid = deepMerge(
        config.hybrid || DEFAULT_HYBRID_CONFIG,
        enhancements.hybrid as Partial<HybridSearchConfig>
      );
    }
    if (enhancements.temporal) {
      config.temporal = deepMerge(
        DEFAULT_TEMPORAL_CONFIG,
        enhancements.temporal as Partial<TemporalConfig>
      );
    }
    if (enhancements.rerank) {
      config.rerank = deepMerge(
        DEFAULT_RERANK_CONFIG,
        enhancements.rerank as Partial<RerankConfig>
      );
    }
    if (enhancements.autoIndex) {
      config.autoIndex = deepMerge(
        DEFAULT_AUTO_INDEX_CONFIG,
        enhancements.autoIndex as Partial<AutoIndexConfig>
      );
    }
  }

  return config;
}

/**
 * Load and merge configuration from OpenClaw config file
 */
export function loadConfig(
  overrides?: Partial<EnhancedSearchConfig>
): EnhancedSearchConfig {
  let config = { ...DEFAULT_CONFIG };

  // Load from OpenClaw config file
  const openclawConfig = loadOpenClawConfig();
  if (openclawConfig) {
    const extracted = extractEnhancementConfig(openclawConfig);
    config = deepMerge(config, extracted);
  }

  // Apply any runtime overrides
  if (overrides) {
    config = deepMerge(config, overrides);
  }

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: EnhancedSearchConfig): string[] {
  const errors: string[] = [];

  // Validate hybrid config
  if (config.hybrid.vectorWeight < 0 || config.hybrid.vectorWeight > 1) {
    errors.push("hybrid.vectorWeight must be between 0 and 1");
  }
  if (config.hybrid.bm25Weight < 0 || config.hybrid.bm25Weight > 1) {
    errors.push("hybrid.bm25Weight must be between 0 and 1");
  }
  if (config.hybrid.rrfK < 1) {
    errors.push("hybrid.rrfK must be at least 1");
  }

  // Validate temporal config
  if (config.temporal.minWeight < 0 || config.temporal.minWeight > 1) {
    errors.push("temporal.minWeight must be between 0 and 1");
  }
  if (config.temporal.customHalfLifeDays !== undefined && config.temporal.customHalfLifeDays <= 0) {
    errors.push("temporal.customHalfLifeDays must be positive");
  }

  // Validate rerank config
  if (config.rerank.candidateCount < config.rerank.finalCount) {
    errors.push("rerank.candidateCount must be >= rerank.finalCount");
  }
  if (config.rerank.finalCount < 1) {
    errors.push("rerank.finalCount must be at least 1");
  }

  // Validate auto-index config
  if (config.autoIndex.debounceMs < 0) {
    errors.push("autoIndex.debounceMs must be non-negative");
  }
  if (config.autoIndex.maxFileSizeBytes < 1) {
    errors.push("autoIndex.maxFileSizeBytes must be positive");
  }
  if (config.autoIndex.watchPaths.length === 0) {
    errors.push("autoIndex.watchPaths must not be empty when enabled");
  }

  // Validate query config
  if (config.query.maxResults < 1) {
    errors.push("query.maxResults must be at least 1");
  }
  if (config.query.minScore < 0 || config.query.minScore > 1) {
    errors.push("query.minScore must be between 0 and 1");
  }

  return errors;
}

/**
 * Create a configuration object for saving to file
 */
export function serializeConfig(config: EnhancedSearchConfig): string {
  return JSON.stringify(
    {
      memoryEnhancements: {
        hybrid: config.hybrid,
        temporal: config.temporal,
        rerank: config.rerank,
        autoIndex: config.autoIndex,
      },
    },
    null,
    2
  );
}
