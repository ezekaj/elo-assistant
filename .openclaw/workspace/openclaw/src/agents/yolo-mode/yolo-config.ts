/**
 * YOLO Mode Configuration
 *
 * YOLO (You Only Live Once) mode provides full automation
 * by auto-approving all tool calls while respecting explicit deny rules.
 *
 * @module yolo-mode
 */

import type { PermissionMode } from "../plan-mode/types.js";

/**
 * YOLO mode configuration
 */
export interface YoloModeConfig {
  /** Is YOLO mode enabled */
  enabled: boolean;

  /** Session-only mode (resets on restart) */
  sessionOnly: boolean;

  /** Show warnings before enabling */
  showWarning: boolean;

  /** Explicit deny rules (always respected) */
  denyRules: string[];
}

/**
 * YOLO mode state
 */
export interface YoloModeState {
  /** Is YOLO mode currently active */
  isActive: boolean;

  /** Was YOLO mode enabled via CLI flag */
  enabledViaCli: boolean;

  /** Was YOLO mode enabled via environment variable */
  enabledViaEnv: boolean;

  /** Was YOLO mode enabled via TUI command */
  enabledViaTui: boolean;

  /** Warning acknowledged */
  warningAcknowledged: boolean;
}

/**
 * Default YOLO mode configuration
 */
export const DEFAULT_YOLO_CONFIG: YoloModeConfig = {
  enabled: false,
  sessionOnly: true,
  showWarning: true,
  denyRules: [],
};

/**
 * Environment variables for YOLO mode
 */
export const YOLO_ENV_VARS = {
  /** Enable YOLO mode */
  YOLO: "OPENCLAW_YOLO",
  /** Enable YOLO mode for session only */
  YOLO_SESSION: "OPENCLAW_YOLO_SESSION",
  /** Disable YOLO mode (override config) */
  YOLO_DISABLE: "OPENCLAW_YOLO_DISABLE",
};

/**
 * CLI flags for YOLO mode
 */
export const YOLO_CLI_FLAGS = {
  /** Enable YOLO mode */
  YOLO: "--yolo",
  /** Enable YOLO mode for session only */
  YOLO_SESSION: "--yolo-session",
  /** Disable YOLO mode */
  NO_YOLO: "--no-yolo",
};

/**
 * Get YOLO mode permission mode
 * Returns 'bypassPermissions' when YOLO is active
 */
export function getYoloPermissionMode(): PermissionMode {
  return "bypassPermissions";
}

/**
 * Check if YOLO mode is enabled via environment
 */
export function isYoloEnabledViaEnv(): boolean {
  return (
    process.env[YOLO_ENV_VARS.YOLO] === "true" || process.env[YOLO_ENV_VARS.YOLO_SESSION] === "true"
  );
}

/**
 * Check if YOLO mode is disabled via environment
 */
export function isYoloDisabledViaEnv(): boolean {
  return process.env[YOLO_ENV_VARS.YOLO_DISABLE] === "true";
}

/**
 * Get YOLO mode state from environment
 */
export function getYoloStateFromEnv(): Partial<YoloModeState> {
  return {
    enabledViaEnv: isYoloEnabledViaEnv(),
    isActive: isYoloEnabledViaEnv() && !isYoloDisabledViaEnv(),
  };
}
