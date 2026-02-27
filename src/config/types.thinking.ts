/**
 * Universal Thinking Support Types
 *
 * Defines thinking modes and configuration for all LLM providers.
 * Works with Zhipu, OpenRouter, LM Studio, Claude, and more.
 */

// ============================================================================
// THINKING MODES
// ============================================================================

/**
 * Thinking mode determines how much the model reasons before responding.
 *
 * - off: No thinking, immediate response
 * - minimal: Very brief reasoning (1-2 sentences)
 * - low: Brief reasoning (short paragraph)
 * - medium: Moderate reasoning (multiple paragraphs)
 * - high: Extensive reasoning (detailed analysis)
 * - adaptive: Model decides automatically (Opus 4.6+, some OpenRouter models)
 */
export type ThinkingMode = "off" | "minimal" | "low" | "medium" | "high" | "adaptive";

// ============================================================================
// THINKING CONFIGURATION
// ============================================================================

/**
 * Thinking configuration for a session
 */
export interface ThinkingConfig {
  /** Thinking mode */
  mode: ThinkingMode;

  /** Enable/disable thinking */
  enabled?: boolean;

  /** Maximum thinking tokens (auto-calculated if undefined) */
  budgetTokens?: number;

  /** Show thinking between tool calls (interleaved) */
  interleaved?: boolean;

  /** How to display thinking in TUI */
  displayMode?: "inline" | "separate" | "hidden";
}

/**
 * Provider-specific thinking configuration
 */
export interface ProviderThinkingConfig {
  /** Is thinking supported? */
  supported: boolean;

  /** Supported thinking modes */
  modes: ThinkingMode[];

  /** Does provider support budget_tokens parameter? */
  budgetSupport: boolean;

  /** Beta header required (if any) */
  betaHeader?: string;

  /** Default thinking mode */
  defaultMode: ThinkingMode;

  /** Provider-specific notes */
  notes?: string;
}

// ============================================================================
// THINKING BUDGET CALCULATION
// ============================================================================

/**
 * Calculate thinking budget based on mode and context
 */
export function calculateThinkingBudget(mode: ThinkingMode, contextTokens: number): number {
  const baseBudget = 1024;

  switch (mode) {
    case "off":
      return 0;
    case "minimal":
      return baseBudget * 0.5; // 512
    case "low":
      return baseBudget; // 1024
    case "medium":
      return baseBudget * 2; // 2048
    case "high":
      return baseBudget * 4; // 4096
    case "adaptive":
      // Adaptive mode: use 10% of remaining context
      return Math.max(1024, Math.floor(contextTokens * 0.1));
    default:
      return baseBudget;
  }
}

/**
 * Get thinking mode label for display
 */
export function getThinkingModeLabel(mode: ThinkingMode): string {
  const labels: Record<ThinkingMode, string> = {
    off: "Off",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    adaptive: "Adaptive",
  };
  return labels[mode];
}

/**
 * Get thinking mode description
 */
export function getThinkingModeDescription(mode: ThinkingMode): string {
  const descriptions: Record<ThinkingMode, string> = {
    off: "No thinking, immediate response",
    minimal: "Very brief reasoning (1-2 sentences)",
    low: "Brief reasoning (short paragraph)",
    medium: "Moderate reasoning (multiple paragraphs)",
    high: "Extensive reasoning (detailed analysis)",
    adaptive: "Model decides automatically",
  };
  return descriptions[mode];
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default thinking configuration
 */
export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  mode: "low",
  enabled: true,
  interleaved: false,
  displayMode: "inline",
};

/**
 * Provider configurations
 */
export const PROVIDER_THINKING_CONFIGS: Record<string, ProviderThinkingConfig> = {
  // Zhipu (GLM models)
  zhipu: {
    supported: true,
    modes: ["off", "minimal", "low", "medium", "high", "adaptive"], // Added adaptive
    budgetSupport: false,
    defaultMode: "adaptive", // Changed to adaptive
    notes: "Adaptive thinking auto-adjusts based on task complexity",
  },

  // OpenRouter (Gemini, Grok, DeepSeek, etc.)
  openrouter: {
    supported: true,
    modes: ["off", "minimal", "low", "medium", "high", "adaptive"],
    budgetSupport: true,
    defaultMode: "adaptive", // Changed to adaptive
    notes: "Adaptive thinking supported for all models",
  },

  // LM Studio (local models)
  lmstudio: {
    supported: true,
    modes: ["off", "minimal", "low", "medium", "high", "adaptive"],
    budgetSupport: false,
    defaultMode: "adaptive", // Changed to adaptive
    notes: "Adaptive thinking via temperature adjustment",
  },

  // Claude (Anthropic)
  claude: {
    supported: true,
    modes: ["off", "minimal", "low", "medium", "high", "adaptive"],
    budgetSupport: true,
    betaHeader: "adaptive-thinking-2026-01-28",
    defaultMode: "adaptive",
    notes: "Opus 4.6+ native adaptive thinking, others simulated",
  },

  // Default/Unknown
  default: {
    supported: true,
    modes: ["off", "minimal", "low", "medium", "high", "adaptive"],
    budgetSupport: false,
    defaultMode: "adaptive", // Changed to adaptive
  },
};
