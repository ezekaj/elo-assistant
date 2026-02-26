/**
 * YOLO Mode Manager
 *
 * Manages YOLO (You Only Live Once) mode state and lifecycle.
 * Provides methods to enable/disable YOLO mode with proper warnings.
 *
 * @module yolo-mode
 */

import type { YoloModeConfig, YoloModeState } from "./yolo-config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { setPermissionMode, getPermissionMode } from "../plan-mode/state.js";
import {
  DEFAULT_YOLO_CONFIG,
  isYoloEnabledViaEnv,
  isYoloDisabledViaEnv,
  getYoloStateFromEnv,
} from "./yolo-config.js";

const log = createSubsystemLogger("yolo-mode");

/**
 * YOLO mode warning message
 */
export const YOLO_WARNING = `
⚠️  YOLO MODE WARNING ⚠️

You are about to enable YOLO (You Only Live Once) mode.

In this mode:
  • All tool calls will be auto-approved
  • No approval prompts will be shown
  • File edits execute immediately
  • Shell commands run without confirmation
  • Network requests are allowed

Security risks:
  • AI can modify any file in workspace
  • AI can execute any shell command
  • AI can install/uninstall packages
  • AI can delete files
  • AI can make network requests

Only enable YOLO mode if:
  ✓ You trust the current codebase
  ✓ You understand all actions AI will take
  ✓ Important files are backed up or committed
  ✓ You are in a controlled/isolated environment
  ✓ You accept full responsibility for consequences

This mode is designed for:
  • CI/CD pipelines
  • Automated testing
  • Trusted personal projects
  • Isolated development environments

DO NOT use YOLO mode for:
  ✗ Production systems
  ✗ Untrusted codebases
  ✗ Sensitive data handling
  ✗ Shared development environments

Type "/yolo confirm" to enable YOLO mode.
Type any other command to cancel.
`.trim();

/**
 * YOLO Mode Manager Class
 */
export class YoloModeManager {
  private config: YoloModeConfig;
  private state: YoloModeState;
  private pendingConfirmation: boolean = false;

  constructor(config: Partial<YoloModeConfig> = {}) {
    this.config = { ...DEFAULT_YOLO_CONFIG, ...config };
    this.state = {
      isActive: false,
      enabledViaCli: false,
      enabledViaEnv: false,
      enabledViaTui: false,
      warningAcknowledged: false,
    };

    // Initialize from environment
    this.initializeFromEnv();

    log.debug("YOLO mode manager initialized");
  }

  /**
   * Initialize YOLO mode from environment variables
   */
  private initializeFromEnv(): void {
    const envState = getYoloStateFromEnv();

    if (envState.enabledViaEnv) {
      this.state.enabledViaEnv = true;
      log.info("YOLO mode enabled via environment variable");
    }

    if (envState.isActive) {
      this.activateYolo("env");
    }
  }

  /**
   * Initialize YOLO mode from CLI flag
   */
  initializeFromCli(): void {
    // Check command line arguments
    const args = process.argv.slice(2);
    const hasYoloFlag = args.some((arg) => arg === "--yolo" || arg === "--yolo-session");

    if (hasYoloFlag) {
      this.state.enabledViaCli = true;
      log.info("YOLO mode enabled via CLI flag");
      this.activateYolo("cli");
    }
  }

  /**
   * Get current YOLO mode state
   */
  getState(): YoloModeState {
    return { ...this.state };
  }

  /**
   * Get current configuration
   */
  getConfig(): YoloModeConfig {
    return { ...this.config };
  }

  /**
   * Check if YOLO mode is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Check if YOLO mode was enabled via CLI
   */
  isEnabledViaCli(): boolean {
    return this.state.enabledViaCli;
  }

  /**
   * Check if YOLO mode was enabled via environment
   */
  isEnabledViaEnv(): boolean {
    return this.state.enabledViaEnv;
  }

  /**
   * Check if YOLO mode was enabled via TUI
   */
  isEnabledViaTui(): boolean {
    return this.state.enabledViaTui;
  }

  /**
   * Get YOLO warning message
   */
  getWarning(): string {
    return YOLO_WARNING;
  }

  /**
   * Request YOLO mode enablement (shows warning)
   */
  requestEnable(): { requiresConfirmation: boolean; warning?: string } {
    if (this.state.isActive) {
      return { requiresConfirmation: false };
    }

    if (this.config.showWarning) {
      this.pendingConfirmation = true;
      return {
        requiresConfirmation: true,
        warning: YOLO_WARNING,
      };
    }

    // No warning required (configured off)
    this.enableYolo("tui");
    return { requiresConfirmation: false };
  }

  /**
   * Confirm YOLO mode enablement (after warning)
   */
  confirmEnable(): { success: boolean; message: string } {
    if (!this.pendingConfirmation) {
      return {
        success: false,
        message: 'No pending YOLO mode confirmation. Use "/yolo on" first.',
      };
    }

    this.pendingConfirmation = false;
    this.enableYolo("tui");

    return {
      success: true,
      message: "✅ YOLO MODE ENABLED - All tools auto-approved",
    };
  }

  /**
   * Cancel YOLO mode enablement
   */
  cancelEnable(): void {
    this.pendingConfirmation = false;
    log.debug("YOLO mode enablement cancelled");
  }

  /**
   * Enable YOLO mode
   */
  enableYolo(source: "cli" | "env" | "tui" = "tui"): void {
    if (this.state.isActive) {
      log.debug("YOLO mode already active");
      return;
    }

    // Update state based on source
    if (source === "cli") {
      this.state.enabledViaCli = true;
    } else if (source === "env") {
      this.state.enabledViaEnv = true;
    } else if (source === "tui") {
      this.state.enabledViaTui = true;
      this.state.warningAcknowledged = true;
    }

    // Activate YOLO mode
    this.activateYolo(source);

    log.info(`YOLO mode enabled via ${source}`);
  }

  /**
   * Activate YOLO mode (internal)
   */
  private activateYolo(source: string): void {
    this.state.isActive = true;

    // Set permission mode to bypassPermissions
    setPermissionMode("bypassPermissions");

    log.info(`YOLO mode activated via ${source}`);
  }

  /**
   * Disable YOLO mode
   */
  disableYolo(): { success: boolean; message: string } {
    if (!this.state.isActive) {
      return {
        success: false,
        message: "YOLO mode is not active",
      };
    }

    // Check if enabled via env (can't disable)
    if (this.state.enabledViaEnv && !this.state.enabledViaTui) {
      return {
        success: false,
        message:
          "⚠️  YOLO mode is enabled via environment variable. Set OPENCLAW_YOLO=false to disable.",
      };
    }

    this.state.isActive = false;
    this.pendingConfirmation = false;

    // Reset permission mode to default
    setPermissionMode("default");

    log.info("YOLO mode disabled");

    return {
      success: true,
      message: "✅ YOLO mode disabled - Normal approval restored",
    };
  }

  /**
   * Toggle YOLO mode
   */
  toggleYolo(): { requiresConfirmation: boolean; warning?: string; message?: string } {
    if (this.state.isActive) {
      const result = this.disableYolo();
      return {
        requiresConfirmation: false,
        message: result.message,
      };
    } else {
      return this.requestEnable();
    }
  }

  /**
   * Get YOLO mode status message
   */
  getStatus(): string {
    if (!this.state.isActive) {
      return "✅ YOLO mode is DISABLED";
    }

    const sources: string[] = [];
    if (this.state.enabledViaCli) sources.push("CLI");
    if (this.state.enabledViaEnv) sources.push("Environment");
    if (this.state.enabledViaTui) sources.push("TUI");

    return `⚠️  YOLO mode is ENABLED (via ${sources.join(", ")})`;
  }
}

/**
 * Global YOLO mode manager instance
 */
let yoloManager: YoloModeManager | null = null;

/**
 * Get or create YOLO mode manager singleton
 */
export function getYoloModeManager(): YoloModeManager {
  if (!yoloManager) {
    yoloManager = new YoloModeManager();
  }
  return yoloManager;
}

/**
 * Initialize YOLO mode manager from CLI
 */
export function initializeYoloModeFromCli(): void {
  const manager = getYoloModeManager();
  manager.initializeFromCli();
}

/**
 * Check if YOLO mode is active
 */
export function isYoloModeActive(): boolean {
  return yoloManager?.isActive() ?? false;
}
