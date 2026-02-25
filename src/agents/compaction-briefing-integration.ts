/**
 * Compaction Briefing Integration
 *
 * Wires compaction-briefing into the agent event system.
 * Listens for compaction events and records them to daily briefings.
 */

import { onAgentEvent, type AgentEventPayload } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  recordCompaction,
  type CompactionBriefingConfig,
  type CompactionEvent,
} from "./compaction-briefing.js";
import { extractAgentIdFromSessionKey } from "./session-utils.js";

const log = createSubsystemLogger("compaction-briefing-integration");

let unsubscribe: (() => void) | null = null;
let config: CompactionBriefingConfig = {};

// Track compaction state by runId
const compactionState = new Map<
  string,
  {
    startedAt: number;
    sessionKey?: string;
  }
>();

/**
 * Initialize the compaction briefing listener
 */
export function initCompactionBriefingListener(cfg?: CompactionBriefingConfig): void {
  if (unsubscribe) {
    log.debug("Compaction briefing listener already initialized");
    return;
  }

  config = cfg || {};

  unsubscribe = onAgentEvent(handleAgentEvent);
  log.info("Compaction briefing listener initialized");
}

/**
 * Stop the compaction briefing listener
 */
export function stopCompactionBriefingListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    compactionState.clear();
    log.info("Compaction briefing listener stopped");
  }
}

/**
 * Handle agent events
 */
function handleAgentEvent(evt: AgentEventPayload): void {
  if (evt.stream !== "compaction") {
    return;
  }

  const phase = evt.data?.phase;

  if (phase === "start") {
    // Track compaction start
    compactionState.set(evt.runId, {
      startedAt: evt.ts,
      sessionKey: evt.sessionKey,
    });
    log.debug(`Compaction started: runId=${evt.runId}`);
    return;
  }

  if (phase === "end") {
    const willRetry = evt.data?.willRetry;
    if (willRetry) {
      log.debug(`Compaction will retry: runId=${evt.runId}`);
      return;
    }

    // Compaction completed - record it
    const state = compactionState.get(evt.runId);
    if (!state) {
      log.warn(`Compaction end without start: runId=${evt.runId}`);
      return;
    }

    compactionState.delete(evt.runId);

    const sessionKey = evt.sessionKey || state.sessionKey || evt.runId;
    const agentId = extractAgentIdFromSessionKey(sessionKey);

    const compactionEvent: CompactionEvent = {
      sessionKey,
      agentId,
      timestamp: evt.ts,
      tokensBefore: 0, // Not available in current event
      tokensAfter: 0, // Not available in current event
      messagesCompacted: 0, // Not available in current event
    };

    // Record compaction asynchronously (don't block the event handler)
    void recordCompactionAsync(compactionEvent);
  }
}

/**
 * Record compaction asynchronously
 */
async function recordCompactionAsync(event: CompactionEvent): Promise<void> {
  try {
    // Generate a simple summary since we don't have the actual content
    const summary = `Session ${event.sessionKey} compacted at ${new Date(event.timestamp).toLocaleTimeString()}`;

    await recordCompaction(event, summary, config);
    log.debug(`Compaction recorded for ${event.agentId}`);
  } catch (error) {
    log.error(`Failed to record compaction: ${error}`);
  }
}

/**
 * Update the configuration
 */
export function updateCompactionBriefingConfig(cfg: CompactionBriefingConfig): void {
  config = { ...config, ...cfg };
}
