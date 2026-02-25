/**
 * Teleport Status Component for TUI
 *
 * Displays teleport status in the TUI interface.
 */

import { Text } from "@mariozechner/pi-tui";
import { getSessionTeleportManager } from "../agents/session-teleport-manager.js";

// ============================================================================
// TELEPORT STATUS COMPONENT
// ============================================================================

/**
 * Render teleport status display
 */
export function renderTeleportStatus(): any {
  const manager = getSessionTeleportManager();
  const info = manager.getTeleportedSessionInfo();

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

  return Text.create(`${statusSymbol} Teleported ${shortSessionId}...`, { color: statusColor });
}

/**
 * Render compact teleport status (for status bar)
 */
export function renderCompactTeleportStatus(): any {
  const manager = getSessionTeleportManager();
  const info = manager.getTeleportedSessionInfo();

  if (!info?.isTeleported) {
    return null;
  }

  const statusColor = info.hasLoggedFirstMessage ? "green" : "yellow";
  const statusSymbol = info.hasLoggedFirstMessage ? "✓" : "~";

  return Text.create(`${statusSymbol} Teleport ${info.sessionId.slice(0, 8)}`, {
    color: statusColor,
  });
}

/**
 * Render teleport info for display
 */
export function renderTeleportInfo(): any {
  const manager = getSessionTeleportManager();
  const info = manager.getTeleportedSessionInfo();

  if (!info) {
    return Text.create("No active teleport", { color: "gray", italic: true });
  }

  const statusColor = info.hasLoggedFirstMessage ? "green" : "yellow";
  const statusText = info.hasLoggedFirstMessage ? "First message logged" : "Awaiting first message";

  const teleportTime = info.teleportedAt
    ? new Date(info.teleportedAt).toLocaleTimeString()
    : "Unknown";

  return Text.create(
    `Teleported: ${info.sessionId}\n` + `Time: ${teleportTime}\n` + `Status: ${statusText}`,
    { color: statusColor },
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { renderTeleportStatus, renderCompactTeleportStatus, renderTeleportInfo };
