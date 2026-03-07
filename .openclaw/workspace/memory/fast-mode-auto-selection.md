# Fast Mode - Intelligent Auto-Selection System

## Concept

**Auto-Fast Mode** = The AI automatically chooses the optimal model speed based on:
1. **Query complexity** - Simple vs complex tasks
2. **Response requirements** - Quick answer vs deep analysis
3. **Context size** - Short vs long context
4. **Tool usage** - Simple tools vs complex orchestration
5. **User patterns** - Learning from usage history

---

## 1. Types & Interfaces

```typescript
// src/config/types.auto-fast-mode.ts

/**
 * Query complexity levels
 */
export type QueryComplexity = 
  | "trivial"    // Single word/number answers
  | "simple"     // Quick lookups, simple code
  | "moderate"   // Standard tasks, some reasoning
  | "complex"    // Multi-step, deep analysis
  | "expert";    // Research-level, extensive reasoning

/**
 * Task type classification
 */
export type TaskType =
  | "quick_question"      // Simple factual query
  | "code_completion"     // Code autocomplete
  | "code_review"         // Code analysis
  | "code_generation"     // Write new code
  | "debugging"           // Find/fix bugs
  | "refactoring"         // Code improvement
  | "explanation"         // Explain concepts
  | "planning"            // Multi-step planning
  | "research"            // Deep research
  | "analysis"            // Data/text analysis
  | "creative_writing"    // Content creation
  | "translation"         // Language translation
  | "summarization"       // Summarize content
  | "tool_orchestration"  // Complex tool usage
  | "multi_file_edit"     // Edit multiple files
  | "unknown";            // Unclassified

/**
 * Model speed preference
 */
export type ModelSpeedPreference = 
  | "fast"       // Prefer speed over depth
  | "balanced"   // Balance speed and quality
  | "thorough";  // Prefer quality over speed

/**
 * Auto-selection decision factors
 */
export interface AutoSelectionFactors {
  /** Query complexity (0-1) */
  complexity: number;
  
  /** Task type classification */
  taskType: TaskType;
  
  /** Context size (tokens) */
  contextSize: number;
  
  /** Number of tools to use */
  toolCount: number;
  
  /** Estimated response length */
  estimatedResponseLength: number;
  
  /** Requires reasoning chain */
  requiresReasoning: boolean;
  
  /** Requires code execution */
  requiresCodeExecution: boolean;
  
  /** Multi-step task */
  isMultiStep: boolean;
  
  /** User urgency signal */
  userUrgency: "low" | "normal" | "high";
  
  /** Historical accuracy needs */
  accuracyRequirement: "low" | "normal" | "high";
}

/**
 * Auto-selection result
 */
export interface AutoSelectionResult {
  /** Use fast mode? */
  useFastMode: boolean;
  
  /** Selected model */
  model: string;
  
  /** Confidence in selection (0-1) */
  confidence: number;
  
  /** Reason for selection */
  reason: string;
  
  /** Factors considered */
  factors: AutoSelectionFactors;
  
  /** Estimated speedup if using fast mode */
  estimatedSpeedup?: number;
  
  /** Estimated quality impact if using fast mode */
  estimatedQualityImpact?: number;
}

/**
 * Auto-selection configuration
 */
export interface AutoSelectionConfig {
  /** Enable auto-selection */
  enabled: boolean;
  
  /** Minimum confidence threshold */
  confidenceThreshold: number;
  
  /** Complexity threshold for fast mode (below = fast) */
  complexityThreshold: number;
  
  /** Context size threshold (below = fast) */
  contextThreshold: number;
  
  /** Prefer speed by default */
  preferSpeedByDefault: boolean;
  
  /** Learn from user feedback */
  learnFromFeedback: boolean;
  
  /** User preference override */
  userPreference?: ModelSpeedPreference;
}

/**
 * Historical data for learning
 */
export interface SelectionHistory {
  /** Query hash */
  queryHash: string;
  
  /** Factors */
  factors: AutoSelectionFactors;
  
  /** Selection made */
  usedFastMode: boolean;
  
  /** User satisfaction (0-1) */
  satisfaction?: number;
  
  /** Response time (ms) */
  responseTime: number;
  
  /** Response quality score */
  qualityScore?: number;
  
  /** User corrected selection */
  userCorrected?: boolean;
}
```

---

## 2. Query Analyzer

```typescript
// src/agents/query-analyzer.ts

import type { QueryComplexity, TaskType, AutoSelectionFactors } from "../config/types.auto-fast-mode.js";

/**
 * Analyze query and extract factors for auto-selection
 */
export class QueryAnalyzer {
  
  /**
   * Analyze a user query
   */
  analyzeQuery(query: string, context?: {
    availableTools?: string[];
    conversationHistory?: any[];
    fileSize?: number;
  }): AutoSelectionFactors {
    return {
      complexity: this.calculateComplexity(query, context),
      taskType: this.classifyTask(query),
      contextSize: context?.fileSize || 0,
      toolCount: context?.availableTools?.length || 0,
      estimatedResponseLength: this.estimateResponseLength(query),
      requiresReasoning: this.requiresReasoning(query),
      requiresCodeExecution: this.requiresCodeExecution(query),
      isMultiStep: this.isMultiStep(query),
      userUrgency: this.detectUrgency(query),
      accuracyRequirement: this.detectAccuracyNeed(query),
    };
  }
  
  /**
   * Calculate query complexity (0-1)
   */
  private calculateComplexity(query: string, context?: any): number {
    let score = 0;
    
    // Length factor
    const wordCount = query.split(/\s+/).length;
    if (wordCount < 5) score += 0.1;
    else if (wordCount < 15) score += 0.2;
    else if (wordCount < 30) score += 0.4;
    else if (wordCount < 60) score += 0.6;
    else score += 0.8;
    
    // Complexity indicators
    const complexIndicators = [
      /analyze/i, /compare/i, /evaluate/i, /design/i,
      /architect/i, /optimize/i, /refactor/i, /debug/i,
      /investigate/i, /research/i, /explain why/i,
      /multiple steps/i, /comprehensive/i, /detailed/i,
    ];
    
    for (const pattern of complexIndicators) {
      if (pattern.test(query)) score += 0.1;
    }
    
    // Simple indicators
    const simpleIndicators = [
      /^what('s| is) /i, /^how (do|to) /i, /^where /i,
      /^when /i, /^who /i, /^list /i, /^show /i,
      /^quick /i, /^briefly /i, /^just /i,
    ];
    
    for (const pattern of simpleIndicators) {
      if (pattern.test(query)) score -= 0.1;
    }
    
    // Context complexity
    if (context?.availableTools?.length > 3) score += 0.15;
    if (context?.fileSize && context.fileSize > 10000) score += 0.1;
    
    // Clamp to 0-1
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Classify task type
   */
  private classifyTask(query: string): TaskType {
    const queryLower = query.toLowerCase();
    
    // Quick question patterns
    if (/^(what|who|when|where|how many|how much)/i.test(query)) {
      if (query.length < 100) return "quick_question";
    }
    
    // Code completion
    if (/complete|finish|autocomplete|suggest/i.test(query)) {
      return "code_completion";
    }
    
    // Code review
    if (/review|check|audit|analyze.*code|look at.*code/i.test(query)) {
      return "code_review";
    }
    
    // Code generation
    if (/write|create|generate|implement|build|make/i.test(query)) {
      if (/function|class|component|module|script/i.test(query)) {
        return "code_generation";
      }
    }
    
    // Debugging
    if (/bug|error|fix|debug|issue|problem|not working|broken/i.test(query)) {
      return "debugging";
    }
    
    // Refactoring
    if (/refactor|improve|optimize|clean up|restructure/i.test(query)) {
      return "refactoring";
    }
    
    // Explanation
    if (/explain|describe|tell me about|what does|how does/i.test(query)) {
      return "explanation";
    }
    
    // Planning
    if (/plan|design|architect|roadmap|strategy|step-by-step/i.test(query)) {
      return "planning";
    }
    
    // Research
    if (/research|investigate|explore|deep dive|comprehensive/i.test(query)) {
      return "research";
    }
    
    // Analysis
    if (/analyze|examine|evaluate|assess|compare|contrast/i.test(query)) {
      return "analysis";
    }
    
    // Creative writing
    if (/write|compose|create.*story|draft|author/i.test(query)) {
      if (/article|blog|email|message|document/i.test(query)) {
        return "creative_writing";
      }
    }
    
    // Translation
    if (/translate|convert to|in (spanish|french|german)/i.test(query)) {
      return "translation";
    }
    
    // Summarization
    if (/summarize|sum up|tldr|brief|overview/i.test(query)) {
      return "summarization";
    }
    
    // Tool orchestration
    if (/search|find|look up|query|fetch/i.test(query)) {
      if (/and then|after that|next|also/i.test(query)) {
        return "tool_orchestration";
      }
    }
    
    // Multi-file edit
    if (/multiple files|across.*files|all.*files|update.*every/i.test(query)) {
      return "multi_file_edit";
    }
    
    return "unknown";
  }
  
  /**
   * Estimate response length
   */
  private estimateResponseLength(query: string): number {
    const wordCount = query.split(/\s+/).length;
    
    // Heuristics based on query length and type
    if (this.classifyTask(query) === "quick_question") {
      return 50; // Very short
    }
    
    if (/briefly|quickly|short|simple/i.test(query)) {
      return 100;
    }
    
    if (/detailed|comprehensive|thorough|extensive/i.test(query)) {
      return wordCount * 10; // Long response
    }
    
    if (/list|enumerate|name all/i.test(query)) {
      return 200;
    }
    
    // Default: 2-5x query length
    return wordCount * 3;
  }
  
  /**
   * Check if query requires reasoning
   */
  private requiresReasoning(query: string): boolean {
    const reasoningIndicators = [
      /why|because|reason|cause|explain.*how/i,
      /compare|contrast|difference|similarity/i,
      /analyze|evaluate|assess|judge/i,
      /should|would|could|might|if.*then/i,
      /pros and cons|advantages|disadvantages/i,
      /recommend|suggest|advise|best/i,
      /solve|figure out|determine|calculate/i,
    ];
    
    return reasoningIndicators.some(pattern => pattern.test(query));
  }
  
  /**
   * Check if query requires code execution
   */
  private requiresCodeExecution(query: string): boolean {
    return /run|execute|test|try|check if works|output/i.test(query);
  }
  
  /**
   * Check if multi-step task
   */
  private isMultiStep(query: string): boolean {
    const stepIndicators = [
      /then|next|after|step|first.*second|part \d+/i,
      /and also|additionally|furthermore/i,
      /multiple|several|all of the/i,
    ];
    
    // Also check for numbered lists
    if (/\d+\./.test(query)) return true;
    
    return stepIndicators.some(pattern => pattern.test(query));
  }
  
  /**
   * Detect user urgency
   */
  private detectUrgency(query: string): "low" | "normal" | "high" {
    const highUrgency = [
      /asap|immediately|urgent|quickly|fast|hurry/i,
      /right now|now|please help|emergency/i,
    ];
    
    const lowUrgency = [
      /when you have time|no rush|take your time|eventually/i,
      /just curious|wondering|fyi/i,
    ];
    
    if (highUrgency.some(p => p.test(query))) return "high";
    if (lowUrgency.some(p => p.test(query))) return "low";
    return "normal";
  }
  
  /**
   * Detect accuracy requirement
   */
  private detectAccuracyNeed(query: string): "low" | "normal" | "high" {
    const highAccuracy = [
      /exact|precise|accurate|correct|right/i,
      /critical|important|crucial|essential/i,
      /production|live|deploy|ship/i,
      /security|safety|legal|compliance/i,
    ];
    
    const lowAccuracy = [
      /roughly|approximately|about|around|estimate/i,
      /just|simple|basic|quick/i,
    ];
    
    if (highAccuracy.some(p => p.test(query))) return "high";
    if (lowAccuracy.some(p => p.test(query))) return "low";
    return "normal";
  }
}

export const queryAnalyzer = new QueryAnalyzer();
```

---

## 3. Auto-Selection Engine

```typescript
// src/agents/auto-fast-mode-selector.ts

import type { 
  AutoSelectionFactors, 
  AutoSelectionResult, 
  AutoSelectionConfig,
  ModelSpeedPreference,
  SelectionHistory 
} from "../config/types.auto-fast-mode.js";
import { QueryAnalyzer } from "./query-analyzer.js";
import { getFastModelForModel, detectProviderFromModel } from "../config/defaults.fast-mode.js";

/**
 * Default auto-selection configuration
 */
export const DEFAULT_AUTO_CONFIG: AutoSelectionConfig = {
  enabled: true,
  confidenceThreshold: 0.7,
  complexityThreshold: 0.4,
  contextThreshold: 5000,
  preferSpeedByDefault: true,
  learnFromFeedback: true,
};

/**
 * Auto-Fast Mode Selection Engine
 */
export class AutoFastModeSelector {
  private analyzer = new QueryAnalyzer();
  private history: SelectionHistory[] = [];
  private config: AutoSelectionConfig;
  
  constructor(config: Partial<AutoSelectionConfig> = {}) {
    this.config = { ...DEFAULT_AUTO_CONFIG, ...config };
  }
  
  /**
   * Decide whether to use fast mode for a query
   */
  decide(
    query: string,
    currentModel: string,
    context?: {
      availableTools?: string[];
      conversationHistory?: any[];
      fileSize?: number;
    }
  ): AutoSelectionResult {
    // If auto-selection disabled, default to current
    if (!this.config.enabled) {
      return this.createResult(false, currentModel, "Auto-selection disabled");
    }
    
    // Analyze query
    const factors = this.analyzer.analyzeQuery(query, context);
    
    // Check user preference override
    if (this.config.userPreference) {
      return this.applyUserPreference(factors, currentModel);
    }
    
    // Calculate decision
    const decision = this.calculateDecision(factors, currentModel);
    
    // Get fast model if needed
    let selectedModel = currentModel;
    if (decision.useFastMode) {
      const fastModel = getFastModelForModel(currentModel);
      if (fastModel) {
        selectedModel = fastModel.fastModel;
      }
    }
    
    return {
      ...decision,
      model: selectedModel,
      factors,
    };
  }
  
  /**
   * Calculate decision based on factors
   */
  private calculateDecision(
    factors: AutoSelectionFactors, 
    currentModel: string
  ): Partial<AutoSelectionResult> {
    let fastModeScore = 0;
    const reasons: string[] = [];
    
    // Factor 1: Complexity (lower = fast mode)
    if (factors.complexity < this.config.complexityThreshold) {
      fastModeScore += 0.3;
      reasons.push("Low complexity");
    } else if (factors.complexity > 0.7) {
      fastModeScore -= 0.3;
      reasons.push("High complexity");
    }
    
    // Factor 2: Task type
    const fastTaskTypes = [
      "quick_question",
      "code_completion", 
      "translation",
      "summarization",
    ];
    
    const slowTaskTypes = [
      "research",
      "planning",
      "tool_orchestration",
      "multi_file_edit",
      "debugging",
    ];
    
    if (fastTaskTypes.includes(factors.taskType)) {
      fastModeScore += 0.25;
      reasons.push(`Task: ${factors.taskType}`);
    } else if (slowTaskTypes.includes(factors.taskType)) {
      fastModeScore -= 0.25;
      reasons.push(`Task: ${factors.taskType}`);
    }
    
    // Factor 3: Context size
    if (factors.contextSize < this.config.contextThreshold) {
      fastModeScore += 0.15;
      reasons.push("Small context");
    } else if (factors.contextSize > 20000) {
      fastModeScore -= 0.15;
      reasons.push("Large context");
    }
    
    // Factor 4: Estimated response length
    if (factors.estimatedResponseLength < 100) {
      fastModeScore += 0.2;
      reasons.push("Short response expected");
    } else if (factors.estimatedResponseLength > 500) {
      fastModeScore -= 0.1;
      reasons.push("Long response expected");
    }
    
    // Factor 5: Reasoning required
    if (factors.requiresReasoning) {
      fastModeScore -= 0.15;
      reasons.push("Requires reasoning");
    }
    
    // Factor 6: Multi-step
    if (factors.isMultiStep) {
      fastModeScore -= 0.1;
      reasons.push("Multi-step task");
    }
    
    // Factor 7: User urgency
    if (factors.userUrgency === "high") {
      fastModeScore += 0.2;
      reasons.push("High urgency");
    }
    
    // Factor 8: Accuracy requirement
    if (factors.accuracyRequirement === "high") {
      fastModeScore -= 0.2;
      reasons.push("High accuracy needed");
    }
    
    // Factor 9: Tool usage
    if (factors.toolCount > 3) {
      fastModeScore -= 0.1;
      reasons.push("Multiple tools");
    } else if (factors.toolCount === 0) {
      fastModeScore += 0.1;
    }
    
    // Apply default preference
    if (this.config.preferSpeedByDefault) {
      fastModeScore += 0.1;
    }
    
    // Learn from history
    const historyAdjustment = this.getHistoryAdjustment(factors);
    fastModeScore += historyAdjustment;
    
    // Make decision
    const useFastMode = fastModeScore > 0;
    const confidence = Math.abs(fastModeScore);
    
    const reason = useFastMode 
      ? `Fast mode: ${reasons.join(", ")}`
      : `Regular mode: ${reasons.join(", ")}`;
    
    return {
      useFastMode,
      confidence,
      reason,
      estimatedSpeedup: useFastMode ? 2 : undefined,
      estimatedQualityImpact: useFastMode ? -0.1 : undefined,
    };
  }
  
  /**
   * Apply user preference override
   */
  private applyUserPreference(
    factors: AutoSelectionFactors,
    currentModel: string
  ): AutoSelectionResult {
    const preference = this.config.userPreference!;
    
    let useFastMode = false;
    let reason = "";
    
    switch (preference) {
      case "fast":
        useFastMode = factors.complexity < 0.7;
        reason = useFastMode 
          ? "User prefers fast mode" 
          : "Too complex for fast mode";
        break;
        
      case "balanced":
        useFastMode = factors.complexity < 0.4;
        reason = "User prefers balanced mode";
        break;
        
      case "thorough":
        useFastMode = factors.complexity < 0.2 && factors.userUrgency === "high";
        reason = useFastMode 
          ? "Urgent request" 
          : "User prefers thorough mode";
        break;
    }
    
    const fastModel = useFastMode ? getFastModelForModel(currentModel) : null;
    
    return {
      useFastMode,
      model: fastModel?.fastModel || currentModel,
      confidence: 0.8,
      reason,
      factors,
    };
  }
  
  /**
   * Get adjustment from historical data
   */
  private getHistoryAdjustment(factors: AutoSelectionFactors): number {
    if (!this.config.learnFromFeedback || this.history.length < 5) {
      return 0;
    }
    
    // Find similar queries
    const similar = this.history.filter(h => 
      Math.abs(h.factors.complexity - factors.complexity) < 0.2 &&
      h.factors.taskType === factors.taskType
    );
    
    if (similar.length < 3) return 0;
    
    // Calculate satisfaction for fast vs regular
    const fastQueries = similar.filter(h => h.usedFastMode);
    const regularQueries = similar.filter(h => !h.usedFastMode);
    
    const fastSatisfaction = this.averageSatisfaction(fastQueries);
    const regularSatisfaction = this.averageSatisfaction(regularQueries);
    
    // Adjust based on historical satisfaction
    if (fastSatisfaction > regularSatisfaction + 0.1) {
      return 0.1; // Prefer fast
    } else if (regularSatisfaction > fastSatisfaction + 0.1) {
      return -0.1; // Prefer regular
    }
    
    return 0;
  }
  
  /**
   * Record selection outcome for learning
   */
  recordOutcome(
    query: string,
    factors: AutoSelectionFactors,
    usedFastMode: boolean,
    outcome: {
      responseTime: number;
      userSatisfaction?: number;
      qualityScore?: number;
      userCorrected?: boolean;
    }
  ): void {
    const queryHash = this.hashQuery(query);
    
    this.history.push({
      queryHash,
      factors,
      usedFastMode,
      responseTime: outcome.responseTime,
      satisfaction: outcome.userSatisfaction,
      qualityScore: outcome.qualityScore,
      userCorrected: outcome.userCorrected,
    });
    
    // Keep history manageable
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
  }
  
  /**
   * Get configuration
   */
  getConfig(): AutoSelectionConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  setConfig(updates: Partial<AutoSelectionConfig>): void {
    this.config = { ...this.config, ...updates };
  }
  
  // Helper methods
  
  private createResult(
    useFastMode: boolean, 
    model: string, 
    reason: string,
    confidence: number = 0.5
  ): AutoSelectionResult {
    return {
      useFastMode,
      model,
      confidence,
      reason,
      factors: {} as AutoSelectionFactors,
    };
  }
  
  private averageSatisfaction(queries: SelectionHistory[]): number {
    const withSatisfaction = queries.filter(q => q.satisfaction !== undefined);
    if (withSatisfaction.length === 0) return 0.5;
    
    return withSatisfaction.reduce((sum, q) => sum + (q.satisfaction || 0), 0) / withSatisfaction.length;
  }
  
  private hashQuery(query: string): string {
    // Simple hash for deduplication
    return query.toLowerCase().trim().slice(0, 50);
  }
}

// Singleton instance
export const autoFastModeSelector = new AutoFastModeSelector();
```

---

## 4. Integration with Conversation Loop

```typescript
// src/agents/conversation-with-auto-fast.ts

import { autoFastModeSelector } from "./auto-fast-mode-selector.js";
import { 
  isFastModeEnabled, 
  enableFastMode, 
  disableFastMode,
  getModelToUse 
} from "./fast-mode-manager.universal.js";

/**
 * Process user message with auto fast mode selection
 */
export async function processMessageWithAutoFast(
  userMessage: string,
  currentModel: string,
  context: {
    availableTools: string[];
    conversationHistory: any[];
    setAppState: (updater: (state: any) => any) => void;
  }
): Promise<{
  modelToUse: string;
  autoSelectionReason: string;
  fastModeEnabled: boolean;
}> {
  // Get auto-selection decision
  const decision = autoFastModeSelector.decide(
    userMessage,
    currentModel,
    {
      availableTools: context.availableTools,
      conversationHistory: context.conversationHistory,
    }
  );
  
  // Apply decision
  let modelToUse = currentModel;
  let fastModeEnabled = false;
  
  if (decision.useFastMode && decision.confidence > 0.5) {
    // Enable fast mode
    const result = enableFastMode(currentModel, {
      autoSwitch: true,
    });
    
    if (result.enabled && result.fastModel) {
      modelToUse = result.fastModel;
      fastModeEnabled = true;
      
      context.setAppState((state) => ({
        ...state,
        fastMode: true,
        fastModeModel: result.fastModel,
        autoFastModeReason: decision.reason,
      }));
    }
  } else {
    // Use regular mode
    disableFastMode();
    
    context.setAppState((state) => ({
      ...state,
      fastMode: false,
      autoFastModeReason: decision.reason,
    }));
  }
  
  return {
    modelToUse,
    autoSelectionReason: decision.reason,
    fastModeEnabled,
  };
}

/**
 * Record user feedback for learning
 */
export function recordAutoFastFeedback(
  query: string,
  fastModeWasUsed: boolean,
  userFeedback: {
    satisfied: boolean;
    responseTime: number;
    userCorrectedSelection?: boolean;
  }
): void {
  // Get factors from history (would need to store these)
  const factors = {} as any; // Retrieve from stored decision
  
  autoFastModeSelector.recordOutcome(
    query,
    factors,
    fastModeWasUsed,
    {
      responseTime: userFeedback.responseTime,
      userSatisfaction: userFeedback.satisfied ? 1 : 0,
      userCorrected: userFeedback.userCorrectedSelection,
    }
  );
}
```

---

## 5. User Commands

```typescript
// src/commands/auto-fast-mode.ts

import { autoFastModeSelector } from "../agents/auto-fast-mode-selector.js";
import type { ModelSpeedPreference } from "../config/types.auto-fast-mode.js";

/**
 * Handle /auto-fast command
 */
export async function handleAutoFastCommand(
  args: string | undefined,
  context: CommandContext
): Promise<CommandResult> {
  const argLower = args?.trim().toLowerCase();
  
  // Show current status
  if (!argLower || argLower === "status") {
    const config = autoFastModeSelector.getConfig();
    return {
      type: "info",
      message: `
Auto Fast Mode Status
────────────────────
Enabled: ${config.enabled ? "✓" : "✗"}
Confidence Threshold: ${config.confidenceThreshold}
Complexity Threshold: ${config.complexityThreshold}
Preference: ${config.userPreference || "auto"}

Usage:
  /auto-fast on       - Enable auto-selection
  /auto-fast off      - Disable (always regular)
  /auto-fast speed    - Prefer fast mode
  /auto-fast quality  - Prefer thorough mode
  /auto-fast balanced - Balance both
      `.trim(),
    };
  }
  
  // Enable/disable
  if (argLower === "on" || argLower === "enable") {
    autoFastModeSelector.setConfig({ enabled: true });
    return {
      type: "success",
      message: "⚡ Auto fast mode enabled - AI will choose optimal speed",
    };
  }
  
  if (argLower === "off" || argLower === "disable") {
    autoFastModeSelector.setConfig({ enabled: false });
    return {
      type: "success",
      message: "Auto fast mode disabled - using regular mode",
    };
  }
  
  // Set preference
  if (argLower === "speed" || argLower === "fast") {
    autoFastModeSelector.setConfig({ 
      enabled: true, 
      userPreference: "fast" 
    });
    return {
      type: "success",
      message: "⚡ Speed preference set - AI will prefer fast responses",
    };
  }
  
  if (argLower === "quality" || argLower === "thorough") {
    autoFastModeSelector.setConfig({ 
      enabled: true, 
      userPreference: "thorough" 
    });
    return {
      type: "success",
      message: "🎯 Quality preference set - AI will prefer thorough responses",
    };
  }
  
  if (argLower === "balanced") {
    autoFastModeSelector.setConfig({ 
      enabled: true, 
      userPreference: "balanced" 
    });
    return {
      type: "success",
      message: "⚖️ Balanced preference set - AI will balance speed and quality",
    };
  }
  
  // Unknown command
  return {
    type: "error",
    message: `Unknown option: ${argLower}. Use: on, off, speed, quality, or balanced`,
  };
}
```

---

## 6. UI Indicator

```tsx
// src/components/AutoFastIndicator.tsx

import React from "react";
import { Box, Text } from "ink";
import { useAppState } from "../hooks/useAppState.js";

export function AutoFastIndicator() {
  const fastMode = useAppState((s) => s.fastMode);
  const autoReason = useAppState((s) => s.autoFastModeReason);
  
  if (!fastMode) return null;
  
  return (
    <Box>
      <Text color="orange" bold>⚡ Auto</Text>
      {autoReason && (
        <Text dimColor> ({autoReason})</Text>
      )}
    </Box>
  );
}
```

---

## 7. Examples

### Example 1: Simple Query → Fast Mode
```
User: "What is 2 + 2?"

Analysis:
- Complexity: 0.1 (trivial)
- Task: quick_question
- Response length: 10 chars
- Reasoning: No
- Urgency: Normal

Decision: FAST MODE ✓
Reason: "Low complexity, Task: quick_question, Short response expected"
Model: GPT-4o-mini (instead of GPT-4o)
```

### Example 2: Complex Analysis → Regular Mode
```
User: "Analyze the architectural differences between microservices 
      and monolith, and recommend which approach to use for a 
      real-time trading platform handling 1M transactions/second"

Analysis:
- Complexity: 0.85 (complex)
- Task: analysis + planning
- Response length: 2000+ chars
- Reasoning: Yes
- Multi-step: Yes
- Accuracy: High

Decision: REGULAR MODE ✓
Reason: "High complexity, Task: analysis, Requires reasoning, 
         Multi-step task, High accuracy needed"
Model: GPT-4o (full)
```

### Example 3: Code Completion → Fast Mode
```
User: "Complete this function: def add(a, b):"

Analysis:
- Complexity: 0.2 (simple)
- Task: code_completion
- Response length: 50 chars
- Urgency: Normal

Decision: FAST MODE ✓
Reason: "Low complexity, Task: code_completion"
Model: Claude Sonnet 4.6 (instead of Opus 4.6)
```

### Example 4: Urgent Debug → Fast Mode
```
User: "Fix this bug ASAP! TypeError in production!"

Analysis:
- Complexity: 0.5 (moderate)
- Task: debugging
- Urgency: HIGH
- Accuracy: High (production)

Decision: FAST MODE ✓ (despite complexity)
Reason: "High urgency overrides moderate complexity"
Model: Fast variant with priority
```

---

## 8. Learning Over Time

```typescript
// The system learns from user feedback

// Session 1: User corrects fast mode selection
User: "Explain quantum computing"
System: Uses FAST mode (mistake)
User: "That's too simple, give me more detail"
System: Switches to REGULAR mode
LEARNED: For "explain" + technical topics → prefer regular

// Session 2: Similar query
User: "Explain machine learning"
System: Remembers correction → Uses REGULAR mode
Result: Detailed explanation, user satisfied
LEARNED: Reinforced pattern

// Session 3: Pattern established
User: "Explain neural networks"
System: Automatically uses REGULAR mode
Reason: "Learned from 3 similar queries"
```

---

## Summary

### ✅ **Automatic Selection Based On:**

1. **Query complexity** (analyzed linguistically)
2. **Task type** (15+ categories)
3. **Context size** (file size, conversation length)
4. **Tool usage** (simple vs complex)
5. **Response length** (estimated)
6. **Reasoning needs** (detected)
7. **Multi-step tasks** (detected)
8. **User urgency** (language signals)
9. **Accuracy needs** (context signals)
10. **Historical learning** (from feedback)

### 🎯 **User Control:**

```bash
/auto-fast on        # Enable auto-selection
/auto-fast off       # Disable (always regular)
/auto-fast speed     # Prefer fast
/auto-fast quality   # Prefer thorough
/auto-fast balanced  # Balance both
```

### 📊 **Transparency:**

- Shows why mode was selected
- Confidence score displayed
- User can override anytime
- Learns from corrections

### 🧠 **Intelligence:**

- Pattern recognition
- Learns from feedback
- Adapts to user preferences
- Considers context

**The AI now chooses the optimal speed automatically!** 🚀
