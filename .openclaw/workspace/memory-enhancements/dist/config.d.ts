/**
 * OpenClaw Memory Enhancements - Configuration
 */
import type { EnhancedSearchConfig, HybridSearchConfig, TemporalConfig, RerankConfig, AutoIndexConfig, EmbeddingConfig, QueryConfig } from "./types.js";
export declare const DEFAULT_HYBRID_CONFIG: HybridSearchConfig;
export declare const DEFAULT_TEMPORAL_CONFIG: TemporalConfig;
export declare const DEFAULT_RERANK_CONFIG: RerankConfig;
export declare const DEFAULT_AUTO_INDEX_CONFIG: AutoIndexConfig;
export declare const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig;
export declare const DEFAULT_QUERY_CONFIG: QueryConfig;
export declare const DEFAULT_CONFIG: EnhancedSearchConfig;
/**
 * Resolve a path that may contain ~ for home directory
 */
export declare function resolveUserPath(path: string): string;
/**
 * Get the OpenClaw config file path
 */
export declare function getConfigPath(): string;
/**
 * Get the memory database path
 */
export declare function getMemoryDbPath(): string;
/**
 * Load OpenClaw configuration file
 */
export declare function loadOpenClawConfig(): Record<string, unknown> | null;
/**
 * Load and merge configuration from OpenClaw config file
 */
export declare function loadConfig(overrides?: Partial<EnhancedSearchConfig>): EnhancedSearchConfig;
/**
 * Validate configuration
 */
export declare function validateConfig(config: EnhancedSearchConfig): string[];
/**
 * Create a configuration object for saving to file
 */
export declare function serializeConfig(config: EnhancedSearchConfig): string;
//# sourceMappingURL=config.d.ts.map