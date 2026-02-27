/**
 * Thinking Manager
 *
 * Central management for thinking configuration across all LLM providers.
 * Handles provider-specific configs, beta headers, and budget calculation.
 */

import type {
  ThinkingConfig,
  ThinkingMode,
  ProviderThinkingConfig,
} from "../config/types.thinking.js";
import {
  DEFAULT_THINKING_CONFIG,
  PROVIDER_THINKING_CONFIGS,
  calculateThinkingBudget,
} from "../config/types.thinking.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  getUniversalAdaptiveThinkingManager,
  analyzeTaskComplexity,
  determineAdaptiveThinking,
} from "./adaptive-thinking.js";

const log = createSubsystemLogger("thinking-manager");

// ============================================================================
// THINKING MANAGER CLASS
// ============================================================================

export class ThinkingManager {
  private providerConfigs = new Map<string, ProviderThinkingConfig>();
  private sessionConfigs = new Map<string, ThinkingConfig>();

  constructor() {
    this.initializeProviderConfigs();
    log.debug("Thinking manager initialized");
  }

  /**
   * Initialize provider configurations
   */
  private initializeProviderConfigs(): void {
    for (const [provider, config] of Object.entries(PROVIDER_THINKING_CONFIGS)) {
      this.providerConfigs.set(provider, config);
    }
    log.debug(`Initialized ${this.providerConfigs.size} provider configs`);
  }

  /**
   * Get adaptive thinking config (UNIVERSAL - works with ALL models)
   *
   * Automatically determines optimal thinking based on task complexity
   */
  getAdaptiveThinkingConfig(params: {
    model: string;
    message?: string;
    toolCalls?: number;
    contextLength?: number;
    hasCode?: boolean;
    hasMath?: boolean;
    hasReasoning?: boolean;
  }): ThinkingConfig {
    const adaptiveManager = getUniversalAdaptiveThinkingManager();

    return adaptiveManager.getThinkingConfig({
      model: params.model,
      provider: this.extractProvider(params.model),
      message: params.message,
      toolCalls: params.toolCalls,
      contextLength: params.contextLength,
      hasCode: params.hasCode,
      hasMath: params.hasMath,
      hasReasoning: params.hasReasoning,
    });
  }

  /**
   * Get thinking configuration for a model
   */
  getThinkingConfig(model: string, userOverride?: Partial<ThinkingConfig>): ThinkingConfig {
    const provider = this.extractProvider(model);
    const providerConfig =
      this.providerConfigs.get(provider) || this.providerConfigs.get("default");

    if (!providerConfig) {
      log.warn(`No provider config found for model: ${model}`);
      return { ...DEFAULT_THINKING_CONFIG };
    }

    // Build config from provider defaults
    const config: ThinkingConfig = {
      mode: providerConfig.defaultMode,
      enabled: providerConfig.defaultMode !== "off",
      interleaved: providerConfig.modes.includes("adaptive"),
      displayMode: "inline",
      ...userOverride,
    };

    // Calculate budget if not specified
    if (config.enabled && config.mode !== "off" && config.budgetTokens === undefined) {
      config.budgetTokens = calculateThinkingBudget(config.mode, 128000);
    }

    log.debug(`Thinking config for ${model}: ${config.mode}`);
    return config;
  }

  /**
   * Get provider-specific configuration
   */
  getProviderConfig(provider: string): ProviderThinkingConfig {
    return (
      this.providerConfigs.get(provider) ||
      this.providerConfigs.get("default") ||
      PROVIDER_THINKING_CONFIGS["default"]
    );
  }

  /**
   * Get beta headers for a model
   */
  getBetaHeaders(model: string): string[] {
    const provider = this.extractProvider(model);
    const providerConfig = this.providerConfigs.get(provider);

    if (providerConfig?.betaHeader) {
      log.debug(`Beta header for ${model}: ${providerConfig.betaHeader}`);
      return [providerConfig.betaHeader];
    }

    return [];
  }

  /**
   * Check if interleaved thinking is supported for a model
   */
  isInterleavedSupported(model: string): boolean {
    const providerConfig = this.getProviderConfig(this.extractProvider(model));
    return providerConfig.modes.includes("adaptive") || providerConfig.betaHeader !== undefined;
  }

  /**
   * Check if thinking budget is supported for a model
   */
  isBudgetSupported(model: string): boolean {
    const providerConfig = this.getProviderConfig(this.extractProvider(model));
    return providerConfig.budgetSupport;
  }

  /**
   * Set session-specific thinking config
   */
  setSessionConfig(sessionKey: string, config: ThinkingConfig): void {
    this.sessionConfigs.set(sessionKey, config);
    log.debug(`Session config set for ${sessionKey}`);
  }

  /**
   * Get session-specific thinking config
   */
  getSessionConfig(sessionKey: string): ThinkingConfig | undefined {
    return this.sessionConfigs.get(sessionKey);
  }

  /**
   * Clear session config
   */
  clearSessionConfig(): void {
    this.sessionConfigs.clear();
    log.debug("Session configs cleared");
  }

  /**
   * Extract provider from model string
   */
  private extractProvider(model: string): string {
    // Handle "provider/model" format
    if (model.includes("/")) {
      const provider = model.split("/")[0].toLowerCase();

      // Map common provider aliases
      const providerMap: Record<string, string> = {
        google: "openrouter",
        gemini: "openrouter",
        grok: "openrouter",
        deepseek: "openrouter",
        glm: "zhipu",
        claude: "claude",
        liquid: "lmstudio",
        qwen: "lmstudio",
      };

      return providerMap[provider] || provider;
    }

    // Handle model names without provider prefix
    const modelLower = model.toLowerCase();
    if (modelLower.includes("glm")) return "zhipu";
    if (modelLower.includes("gemini")) return "openrouter";
    if (modelLower.includes("grok")) return "openrouter";
    if (modelLower.includes("claude")) return "claude";
    if (modelLower.includes("llama")) return "lmstudio";

    return "default";
  }

  /**
   * Get all supported thinking modes for a model
   */
  getSupportedModes(model: string): ThinkingMode[] {
    const providerConfig = this.getProviderConfig(this.extractProvider(model));
    return providerConfig.modes;
  }

  /**
   * Validate thinking mode for a model
   */
  isValidMode(model: string, mode: ThinkingMode): boolean {
    const supportedModes = this.getSupportedModes(model);
    return supportedModes.includes(mode);
  }

  /**
   * Get thinking manager stats
   */
  getStats(): {
    providerCount: number;
    sessionCount: number;
  } {
    return {
      providerCount: this.providerConfigs.size,
      sessionCount: this.sessionConfigs.size,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ThinkingManager | null = null;

/**
 * Get or create thinking manager singleton
 */
export function getThinkingManager(): ThinkingManager {
  if (!instance) {
    instance = new ThinkingManager();
  }
  return instance;
}

/**
 * Reset thinking manager (for testing)
 */
export function resetThinkingManager(): void {
  instance = null;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Parse thinking mode from string
 */
export function parseThinkingMode(mode: string): ThinkingMode {
  const validModes: ThinkingMode[] = ["off", "minimal", "low", "medium", "high", "adaptive"];
  const normalized = mode.toLowerCase().trim();

  if (validModes.includes(normalized as ThinkingMode)) {
    return normalized as ThinkingMode;
  }

  // Default to low for invalid modes
  return "low";
}

/**
 * Format thinking config for display
 */
export function formatThinkingConfig(config: ThinkingConfig): string {
  const parts: string[] = [];

  parts.push(`Mode: ${config.mode}`);

  if (config.budgetTokens !== undefined) {
    parts.push(`Budget: ${config.budgetTokens} tokens`);
  }

  if (config.interleaved) {
    parts.push("Interleaved: Yes");
  }

  if (config.displayMode) {
    parts.push(`Display: ${config.displayMode}`);
  }

  return parts.join(" | ");
}
