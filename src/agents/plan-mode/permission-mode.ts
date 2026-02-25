/**
 * Plan Mode Permission System
 *
 * Provides permission mode checking for tool execution.
 * Works with ANY LLM provider (client-side feature).
 *
 * Permission Modes:
 * - default: Standard behavior, prompts for dangerous operations
 * - acceptEdits: Auto-accept file edits, still prompt for destructive ops
 * - bypassPermissions: Auto-accept everything
 * - plan: Read-only, no tool execution
 * - dontAsk: Don't prompt, deny if not pre-approved
 */

import type { ToolBlockResult } from "./types.js";
import { getPermissionMode, isPlanMode } from "./state.js";

// Re-export getPermissionMode for tool-execution-wrapper
export { getPermissionMode } from "./state.js";

// ============================================================================
// TOOL CATEGORIES
// ============================================================================

/**
 * Edit tools - modify files but are generally safe (auto-accepted in acceptEdits mode)
 * These are code modification tools that don't have side effects beyond the file system
 */
const EDIT_TOOLS = [
  "write", // Write files
  "edit", // Edit files
  "notebookedit", // Edit Jupyter notebooks
  "notebook_write", // Alternative naming
];

/**
 * Destructive tools - have side effects beyond file modification
 * These should ALWAYS prompt unless in bypassPermissions mode
 */
const DESTRUCTIVE_TOOLS = [
  "bash", // Shell commands (can do anything)
  "process", // Process management
  "exec", // Command execution
  "delete", // File deletion
  "remove", // Alternative delete naming
  "move", // File moves (can overwrite)
  "copy", // File copies (can overwrite)
  "ssh", // SSH connections
  "nodes", // Remote node commands
  "task", // Task spawning (side effects)
  "session", // Session management
  "mcp", // MCP tool calls (unknown side effects)
  "web_fetch", // Network requests
  "web_search", // Network requests
  "http", // HTTP requests
  "curl", // curl requests
];

/**
 * Read-only tools - safe in all modes
 */
const READ_ONLY_TOOLS = [
  "read",
  "glob",
  "grep",
  "memory_search",
  "memory_get",
  "task_get",
  "task_list",
  "task_output",
  "agent_list",
  "session_list",
  "session_status",
  "status",
];

/**
 * All write tools (edit + destructive combined)
 */
const WRITE_TOOLS = [...EDIT_TOOLS, ...DESTRUCTIVE_TOOLS];

// ============================================================================
// TOOL CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Check if tool is an edit tool (file modification only)
 */
export function isEditTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/_/g, "");
  return EDIT_TOOLS.some((edit) => normalized.includes(edit));
}

/**
 * Check if tool is a destructive tool (side effects beyond files)
 */
export function isDestructiveTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/_/g, "");
  return DESTRUCTIVE_TOOLS.some((dest) => normalized.includes(dest));
}

/**
 * Check if tool is a write tool (any modification)
 */
function isWriteTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/_/g, "");
  return WRITE_TOOLS.some((write) => normalized.includes(write));
}

/**
 * Check if tool is read-only (safe in all modes)
 */
export function isReadOnlyTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/_/g, "");
  return READ_ONLY_TOOLS.some((read) => normalized.includes(read));
}

/**
 * Get tool category for display
 */
export function getToolCategory(toolName: string): "edit" | "destructive" | "readonly" | "unknown" {
  if (isReadOnlyTool(toolName)) return "readonly";
  if (isEditTool(toolName)) return "edit";
  if (isDestructiveTool(toolName)) return "destructive";
  return "unknown";
}

// ============================================================================
// PERMISSION CHECKING FUNCTIONS
// ============================================================================

/**
 * Check if tool execution should be blocked
 * Works with ANY LLM provider (client-side check)
 */
export function shouldBlockToolExecution(toolName: string): boolean {
  const mode = getPermissionMode();

  // Always block write tools in plan mode
  if (mode === "plan" && isWriteTool(toolName)) {
    return true;
  }

  // Don't block in other modes (prompting is handled separately)
  return false;
}

/**
 * Check if user should be prompted for tool approval
 * This is the key function for acceptEdits mode
 *
 * @param toolName - Name of the tool being executed
 * @returns true if user should be prompted, false if auto-approved
 */
export function shouldPromptForTool(toolName: string): boolean {
  const mode = getPermissionMode();

  // In bypassPermissions mode: never prompt
  if (mode === "bypassPermissions") {
    return false;
  }

  // In plan mode: block was already checked, but if we got here, prompt
  if (mode === "plan") {
    return true;
  }

  // In dontAsk mode: never prompt (will be denied if not pre-approved)
  if (mode === "dontAsk") {
    return false;
  }

  // In acceptEdits mode: auto-accept edit tools, prompt for destructive
  if (mode === "acceptEdits") {
    // Auto-accept edit tools
    if (isEditTool(toolName)) {
      return false;
    }
    // Always prompt for destructive tools
    if (isDestructiveTool(toolName)) {
      return true;
    }
    // Unknown tools: be safe and prompt
    return true;
  }

  // In default mode: prompt for all write tools
  if (mode === "default") {
    return isWriteTool(toolName);
  }

  // Unknown mode: be safe and prompt
  return true;
}

/**
 * Check if tool is auto-approved in current mode
 */
export function isToolAutoApproved(toolName: string): boolean {
  return !shouldPromptForTool(toolName);
}

/**
 * Get block reason for tool
 */
export function getToolBlockReason(toolName: string): string {
  if (isPlanMode()) {
    if (isWriteTool(toolName)) {
      return "Tool execution is blocked in plan mode. Use exit_plan_mode to get approval.";
    }
  }

  return "";
}

/**
 * Check tool execution permission
 * Returns block result with reason if blocked
 */
export function checkToolExecution(toolName: string): ToolBlockResult {
  const blocked = shouldBlockToolExecution(toolName);

  if (blocked) {
    return {
      blocked: true,
      reason: getToolBlockReason(toolName),
    };
  }

  return {
    blocked: false,
  };
}

/**
 * Get permission decision for tool
 * Returns 'auto-approve', 'prompt', or 'block'
 */
export function getToolPermissionDecision(toolName: string): "auto-approve" | "prompt" | "block" {
  // First check if blocked
  if (shouldBlockToolExecution(toolName)) {
    return "block";
  }

  // Then check if needs prompt
  if (shouldPromptForTool(toolName)) {
    return "prompt";
  }

  // Otherwise auto-approve
  return "auto-approve";
}

/**
 * Get available tools for current mode
 * In plan mode, only read-only tools are available
 */
export function getAvailableTools(): string[] {
  if (isPlanMode()) {
    return READ_ONLY_TOOLS;
  }

  // All tools available in other modes
  return [...WRITE_TOOLS, ...READ_ONLY_TOOLS];
}

// ============================================================================
// MODE DESCRIPTIONS (for UI)
// ============================================================================

export const PERMISSION_MODE_DESCRIPTIONS: Record<
  string,
  { name: string; description: string; symbol: string }
> = {
  default: {
    name: "Default",
    description: "Prompts for all write operations",
    symbol: "",
  },
  acceptEdits: {
    name: "Accept Edits",
    description: "Auto-accepts file edits, prompts for commands",
    symbol: "▶▶",
  },
  bypassPermissions: {
    name: "Bypass Permissions",
    description: "Auto-accepts all operations",
    symbol: "⚠️",
  },
  plan: {
    name: "Plan Mode",
    description: "Read-only, no tool execution",
    symbol: "⏸",
  },
  dontAsk: {
    name: "Don't Ask",
    description: "Never prompts, denies if not pre-approved",
    symbol: "🚫",
  },
};
