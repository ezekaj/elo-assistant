/**
 * Tool Execution Validator
 * Validates tool output against output schema during execution
 * Matches Claude Code's callTool validation (lines 209505-209520)
 */

import type { AnyAgentTool } from "./tools/common.js";
import { getGlobalValidator } from "./schema/json-schema-validator.js";

// Local type that includes structuredContent
interface ToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  details?: unknown;
  structuredContent?: unknown;
  [key: string]: unknown;
}

// ============================================================================
// ERRORS
// ============================================================================

export class ToolOutputValidationError extends Error {
  constructor(
    public toolName: string,
    public message: string,
    public cause?: Error,
  ) {
    super(`Tool ${toolName}: ${message}`);
    this.name = "ToolOutputValidationError";
  }
}

export class MissingStructuredContentError extends Error {
  constructor(public toolName: string) {
    super(`Tool ${toolName} has an output schema but did not return structured content`);
    this.name = "MissingStructuredContentError";
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate tool output against its output schema
 * Matches Claude Code's validation pattern (lines 209505-209520)
 */
export function validateToolOutput(tool: AnyAgentTool, result: ToolResult): void {
  // Check if tool has output schema
  if (!("outputSchema" in tool) || !tool.outputSchema) {
    return; // No validation needed
  }

  // Check for structured content
  if (!result.structuredContent && !result.details) {
    throw new MissingStructuredContentError(tool.name);
  }

  // Get the content to validate
  const contentToValidate = result.structuredContent ?? result.details;

  // Validate against schema
  const validator = getGlobalValidator().getValidator(tool.outputSchema);
  const validatorResult = validator(contentToValidate);

  if (!validatorResult.valid) {
    throw new ToolOutputValidationError(
      tool.name,
      validatorResult.errorMessage || "Unknown validation error",
      validatorResult.errors ? new Error(JSON.stringify(validatorResult.errors)) : undefined,
    );
  }
}

/**
 * Wrap tool execution with validation
 * Matches Claude Code's callTool pattern
 */
export async function executeToolWithValidation(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  context: any,
): Promise<ToolResult> {
  // Execute the tool
  const result = await (tool as any).call(args, context);

  // Validate output
  validateToolOutput(tool, result);

  return result;
}
