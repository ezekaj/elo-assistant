/**
 * Session Teleport Executor
 *
 * Main teleport logic that coordinates git operations, API calls, and state management.
 * Matches Claude Code's teleport execution flow.
 */

import type { TeleportOptions, TeleportResult } from "./types.js";
import {
  validateGitWorkingDirectory,
  fetchBranch,
  checkoutBranch,
  stashChanges,
  popStash,
  isGitRepository,
  getCurrentBranch,
} from "./git-integration.js";
import { getDefaultAPIClient } from "./teleport-api.js";
import {
  setTeleportedSessionInfo,
  markFirstTeleportMessageLogged,
  clearTeleportedSessionInfo,
  getTeleportedSessionInfo,
} from "./teleport-state.js";

/**
 * Execute session teleport
 *
 * Transfers a session from another device/context to the current environment.
 *
 * @param options - Teleport options
 * @returns Teleport result with messages and status
 */
export async function executeTeleport(options: TeleportOptions): Promise<TeleportResult> {
  const api = getDefaultAPIClient();

  try {
    // 1. Check if git repository exists
    const isGitRepo = await isGitRepository();

    // 2. Validate git working directory if in git repo
    if (isGitRepo && options.validateGit !== false) {
      await validateGitWorkingDirectory();
    }

    // 3. Fetch session from API
    const session = await api.fetchSession(options.sessionId);
    const messages = await api.fetchSessionLogs(options.sessionId);

    // 4. Stash changes if requested
    if (options.stashChanges && isGitRepo) {
      await stashChanges("Teleport auto-stash");
    }

    // 5. Fetch and checkout branch
    const branch = options.branch || session.branch;
    if (branch && isGitRepo) {
      const currentBranch = await getCurrentBranch();
      if (currentBranch !== branch) {
        await fetchBranch(branch);
        await checkoutBranch(branch);
      }
    }

    // 6. Set teleported session info
    setTeleportedSessionInfo({
      isTeleported: true,
      hasLoggedFirstMessage: false,
      sessionId: options.sessionId,
      teleportedAt: new Date(),
      originalDevice: process.env.HOSTNAME,
      branch,
    });

    // 7. Mark first message as logged
    markFirstTeleportMessageLogged();

    return {
      success: true,
      messages,
      branch,
    };
  } catch (error) {
    return {
      success: false,
      messages: [],
      error: error instanceof Error ? error.message : "Teleport failed",
    };
  }
}

/**
 * Complete teleport operation
 *
 * Restores stashed changes and cleans up teleport state.
 * Should be called after user is done with teleported session.
 */
export async function completeTeleport(): Promise<void> {
  try {
    // Pop stash if it exists
    await popStash();
  } catch {
    // No stash to pop, that's ok
  }

  // Clear teleport state
  clearTeleportedSessionInfo();
}

/**
 * Check teleport status
 *
 * @returns Current teleport status info
 */
export function getTeleportStatus(): {
  isTeleported: boolean;
  sessionId?: string;
  branch?: string;
  teleportedAt?: Date;
} {
  const info = getTeleportedSessionInfo();

  if (!info?.isTeleported) {
    return { isTeleported: false };
  }

  return {
    isTeleported: true,
    sessionId: info.sessionId,
    branch: info.branch,
    teleportedAt: info.teleportedAt,
  };
}
