/**
 * Plugin Hooks System - Hook Matchers
 *
 * Provides matcher functionality for targeting specific hook events
 * based on tool names, patterns, and file globs.
 */

import { HookMatcher, HookEventName, HookRegistration } from "./types.js";

// Import minimatch for glob pattern matching
let minimatch: ((path: string, pattern: string, options?: any) => boolean) | null = null;

async function getMinimatch() {
  if (!minimatch) {
    try {
      const module = await import("minimatch");
      minimatch = module.minimatch;
    } catch {
      // Fallback to simple pattern matching
      minimatch = (path: string, pattern: string) => {
        // Simple glob pattern matching
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return regex.test(path);
      };
    }
  }
  return minimatch;
}

/**
 * Check if a hook matcher matches the given context
 *
 * @param matcher - Hook matcher to evaluate
 * @param context - Context information for matching
 * @returns true if the matcher matches the context
 */
export function matchesHookContext(
  matcher: HookMatcher | null,
  context: {
    event: HookEventName;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    filePath?: string;
  },
): boolean {
  if (!matcher) return true; // No matcher = always matches

  // Check tool name matching
  if (matcher.tools && context.toolName) {
    const matchesTool = matcher.tools.some((pattern: string) => {
      // Support pipe-separated patterns: "Write|Edit"
      const patterns = pattern.split("|");
      return patterns.some((p: string) => {
        const toolName = context.toolName!;

        // Support regex patterns with wildcards
        if (p.includes("*") || p.includes("?") || p.includes("[")) {
          // Use minimatch for glob patterns
          const match =
            minimatch ||
            ((path: string, pat: string) => {
              const regex = new RegExp("^" + pat.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
              return regex.test(path);
            });
          return match(toolName, p);
        }

        // Exact match or contains
        return toolName === p || toolName.includes(p);
      });
    });

    if (!matchesTool) return false;
  }

  // Check input pattern matching
  if (matcher.pattern && context.toolInput) {
    try {
      const inputStr = JSON.stringify(context.toolInput);
      const regex = new RegExp(matcher.pattern);
      if (!regex.test(inputStr)) return false;
    } catch {
      // Invalid regex, skip pattern matching
    }
  }

  // Check file pattern matching
  if (matcher.filePattern && context.filePath) {
    const matchFn =
      minimatch ||
      ((path: string, pattern: string) => {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
        return regex.test(path);
      });

    if (!matchFn(context.filePath, matcher.filePattern)) return false;
  }

  return true;
}

/**
 * Get all matching hooks for an event
 *
 * @param hooks - All registered hooks
 * @param event - Event name to match
 * @param context - Context information for matching
 * @returns Array of matching hook registrations
 */
export function getMatchingHooks(
  hooks: HookRegistration[],
  event: HookEventName,
  context: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    filePath?: string;
  },
): HookRegistration[] {
  return hooks
    .filter((h) => h.event === event)
    .filter((h) => matchesHookContext(h.matcher, { event, ...context }));
}

/**
 * Parse matcher from string or object
 *
 * @param matcher - String or HookMatcher object
 * @returns Parsed HookMatcher or null
 */
export function parseMatcher(matcher: string | HookMatcher | null | undefined): HookMatcher | null {
  if (!matcher) return null;

  if (typeof matcher === "string") {
    // String matcher - treat as tool pattern
    return {
      tools: [matcher],
    };
  }

  return matcher;
}

/**
 * Validate hook matcher
 *
 * @param matcher - Matcher to validate
 * @returns Validation result
 */
export function validateMatcher(matcher: HookMatcher | null): { valid: boolean; error?: string } {
  if (!matcher) return { valid: true };

  // Validate regex pattern
  if (matcher.pattern) {
    try {
      new RegExp(matcher.pattern);
    } catch (e) {
      return {
        valid: false,
        error: `Invalid regex pattern in hook matcher: ${matcher.pattern}`,
      };
    }
  }

  // Validate file pattern (basic check)
  if (matcher.filePattern && matcher.filePattern.includes("**")) {
    // Double-star patterns require minimatch
    getMinimatch().catch(() => {
      // Ignore error, will use fallback
    });
  }

  return { valid: true };
}

/**
 * Format matcher for display
 *
 * @param matcher - Matcher to format
 * @returns Human-readable matcher description
 */
export function formatMatcher(matcher: HookMatcher | null): string {
  if (!matcher) return "(all)";

  const parts: string[] = [];

  if (matcher.tools) {
    parts.push(`tools: [${matcher.tools.join(", ")}]`);
  }

  if (matcher.pattern) {
    parts.push(`pattern: ${matcher.pattern}`);
  }

  if (matcher.filePattern) {
    parts.push(`files: ${matcher.filePattern}`);
  }

  return parts.join(", ") || "(all)";
}
