/**
 * Advanced Plugin Hooks - Agent Hook Implementation
 *
 * Provides subagent-based condition evaluation for hooks.
 * Matches Claude Code's agent hook system.
 */

import type { HookOutput } from "./types.js";

/**
 * Agent hook configuration
 */
export interface AgentHookConfig {
  type: "agent";
  /** Prompt for the agent */
  prompt: string;
  /** Tools available to the agent */
  tools?: string[];
  /** Maximum turns (default: 10) */
  maxTurns?: number;
  /** Timeout in seconds (default: 60) */
  timeout?: number;
}

/**
 * Execute an agent hook
 *
 * Spawns a subagent to evaluate a condition and return hook output.
 *
 * @param config - Agent hook configuration
 * @param context - Hook execution context
 * @returns Hook output or null if evaluation failed
 */
export async function executeAgentHook(
  config: AgentHookConfig,
  context: Record<string, unknown>,
): Promise<HookOutput | null> {
  const maxTurns = config.maxTurns || 10;
  const timeout = (config.timeout || 60) * 1000;

  try {
    // Import subagent runner dynamically to avoid circular dependencies
    const { runSubagent } = await import("../agents/subagent-runner.js");

    // Build agent prompt with context
    const fullPrompt = `${config.prompt}\n\nContext:\n${JSON.stringify(context, null, 2)}\n\nReturn your evaluation as valid JSON.`;

    // Run subagent with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const result = await runSubagent({
      prompt: fullPrompt,
      tools: config.tools || [],
      maxTurns,
      context,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse agent output as hook output
    try {
      const output = JSON.parse(result.finalResponse);
      return output as HookOutput;
    } catch {
      return null;
    }
  } catch (error) {
    console.error("[AgentHook] Error:", error);
    return null;
  }
}

/**
 * Create an agent hook from configuration
 */
export function createAgentHook(config: AgentHookConfig) {
  return async (context: Record<string, unknown>): Promise<HookOutput | null> => {
    return executeAgentHook(config, context);
  };
}
