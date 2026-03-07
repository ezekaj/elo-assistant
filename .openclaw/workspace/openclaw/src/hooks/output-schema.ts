/**
 * Plugin Hooks System - Output Schema Validation
 *
 * Validates hook output against the expected JSON schema.
 * Ensures hooks return properly formatted responses.
 */

import type { HookOutput, HookSpecificOutput, HookEventName } from "./types.js";

/**
 * Validation result for hook output
 */
export interface ValidationResult {
  valid: boolean;
  data?: HookOutput;
  error?: string;
}

/**
 * Validate hook output against schema
 *
 * @param output - Hook output to validate
 * @returns Validation result
 */
export function validateHookOutput(output: unknown): ValidationResult {
  if (typeof output !== "object" || output === null) {
    return {
      valid: false,
      error: "Hook output must be an object",
    };
  }

  const obj = output as Record<string, unknown>;
  const errors: string[] = [];

  // Validate universal fields
  if ("continue" in obj && typeof obj.continue !== "boolean") {
    errors.push("continue must be a boolean");
  }

  if ("suppressOutput" in obj && typeof obj.suppressOutput !== "boolean") {
    errors.push("suppressOutput must be a boolean");
  }

  if ("stopReason" in obj && typeof obj.stopReason !== "string") {
    errors.push("stopReason must be a string");
  }

  if ("systemMessage" in obj && typeof obj.systemMessage !== "string") {
    errors.push("systemMessage must be a string");
  }

  if ("reason" in obj && typeof obj.reason !== "string") {
    errors.push("reason must be a string");
  }

  if ("decision" in obj && obj.decision !== "approve" && obj.decision !== "block") {
    errors.push('decision must be "approve" or "block"');
  }

  // Validate hookSpecificOutput if present
  if ("hookSpecificOutput" in obj) {
    const specific = obj.hookSpecificOutput as Record<string, unknown>;

    if (!specific || typeof specific !== "object") {
      errors.push("hookSpecificOutput must be an object");
    } else {
      // Validate hookEventName
      if (!("hookEventName" in specific)) {
        errors.push("hookSpecificOutput must include hookEventName");
      } else {
        const eventName = specific.hookEventName as string;

        // Validate event-specific fields
        const eventValidation = validateEventSpecificOutput(specific, eventName);
        if (!eventValidation.valid) {
          errors.push(eventValidation.error!);
        }
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: `Hook output validation failed:\n  - ${errors.join("\n  - ")}`,
    };
  }

  return {
    valid: true,
    data: obj as HookOutput,
  };
}

/**
 * Validate event-specific output
 */
function validateEventSpecificOutput(
  output: Record<string, unknown>,
  eventName: string,
): { valid: boolean; error?: string } {
  switch (eventName) {
    case "PreToolUse":
      return validatePreToolUseOutput(output);
    case "UserPromptSubmit":
      return validateUserPromptSubmitOutput(output);
    case "PostToolUse":
      return validatePostToolUseOutput(output);
    case "PostToolUseFailure":
      return validatePostToolUseFailureOutput(output);
    case "PermissionRequest":
      return validatePermissionRequestOutput(output);
    default:
      return validateGenericOutput(output);
  }
}

/**
 * Validate PreToolUse output
 */
function validatePreToolUseOutput(output: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  const validDecisions = ["allow", "deny", "ask"];

  if ("permissionDecision" in output) {
    const decision = output.permissionDecision;
    if (typeof decision !== "string" || !validDecisions.includes(decision)) {
      return {
        valid: false,
        error: `permissionDecision must be one of: ${validDecisions.join(", ")}`,
      };
    }
  }

  if ("permissionDecisionReason" in output && typeof output.permissionDecisionReason !== "string") {
    return {
      valid: false,
      error: "permissionDecisionReason must be a string",
    };
  }

  if ("updatedInput" in output && typeof output.updatedInput !== "object") {
    return {
      valid: false,
      error: "updatedInput must be an object",
    };
  }

  if ("additionalContext" in output && typeof output.additionalContext !== "string") {
    return {
      valid: false,
      error: "additionalContext must be a string",
    };
  }

  return { valid: true };
}

/**
 * Validate UserPromptSubmit output
 */
function validateUserPromptSubmitOutput(output: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  // additionalContext is required for UserPromptSubmit
  if (!("additionalContext" in output)) {
    return {
      valid: false,
      error: "UserPromptSubmit hook must include additionalContext",
    };
  }

  if (typeof output.additionalContext !== "string") {
    return {
      valid: false,
      error: "additionalContext must be a string",
    };
  }

  return { valid: true };
}

/**
 * Validate PostToolUse output
 */
function validatePostToolUseOutput(output: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if ("additionalContext" in output && typeof output.additionalContext !== "string") {
    return {
      valid: false,
      error: "additionalContext must be a string",
    };
  }

  // updatedMCPToolOutput can be any type
  return { valid: true };
}

/**
 * Validate PostToolUseFailure output
 */
function validatePostToolUseFailureOutput(output: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if ("additionalContext" in output && typeof output.additionalContext !== "string") {
    return {
      valid: false,
      error: "additionalContext must be a string",
    };
  }

  return { valid: true };
}

/**
 * Validate PermissionRequest output
 */
function validatePermissionRequestOutput(output: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if (!("decision" in output)) {
    return {
      valid: false,
      error: "PermissionRequest hook must include decision",
    };
  }

  const decision = output.decision as Record<string, unknown>;

  if (typeof decision !== "object" || decision === null) {
    return {
      valid: false,
      error: "decision must be an object",
    };
  }

  if (!("behavior" in decision)) {
    return {
      valid: false,
      error: "decision must include behavior",
    };
  }

  const behavior = decision.behavior;
  if (typeof behavior !== "string" || (behavior !== "allow" && behavior !== "deny")) {
    return {
      valid: false,
      error: 'decision.behavior must be "allow" or "deny"',
    };
  }

  return { valid: true };
}

/**
 * Validate generic hook output
 */
function validateGenericOutput(output: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if ("additionalContext" in output && typeof output.additionalContext !== "string") {
    return {
      valid: false,
      error: "additionalContext must be a string",
    };
  }

  return { valid: true };
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: Array<{ path: string; message: string }>): string {
  return errors.map((e) => `${e.path || "root"}: ${e.message}`).join("; ");
}
