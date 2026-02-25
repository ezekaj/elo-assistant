/**
 * Session Teleport Manager
 *
 * Manages session export/import/teleport operations.
 * Enables continuing sessions across devices/contexts.
 */

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  TeleportedSessionInfo,
  SessionExport,
  TeleportValidation,
  GitRepoInfo,
  SessionMessage,
  SessionState,
  SessionMetadata,
} from "../config/types.session-teleport.js";
import {
  validateSessionExportFormat,
  getTeleportStatusMessage,
} from "../config/types.session-teleport.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("session-teleport");
const execAsync = promisify(exec);

// ============================================================================
// SESSION TELEPORT MANAGER CLASS
// ============================================================================

/**
 * Manages session teleport operations
 */
export class SessionTeleportManager {
  private teleportedSessionInfo: TeleportedSessionInfo | null = null;
  private enabled = true;

  constructor(enabled = true) {
    this.enabled = enabled;
    log.debug(`Session teleport manager initialized (enabled: ${enabled})`);
  }

  /**
   * Enable or disable teleport
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug(`Session teleport manager ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if teleport is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Export session to file
   *
   * @param sessionId - Session ID to export
   * @param messages - Session messages
   * @param state - Session state
   * @param metadata - Session metadata
   * @param outputPath - Output path (optional, defaults to ./session-{id}.json)
   * @returns Path to exported file
   */
  async exportSession(
    sessionId: string,
    messages: SessionMessage[],
    state: SessionState,
    metadata: Omit<SessionMetadata, "createdAt" | "updatedAt" | "messageCount">,
    outputPath?: string,
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error("Session teleport is disabled");
    }

    log.info(`Exporting session ${sessionId}`);

    // 1. Get git repo info
    const gitRepo = await this.getGitRepoInfo();

    // 2. Build export object
    const exportData: SessionExport = {
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

    // 3. Write to file
    const path = outputPath || `./session-${sessionId.slice(0, 8)}.json`;
    await fs.writeFile(path, JSON.stringify(exportData, null, 2));

    log.info(`Session exported to ${path}`);
    return path;
  }

  /**
   * Import session from file
   *
   * @param importPath - Path to session export file
   * @returns Imported session data
   */
  async importSession(importPath: string): Promise<SessionExport> {
    if (!this.enabled) {
      throw new Error("Session teleport is disabled");
    }

    log.info(`Importing session from ${importPath}`);

    // 1. Read file
    const content = await fs.readFile(importPath, "utf-8");
    const exportData: any = JSON.parse(content);

    // 2. Validate format
    if (!validateSessionExportFormat(exportData)) {
      log.error("Invalid session export format");
      throw new Error("Invalid session export format");
    }

    // 3. Validate git repo
    const validation = await this.validateGitRepo(exportData);
    if (validation.status === "repo_mismatch") {
      log.error(`Git repository mismatch: ${validation.errorMessage}`);
      throw new Error(
        `Git repository mismatch!\n` +
          `Session is from: ${validation.sessionRepo?.url}\n` +
          `Current repo: ${validation.currentRepo?.url}\n` +
          `Please cd to the correct repository.`,
      );
    }

    log.info(`Session imported from ${importPath}`);
    return exportData;
  }

  /**
   * Validate git repository for session
   *
   * @param session - Session export to validate
   * @returns Validation result
   */
  async validateGitRepo(session: SessionExport): Promise<TeleportValidation> {
    const currentRepo = await this.getGitRepoInfo();

    // No repo in session - no validation needed
    if (!session.gitRepo) {
      log.debug("Session has no git repo info, skipping validation");
      return { status: "success" };
    }

    // Not in git directory
    if (!currentRepo) {
      log.warn("Not in git directory, but session requires git repo");
      return {
        status: "not_in_repo",
        sessionRepo: session.gitRepo,
      };
    }

    // Repo mismatch
    if (session.gitRepo.url !== currentRepo.url) {
      log.error(`Git repo mismatch: session=${session.gitRepo.url}, current=${currentRepo.url}`);
      return {
        status: "repo_mismatch",
        sessionRepo: session.gitRepo,
        currentRepo,
        errorMessage: "Repository URL mismatch",
      };
    }

    log.debug("Git repo validation successful");
    return {
      status: "success",
      sessionRepo: session.gitRepo,
      currentRepo,
    };
  }

  /**
   * Set teleported session info
   *
   * @param info - Teleported session info
   */
  setTeleportedSessionInfo(info: Omit<TeleportedSessionInfo, "teleportedAt">): void {
    this.teleportedSessionInfo = {
      ...info,
      teleportedAt: Date.now(),
    };
    log.info(`Session teleport set: ${info.sessionId}`);
  }

  /**
   * Get teleported session info
   *
   * @returns Teleported session info or null
   */
  getTeleportedSessionInfo(): TeleportedSessionInfo | null {
    return this.teleportedSessionInfo;
  }

  /**
   * Mark first message after teleport as logged
   */
  markFirstMessageLogged(): void {
    if (this.teleportedSessionInfo) {
      this.teleportedSessionInfo.hasLoggedFirstMessage = true;
      log.debug("First message after teleport logged");
    }
  }

  /**
   * Clear teleported session info
   */
  clearTeleportedSessionInfo(): void {
    this.teleportedSessionInfo = null;
    log.debug("Cleared teleported session info");
  }

  /**
   * Get git repository info
   *
   * @returns Git repo info or null if not in git repo
   */
  private async getGitRepoInfo(): Promise<GitRepoInfo | null> {
    try {
      // Get remote URL
      const { stdout: urlOut } = await execAsync("git remote get-url origin");

      // Get current branch
      const { stdout: branchOut } = await execAsync("git branch --show-current");

      // Get current commit
      const { stdout: commitOut } = await execAsync("git rev-parse HEAD");

      // Get repo root path
      const { stdout: pathOut } = await execAsync("git rev-parse --show-toplevel");

      const repoInfo: GitRepoInfo = {
        url: urlOut.trim(),
        branch: branchOut.trim(),
        commit: commitOut.trim(),
        path: pathOut.trim(),
      };

      log.debug(`Git repo info: ${repoInfo.url}@${repoInfo.branch}`);
      return repoInfo;
    } catch (error) {
      log.debug("Not in git repository or git not available");
      return null;
    }
  }

  /**
   * Get manager stats
   */
  getStats(): {
    isTeleported: boolean;
    sessionId?: string;
    hasLoggedFirstMessage: boolean;
    enabled: boolean;
  } {
    return {
      isTeleported: this.teleportedSessionInfo?.isTeleported ?? false,
      sessionId: this.teleportedSessionInfo?.sessionId,
      hasLoggedFirstMessage: this.teleportedSessionInfo?.hasLoggedFirstMessage ?? false,
      enabled: this.enabled,
    };
  }

  /**
   * Reset manager to initial state
   */
  reset(): void {
    this.teleportedSessionInfo = null;
    this.enabled = true;
    log.debug("Reset session teleport manager");
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: SessionTeleportManager | null = null;

/**
 * Get or create session teleport manager singleton
 */
export function getSessionTeleportManager(): SessionTeleportManager {
  if (!instance) {
    instance = new SessionTeleportManager();
  }
  return instance;
}

/**
 * Reset session teleport manager singleton (for testing)
 */
export function resetSessionTeleportManager(): void {
  instance = null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate session ID for export
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Format session export path
 */
export function formatSessionExportPath(sessionId: string, baseDir?: string): string {
  const filename = `session-${sessionId.slice(0, 8)}.json`;
  return baseDir ? join(baseDir, filename) : filename;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  SessionTeleportManager,
  getSessionTeleportManager,
  resetSessionTeleportManager,
  generateSessionId,
  formatSessionExportPath,
};
