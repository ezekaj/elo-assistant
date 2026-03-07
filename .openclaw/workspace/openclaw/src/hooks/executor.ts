/**
 * Plugin Hooks System - Hook Executor
 *
 * Main executor for running hooks. Coordinates execution of
 * command, prompt, agent, and HTTP hooks.
 */

import { executeCommandHook, buildHookEnv } from "./command-hook.js";
import { getMatchingHooks, parseMatcher } from "./matchers.js";
import {
  HookRegistration,
  HookEventName,
  HookConfig,
  HookOutput,
  HookExecutionResult,
  HookContext,
} from "./types.js";

/**
 * Hook executor for running registered hooks
 */
export class HookExecutor {
  private hooks: HookRegistration[] = [];

  /**
   * Register new hooks
   */
  registerHooks(hooks: HookRegistration[]) {
    this.hooks = [...this.hooks, ...hooks];
  }

  /**
   * Clear all registered hooks
   */
  clearHooks() {
    this.hooks = [];
  }

  /**
   * Get all registered hooks
   */
  getHooks(): HookRegistration[] {
    return [...this.hooks];
  }

  /**
   * Check if hooks are registered for an event
   */
  hasHooks(event: HookEventName): boolean {
    return this.hooks.some((h) => h.event === event);
  }

  /**
   * Get hook count for an event
   */
  getHookCount(event: HookEventName): number {
    return this.hooks.filter((h) => h.event === event).length;
  }

  /**
   * Execute hooks for an event
   *
   * @param event - Event name
   * @param context - Event context
   * @returns Combined execution result
   */
  async executeHooks(
    event: HookEventName,
    context: Record<string, unknown>,
  ): Promise<HookExecutionResult> {
    const matchingHooks = getMatchingHooks(this.hooks, event, {
      toolName: context.tool_name as string,
      toolInput: context.tool_input as Record<string, unknown>,
      filePath: context.file_path as string,
    });

    if (matchingHooks.length === 0) {
      return {};
    }

    const result: HookExecutionResult = {};

    // Execute hooks sequentially (order matters for some hooks)
    for (const registration of matchingHooks) {
      for (const hook of registration.hooks) {
        try {
          const hookResult = await this.executeSingleHook(hook, event, context);

          // Merge results
          this.mergeResults(result, hookResult);

          // Stop if continuation prevented
          if (result.preventContinuation) {
            return result;
          }
        } catch (error) {
          // Log error but continue with other hooks
          console.error(`[hooks] ${event} hook failed:`, error);
        }
      }

      // Stop if continuation prevented
      if (result.preventContinuation) {
        return result;
      }
    }

    return result;
  }

  /**
   * Execute a single hook
   */
  private async executeSingleHook(
    hook: HookConfig,
    event: HookEventName,
    context: Record<string, unknown>,
  ): Promise<HookExecutionResult> {
    const stdin = JSON.stringify(context);
    const env = buildHookEnv(context);

    let output: HookOutput | null = null;

    // Execute based on hook type
    switch (hook.type) {
      case "command":
        output = (await executeCommandHook(hook, stdin, env)).parsedOutput;
        break;

      case "prompt":
        output = await executePromptHook(hook, context);
        break;

      case "agent":
        output = await executeAgentHook(hook, context);
        break;

      case "http":
        output = await executeHTTPHook(hook, context);
        break;

      default:
        console.warn(`[hooks] Unknown hook type: ${(hook as HookConfig).type}`);
        return {};
    }

    // Process hook output
    return this.processHookOutput(output, event);
  }

  /**
   * Execute a prompt hook
   */
  private async executePromptHook(
    hook: HookConfig,
    context: Record<string, unknown>,
  ): Promise<HookOutput | null> {
    return executePromptHook(hook, context);
  }

  /**
   * Execute an agent hook
   */
  private async executeAgentHook(
    hook: HookConfig,
    context: Record<string, unknown>,
  ): Promise<HookOutput | null> {
    return executeAgentHook(hook, context);
  }

  /**
   * Process hook output into execution result
   */
  private processHookOutput(output: HookOutput | null, event: HookEventName): HookExecutionResult {
    if (!output) return {};

    const result: HookExecutionResult = {};

    // Handle continue field
    if (output.continue === false) {
      result.preventContinuation = true;
      result.stopReason = output.stopReason || "Blocked by hook";
    }

    // Handle system message
    if (output.systemMessage) {
      result.systemMessage = output.systemMessage;
    }

    // Handle deprecated decision field
    if (output.decision === "block") {
      result.preventContinuation = true;
      result.stopReason = output.reason || "Blocked by hook";
    }

    // Handle hook-specific output
    if (output.hookSpecificOutput) {
      const specific = output.hookSpecificOutput;

      // PreToolUse specific
      if (specific.hookEventName === "PreToolUse") {
        if (specific.permissionDecision === "allow") {
          result.permissionBehavior = "allow";
        } else if (specific.permissionDecision === "deny") {
          result.permissionBehavior = "deny";
          result.blockingError = {
            blockingError: specific.permissionDecisionReason || "Blocked by hook",
            command: "hook",
          };
        } else if (specific.permissionDecision === "ask") {
          result.permissionBehavior = "ask";
        }

        if (specific.permissionDecisionReason) {
          result.hookPermissionDecisionReason = specific.permissionDecisionReason;
        }

        if (specific.updatedInput) {
          result.updatedInput = specific.updatedInput;
        }
      }

      // Add additional context
      if (specific.additionalContext) {
        result.additionalContext = specific.additionalContext;
      }

      // PostToolUse specific
      if (specific.hookEventName === "PostToolUse" && "updatedMCPToolOutput" in specific) {
        result.updatedMCPToolOutput = specific.updatedMCPToolOutput;
      }
    }

    return result;
  }

  /**
   * Merge hook execution results
   */
  private mergeResults(target: HookExecutionResult, source: HookExecutionResult) {
    // Prevent continuation takes precedence
    if (source.preventContinuation) {
      target.preventContinuation = true;
      target.stopReason = source.stopReason;
    }

    // System message (last one wins)
    if (source.systemMessage) {
      target.systemMessage = source.systemMessage;
    }

    // Permission behavior (deny takes precedence)
    if (source.permissionBehavior === "deny") {
      target.permissionBehavior = "deny";
    } else if (source.permissionBehavior === "ask" && !target.permissionBehavior) {
      target.permissionBehavior = "ask";
    } else if (source.permissionBehavior === "allow" && !target.permissionBehavior) {
      target.permissionBehavior = "allow";
    }

    // Blocking error
    if (source.blockingError) {
      target.blockingError = source.blockingError;
    }

    // Updated input (last one wins)
    if (source.updatedInput) {
      target.updatedInput = source.updatedInput;
    }

    // Additional context (accumulate)
    if (source.additionalContext) {
      target.additionalContext = target.additionalContext
        ? `${target.additionalContext}\n${source.additionalContext}`
        : source.additionalContext;
    }

    // Updated MCP tool output (last one wins)
    if (source.updatedMCPToolOutput) {
      target.updatedMCPToolOutput = source.updatedMCPToolOutput;
    }

    // Permission decision reason (last one wins)
    if (source.hookPermissionDecisionReason) {
      target.hookPermissionDecisionReason = source.hookPermissionDecisionReason;
    }
  }
}

/**
 * Global hook executor instance
 */
export const globalHookExecutor = new HookExecutor();

/**
 * Initialize hooks from configuration
 */
export async function initializeHooks(): Promise<void> {
  // Load hooks from config
  const { loadHooksFromConfig } = await import("./config.js");
  const hooks = await loadHooksFromConfig();
  globalHookExecutor.registerHooks(hooks);
}
