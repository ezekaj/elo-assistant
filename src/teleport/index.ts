/**
 * Session Teleport System
 *
 * Provides multi-device session transfer functionality.
 * Matches Claude Code's teleport system.
 *
 * @module teleport
 */

// Types
export * from "./types.js";

// State management
export {
  setTeleportedSessionInfo,
  getTeleportedSessionInfo,
  markFirstTeleportMessageLogged,
  clearTeleportedSessionInfo,
  isTeleportedSession,
  hasFirstMessageBeenLogged,
} from "./teleport-state.js";

// Git integration
export {
  isGitClean,
  validateGitWorkingDirectory,
  fetchBranch,
  checkoutBranch,
  getCurrentBranch,
  branchExists,
  remoteBranchExists,
  stashChanges,
  popStash,
  listStashes,
  isGitRepository,
  getGitRoot,
} from "./git-integration.js";

// API client
export {
  createTeleportAPIClient,
  getDefaultAPIClient,
  resetDefaultAPIClient,
} from "./teleport-api.js";

// Executor
export { executeTeleport, completeTeleport, getTeleportStatus } from "./teleport-executor.js";
