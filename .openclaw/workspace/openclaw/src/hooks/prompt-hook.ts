/**
 * Advanced Plugin Hooks - Prompt Hook Implementation
 *
 * Provides LLM-based condition evaluation for hooks.
 * Matches Claude Code's prompt hook system.
 */

import type { HookOutput } from "./types.js";
import { validateHookOutput } from "./output-schema.js";

/**
 * Prompt hook configuration
 */
export interface PromptHookConfig {
  type: "prompt";
  /** LLM prompt for evaluation */
  prompt: string;
  /** Model to use (default: claude-sonnet-4-6) */
  model?: string;
  /** Timeout in seconds (default: 30) */
  timeout?: number;
  /** API key (optional, uses env var if not provided) */
  apiKey?: string;
}

/**
 * Execute a prompt hook
 *
 * Uses LLM to evaluate a condition and return hook output.
 *
 * @param config - Prompt hook configuration
 * @param context - Hook execution context
 * @returns Hook output or null if evaluation failed
 */
export async function executePromptHook(
  config: PromptHookConfig,
  context: Record<string, unknown>,
): Promise<HookOutput | null> {
  const model = config.model || process.env.OPENCLAW_HOOK_MODEL || "claude-sonnet-4-6";
  const timeout = (config.timeout || 30) * 1000;
  const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("[PromptHook] ANTHROPIC_API_KEY not set");
    return null;
  }

  // Build system prompt
  const systemPrompt = `You are evaluating a condition for an automated hook system. 
Reply with ONLY valid JSON that matches this schema:
{
  "continue": boolean,
  "hookSpecificOutput": {
    "hookEventName": string,
    "permissionDecision"?: "allow" | "deny" | "ask",
    "permissionDecisionReason"?: string,
    "updatedInput"?: object,
    "additionalContext"?: string
  }
}

Do not include any explanation or text outside the JSON.`;

  // Build user prompt with context
  const userPrompt = `${config.prompt}\n\nContext:\n${JSON.stringify(context, null, 2)}`;

  // Call LLM API
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2024-01-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";

    // Parse JSON output
    try {
      const output = JSON.parse(content);
      const validation = validateHookOutput(output);
      return validation.valid ? validation.data : null;
    } catch (parseError) {
      console.error("[PromptHook] Failed to parse LLM output:", parseError);
      return null;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[PromptHook] Error:", error);
    return null;
  }
}

/**
 * Create a prompt hook from configuration
 */
export function createPromptHook(config: PromptHookConfig) {
  return async (context: Record<string, unknown>): Promise<HookOutput | null> => {
    return executePromptHook(config, context);
  };
}
