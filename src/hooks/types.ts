/**
 * Plugin Hooks System - Type Definitions
 *
 * Provides comprehensive type definitions for the hooks system,
 * matching Claude Code's 18 event types and 4 hook types.
 */

// ============================================================================
// 18 HOOK EVENT TYPES
// ============================================================================

/**
 * All available hook event names
 * Matches Claude Code's hook system exactly
 */
export type HookEventName =
  // Tool events (6)
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "PermissionRequest"
  | "Notification"
  | "Stop"
  // Session events (4)
  | "SessionStart"
  | "SessionEnd"
  | "Setup"
  | "ConfigChange"
  // Agent events (4)
  | "SubagentStart"
  | "SubagentStop"
  | "TeammateIdle"
  | "TaskCompleted"
  // Other events (4)
  | "UserPromptSubmit"
  | "PreCompact"
  | "WorktreeCreate"
  | "WorktreeRemove";

// ============================================================================
// 4 HOOK TYPES
// ============================================================================

/**
 * Available hook types
 * - command: Execute shell command
 * - prompt: LLM-based condition evaluation
 * - agent: Spawn subagent with tools
 * - http: Call webhook URL
 */
export type HookType = "command" | "prompt" | "agent" | "http";

// ============================================================================
// HOOK MATCHER
// ============================================================================

/**
 * Hook matcher for targeting specific events
 * Supports tool names, patterns, and file globs
 */
export interface HookMatcher {
  /** Tool names to match (supports pipe-separated: "Write|Edit") */
  tools?: string[];
  /** Regex pattern for tool input */
  pattern?: string;
  /** Glob pattern for file paths */
  filePattern?: string;
}

// ============================================================================
// HOOK CONFIGURATION
// ============================================================================

/**
 * Hook configuration
 * Defines how a hook executes
 */
export interface HookConfig {
  /** Hook type */
  type: HookType;

  // Command hook fields
  /** Shell command to execute (for 'command' type) */
  command?: string;

  // Prompt hook fields
  /** Prompt for LLM evaluation (for 'prompt' type) */
  prompt?: string;
  /** Model to use for prompt hook */
  model?: string;

  // Agent hook fields
  /** Tools available to agent hook */
  tools?: string[];
  /** Maximum turns for agent hook */
  maxTurns?: number;

  // HTTP hook fields
  /** Webhook URL (for 'http' type) */
  url?: string;
  /** HTTP method */
  method?: string;
  /** HTTP headers */
  headers?: Record<string, string>;

  // Common fields
  /** Timeout in seconds */
  timeout?: number;
  /** Execute asynchronously */
  async?: boolean;
  /** Timeout for async execution */
  asyncTimeout?: number;
}

/**
 * Matcher with hooks configuration
 * Used in settings.json
 */
export interface HookMatcherConfig {
  /** Matcher to trigger hooks */
  matcher?: HookMatcher | string | null;
  /** Hooks to execute when matcher matches */
  hooks: HookConfig[];
}

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

/**
 * Registered hook with metadata
 */
export interface HookRegistration {
  /** Event name this hook listens to */
  event: HookEventName;
  /** Matcher for filtering events */
  matcher: HookMatcher | null;
  /** Hooks to execute */
  hooks: HookConfig[];
  /** Execution priority (higher = first) */
  priority?: number;
  /** Configuration source */
  source?: "user" | "project" | "local" | "plugin" | "managed";
  /** Plugin ID (if from plugin) */
  pluginId?: string;
  /** Plugin name (if from plugin) */
  pluginName?: string;
}

// ============================================================================
// HOOK CONTEXT TYPES
// ============================================================================

/**
 * Base context for all hook events
 */
export interface BaseHookContext {
  /** Session ID */
  session_id: string;
  /** Transcript file path */
  transcript_path: string;
  /** Current working directory */
  cwd: string;
  /** Permission mode */
  permission_mode?: string;
}

/**
 * PreToolUse hook context
 */
export interface PreToolUseContext extends BaseHookContext {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

/**
 * PostToolUse hook context
 */
export interface PostToolUseContext extends BaseHookContext {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
}

/**
 * PostToolUseFailure hook context
 */
export interface PostToolUseFailureContext extends BaseHookContext {
  hook_event_name: "PostToolUseFailure";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
}

/**
 * PermissionRequest hook context
 */
export interface PermissionRequestContext extends BaseHookContext {
  hook_event_name: "PermissionRequest";
  tool_name: string;
  tool_input: Record<string, unknown>;
  permission_suggestions?: Array<{
    behavior: "allow" | "deny";
    reason?: string;
  }>;
}

/**
 * Notification hook context
 */
export interface NotificationContext extends BaseHookContext {
  hook_event_name: "Notification";
  message: string;
  title?: string;
  notification_type: string;
}

/**
 * UserPromptSubmit hook context
 */
export interface UserPromptSubmitContext extends BaseHookContext {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

/**
 * SessionStart hook context
 */
export interface SessionStartContext extends BaseHookContext {
  hook_event_name: "SessionStart";
  source: "startup" | "resume" | "clear" | "compact";
  agent_type?: string;
  model?: string;
}

/**
 * SessionEnd hook context
 */
export interface SessionEndContext extends BaseHookContext {
  hook_event_name: "SessionEnd";
  reason: "clear" | "logout" | "prompt_input_exit" | "other" | "bypass_permissions_disabled";
}

/**
 * Setup hook context
 */
export interface SetupContext extends BaseHookContext {
  hook_event_name: "Setup";
  trigger: "init" | "maintenance";
}

/**
 * Stop hook context
 */
export interface StopContext extends BaseHookContext {
  hook_event_name: "Stop";
  stop_hook_active: boolean;
  last_assistant_message?: string;
}

/**
 * SubagentStart hook context
 */
export interface SubagentStartContext extends BaseHookContext {
  hook_event_name: "SubagentStart";
  agent_id: string;
  agent_type: string;
}

/**
 * SubagentStop hook context
 */
export interface SubagentStopContext extends BaseHookContext {
  hook_event_name: "SubagentStop";
  stop_hook_active: boolean;
  agent_id: string;
  agent_transcript_path: string;
  agent_type: string;
  last_assistant_message?: string;
}

/**
 * PreCompact hook context
 */
export interface PreCompactContext extends BaseHookContext {
  hook_event_name: "PreCompact";
  trigger: "manual" | "auto";
  custom_instructions: string | null;
}

/**
 * ConfigChange hook context
 */
export interface ConfigChangeContext extends BaseHookContext {
  hook_event_name: "ConfigChange";
  source: "user_settings" | "project_settings" | "local_settings" | "policy_settings" | "skills";
  file_path?: string;
}

/**
 * WorktreeCreate hook context
 */
export interface WorktreeCreateContext extends BaseHookContext {
  hook_event_name: "WorktreeCreate";
  name: string;
}

/**
 * WorktreeRemove hook context
 */
export interface WorktreeRemoveContext extends BaseHookContext {
  hook_event_name: "WorktreeRemove";
  worktree_path: string;
}

/**
 * TeammateIdle hook context
 */
export interface TeammateIdleContext extends BaseHookContext {
  hook_event_name: "TeammateIdle";
  teammate_name: string;
  team_name: string;
}

/**
 * TaskCompleted hook context
 */
export interface TaskCompletedContext extends BaseHookContext {
  hook_event_name: "TaskCompleted";
  task_id: string;
  task_subject: string;
  task_description?: string;
  teammate_name?: string;
  team_name?: string;
}

/**
 * Union of all hook context types
 */
export type HookContext =
  | PreToolUseContext
  | PostToolUseContext
  | PostToolUseFailureContext
  | PermissionRequestContext
  | NotificationContext
  | UserPromptSubmitContext
  | SessionStartContext
  | SessionEndContext
  | SetupContext
  | StopContext
  | SubagentStartContext
  | SubagentStopContext
  | PreCompactContext
  | ConfigChangeContext
  | WorktreeCreateContext
  | WorktreeRemoveContext
  | TeammateIdleContext
  | TaskCompletedContext;

// ============================================================================
// HOOK OUTPUT TYPES
// ============================================================================

/**
 * PreToolUse hook-specific output
 */
export interface PreToolUseOutput {
  hookEventName: "PreToolUse";
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
}

/**
 * UserPromptSubmit hook-specific output
 */
export interface UserPromptSubmitOutput {
  hookEventName: "UserPromptSubmit";
  additionalContext: string; // Required for this event
}

/**
 * PostToolUse hook-specific output
 */
export interface PostToolUseOutput {
  hookEventName: "PostToolUse";
  additionalContext?: string;
  updatedMCPToolOutput?: unknown;
}

/**
 * PostToolUseFailure hook-specific output
 */
export interface PostToolUseFailureOutput {
  hookEventName: "PostToolUseFailure";
  additionalContext?: string;
}

/**
 * PermissionRequest hook-specific output
 */
export interface PermissionRequestOutput {
  hookEventName: "PermissionRequest";
  decision:
    | {
        behavior: "allow" | "deny";
        updatedInput?: Record<string, unknown>;
        updatedPermissions?: Array<{ behavior: "allow" | "deny"; reason?: string }>;
      }
    | {
        behavior: "deny";
        message?: string;
        interrupt?: boolean;
      };
}

/**
 * Generic hook output for events without special fields
 */
export interface GenericHookOutput {
  hookEventName: HookEventName;
  additionalContext?: string;
}

/**
 * Union of all hook-specific output types
 */
export type HookSpecificOutput =
  | PreToolUseOutput
  | UserPromptSubmitOutput
  | PostToolUseOutput
  | PostToolUseFailureOutput
  | PermissionRequestOutput
  | GenericHookOutput;

/**
 * Universal hook output schema
 * All hooks can return this structure
 */
export interface HookOutput {
  // Universal fields (all hooks)
  /** Continue execution (false = block/stop) */
  continue?: boolean;
  /** Suppress stdout from transcript */
  suppressOutput?: boolean;
  /** Reason shown when blocking */
  stopReason?: string;
  /** Message displayed to user in UI */
  systemMessage?: string;
  /** Explanation for decision */
  reason?: string;
  /** Deprecated: use hookSpecificOutput instead */
  decision?: "approve" | "block";

  // Hook-specific output (must include hookEventName)
  hookSpecificOutput?: HookSpecificOutput;
}

// ============================================================================
// HOOK EXECUTION RESULT
// ============================================================================

/**
 * Result from hook execution
 * Used internally to merge hook outputs
 */
export interface HookExecutionResult {
  /** Prevent continuation (block execution) */
  preventContinuation?: boolean;
  /** Reason shown when blocking */
  stopReason?: string;
  /** Message displayed to user */
  systemMessage?: string;
  /** Permission behavior decision */
  permissionBehavior?: "allow" | "deny" | "ask";
  /** Blocking error details */
  blockingError?: {
    blockingError: string;
    command: string;
  };
  /** Modified tool input */
  updatedInput?: Record<string, unknown>;
  /** Context to inject into model */
  additionalContext?: string;
  /** Modified MCP tool output */
  updatedMCPToolOutput?: unknown;
  /** Reason for permission decision */
  hookPermissionDecisionReason?: string;
}

// ============================================================================
// HOOK REGISTRY
// ============================================================================

/**
 * Hook registry for managing all registered hooks
 */
export interface HookRegistry {
  /** All registered hooks */
  hooks: HookRegistration[];
  /** Typed hooks for efficient lookup */
  typedHooks: TypedHookRegistration[];
}

/**
 * Typed hook registration for efficient lookup
 */
export interface TypedHookRegistration extends HookRegistration {
  hookName: HookEventName;
}

// ============================================================================
// HOOK RUNNER INTERFACE
// ============================================================================

/**
 * Hook runner interface for executing hooks
 */
export interface HookRunner {
  /** Run parallel hooks */
  runParallel: <K extends HookEventName>(
    hookName: K,
    event: HookContextForEvent<K>,
  ) => Promise<HookExecutionResult[]>;

  /** Run sequential hooks */
  runSequential: <K extends HookEventName>(
    hookName: K,
    event: HookContextForEvent<K>,
  ) => Promise<HookExecutionResult[]>;

  /** Run modifying hooks (can modify input) */
  runModifying: <K extends HookEventName>(
    hookName: K,
    event: HookContextForEvent<K>,
  ) => Promise<HookExecutionResult>;

  /** Check if hooks are registered for an event */
  hasHooks: (hookName: HookEventName) => boolean;

  /** Get hook count for an event */
  getHookCount: (hookName: HookEventName) => number;
}

/**
 * Get hook context type for a specific event
 */
export type HookContextForEvent<K extends HookEventName> = K extends "PreToolUse"
  ? PreToolUseContext
  : K extends "PostToolUse"
    ? PostToolUseContext
    : K extends "PostToolUseFailure"
      ? PostToolUseFailureContext
      : K extends "PermissionRequest"
        ? PermissionRequestContext
        : K extends "Notification"
          ? NotificationContext
          : K extends "UserPromptSubmit"
            ? UserPromptSubmitContext
            : K extends "SessionStart"
              ? SessionStartContext
              : K extends "SessionEnd"
                ? SessionEndContext
                : K extends "Setup"
                  ? SetupContext
                  : K extends "Stop"
                    ? StopContext
                    : K extends "SubagentStart"
                      ? SubagentStartContext
                      : K extends "SubagentStop"
                        ? SubagentStopContext
                        : K extends "PreCompact"
                          ? PreCompactContext
                          : K extends "ConfigChange"
                            ? ConfigChangeContext
                            : K extends "WorktreeCreate"
                              ? WorktreeCreateContext
                              : K extends "WorktreeRemove"
                                ? WorktreeRemoveContext
                                : K extends "TeammateIdle"
                                  ? TeammateIdleContext
                                  : K extends "TaskCompleted"
                                    ? TaskCompletedContext
                                    : never;

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Hook callback function type
 */
export type HookCallback<T extends HookContext = HookContext> = (
  event: T,
) => Promise<HookOutput | void> | HookOutput | void;

/**
 * Internal hook handler
 */
export interface InternalHookHandler {
  hookName: HookEventName;
  callback: HookCallback;
  priority: number;
  pluginId?: string;
}

// ============================================================================
// LEGACY / COMPATIBILITY TYPES (for frontmatter.ts)
// ============================================================================

/**
 * Hook entry for frontmatter parsing
 * Used by hook manifest system
 */
export interface HookEntry {
  key: string;
  name: string;
  description?: string;
  events?: HookEventName[];
  hooks?: HookConfig[];
  enabled?: boolean;
  priority?: number;
}

/**
 * Hook install specification
 */
export interface HookInstallSpec {
  kind: "bundled" | "npm" | "git";
  id?: string;
  path?: string;
  version?: string;
}

/**
 * Hook invocation policy
 */
export type HookInvocationPolicy = "allow" | "deny" | "ask";

/**
 * OpenClaw hook metadata
 */
export interface OpenClawHookMetadata {
  name: string;
  description?: string;
  events?: HookEventName[];
  hooks?: HookConfig[];
  install?: HookInstallSpec;
  policy?: HookInvocationPolicy;
}

/**
 * Parsed hook frontmatter
 */
export interface ParsedHookFrontmatter {
  name?: string;
  description?: string;
  events?: string[];
  hooks?: HookConfig[];
  install?: HookInstallSpec;
  policy?: string;
  [key: string]: unknown;
}
