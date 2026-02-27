/**
 * Universal Adaptive Thinking System
 *
 * Implements adaptive thinking for ALL LLM providers (not just Opus 4.6).
 * Automatically adjusts thinking depth based on task complexity.
 *
 * Features:
 * - Auto-detect task complexity
 * - Adjust thinking mode dynamically
 * - Works with Zhipu, OpenRouter, LM Studio, Claude, etc.
 * - Interleaved thinking support
 * - Effort level guidance
 */

import type { ThinkingMode, ThinkingConfig } from "../config/types.thinking.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getThinkingManager } from "./thinking-manager.js";

const log = createSubsystemLogger("adaptive-thinking");

// ============================================================================
// TYPES
// ============================================================================

/**
 * Task complexity levels
 */
export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "very_complex";

/**
 * Adaptive thinking result
 */
export interface AdaptiveThinkingResult {
  mode: ThinkingMode;
  budgetTokens?: number;
  reasoning: string;
  complexity: TaskComplexity;
}

/**
 * Task analysis options
 */
export interface TaskAnalysisOptions {
  message?: string;
  toolCalls?: number;
  contextLength?: number;
  hasCode?: boolean;
  hasMath?: boolean;
  hasReasoning?: boolean;
}

// ============================================================================
// COMPLEXITY DETECTION
// ============================================================================

/**
 * Analyze task complexity from user message
 */
export function analyzeTaskComplexity(options: TaskAnalysisOptions): TaskComplexity {
  const {
    message = "",
    toolCalls = 0,
    contextLength = 0,
    hasCode = false,
    hasMath = false,
    hasReasoning = false,
  } = options;

  let score = 0;
  const reasons: string[] = [];

  // Message length analysis
  const wordCount = message.split(/\s+/).length;
  if (wordCount > 100) {
    score += 2;
    reasons.push("Long message (>100 words)");
  } else if (wordCount > 50) {
    score += 1;
    reasons.push("Medium message (>50 words)");
  }

  // Keyword analysis
  const complexityKeywords = [
    "analyze",
    "debug",
    "optimize",
    "refactor",
    "architecture",
    "design",
    "implement",
    "complex",
    "difficult",
    "challenge",
    "race condition",
    "concurrency",
    "parallel",
    "distributed",
    "algorithm",
    "data structure",
    "performance",
    "scalability",
  ];

  const messageLower = message.toLowerCase();
  const foundKeywords = complexityKeywords.filter((kw) => messageLower.includes(kw));
  if (foundKeywords.length >= 3) {
    score += 3;
    reasons.push(`Complex keywords: ${foundKeywords.join(", ")}`);
  } else if (foundKeywords.length >= 1) {
    score += 1;
    reasons.push(`Some complex keywords: ${foundKeywords.join(", ")}`);
  }

  // Tool calls analysis
  if (toolCalls >= 5) {
    score += 3;
    reasons.push("Many tool calls expected (>=5)");
  } else if (toolCalls >= 2) {
    score += 1;
    reasons.push("Multiple tool calls expected (>=2)");
  }

  // Context length analysis
  if (contextLength > 50000) {
    score += 2;
    reasons.push("Large context (>50k tokens)");
  } else if (contextLength > 10000) {
    score += 1;
    reasons.push("Medium context (>10k tokens)");
  }

  // Content type analysis
  if (hasCode) {
    score += 1;
    reasons.push("Contains code");
  }
  if (hasMath) {
    score += 1;
    reasons.push("Contains math");
  }
  if (hasReasoning) {
    score += 2;
    reasons.push("Requires reasoning");
  }

  // Determine complexity level
  let complexity: TaskComplexity;
  if (score <= 1) {
    complexity = "trivial";
  } else if (score <= 3) {
    complexity = "simple";
  } else if (score <= 5) {
    complexity = "moderate";
  } else if (score <= 7) {
    complexity = "complex";
  } else {
    complexity = "very_complex";
  }

  log.debug(`Task complexity: ${complexity} (score: ${score}, reasons: ${reasons.join("; ")})`);

  return complexity;
}

// ============================================================================
// ADAPTIVE THINKING DECISION
// ============================================================================

/**
 * Determine optimal thinking configuration based on task complexity
 */
export function determineAdaptiveThinking(
  complexity: TaskComplexity,
  model: string,
  provider?: string,
): AdaptiveThinkingResult {
  const thinkingManager = getThinkingManager();
  const providerConfig = thinkingManager.getProviderConfig(provider || extractProvider(model));

  let mode: ThinkingMode;
  let budgetTokens: number | undefined;
  let reasoning: string;

  switch (complexity) {
    case "trivial":
      mode = providerConfig.modes.includes("minimal") ? "minimal" : "low";
      budgetTokens = 256;
      reasoning = "Trivial task - minimal thinking required";
      break;

    case "simple":
      mode = "low";
      budgetTokens = 512;
      reasoning = "Simple task - brief thinking sufficient";
      break;

    case "moderate":
      mode = "medium";
      budgetTokens = 2048;
      reasoning = "Moderate complexity - moderate thinking needed";
      break;

    case "complex":
      mode = providerConfig.modes.includes("high") ? "high" : "medium";
      budgetTokens = 4096;
      reasoning = "Complex task - extensive thinking required";
      break;

    case "very_complex":
      mode = providerConfig.modes.includes("high") ? "high" : "medium";
      budgetTokens = 8192;
      reasoning = "Very complex task - maximum thinking recommended";
      break;
  }

  // Adjust for model capabilities
  if (model.includes("opus") || model.includes("claude-3")) {
    // Claude models handle thinking well
    budgetTokens = Math.floor(budgetTokens * 1.2);
  } else if (model.includes("gemini")) {
    // Gemini is fast, can use more thinking
    budgetTokens = Math.floor(budgetTokens * 1.3);
  } else if (model.includes("glm")) {
    // GLM models are efficient
    budgetTokens = Math.floor(budgetTokens * 1.1);
  }

  // Check if adaptive mode is supported
  if (providerConfig.modes.includes("adaptive")) {
    mode = "adaptive";
    reasoning += " (using adaptive mode)";
  }

  log.debug(`Adaptive thinking: mode=${mode}, budget=${budgetTokens}, reasoning=${reasoning}`);

  return {
    mode,
    budgetTokens,
    reasoning,
    complexity,
  };
}

// ============================================================================
// UNIVERSAL ADAPTIVE THINKING MANAGER
// ============================================================================

/**
 * Universal Adaptive Thinking Manager
 *
 * Provides adaptive thinking for ALL models, not just Opus 4.6
 */
export class UniversalAdaptiveThinkingManager {
  private history = new Map<string, AdaptiveThinkingResult[]>();
  private maxHistorySize = 10;

  /**
   * Get adaptive thinking config for a request
   */
  getThinkingConfig(params: {
    model: string;
    provider?: string;
    message?: string;
    toolCalls?: number;
    contextLength?: number;
    hasCode?: boolean;
    hasMath?: boolean;
    hasReasoning?: boolean;
  }): ThinkingConfig {
    const { model, provider, message, toolCalls, contextLength, hasCode, hasMath, hasReasoning } =
      params;

    // Analyze task complexity
    const complexity = analyzeTaskComplexity({
      message,
      toolCalls,
      contextLength,
      hasCode,
      hasMath,
      hasReasoning,
    });

    // Determine adaptive thinking
    const adaptive = determineAdaptiveThinking(complexity, model, provider);

    // Store in history
    this.storeInHistory(model, adaptive);

    // Build thinking config
    const config: ThinkingConfig = {
      mode: adaptive.mode,
      enabled: adaptive.mode !== "off",
      budgetTokens: adaptive.budgetTokens,
      interleaved: this.supportsInterleaved(model, provider),
      displayMode: "inline",
    };

    log.info(`Adaptive thinking for ${model}: ${adaptive.mode} (${adaptive.complexity})`);

    return config;
  }

  /**
   * Check if model supports interleaved thinking
   */
  private supportsInterleaved(model: string, provider?: string): boolean {
    // Opus 4.6 has native interleaved thinking
    if (model.includes("opus-4-6") || model.includes("opus4.6")) {
      return true;
    }

    // Other models can simulate interleaved thinking
    if (provider === "openrouter" || provider === "zhipu") {
      return true;
    }

    // Default: limited interleaved support
    return false;
  }

  /**
   * Store result in history for learning
   */
  private storeInHistory(model: string, result: AdaptiveThinkingResult): void {
    if (!this.history.has(model)) {
      this.history.set(model, []);
    }

    const history = this.history.get(model)!;
    history.push(result);

    // Trim history
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Get thinking history for a model
   */
  getHistory(model: string): AdaptiveThinkingResult[] {
    return this.history.get(model) || [];
  }

  /**
   * Clear history
   */
  clearHistory(model?: string): void {
    if (model) {
      this.history.delete(model);
    } else {
      this.history.clear();
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    modelsTracked: number;
    totalDecisions: number;
    averageComplexity: string;
  } {
    const models = Array.from(this.history.keys());
    let totalDecisions = 0;
    let complexitySum = 0;

    const complexityMap: Record<TaskComplexity, number> = {
      trivial: 1,
      simple: 2,
      moderate: 3,
      complex: 4,
      very_complex: 5,
    };

    for (const history of this.history.values()) {
      totalDecisions += history.length;
      for (const result of history) {
        complexitySum += complexityMap[result.complexity];
      }
    }

    const avgComplexity = totalDecisions > 0 ? complexitySum / totalDecisions : 0;

    let averageComplexity: TaskComplexity;
    if (avgComplexity <= 1.5) averageComplexity = "trivial";
    else if (avgComplexity <= 2.5) averageComplexity = "simple";
    else if (avgComplexity <= 3.5) averageComplexity = "moderate";
    else if (avgComplexity <= 4.5) averageComplexity = "complex";
    else averageComplexity = "very_complex";

    return {
      modelsTracked: models.length,
      totalDecisions,
      averageComplexity,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let adaptiveInstance: UniversalAdaptiveThinkingManager | null = null;

/**
 * Get or create universal adaptive thinking manager
 */
export function getUniversalAdaptiveThinkingManager(): UniversalAdaptiveThinkingManager {
  if (!adaptiveInstance) {
    adaptiveInstance = new UniversalAdaptiveThinkingManager();
  }
  return adaptiveInstance;
}

/**
 * Reset universal adaptive thinking manager (for testing)
 */
export function resetUniversalAdaptiveThinkingManager(): void {
  adaptiveInstance = null;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Extract provider from model string
 */
function extractProvider(model: string): string {
  if (model.includes("/")) {
    return model.split("/")[0].toLowerCase();
  }
  if (model.toLowerCase().includes("glm")) return "zhipu";
  if (model.toLowerCase().includes("gemini")) return "openrouter";
  if (model.toLowerCase().includes("grok")) return "openrouter";
  if (model.toLowerCase().includes("claude")) return "claude";
  if (model.toLowerCase().includes("llama")) return "lmstudio";
  return "unknown";
}

/**
 * Format adaptive thinking config for display
 */
export function formatAdaptiveThinkingConfig(config: ThinkingConfig): string {
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
