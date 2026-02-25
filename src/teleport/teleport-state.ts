/**
 * Session Teleport State Management
 *
 * Manages teleported session state globally.
 * Matches Claude Code's teleportedSessionInfo system.
 */

import type { TeleportedSessionInfo } from "./types.js";

/**
 * Global teleport state
 */
const state = {
  teleportedSessionInfo: null as TeleportedSessionInfo | null,
};

/**
 * Set teleported session info
 * Called when a session is teleported from another device
 */
export function setTeleportedSessionInfo(info: TeleportedSessionInfo): void {
  state.teleportedSessionInfo = info;
}

/**
 * Get teleported session info
 * Returns null if session was not teleported
 */
export function getTeleportedSessionInfo(): TeleportedSessionInfo | null {
  return state.teleportedSessionInfo;
}

/**
 * Mark first teleported message as logged
 * Called after the first message in a teleported session is processed
 */
export function markFirstTeleportMessageLogged(): void {
  if (state.teleportedSessionInfo) {
    state.teleportedSessionInfo.hasLoggedFirstMessage = true;
  }
}

/**
 * Clear teleported session info
 * Called when session ends or is reset
 */
export function clearTeleportedSessionInfo(): void {
  state.teleportedSessionInfo = null;
}

/**
 * Check if current session is teleported
 */
export function isTeleportedSession(): boolean {
  return state.teleportedSessionInfo?.isTeleported === true;
}

/**
 * Check if first message has been logged for teleported session
 */
export function hasFirstMessageBeenLogged(): boolean {
  return state.teleportedSessionInfo?.hasLoggedFirstMessage === true;
}
