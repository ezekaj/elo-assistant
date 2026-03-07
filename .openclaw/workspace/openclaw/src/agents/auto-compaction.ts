/**
 * Auto-Compaction
 *
 * Provides a simplified interface to trigger compaction from a sessionKey,
 * handling session lookup and parameter resolution internally.
 */

import type { OpenClawConfig } from "../config/config.js";
import { loadSessionStore, resolveSessionFilePath, resolveStorePath } from "../config/sessions.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { compactEmbeddedPiSession } from "./pi-embedded.js";

const log = createSubsystemLogger("auto-compaction");

/** Context required for auto-compaction */
export interface AutoCompactionContext {
  config: OpenClawConfig;
  workspaceDir: string;
}

let globalContext: AutoCompactionContext | null = null;

/**
 * Initialize the auto-compaction context.
 * Must be called at startup before any auto-compaction can be triggered.
 */
export function initAutoCompactionContext(ctx: AutoCompactionContext): void {
  globalContext = ctx;
  log.debug("Auto-compaction context initialized");
}

/**
 * Trigger auto-compaction for a session.
 * Uses the global context to resolve session info and trigger compaction.
 */
export async function triggerAutoCompaction(
  sessionKey: string,
  agentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!globalContext) {
    log.warn("Auto-compaction context not initialized");
    return { ok: false, reason: "context not initialized" };
  }

  const { config, workspaceDir } = globalContext;

  try {
    // Resolve session store path for this agent
    const storePath = resolveStorePath(config?.session?.store, { agentId });

    // Load session store and find the entry
    const store = loadSessionStore(storePath);
    const sessionEntry = store[sessionKey];

    if (!sessionEntry?.sessionId) {
      log.warn(`Session not found for key: ${sessionKey}`);
      return { ok: false, reason: "session not found" };
    }

    const sessionId = sessionEntry.sessionId;
    const sessionFile = resolveSessionFilePath(sessionId, sessionEntry, { agentId });

    log.info(`Triggering auto-compaction for session ${sessionKey}`);

    // Trigger compaction with minimal required parameters
    const result = await compactEmbeddedPiSession({
      sessionId,
      sessionKey,
      sessionFile,
      workspaceDir,
      config,
      groupId: sessionEntry.groupId,
      groupChannel: sessionEntry.groupChannel,
      groupSpace: sessionEntry.space,
      spawnedBy: sessionEntry.spawnedBy,
      skillsSnapshot: sessionEntry.skillsSnapshot,
      customInstructions: "Auto-compaction triggered after 13 answers.",
    });

    if (result.ok) {
      log.info(
        `Auto-compaction completed for ${sessionKey}: ${result.compacted ? "compacted" : "skipped"}`,
      );
      return { ok: true, reason: result.reason };
    } else {
      log.error(`Auto-compaction failed for ${sessionKey}: ${result.reason}`);
      return { ok: false, reason: result.reason };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`Auto-compaction error for ${sessionKey}: ${errMsg}`);
    return { ok: false, reason: errMsg };
  }
}
