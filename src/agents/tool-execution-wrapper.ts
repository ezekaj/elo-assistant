/**
 * Tool Execution Wrapper with Hooks Integration
 *
 * Wraps tool execution with hook support, allowing hooks to:
 * - Block/modify tool execution (PreToolUse)
 * - Process tool results (PostToolUse)
 * - Handle tool failures (PostToolUseFailure)
 *
 * Also includes Plan Mode blocking for read-only tool execution.
 * Supports automatic plan detection from user messages.
 */

import type { HookExecutionResult } from "../hooks/executor.js";
import type { AnyAgentTool } from "./tools/common.js";
import { globalHookExecutor } from "../hooks/executor.js";
import { isPlanRequest, isDeepPlanRequest } from "./plan-mode/auto-plan-detector.js";
import {
  shouldBlockToolExecution,
  getToolBlockReason,
  getPermissionMode,
  setPermissionMode,
} from "./plan-mode/permission-mode.js";

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
  // ADD: Check plan mode blocking FIRST (before hooks)
  const planModeBlock = shouldBlockToolExecution(tool.name);
  if (planModeBlock) {
    return {
      blocked: true,
      reason: getToolBlockReason(tool.name),
      permissionMode: getPermissionMode(),
    };
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
