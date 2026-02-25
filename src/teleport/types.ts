/**
 * Session Teleport System - Type Definitions
 *
 * Provides types for multi-device session transfer functionality.
 * Matches Claude Code's teleport system.
 */

/**
 * Teleported session information
 * Tracks when a session has been transferred from another device/context
 */
export interface TeleportedSessionInfo {
  /** Whether this session was teleported */
  isTeleported: boolean;
  /** Whether the first message has been logged */
  hasLoggedFirstMessage: boolean;
  /** Original session ID */
  sessionId: string;
  /** When the teleport occurred */
  teleportedAt: Date;
  /** Device that initiated the teleport */
  originalDevice?: string;
  /** Git branch associated with session */
  branch?: string;
}

/**
 * Teleport operation options
 */
export interface TeleportOptions {
  /** Session ID to teleport to */
  sessionId: string;
  /** Git branch to checkout (optional) */
  branch?: string;
  /** Whether to stash uncommitted changes */
  stashChanges?: boolean;
  /** Whether to validate git working directory */
  validateGit?: boolean;
}

/**
 * Teleport operation result
 */
export interface TeleportResult {
  /** Whether teleport was successful */
  success: boolean;
  /** Messages from the teleported session */
  messages: SessionMessage[];
  /** Git branch that was checked out */
  branch?: string;
  /** Error message if teleport failed */
  error?: string;
}

/**
 * Session message structure
 */
export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
  toolUseId?: string;
  toolName?: string;
}

/**
 * Session API response structure
 */
export interface SessionAPIResponse {
  sessionId: string;
  messages: SessionMessage[];
  branch: string;
  title: string;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Git stash information
 */
export interface StashInfo {
  /** Whether stash was created */
  created: boolean;
  /** Stash message */
  message?: string;
  /** Stash reference */
  ref?: string;
}
