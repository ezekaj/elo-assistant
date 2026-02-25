/**
 * Claude Code-Style Compaction Threshold System
 *
 * Implements exact token-based compaction triggering matching Claude Code's behavior:
 * - Triggers at 167k tokens (83.5% of 200k context)
 * - 13k token buffer before hard limit
 * - Dynamic threshold calculation based on model
 * - Environment variable overrides
 *
 * Based on analysis of Claude Code source (lines 276416-276458)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("compaction-thresholds");

// ============================================================================
// CLAUDE CODE CONSTANTS (from line 276480-276484)
// ============================================================================

/** Output token reserve - kept for response generation */
const OUTPUT_TOKEN_RESERVE = 20000;

/** Auto-compact buffer - safety margin before hard limit */
const AUTO_COMPACT_BUFFER = 13000;

/** Warning threshold - when to show warning to user */
const WARNING_THRESHOLD = 20000;

/** Error threshold - when compaction fails */
const ERROR_THRESHOLD = 20000;

/** Blocking limit buffer - absolute maximum before API rejects */
const BLOCKING_LIMIT_BUFFER = 3000;

// ============================================================================
// MODEL CONTEXT WINDOWS
// ============================================================================

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  "claude-3-5-sonnet": 200000,
  "claude-3-opus": 200000,
  "claude-3-haiku": 200000,

  // Zhipu
  "glm-5": 256000,
  "glm-4": 128000,

  // Google
  "gemini-2.5-flash": 1000000,
  "gemini-2.0-flash": 1000000,

  // Default
  default: 200000,
};

/**
 * Get context window for a model
 */
export function getContextWindow(model: string): number {
  // Check exact match
  if (MODEL_CONTEXT_WINDOWS[model]) {
    return MODEL_CONTEXT_WINDOWS[model];
  }

  // Check partial match
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.toLowerCase().includes(key)) {
      return value;
    }
  }

  // Default
  return MODEL_CONTEXT_WINDOWS["default"];
}

// ============================================================================
// THRESHOLD CALCULATION (Claude Code: xcT function, line 276416-276428)
// ============================================================================

/**
 * Calculate auto-compact threshold for a model
 *
 * Formula: (contextWindow - outputReserve) - bufferTokens
 * For 200k model: (200000 - 20000) - 13000 = 167000 tokens
 */
export function calculateAutoCompactThreshold(model: string): number {
  const contextWindow = getContextWindow(model);
  const available = contextWindow - OUTPUT_TOKEN_RESERVE;
  const threshold = available - AUTO_COMPACT_BUFFER;

  // Check for environment variable override
  const override = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (override) {
    const pct = parseFloat(override);
    if (!isNaN(pct) && pct > 0 && pct <= 100) {
      const overrideThreshold = Math.floor(available * (pct / 100));
      const finalThreshold = Math.min(overrideThreshold, threshold);
      log.debug(`Auto-compact threshold overridden: ${finalThreshold} tokens (${pct}%)`);
      return finalThreshold;
    }
  }

  return threshold;
}

// ============================================================================
// THRESHOLD CHECKING (Claude Code: ed function, line 276378-276410)
// ============================================================================

export interface ThresholdCheckResult {
  percentLeft: number;
  isAboveWarningThreshold: boolean;
  isAboveErrorThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  isAtBlockingLimit: boolean;
  currentTokens: number;
  autoCompactThreshold: number;
  effectiveWindow: number;
}

/**
 * Check token thresholds and return status
 */
export function checkThresholds(
  currentTokens: number,
  model: string,
  autoCompactEnabled: boolean = true,
): ThresholdCheckResult {
  const autoCompactThreshold = calculateAutoCompactThreshold(model);
  const effectiveWindow = autoCompactEnabled ? autoCompactThreshold : getContextWindow(model);

  const percentLeft = Math.max(
    0,
    Math.round(((effectiveWindow - currentTokens) / effectiveWindow) * 100),
  );

  const warningThreshold = effectiveWindow - WARNING_THRESHOLD;
  const errorThreshold = effectiveWindow - ERROR_THRESHOLD;
  const isAboveWarningThreshold = currentTokens >= warningThreshold;
  const isAboveErrorThreshold = currentTokens >= errorThreshold;
  const isAboveAutoCompactThreshold = autoCompactEnabled && currentTokens >= autoCompactThreshold;

  const contextWindow = getContextWindow(model);
  const blockingLimit = contextWindow - BLOCKING_LIMIT_BUFFER;
  const isAtBlockingLimit = currentTokens >= blockingLimit;

  return {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAtBlockingLimit,
    currentTokens,
    autoCompactThreshold,
    effectiveWindow,
  };
}

// ============================================================================
// AUTO-COMPACT ENABLED CHECK (Claude Code: tx function, line 276446)
// ============================================================================

/**
 * Check if auto-compact is enabled
 */
export function isAutoCompactEnabled(): boolean {
  // Check environment variables
  if (isTruthy(process.env.DISABLE_COMPACT)) {
    return false;
  }

  if (isTruthy(process.env.DISABLE_AUTO_COMPACT)) {
    return false;
  }

  // Default: enabled
  return true;
}

/**
 * Check if a value is truthy (matches Claude Code's isTruthy)
 */
function isTruthy(value: string | undefined): boolean {
  if (value === undefined || value === "") {
    return false;
  }
  const lower = value.toLowerCase();
  return lower !== "false" && lower !== "0" && lower !== "no";
}

// ============================================================================
// AUTO-COMPACT TRIGGER (Claude Code: Ne7 function, line 276447-276458)
// ============================================================================

/**
 * Determine if auto-compact should trigger
 */
export async function shouldTriggerAutoCompact(
  currentTokens: number,
  model: string,
  source?: string,
): Promise<boolean> {
  // Don't compact compactions
  if (source === "session_memory" || source === "compact") {
    log.debug("Skipping auto-compact: source is compaction-related");
    return false;
  }

  // Check if enabled
  if (!isAutoCompactEnabled()) {
    log.debug("Skipping auto-compact: disabled");
    return false;
  }

  // Check thresholds
  const thresholds = checkThresholds(currentTokens, model, true);

  log.debug(
    `Auto-compact check: tokens=${currentTokens}, threshold=${thresholds.autoCompactThreshold}, ` +
      `effectiveWindow=${thresholds.effectiveWindow}, trigger=${thresholds.isAboveAutoCompactThreshold}`,
  );

  return thresholds.isAboveAutoCompactThreshold;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get human-readable threshold status
 */
export function getThresholdStatus(currentTokens: number, model: string): string {
  const thresholds = checkThresholds(currentTokens, model);
  const contextWindow = getContextWindow(model);

  const parts: string[] = [];

  if (thresholds.isAtBlockingLimit) {
    parts.push("🚨 AT BLOCKING LIMIT");
  } else if (thresholds.isAboveErrorThreshold) {
    parts.push("❌ ABOVE ERROR THRESHOLD");
  } else if (thresholds.isAboveAutoCompactThreshold) {
    parts.push("⚠️ AUTO-COMPACT TRIGGERED");
  } else if (thresholds.isAboveWarningThreshold) {
    parts.push("⚡ APPROACHING LIMIT");
  } else {
    parts.push("✅ HEALTHY");
  }

  parts.push(`${thresholds.percentLeft}% remaining`);
  parts.push(`${currentTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens`);

  return parts.join(" · ");
}

/**
 * Log threshold status
 */
export function logThresholdStatus(currentTokens: number, model: string): void {
  const status = getThresholdStatus(currentTokens, model);
  log.info(`Token threshold status: ${status}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  OUTPUT_TOKEN_RESERVE,
  AUTO_COMPACT_BUFFER,
  WARNING_THRESHOLD,
  ERROR_THRESHOLD,
  BLOCKING_LIMIT_BUFFER,
  MODEL_CONTEXT_WINDOWS,
};
