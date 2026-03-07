/**
 * Plan Mode System
 *
 * Provides plan mode functionality for OpenClaw.
 * Works with ANY LLM provider (client-side feature).
 *
 * Features:
 * - Manual plan mode (/enter-plan-mode, /exit-plan-mode)
 * - Automatic plan detection (detects "make a plan" requests)
 * - Deep plan mode for thorough planning
 * - AcceptEdits mode (auto-accept file edits, prompt for commands)
 *
 * @module plan-mode
 */

// Types
export * from "./types.js";

// State management
export {
  setPermissionMode,
  getPermissionMode,
  isPlanMode,
  getPlanModeState,
  storePlan,
  getCurrentPlan,
  approvePlan,
  rejectPlan,
  approveDomain,
  isDomainApproved,
  resetPlanModeState,
} from "./state.js";

// Permission mode system
export {
  shouldBlockToolExecution,
  getToolBlockReason,
  checkToolExecution,
  isReadOnlyTool,
  isEditTool,
  isDestructiveTool,
  getToolCategory,
  shouldPromptForTool,
  isToolAutoApproved,
  getToolPermissionDecision,
  getAvailableTools,
  PERMISSION_MODE_DESCRIPTIONS,
} from "./permission-mode.js";

// Automatic plan detection
export {
  isPlanRequest,
  isDeepPlanRequest,
  getPlanType,
  extractPlanContext,
} from "./auto-plan-detector.js";

// Tools
export { createEnterPlanModeTool } from "./tools/enter-plan-mode.js";
export { createExitPlanModeTool } from "./tools/exit-plan-mode.js";
export { createUpdatePlanTool } from "./tools/update-plan.js";
