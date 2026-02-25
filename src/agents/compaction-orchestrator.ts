/**
 * Compaction Orchestrator
 * 
 * Implements Claude Code's two-stage compaction strategy:
 * 1. Try session memory compaction first (fast, incremental)
 * 2. Fallback to regular compaction (full, with attachments)
 * 
 * Based on Claude Code source (lines 276461-276490)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  shouldTriggerAutoCompact,
  calculateAutoCompactThreshold,
  checkThresholds,
  isAutoCompactEnabled
} from "./compaction-thresholds.js";
import { compactEmbeddedPiSession } from "./pi-embedded.js";
import type { OpenClawConfig } from "../config/config.js";

const log = createSubsystemLogger("compaction-orchestrator");

// ============================================================================
// TYPES
// ============================================================================

export interface CompactionResult {
  wasCompacted: boolean;
  compactionResult?: any;
  reason?: string;
  tokenCount?: number;
  threshold?: number;
}

export interface CompactionContext {
  messages: any[];
  model: string;
  agentId: string;
  sessionId: string;
  sessionKey: string;
  sessionFile: string;
  workspaceDir: string;
  config: OpenClawConfig;
  source?: string;
  customInstructions?: string;
}

// ============================================================================
// MAIN COMPACTION ORCHESTRATOR (Claude Code: W2B function, line 276461-276490)
// ============================================================================

/**
 * Perform compaction with Claude Code's two-stage strategy
 */
export async function performCompaction(
  context: CompactionContext
): Promise<CompactionResult> {
  // Check if compaction is disabled
  if (isTruthy(process.env.DISABLE_COMPACT)) {
    log.debug("Compaction disabled via environment variable");
    return { wasCompacted: false, reason: "disabled" };
  }
  
  const { messages, model, source } = context;
  
  // Count current tokens
  const currentTokens = countMessagesTokens(messages);
  const threshold = calculateAutoCompactThreshold(model);
  
  log.debug(
    `Compaction check: ${currentTokens.toLocaleString()} tokens, ` +
    `threshold: ${threshold.toLocaleString()}`
  );
  
  // Check if should compact
  const shouldCompact = await shouldTriggerAutoCompact(
    currentTokens,
    model,
    source
  );
  
  if (!shouldCompact) {
    log.debug("Skipping compaction: below threshold");
    return {
      wasCompacted: false,
      reason: "below threshold",
      tokenCount: currentTokens,
      threshold
    };
  }
  
  log.info(
    `Triggering compaction: ${currentTokens.toLocaleString()} >= ${threshold.toLocaleString()}`
  );
  
  // Stage 1: Try session memory compaction (TUR function)
  log.debug("Attempting session memory compaction...");
  const sessionMemoryResult = await trySessionMemoryCompaction(context);
  
  if (sessionMemoryResult) {
    log.info("Session memory compaction successful");
    clearCaches();
    return {
      wasCompacted: true,
      compactionResult: sessionMemoryResult,
      reason: "session memory",
      tokenCount: sessionMemoryResult.postCompactTokenCount,
      threshold
    };
  }
  
  // Stage 2: Fallback to regular compaction (xET function)
  log.debug("Session memory compaction failed, trying regular compaction...");
  const regularResult = await tryRegularCompaction(context);
  
  if (regularResult) {
    log.info("Regular compaction successful");
    clearCaches();
    return {
      wasCompacted: true,
      compactionResult: regularResult,
      reason: "regular",
      tokenCount: regularResult.postCompactTokenCount,
      threshold
    };
  }
  
  // Both stages failed
  log.warn("Both compaction methods failed");
  return {
    wasCompacted: false,
    reason: "both methods failed",
    tokenCount: currentTokens,
    threshold
  };
}

// ============================================================================
// SESSION MEMORY COMPACTION (Claude Code: TUR function, line 276263-276340)
// ============================================================================

/**
 * Try session memory compaction (fast, incremental)
 */
async function trySessionMemoryCompaction(
  context: CompactionContext
): Promise<any | null> {
  try {
    // Check if session memory is enabled
    if (!isSessionMemoryEnabled()) {
      log.debug("Session memory compaction disabled");
      return null;
    }
    
    // Initialize session memory
    await initializeSessionMemory();
    
    // Get session memory template
    const template = await getSessionMemoryTemplate(context.agentId);
    if (!template) {
      log.debug("No session memory template");
      return null;
    }
    
    // Check if template is empty
    if (await isTemplateEmpty(template)) {
      log.debug("Session memory template is empty");
      return null;
    }
    
    // Trigger compaction via existing OpenClaw infrastructure
    const result = await compactEmbeddedPiSession({
      sessionId: context.sessionId,
      sessionKey: context.sessionKey,
      sessionFile: context.sessionFile,
      workspaceDir: context.workspaceDir,
      config: context.config,
      customInstructions: context.customInstructions || 
        "Compact this conversation while preserving all important context, decisions, and open tasks."
    });
    
    if (result.ok && result.compacted) {
      log.debug("Session memory compaction completed");
      return {
        success: true,
        method: "session_memory",
        postCompactTokenCount: result.tokenCount || 0
      };
    }
    
    return null;
    
  } catch (error) {
    log.debug("Session memory compaction error:", error);
    return null;
  }
}

// ============================================================================
// REGULAR COMPACTION (Claude Code: xET function, line 275043-275180)
// ============================================================================

/**
 * Try regular compaction (full, with attachments)
 */
async function tryRegularCompaction(
  context: CompactionContext
): Promise<any | null> {
  try {
    // Trigger compaction via existing OpenClaw infrastructure
    const result = await compactEmbeddedPiSession({
      sessionId: context.sessionId,
      sessionKey: context.sessionKey,
      sessionFile: context.sessionFile,
      workspaceDir: context.workspaceDir,
      config: context.config,
      customInstructions: context.customInstructions ||
        "Compact this conversation while preserving all important context, decisions, open tasks, " +
        "file references, and action items. Keep it concise but complete."
    });
    
    if (result.ok && result.compacted) {
      log.debug("Regular compaction completed");
      return {
        success: true,
        method: "regular",
        postCompactTokenCount: result.tokenCount || 0
      };
    }
    
    return null;
    
  } catch (error) {
    log.error("Regular compaction error:", error);
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Count tokens in messages
 */
function countMessagesTokens(messages: any[]): number {
  // Use OpenClaw's existing token estimation
  try {
    const { estimateTokens } = await import("./compaction.js");
    return messages.reduce((sum, msg) => sum + estimateTokens(msg), 0);
  } catch {
    // Fallback: rough estimate (4 chars ≈ 1 token)
    const text = JSON.stringify(messages);
    return Math.ceil(text.length / 4);
  }
}

/**
 * Check if session memory is enabled
 */
function isSessionMemoryEnabled(): boolean {
  return isTruthy(process.env.ENABLE_CLAUDE_CODE_SM_COMPACT) ||
    (isTruthy(process.env.A9?.("tengu_session_memory")) &&
     isTruthy(process.env.A9?.("tengu_sm_compact")));
}

/**
 * Initialize session memory
 */
async function initializeSessionMemory(): Promise<void> {
  // Placeholder for session memory initialization
  // Would integrate with neuro-memory or similar system
}

/**
 * Get session memory template
 */
async function getSessionMemoryTemplate(agentId: string): Promise<any | null> {
  // Placeholder for session memory template retrieval
  return null;
}

/**
 * Check if template is empty
 */
async function isTemplateEmpty(template: any): Promise<boolean> {
  // Placeholder for template emptiness check
  return false;
}

/**
 * Clear caches after compaction
 */
function clearCaches(): void {
  // Clear system prompt section cache
  try {
    const { clearSystemPromptSectionCache } = await import("./system-prompt-cache.js");
    clearSystemPromptSectionCache();
  } catch {
    // Cache module not available
  }
  
  log.debug("Caches cleared");
}

/**
 * Check if a value is truthy
 */
function isTruthy(value: string | undefined): boolean {
  if (value === undefined || value === "") {
    return false;
  }
  const lower = value.toLowerCase();
  return lower !== "false" && lower !== "0" && lower !== "no";
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  CompactionResult,
  CompactionContext
};
