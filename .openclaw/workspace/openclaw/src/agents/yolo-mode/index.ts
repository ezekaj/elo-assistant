/**
 * YOLO Mode System
 *
 * YOLO (You Only Live Once) mode provides full automation
 * by auto-approving all tool calls while respecting explicit deny rules.
 *
 * Features:
 * - Auto-approve all tool calls
 * - No approval prompts
 * - Respects explicit deny rules
 * - CLI flag support (--yolo)
 * - Environment variable support (OPENCLAW_YOLO)
 * - TUI command support (/yolo)
 * - Security warnings
 *
 * @module yolo-mode
 */

// Configuration
export * from "./yolo-config.js";

// Manager
export {
  YoloModeManager,
  getYoloModeManager,
  initializeYoloModeFromCli,
  isYoloModeActive,
  YOLO_WARNING,
} from "./yolo-manager.js";
