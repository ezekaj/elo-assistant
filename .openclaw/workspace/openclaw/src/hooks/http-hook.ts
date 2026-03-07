/**
 * Advanced Plugin Hooks - HTTP Hook Implementation
 *
 * Provides webhook-based hook execution.
 * Matches Claude Code's HTTP hook system.
 */

import type { HookOutput } from "./types.js";

/**
 * HTTP hook configuration
 */
export interface HTTPHookConfig {
  type: "http";
  /** Webhook URL */
  url: string;
  /** HTTP method (default: POST) */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Custom headers */
  headers?: Record<string, string>;
  /** Timeout in seconds (default: 30) */
  timeout?: number;
  /** Expected response format */
  expectJson?: boolean;
}

/**
 * Execute an HTTP hook
 *
 * Calls a webhook URL with hook context and returns the response.
 *
 * @param config - HTTP hook configuration
 * @param context - Hook execution context
 * @returns Hook output or null if request failed
 */
export async function executeHTTPHook(
  config: HTTPHookConfig,
  context: Record<string, unknown>,
): Promise<HookOutput | null> {
  const timeout = (config.timeout || 30) * 1000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions: RequestInit = {
      method: config.method || "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body:
        config.method === "GET"
          ? undefined
          : JSON.stringify({
              context,
              event: "hook_trigger",
              timestamp: new Date().toISOString(),
            }),
      signal: controller.signal,
    };

    const response = await fetch(config.url, fetchOptions);

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP hook error: ${response.statusText}`);
    }

    if (config.expectJson !== false) {
      const data = await response.json();
      return data as HookOutput;
    }

    return null;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[HTTPHook] Error:", error);
    return null;
  }
}

/**
 * Create an HTTP hook from configuration
 */
export function createHTTPHook(config: HTTPHookConfig) {
  return async (context: Record<string, unknown>): Promise<HookOutput | null> => {
    return executeHTTPHook(config, context);
  };
}
