/**
 * Vim Mode Indicator Component
 *
 * Displays current Vim mode in the status bar.
 */

import { Text } from "@mariozechner/pi-tui";
import { getCurrentVimMode, isVimModeEnabled } from "./vim-mode/vim-state.js";

/**
 * Render Vim mode indicator
 */
export function renderVimModeIndicator(): any {
  if (!isVimModeEnabled()) {
    return null;
  }

  const mode = getCurrentVimMode();

  let color: string;
  let symbol: string;
  let tooltip: string;

  switch (mode) {
    case "INSERT":
      color = "green";
      symbol = "INSERT";
      tooltip = "Vim INSERT mode - typing inserts text";
      break;
    case "NORMAL":
      color = "blue";
      symbol = "NORMAL";
      tooltip = "Vim NORMAL mode - use vim commands";
      break;
    case "VISUAL":
      color = "yellow";
      symbol = "VISUAL";
      tooltip = "Vim VISUAL mode - selecting text";
      break;
    default:
      color = "white";
      symbol = mode;
      tooltip = `Vim ${mode} mode`;
  }

  return Text.create(`[${symbol}]`, {
    color,
    bold: true,
    tooltip,
  });
}

/**
 * Render compact Vim mode indicator (for status bar)
 */
export function renderCompactVimModeIndicator(): any {
  if (!isVimModeEnabled()) {
    return null;
  }

  const mode = getCurrentVimMode();

  let color: string;
  let symbol: string;

  switch (mode) {
    case "INSERT":
      color = "green";
      symbol = "I";
      break;
    case "NORMAL":
      color = "blue";
      symbol = "N";
      break;
    case "VISUAL":
      color = "yellow";
      symbol = "V";
      break;
    default:
      color = "white";
      symbol = mode[0];
  }

  return Text.create(symbol, { color, bold: true });
}

/**
 * Get Vim mode status text for display
 */
export function getVimModeStatusText(): string {
  if (!isVimModeEnabled()) {
    return "Vim mode: OFF";
  }

  const mode = getCurrentVimMode();
  return `Vim mode: ${mode}`;
}
