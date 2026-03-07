/**
 * Answer Briefing Tracker
 *
 * Tracks agent answers per session and:
 * 1. Records briefing after EVERY answer
 * 2. Triggers auto-compact after 13 answers
 *
 * Listens for "answer" stream events emitted when assistant messages complete.
 */

import { promises as fs } from "fs";
import path from "path";
import { onAgentEvent, type AgentEventPayload } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  recordCompaction,
  type CompactionBriefingConfig,
  type CompactionEvent,
} from "./compaction-briefing.js";
import { extractAgentIdFromSessionKey } from "./session-utils.js";

const log = createSubsystemLogger("answer-briefing-tracker");

/** Configuration for the answer briefing tracker */
export interface AnswerBriefingConfig extends CompactionBriefingConfig {
  /** Number of answers before triggering auto-compact (default: 13) */
  compactAfterAnswers?: number;
  /** Number of cycles before aggregating into master briefing (default: 10) */
  aggregateAfterCycles?: number;
  /** Callback to trigger compaction */
  onCompactNeeded?: (sessionKey: string, agentId: string) => Promise<void>;
  /** LLM config for cycle summaries */
  llmConfig?: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
  };
}

const DEFAULT_COMPACT_AFTER_ANSWERS = 13;
const DEFAULT_AGGREGATE_AFTER_CYCLES = 10;

// Track answer counts by sessionKey
const answerCounts = new Map<
  string,
  {
    count: number;
    agentId: string;
    answerTexts: string[]; // Collect all answer texts for cycle summary
  }
>();

// Collect cycle summaries for aggregation (NOT saved to context)
const cycleSummaries: string[] = [];
let cycleCount = 0;

// Keep recent summaries for continuity (last 2 cycles)
let recentSummaries: string[] = [];

/** Get recent summaries for context continuity */
export function getRecentSummaries(): string[] {
  return recentSummaries;
}

let unsubscribe: (() => void) | null = null;
let config: AnswerBriefingConfig = {};

/**
 * Initialize the answer briefing tracker
 */
export function initAnswerBriefingTracker(cfg?: AnswerBriefingConfig): void {
  if (unsubscribe) {
    log.debug("Answer briefing tracker already initialized");
    return;
  }

  config = cfg || {};

  unsubscribe = onAgentEvent(handleAgentEvent);
  log.info("Answer briefing tracker initialized");
}

/**
 * Stop the answer briefing tracker
 */
export function stopAnswerBriefingTracker(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    answerCounts.clear();
    log.info("Answer briefing tracker stopped");
  }
}

/**
 * Handle agent events
 */
function handleAgentEvent(evt: AgentEventPayload): void {
  // Listen for "answer" stream events (emitted when assistant message completes)
  if (evt.stream !== "answer") {
    return;
  }

  const sessionKey = evt.sessionKey || evt.runId;
  const answerText = (evt.data?.text as string) || "";

  if (!answerText.trim()) {
    return;
  }

  const agentId = extractAgentIdFromSessionKey(sessionKey);

  // Get or create answer tracking for this session
  let tracker = answerCounts.get(sessionKey);
  if (!tracker) {
    tracker = {
      count: 0,
      agentId,
      answerTexts: [],
    };
    answerCounts.set(sessionKey, tracker);
  }

  // Increment answer count
  tracker.count += 1;
  tracker.answerTexts.push(answerText.slice(0, 300)); // Collect for cycle summary

  log.debug(`Answer #${tracker.count} for session ${sessionKey}`);

  // Record briefing for this answer
  void recordAnswerBriefing(sessionKey, agentId, tracker.count, answerText);

  // Check if we need to trigger auto-compact
  const compactAfter = config.compactAfterAnswers || DEFAULT_COMPACT_AFTER_ANSWERS;
  if (tracker.count >= compactAfter) {
    log.info(`Session ${sessionKey} reached ${tracker.count} answers, triggering auto-compact`);

    // Generate cycle summary before resetting
    const cycleTexts = [...tracker.answerTexts];

    // Reset counter
    tracker.count = 0;
    tracker.answerTexts = [];

    // Generate cycle summary (collected, not saved to context)
    void generateAndCollectCycleSummary(cycleTexts, sessionKey);

    // Trigger compaction
    if (config.onCompactNeeded) {
      void config.onCompactNeeded(sessionKey, agentId).catch((err) => {
        log.error(`Failed to trigger compaction for ${sessionKey}: ${err}`);
      });
    }
  }
}

/**
 * Record a briefing entry for an answer
 */
async function recordAnswerBriefing(
  sessionKey: string,
  agentId: string,
  answerNumber: number,
  answerText: string,
): Promise<void> {
  try {
    const compactionEvent: CompactionEvent = {
      sessionKey,
      agentId,
      timestamp: Date.now(),
      tokensBefore: 0,
      tokensAfter: 0,
      messagesCompacted: 0,
      summary: `Answer #${answerNumber}`,
    };

    // Generate a summary of the answer
    const summary = `Answer #${answerNumber}: ${answerText.slice(0, 200).trim()}${answerText.length > 200 ? "..." : ""}`;

    await recordCompaction(compactionEvent, summary, config);
    log.debug(`Recorded briefing for answer #${answerNumber} in session ${sessionKey}`);
  } catch (error) {
    log.error(`Failed to record answer briefing: ${error}`);
  }
}

/**
 * Get the current answer count for a session
 */
export function getAnswerCount(sessionKey: string): number {
  return answerCounts.get(sessionKey)?.count || 0;
}

/**
 * Reset the answer count for a session
 */
export function resetAnswerCount(sessionKey: string): void {
  const tracker = answerCounts.get(sessionKey);
  if (tracker) {
    tracker.count = 0;
  }
}

/**
 * Update the configuration
 */
export function updateAnswerBriefingConfig(cfg: AnswerBriefingConfig): void {
  config = { ...config, ...cfg };
}

/**
 * Generate a cycle summary and collect it (NOT saved to context)
 */
async function generateAndCollectCycleSummary(
  answerTexts: string[],
  sessionKey: string,
): Promise<void> {
  if (!config.llmConfig?.apiKey) {
    log.debug("No LLM config for cycle summary, skipping");
    return;
  }

  const model = config.llmConfig.model || "google/gemini-2.5-flash";
  const baseUrl = config.llmConfig.baseUrl || "https://openrouter.ai/api/v1";

  const prompt = `Summarize this conversation cycle into 3-5 concise bullet points. Focus on what was discussed, decisions made, and any action items.

Conversation excerpts:
${answerTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Provide a brief, useful summary (no more than 100 words).`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llmConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "Cycle summary unavailable.";

    // Collect for aggregation
    cycleSummaries.push(summary);
    cycleCount++;

    // Keep recent summaries for context continuity (last 2 cycles)
    recentSummaries.push(summary);
    if (recentSummaries.length > 2) {
      recentSummaries.shift(); // Keep only last 2
    }

    // Update RECENT_CONTEXT.md for next session
    await updateRecentContext();

    log.info(
      `Cycle #${cycleCount} summary collected (${cycleSummaries.length} total, ${recentSummaries.length} recent)`,
    );

    // Check if we should aggregate and save
    const aggregateAfter = config.aggregateAfterCycles || DEFAULT_AGGREGATE_AFTER_CYCLES;
    if (cycleCount >= aggregateAfter) {
      await aggregateAndSaveBriefing();
    }
  } catch (error) {
    log.error(`Failed to generate cycle summary: ${error}`);
  }
}

/**
 * Aggregate all cycle summaries into one master briefing and save
 */
async function aggregateAndSaveBriefing(): Promise<void> {
  if (cycleSummaries.length === 0) {
    log.debug("No cycle summaries to aggregate");
    return;
  }

  if (!config.llmConfig?.apiKey) {
    log.debug("No LLM config for aggregation, dumping raw summaries");
    await writeBriefingFile(cycleSummaries.join("\n\n"));
    cycleSummaries.length = 0;
    cycleCount = 0;
    return;
  }

  const model = config.llmConfig.model || "google/gemini-2.5-flash";
  const baseUrl = config.llmConfig.baseUrl || "https://openrouter.ai/api/v1";

  const prompt = `You are summarizing ${cycleSummaries.length} conversation cycles from today. Create ONE cohesive briefing (5-7 bullet points) that captures:

1. Main topics discussed across all cycles
2. Key decisions made
3. Important action items or follow-ups
4. Any patterns or recurring themes

Cycle summaries:
${cycleSummaries.map((s, i) => `--- Cycle ${i + 1} ---\n${s}`).join("\n")}

Create a concise master briefing (no more than 150 words). Focus on what matters.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llmConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const masterBriefing = data.choices?.[0]?.message?.content || cycleSummaries.join("\n\n");

    // Write the aggregated briefing
    await writeBriefingFile(masterBriefing);

    log.info(`Aggregated briefing saved (${cycleSummaries.length} cycles → 1 briefing)`);

    // Clear collected summaries (tokens saved!)
    cycleSummaries.length = 0;
    cycleCount = 0;
  } catch (error) {
    log.error(`Failed to aggregate briefing: ${error}`);
    // Fallback: write raw summaries
    await writeBriefingFile(cycleSummaries.join("\n\n"));
    cycleSummaries.length = 0;
    cycleCount = 0;
  }
}

/**
 * Write briefing to briefings/YYYY-MM-DD.md (OUTSIDE memory/ to avoid token burn)
 */
async function writeBriefingFile(content: string): Promise<void> {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().slice(0, 5);

  // Write to briefings/ folder (NOT memory/briefings/ - avoid auto-indexing)
  const workspacePath =
    process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || "", ".openclaw", "workspace");
  const briefingDir = path.join(workspacePath, "briefings");
  const briefingPath = path.join(briefingDir, `${dateStr}.md`);

  try {
    // Ensure directory exists
    await fs.mkdir(briefingDir, { recursive: true });

    // Append master briefing entry
    const entry = `\n## Aggregated Briefing (${timeStr})\n${content}\n`;
    await fs.appendFile(briefingPath, entry, "utf-8");

    log.debug(`Wrote aggregated briefing to ${briefingPath}`);
  } catch (error) {
    log.error(`Failed to write briefing file: ${error}`);
  }
}

/**
 * Update RECENT_CONTEXT.md with latest summaries (for continuity)
 */
async function updateRecentContext(): Promise<void> {
  if (recentSummaries.length === 0) return;

  const workspacePath =
    process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || "", ".openclaw", "workspace");
  const contextPath = path.join(workspacePath, "RECENT_CONTEXT.md");

  const content = `# Recent Context

Last ${recentSummaries.length} conversation cycles:

${recentSummaries.map((s, i) => `## Cycle ${i + 1}\n${s}`).join("\n\n")}

---
*Auto-updated. Do not edit manually.*
`;

  try {
    await fs.writeFile(contextPath, content, "utf-8");
    log.debug(`Updated RECENT_CONTEXT.md with ${recentSummaries.length} summaries`);
  } catch (error) {
    log.error(`Failed to update RECENT_CONTEXT.md: ${error}`);
  }
}

/**
 * Force aggregation (e.g., at end of day)
 */
export async function forceAggregateBriefing(): Promise<void> {
  if (cycleSummaries.length > 0) {
    await aggregateAndSaveBriefing();
  }
}

/**
 * Get current cycle stats
 */
export function getCycleStats(): { cycleCount: number; summariesCollected: number } {
  return { cycleCount, summariesCollected: cycleSummaries.length };
}
