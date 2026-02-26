import type { SlashCommand } from "@mariozechner/pi-tui";
import {
  toggleVimMode,
  isVimModeEnabled,
  getCurrentVimMode,
  getVimState,
  setVimModeEnabled,
} from "./vim-state.js";

/**
 * Create Vim toggle command
 */
export function createVimToggleCommand(): SlashCommand {
  return {
    name: "vim",
    description: "Toggle Vim mode on/off",
    async handler(args) {
      const subcommand = args?.toLowerCase().trim();

      if (subcommand === "on" || subcommand === "enable") {
        setVimModeEnabled(true);
        return {
          success: true,
          message: "Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes.",
        };
      }

      if (subcommand === "off" || subcommand === "disable") {
        setVimModeEnabled(false);
        return {
          success: true,
          message: "Vim mode DISABLED. Using standard keyboard bindings.",
        };
      }

      // Toggle
      const enabled = toggleVimMode();
      return {
        success: true,
        message: enabled
          ? "Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes."
          : "Vim mode DISABLED. Using standard keyboard bindings.",
      };
    },
  };
}

/**
 * Create Vim status command
 */
export function createVimStatusCommand(): SlashCommand {
  return {
    name: "vim-status",
    description: "Show Vim mode status",
    async handler() {
      const enabled = isVimModeEnabled();
      const mode = getCurrentVimMode();
      const state = getVimState();

      if (!enabled) {
        return {
          success: true,
          message: "Vim mode is DISABLED\nUse /vim to enable.",
        };
      }

      return {
        success: true,
        message:
          `Vim Mode Status:\n` +
          `  Enabled: Yes\n` +
          `  Current Mode: ${mode}\n` +
          `  Pending Operator: ${state.pendingOperator || "none"}\n` +
          `\n` +
          `NORMAL mode keys:\n` +
          `  h/j/k/l - Move cursor\n` +
          `  w/b/e   - Word movement\n` +
          `  0/$     - Line start/end\n` +
          `  i/a/I/A - Enter INSERT mode\n` +
          `  o/O     - Open line\n` +
          `  v       - Visual mode\n` +
          `  x/dd    - Delete\n` +
          `  Escape  - Toggle INSERT/NORMAL`,
      };
    },
  };
}
