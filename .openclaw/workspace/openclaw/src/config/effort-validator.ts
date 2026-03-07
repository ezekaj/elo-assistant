/**
 * Effort Level Validator
 *
 * Provides validation utilities for effort levels.
 * Matches Claude Code's effort validation patterns.
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/effort.md
 */

import type { ModelConfig } from "../config/types.models.js";
import {
  type EffortLevel,
  VALID_EFFORT_LEVELS,
  normalizeEffortLevel,
  getDefaultEffortLevel,
} from "./env-vars.effort.js";

// Re-export for convenience
export { EffortLevel, VALID_EFFORT_LEVELS, normalizeEffortLevel, getDefaultEffortLevel };

/**
 * Validation result for effort level
 */
export interface EffortValidationResult {
  valid: boolean;
  error?: string;
  normalized?: EffortLevel;
  // For models that don't support effort (like GLM)
  ignored?: boolean;
  reason?: string;
}

/**
 * Validate effort level for model
 *
 * Checks:
 * 1. Effort level is valid enum value
 * 2. Model supports effort levels (if not, effort is silently ignored)
 * 3. Effort level is supported by model
 *
 * @param effort - Effort level to validate
 * @param model - Model configuration
 * @returns Validation result
 *
 * Note: For models that don't support effort (like GLM), validation passes
 * but the effort level is ignored. No error is thrown.
 */
export function validateEffortLevel(effort: string, model?: ModelConfig): EffortValidationResult {
  // Normalize effort level
  const normalized = normalizeEffortLevel(effort);

  if (!normalized) {
    return {
      valid: false,
      error: `Invalid effort level '${effort}'. Valid options: ${VALID_EFFORT_LEVELS.join(", ")}`,
    };
  }

  // Check if model is provided
  if (!model) {
    // No model to validate against, just check if effort is valid
    return {
      valid: true,
      normalized,
    };
  }

  // Check if model supports effort
  if (!modelSupportsEffort(model)) {
    // Model doesn't support effort - return valid but note it's ignored
    // This allows GLM and other models to work without errors
    return {
      valid: true,
      normalized,
      // Note: effort will be ignored for this model
      ignored: true,
      reason: `Model '${model.displayName || model.id}' does not support effort levels. Effort parameter will be ignored.`,
    };
  }

  // Check if effort level is supported by model
  const supportedLevels = getModelEffortLevels(model);
  if (!supportedLevels.includes(normalized)) {
    return {
      valid: false,
      error:
        `Model '${model.displayName || model.id}' does not support effort level '${normalized}'. ` +
        `Supported levels: ${supportedLevels.join(", ")}`,
    };
  }

  // Check for "max" restrictions
  if (normalized === "max") {
    const maxRestriction = checkMaxEffortRestriction(model);
    if (maxRestriction) {
      return {
        valid: false,
        error: maxRestriction,
      };
    }
  }

  return {
    valid: true,
    normalized,
  };
}

/**
 * Check if model supports effort levels
 *
 * @param model - Model configuration
 * @returns true if model supports effort
 *
 * Note: Currently only Claude Opus 4.5/4.6 support effort levels.
 * GLM and other models will have effort ignored (no error).
 */
export function modelSupportsEffort(model?: ModelConfig): boolean {
  if (!model) {
    return false;
  }

  // Explicit support flag
  if (model.supportsEffort === true) {
    return true;
  }

  // Explicit no-support flag (for GLM and other models)
  if (model.supportsEffort === false) {
    return false;
  }

  // Check by model ID pattern - only Opus models support effort
  const modelId = model.id.toLowerCase();
  const provider = (model.provider || "").toLowerCase();

  // Claude Opus 4.5/4.6 from Anthropic
  if (provider.includes("anthropic") && modelId.includes("opus")) {
    return true;
  }

  // GLM models don't support effort levels yet
  if (provider.includes("zhipu") || modelId.includes("glm")) {
    return false;
  }

  // Default: assume no effort support for unknown models
  return false;
}

/**
 * Get supported effort levels for model
 *
 * @param model - Model configuration
 * @returns Array of supported effort levels
 */
export function getModelEffortLevels(model?: ModelConfig): EffortLevel[] {
  if (!model) {
    return VALID_EFFORT_LEVELS;
  }

  // Explicit levels from config
  if (model.supportedEffortLevels && model.supportedEffortLevels.length > 0) {
    return model.supportedEffortLevels as EffortLevel[];
  }

  // Default levels based on model
  const modelId = model.id.toLowerCase();

  // Opus 4.6 supports all levels including "max"
  if (modelId.includes("opus-4-6")) {
    return ["low", "medium", "high", "max"];
  }

  // Opus 4.5 supports all levels except "max"
  if (modelId.includes("opus-4-5")) {
    return ["low", "medium", "high"];
  }

  // Default: no effort support
  return [];
}

/**
 * Check for "max" effort level restrictions
 *
 * "max" effort has special restrictions:
 * - Only available for Opus 4.6
 * - Not available in interactive mode (Claude Code)
 * - Not available for Claude.ai subscribers
 *
 * @param model - Model configuration
 * @returns Error message if restricted, undefined otherwise
 */
export function checkMaxEffortRestriction(model?: ModelConfig): string | undefined {
  if (!model) {
    return undefined;
  }

  const modelId = model.id.toLowerCase();

  // "max" is only available for Opus 4.6
  if (!modelId.includes("opus-4-6")) {
    return (
      `Effort level "max" is only available for Opus 4.6 models. ` +
      `Current model: ${model.displayName || model.id}`
    );
  }

  return undefined;
}

/**
 * Get default effort for model
 *
 * @param model - Model configuration
 * @returns Default effort level or undefined
 */
export function getDefaultEffortForModel(model?: ModelConfig): EffortLevel | undefined {
  if (!model) {
    return undefined;
  }

  // Opus 4.6 defaults to "medium"
  if (model.id.toLowerCase().includes("opus-4-6")) {
    return "medium";
  }

  // Opus 4.5 defaults to "high"
  if (model.id.toLowerCase().includes("opus-4-5")) {
    return "high";
  }

  return undefined;
}

/**
 * Resolve effort level from multiple sources
 *
 * Priority:
 * 1. Explicit effort parameter
 * 2. Environment variable (OPENCLAW_EFFORT_LEVEL)
 * 3. Model default
 * 4. Global default ("high")
 *
 * @param params - Resolution parameters
 * @returns Resolved effort level
 */
export function resolveEffortLevel(params: { effort?: string; model?: ModelConfig }): EffortLevel {
  const { effort, model } = params;

  // 1. Check explicit effort parameter
  if (effort) {
    const validation = validateEffortLevel(effort, model);
    if (validation.valid && validation.normalized) {
      return validation.normalized;
    }
  }

  // 2. Check environment variable
  const envDefault = getDefaultEffortLevel();
  if (envDefault) {
    return envDefault;
  }

  // 3. Check model default
  const modelDefault = getDefaultEffortForModel(model);
  if (modelDefault) {
    return modelDefault;
  }

  // 4. Fall back to "high"
  return "high";
}

/**
 * Get effort level cost description
 *
 * @param level - Effort level
 * @returns Cost description
 */
export function getEffortCostDescription(level: EffortLevel): string {
  switch (level) {
    case "low":
      return "~50% token cost compared to high effort";
    case "medium":
      return "~75% token cost compared to high effort";
    case "high":
      return "Baseline token cost";
    case "max":
      return "~150% token cost compared to high effort";
  }
}

/**
 * Format effort level for display
 *
 * @param level - Effort level
 * @returns Formatted display string
 */
export function formatEffortLevel(level: EffortLevel): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}
