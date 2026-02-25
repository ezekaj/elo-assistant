/**
 * Plan Mode Type Definitions
 *
 * Provides types for the Plan Mode permission system.
 * Works with ANY LLM provider (client-side feature).
 */

/**
 * Plan Mode Permission Modes
 * Matches Claude Code's permission mode system
 */
export type PermissionMode =
  | "default" // Standard behavior, prompts for dangerous operations
  | "acceptEdits" // Auto-accept file edit operations
  | "bypassPermissions" // Bypass all permission checks
  | "plan" // Plan mode: No tool execution (read-only)
  | "dontAsk"; // Don't prompt for permissions, deny if not pre-approved

/**
 * Plan structure
 */
export interface Plan {
  /** Plan content/description */
  content: string;
  /** Domains to access */
  domains?: string[];
  /** Actions to take */
  actions?: string[];
  /** Identified risks */
  risks?: string[];
  /** When plan was created */
  createdAt: string;
}

/**
 * Plan Mode State
 * Tracks plan mode lifecycle
 */
export interface PlanModeState {
  /** Current permission mode */
  currentMode: PermissionMode;
  /** Whether user has exited plan mode in this session */
  hasExitedPlanMode: boolean;
  /** Whether exit attachment is needed */
  needsPlanModeExitAttachment: boolean;
  /** Whether awaiting plan approval */
  awaitingPlanApproval: boolean;
  /** Current plan (if any) */
  currentPlan: Plan | null;
  /** Approved domains for session */
  approvedDomains: string[];
}

/**
 * Plan approval response
 */
export interface PlanApprovalResponse {
  /** Whether plan was approved */
  approved: boolean;
  /** User feedback (if rejected) */
  feedback?: string;
}

/**
 * Tool execution block result
 */
export interface ToolBlockResult {
  /** Whether tool should be blocked */
  blocked: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
}
