/**
 * Plan Mode State Management
 *
 * Manages plan mode state globally.
 * Works with ANY LLM provider (client-side feature).
 */

import type { PlanModeState, PermissionMode, Plan } from "./types.js";

/**
 * Global plan mode state
 */
const state: PlanModeState = {
  currentMode: "default",
  hasExitedPlanMode: false,
  needsPlanModeExitAttachment: false,
  awaitingPlanApproval: false,
  currentPlan: null,
  approvedDomains: [],
};

/**
 * Set permission mode
 * Handles mode transitions automatically
 */
export function setPermissionMode(mode: PermissionMode): void {
  const oldMode = state.currentMode;
  state.currentMode = mode;

  // Handle plan mode transitions
  if (oldMode === "plan" && mode !== "plan") {
    // Exiting plan mode
    state.needsPlanModeExitAttachment = false;
    state.hasExitedPlanMode = true;
  }
  if (mode === "plan" && oldMode !== "plan") {
    // Entering plan mode
    state.needsPlanModeExitAttachment = true;
  }
}

/**
 * Get current permission mode
 */
export function getPermissionMode(): PermissionMode {
  return state.currentMode;
}

/**
 * Check if in plan mode
 */
export function isPlanMode(): boolean {
  return state.currentMode === "plan";
}

/**
 * Get plan mode state
 */
export function getPlanModeState(): PlanModeState {
  return { ...state };
}

/**
 * Store plan for approval
 */
export function storePlan(plan: Plan): void {
  state.currentPlan = plan;
  state.awaitingPlanApproval = true;
}

/**
 * Get current plan
 */
export function getCurrentPlan(): Plan | null {
  return state.currentPlan;
}

/**
 * Approve plan and exit plan mode
 */
export function approvePlan(domains?: string[]): void {
  if (domains) {
    state.approvedDomains = domains;
  }
  state.awaitingPlanApproval = false;
  state.currentPlan = null;
  setPermissionMode("default"); // Exit plan mode
}

/**
 * Reject plan (stay in plan mode)
 */
export function rejectPlan(): void {
  state.awaitingPlanApproval = false;
  // Stay in plan mode for revision
}

/**
 * Approve domain for session
 */
export function approveDomain(domain: string): void {
  if (!state.approvedDomains.includes(domain)) {
    state.approvedDomains.push(domain);
  }
}

/**
 * Check if domain is approved
 */
export function isDomainApproved(domain: string): boolean {
  return state.approvedDomains.includes(domain);
}

/**
 * Reset plan mode state (for new session)
 */
export function resetPlanModeState(): void {
  state.currentMode = "default";
  state.hasExitedPlanMode = false;
  state.needsPlanModeExitAttachment = false;
  state.awaitingPlanApproval = false;
  state.currentPlan = null;
  state.approvedDomains = [];
}
