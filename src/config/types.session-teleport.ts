/**
 * Session Teleport Types
 *
 * Defines types for session export/import/teleport functionality.
 * Enables continuing sessions across devices/contexts.
 */

// ============================================================================
// TELEPORTED SESSION INFO
// ============================================================================

/**
 * Information about a teleported session
 */
export interface TeleportedSessionInfo {
  /** Is this a teleported session? */
  isTeleported: boolean;
  /** Has the first message after teleport been logged? */
  hasLoggedFirstMessage: boolean;
  /** Original session ID */
  sessionId: string;
  /** When was the session teleported */
  teleportedAt?: number;
  /** Source device identifier (optional) */
  sourceDevice?: string;
}

// ============================================================================
// GIT REPOSITORY INFO
// ============================================================================

/**
 * Git repository information for session validation
 */
export interface GitRepoInfo {
  /** Repository URL (e.g., git@github.com:user/repo.git) */
  url: string;
  /** Branch name */
  branch: string;
  /** Commit hash */
  commit: string;
  /** Local path to repository */
  path: string;
}

// ============================================================================
// SESSION EXPORT FORMAT
// ============================================================================

/**
 * Session state for export
 */
export interface SessionState {
  /** Current agent ID */
  currentAgentId: string;
  /** Context tokens used */
  contextTokens: number;
  /** Thinking level */
  thinkingLevel: string;
  /** Verbose level */
  verboseLevel: string;
  /** Reasoning level */
  reasoningLevel: string;
  /** Model name */
  model: string;
  /** Model provider */
  modelProvider: string;
}

/**
 * Session message for export
 */
export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        source?: any;
        [key: string]: any;
      }>;
  timestamp?: number;
  tool_calls?: Array<{
    id: string;
    name: string;
    input: any;
  }>;
  tool_results?: Array<{
    tool_use_id: string;
    content: any;
  }>;
}

/**
 * Session metadata for export
 */
export interface SessionMetadata {
  /** Session title */
  title?: string;
  /** Session description */
  description?: string;
  /** Session tags */
  tags?: string[];
  /** When session was created */
  createdAt: number;
  /** When session was last updated */
  updatedAt: number;
  /** Number of messages */
  messageCount: number;
}

/**
 * Session export format
 */
export interface SessionExport {
  /** Export format version */
  version: string;
  /** Session ID */
  sessionId: string;
  /** When exported */
  exportedAt: number;
  /** Git repository info (if applicable) */
  gitRepo?: GitRepoInfo;
  /** Session messages */
  messages: SessionMessage[];
  /** Session state */
  state: SessionState;
  /** Session metadata */
  metadata: SessionMetadata;
}

// ============================================================================
// TELEPORT VALIDATION
// ============================================================================

/**
 * Teleport validation status
 */
export type TeleportStatus =
  | "success"
  | "not_in_repo"
  | "repo_mismatch"
  | "session_not_found"
  | "invalid_format"
  | "error";

/**
 * Teleport validation result
 */
export interface TeleportValidation {
  /** Validation status */
  status: TeleportStatus;
  /** Session's git repo info */
  sessionRepo?: GitRepoInfo;
  /** Current git repo info */
  currentRepo?: GitRepoInfo;
  /** Error message if validation failed */
  errorMessage?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create session export from current session
 */
export function createSessionExport(
  sessionId: string,
  messages: SessionMessage[],
  state: SessionState,
  metadata: Omit<SessionMetadata, "createdAt" | "updatedAt" | "messageCount">,
  gitRepo?: GitRepoInfo,
): SessionExport {
  return {
    version: "1.0",
    sessionId,
    exportedAt: Date.now(),
    gitRepo,
    messages,
    state,
    metadata: {
      ...metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: messages.length,
    },
  };
}

/**
 * Validate session export format
 */
export function validateSessionExportFormat(exportData: any): exportData is SessionExport {
  return (
    exportData &&
    typeof exportData === "object" &&
    exportData.version !== undefined &&
    exportData.sessionId !== undefined &&
    exportData.exportedAt !== undefined &&
    Array.isArray(exportData.messages) &&
    exportData.state !== undefined &&
    exportData.metadata !== undefined
  );
}

/**
 * Get teleport status message
 */
export function getTeleportStatusMessage(status: TeleportStatus): string {
  const messages: Record<TeleportStatus, string> = {
    success: "Session teleport successful",
    not_in_repo: "Session requires git repository, but not in git directory",
    repo_mismatch: "Git repository mismatch",
    session_not_found: "Session not found",
    invalid_format: "Invalid session export format",
    error: "Teleport failed",
  };

  return messages[status];
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  TeleportedSessionInfo,
  GitRepoInfo,
  SessionState,
  SessionMessage,
  SessionMetadata,
  SessionExport,
  TeleportStatus,
  TeleportValidation,
  createSessionExport,
  validateSessionExportFormat,
  getTeleportStatusMessage,
};
