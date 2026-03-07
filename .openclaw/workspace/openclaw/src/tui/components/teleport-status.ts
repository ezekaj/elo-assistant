/**
 * Teleport Status Component for TUI
 *
 * Displays teleport status in the TUI interface.
 */

import { createText } from "./component-helpers.js";

// ============================================================================
// TYPES
// ============================================================================

interface TeleportInfo {
  isTeleported: boolean;
  sessionId: string;
  hasLoggedFirstMessage: boolean;
  teleportedAt?: number;
}

// ============================================================================
// STUB MANAGER (until session-teleport-manager is available)
// ============================================================================

function getTeleportInfo(): TeleportInfo | null {
  return null;
}

// ============================================================================
// TELEPORT STATUS COMPONENT
// ============================================================================

/**
 * Render teleport status display
 */
export function renderTeleportStatus(): any {
  const info = getTeleportInfo();

  if (!info?.isTeleported) {
    return null;
  }

  // Determine color based on first message logged
  let statusColor = "yellow";
  let statusSymbol = "~";

  if (info.hasLoggedFirstMessage) {
    statusColor = "green";
    statusSymbol = "✓";
  }

  // Format session ID (show first 8 chars)
  const shortSessionId = info.sessionId.slice(0, 8);

  return createText(`${statusSymbol} Teleported ${shortSessionId}...`, { color: statusColor });
}

/**
 * Render compact teleport status (for status bar)
 */
export function renderCompactTeleportStatus(): any {
  const info = getTeleportInfo();

  if (!info?.isTeleported) {
    return null;
  }

  const statusColor = info.hasLoggedFirstMessage ? "green" : "yellow";
  const statusSymbol = info.hasLoggedFirstMessage ? "✓" : "~";

  return createText(`${statusSymbol} Teleport ${info.sessionId.slice(0, 8)}`, {
    color: statusColor,
  });
}

/**
 * Render teleport info for display
 */
export function renderTeleportInfo(): any {
  const info = getTeleportInfo();

  if (!info) {
    return createText("No active teleport", { color: "gray", italic: true });
  }

  const statusColor = info.hasLoggedFirstMessage ? "green" : "yellow";
  const statusText = info.hasLoggedFirstMessage ? "First message logged" : "Awaiting first message";

  const teleportTime = info.teleportedAt
    ? new Date(info.teleportedAt).toLocaleTimeString()
    : "Unknown";

  return createText(
    `Teleported: ${info.sessionId}\n` + `Time: ${teleportTime}\n` + `Status: ${statusText}`,
    { color: statusColor },
  );
}
