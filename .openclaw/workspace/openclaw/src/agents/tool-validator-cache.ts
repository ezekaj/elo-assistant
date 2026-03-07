/**
 * Tool Output Validator Cache
 * Matches Claude Code's _cachedToolOutputValidators pattern (lines 209223-209536)
 */

import type { AnyAgentTool } from "./tools/common.js";
import { JsonSchemaValidator, type ValidatorFunction } from "./schema/json-schema-validator.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ToolValidatorCacheOptions {
  jsonSchemaValidator?: JsonSchemaValidator;
}

// ============================================================================
// TOOL VALIDATOR CACHE CLASS
// ============================================================================

/**
 * Caches output validators for tools
 * Matches Claude Code's cacheToolMetadata/getToolOutputValidator pattern
 */
export class ToolValidatorCache {
  private validators: Map<string, ValidatorFunction>;
  private knownTaskTools: Set<string>;
  private requiredTaskTools: Set<string>;
  private validator: JsonSchemaValidator;

  constructor(options?: ToolValidatorCacheOptions) {
    this.validators = new Map();
    this.knownTaskTools = new Set();
    this.requiredTaskTools = new Set();
    this.validator = options?.jsonSchemaValidator ?? new JsonSchemaValidator();
  }

  /**
   * Cache validators for a list of tools
   * Matches Claude Code's cacheToolMetadata() (lines 209523-209534)
   */
  cacheToolMetadata(tools: AnyAgentTool[]): void {
    // Clear existing cache
    this.validators.clear();
    this.knownTaskTools.clear();
    this.requiredTaskTools.clear();

    for (const tool of tools) {
      // Cache output schema validator
      if ("outputSchema" in tool && tool.outputSchema) {
        const validator = this.validator.getValidator(tool.outputSchema);
        this.validators.set(tool.name, validator);
      }

      // Track task tools (if applicable)
      // This would need taskSupport metadata on tools
      // For now, we skip this part
    }
  }

  /**
   * Get cached validator for a tool
   * Matches Claude Code's getToolOutputValidator() (lines 209535-209537)
   */
  getValidator(toolName: string): ValidatorFunction | undefined {
    return this.validators.get(toolName);
  }

  /**
   * Check if tool has cached validator
   */
  hasValidator(toolName: string): boolean {
    return this.validators.has(toolName);
  }

  /**
   * Clear all cached validators
   */
  clear(): void {
    this.validators.clear();
    this.knownTaskTools.clear();
    this.requiredTaskTools.clear();
  }
}

// ============================================================================
// GLOBAL CACHE INSTANCE
// ============================================================================

let globalCache: ToolValidatorCache | null = null;

export function getGlobalValidatorCache(): ToolValidatorCache {
  if (!globalCache) {
    globalCache = new ToolValidatorCache();
  }
  return globalCache;
}

export function setGlobalValidatorCache(cache: ToolValidatorCache): void {
  globalCache = cache;
}
