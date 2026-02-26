/**
 * Tool Execution Wrapper with Hooks Integration
 *
 * Wraps tool execution with hook support, allowing hooks to:
 * - Block/modify tool execution (PreToolUse)
 * - Process tool results (PostToolUse)
 * - Handle tool failures (PostToolUseFailure)
 *
 * Also includes Plan Mode blocking and AcceptEdits permission checking.
 * Works with ANY LLM provider (client-side feature).
 */

import type { HookExecutionResult } from "../hooks/executor.js";
import type { AnyAgentTool } from "./tools/common.js";
import { globalHookExecutor } from "../hooks/executor.js";
import {
  shouldBlockToolExecution,
  getToolBlockReason,
  getPermissionMode,
  setPermissionMode,
  shouldPromptForTool,
  getToolPermissionDecision,
  getToolCategory,
  PERMISSION_MODE_DESCRIPTIONS,
} from "./plan-mode/permission-mode.js";
import { isYoloModeActive } from "./yolo-mode/index.js";

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  blocked: boolean;
  reason?: string;
  systemMessage?: string;
  result?: unknown;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  /** Current permission mode */
  permissionMode?: string;
  /** Whether this tool would normally require approval (for gateway mode) */
  needsApproval?: boolean;
  /** Tool category for display */
  toolCategory?: "edit" | "destructive" | "readonly" | "unknown";
  /** Permission decision for this tool */
  permissionDecision?: "auto-approve" | "prompt" | "block";
}

/**
 * Get permission info for a tool (for gateway mode)
 * Returns metadata about whether the tool needs approval
 */
export function getToolPermissionInfo(toolName: string): {
  toolCategory: "edit" | "destructive" | "readonly" | "unknown";
  permissionDecision: "auto-approve" | "prompt" | "block";
  needsApproval: boolean;
  permissionMode: string;
} {
  const category = getToolCategory(toolName);
  const decision = getToolPermissionDecision(toolName);
  const mode = getPermissionMode();

  return {
    toolCategory: category,
    permissionDecision: decision,
    needsApproval: decision === "prompt",
    permissionMode: mode,
  };
}

/**
 * Check if a tool should be auto-approved in current mode
 * Useful for gateway to skip approval UI
 */
export function isToolAutoApprovedInCurrentMode(toolName: string): boolean {
  return getToolPermissionDecision(toolName) === "auto-approve";
}

/**
 * Execute tool with hooks integration
 *
 * @param tool - Tool to execute
 * @param args - Tool arguments
 * @param context - Execution context
 * @returns Tool execution result
 */
export async function executeToolWithHooks(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  context: {
    session_id: string;
    tool_use_id: string;
    cwd: string;
    transcript_path?: string;
    permission_mode?: string;
  },
): Promise<ToolExecutionResult> {
  // YOLO mode check - bypasses all permission checks
  if (isYoloModeActive()) {
    // In YOLO mode, skip plan mode blocking
    // Only hook blocking still applies
  } else {
    // ADD: Check plan mode blocking FIRST (before hooks)
    const planModeBlock = shouldBlockToolExecution(tool.name);
    if (planModeBlock) {
      return {
        blocked: true,
        reason: getToolBlockReason(tool.name),
        permissionMode: getPermissionMode(),
      };
    }
  }

  // Build base context for hooks
  const baseContext = {
    session_id: context.session_id,
    transcript_path: context.transcript_path || "",
    cwd: context.cwd,
    permission_mode: context.permission_mode || getPermissionMode(),
    tool_name: tool.name,
    tool_use_id: context.tool_use_id,
  };

  // ========================================
  // PRE TOOL USE HOOKS
  // ========================================
  const preToolUseResult = await globalHookExecutor.executeHooks("PreToolUse", {
    ...baseContext,
    hook_event_name: "PreToolUse",
    tool_input: args,
  });

  // Handle hook decisions
  if (preToolUseResult.preventContinuation) {
    return {
      blocked: true,
      reason: preToolUseResult.stopReason || "Blocked by hook",
      systemMessage: preToolUseResult.systemMessage,
    };
  }

  // Handle permission behavior
  if (preToolUseResult.permissionBehavior === "deny") {
    return {
      blocked: true,
      reason: preToolUseResult.blockingError?.blockingError || "Denied by hook",
      systemMessage: preToolUseResult.systemMessage,
    };
  }

  // Use modified input if provided
  const finalArgs = preToolUseResult.updatedInput || args;

  // ========================================
  // CREATE FILE SNAPSHOT (before edit tools)
  // ========================================
  let snapshotId: string | undefined;
  const editTools = ["edit", "write", "notebookedit", "notebook_write"];
  const isEditTool = editTools.some((t) => tool.name.toLowerCase().includes(t));

  if (isEditTool && fileHistoryManager) {
    try {
      // Track file if path provided
      const filePath = (finalArgs as any).path || (finalArgs as any).file_path;
      if (filePath) {
        fileHistoryManager.trackFile(filePath);
      }

      // Create snapshot before edit
      const snapshot = await fileHistoryManager.createSnapshot(context.tool_use_id, {
        description: `Before ${tool.name} tool execution`,
      });
      if (snapshot) {
        snapshotId = snapshot.id;
      }
    } catch (error) {
      log.debug(`Failed to create file snapshot: ${error}`);
      // Continue even if snapshot fails
    }
  }

  // ========================================
  // EXECUTE TOOL
  // ========================================
  let result: unknown;
  let error: Error | null = null;

  try {
    result = await tool.call(finalArgs, {
      abortController: new AbortController(),
      getAppState: async () => ({}),
    });
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  // ========================================
  // POST TOOL USE / FAILURE HOOKS
  // ========================================
  if (error) {
    // Tool failed - run PostToolUseFailure hooks
    const postFailureResult = await globalHookExecutor.executeHooks("PostToolUseFailure", {
      ...baseContext,
      hook_event_name: "PostToolUseFailure",
      tool_input: finalArgs,
      error: error.message,
      is_interrupt: false,
    });

    // Add additional context from hooks
    let errorMessage = error.message;
    if (postFailureResult.additionalContext) {
      errorMessage = `${errorMessage}\n\nHook context: ${postFailureResult.additionalContext}`;
    }

    throw new Error(errorMessage);
  } else {
    // Tool succeeded - run PostToolUse hooks
    const postToolUseResult = await globalHookExecutor.executeHooks("PostToolUse", {
      ...baseContext,
      hook_event_name: "PostToolUse",
      tool_input: finalArgs,
      tool_response: result,
    });

    // Process result
    let finalResult = result;

    // Use modified tool output if provided
    if (postToolUseResult.updatedMCPToolOutput) {
      finalResult = postToolUseResult.updatedMCPToolOutput;
    }

    // Build return value
    const returnValue: ToolExecutionResult = {
      blocked: false,
      result: finalResult,
      snapshotId,
    };

    // Add additional context
    if (postToolUseResult.additionalContext) {
      returnValue.additionalContext = postToolUseResult.additionalContext;
    }

    // Add system message
    if (postToolUseResult.systemMessage) {
      returnValue.systemMessage = postToolUseResult.systemMessage;
    }

    return returnValue;
  }
}

/**
 * Check if hooks are registered for tool events
 */
export function hasToolHooks(toolName: string): boolean {
  return (
    globalHookExecutor.hasHooks("PreToolUse") ||
    globalHookExecutor.hasHooks("PostToolUse") ||
    globalHookExecutor.hasHooks("PostToolUseFailure")
  );
}

/**
 * Get hook count for tool events
 */
export function getToolHookCount(toolName: string): number {
  return (
    globalHookExecutor.getHookCount("PreToolUse") +
    globalHookExecutor.getHookCount("PostToolUse") +
    globalHookExecutor.getHookCount("PostToolUseFailure")
  );
}
