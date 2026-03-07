/**
 * Adaptive Response Integration
 *
 * Wires the adaptive response system into OpenClaw's message flow.
 * Works alongside existing auto-reply, not replacing it.
 *
 * Provides:
 * - Smart urgency scoring
 * - Response mode suggestions
 * - Pattern learning from user interactions
 */

import { onAgentEvent, type AgentEventPayload } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  classifyMessage,
  learnFromFeedback,
  type ResponseMode,
  type AdaptiveResponseConfig,
  updateAdaptiveConfig,
} from "./adaptive-response.js";

const log = createSubsystemLogger("adaptive-response-integration");

let unsubscribe: (() => void) | null = null;

// Track recent classifications for feedback loop
const recentClassifications = new Map<
  string,
  {
    classification: ReturnType<typeof classifyMessage> extends Promise<infer T> ? T : never;
    timestamp: number;
  }
>();

/**
 * Initialize adaptive response integration
 */
export function initAdaptiveResponse(config?: Partial<AdaptiveResponseConfig>): void {
  if (unsubscribe) {
    log.debug("Adaptive response already initialized");
    return;
  }

  if (config) {
    updateAdaptiveConfig(config);
  }

  // Listen for answer events to learn from interactions
  unsubscribe = onAgentEvent(handleAgentEvent);

  log.info("Adaptive response integration initialized");
}

/**
 * Stop adaptive response integration
 */
export function stopAdaptiveResponse(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    recentClassifications.clear();
    log.info("Adaptive response integration stopped");
  }
}

/**
 * Handle agent events for learning
 */
function handleAgentEvent(evt: AgentEventPayload): void {
  // Listen for user messages (to learn patterns)
  if (evt.stream === "user" || evt.stream === "inbound") {
    const text = (evt.data?.text as string) || "";
    const sessionKey = evt.sessionKey || evt.runId;

    if (text.trim()) {
      // Store for potential feedback learning
      const key = `${sessionKey}:${evt.data?.messageId || Date.now()}`;
      // Will be used for feedback loop when we see the bot's response
    }
  }

  // Listen for bot responses (to correlate with user patterns)
  if (evt.stream === "answer") {
    // Bot responded - the previous user message got a response
    // This could inform pattern learning
    const mode = classifyResponseMode((evt.data?.text as string) || "");
    log.debug(`Bot responded with mode: ${mode}`);
  }
}

/**
 * Classify what mode a response was
 */
function classifyResponseMode(text: string): ResponseMode {
  if (!text || text.length === 0) return "silent";
  if (text.length < 5) return "reaction";
  if (text.length < 100) return "short";
  return "full";
}

/**
 * Get response suggestion for a message
 *
 * Call this from message handlers to get adaptive suggestions
 */
export async function getResponseSuggestion(params: {
  message: string;
  sender?: string;
  channelId?: string;
  isGroup: boolean;
  isMentioned: boolean;
  isReply: boolean;
  recentContext?: string[];
}): Promise<{
  shouldRespond: boolean;
  urgency: number;
  suggestedMode: ResponseMode;
  reasoning: string;
  suggestedDelay?: number;
}> {
  const classification = await classifyMessage({
    ...params,
    timeOfDay: new Date().getHours(),
  });

  return {
    shouldRespond: classification.needsResponse,
    urgency: classification.urgency,
    suggestedMode: classification.mode,
    reasoning: classification.reasoning,
    suggestedDelay: classification.suggestedDelay,
  };
}

/**
 * Record feedback for learning
 *
 * Call this when user interacts with a bot response
 */
export function recordFeedback(params: {
  originalMessage: string;
  userAction: "responded" | "ignored" | "interrupted" | "corrected";
  botResponseMode: ResponseMode;
}): void {
  learnFromFeedback(params);
}

/**
 * Check if should use adaptive delay
 */
export function shouldDelayResponse(urgency: number, isGroup: boolean): number {
  // Higher urgency = faster response
  if (urgency >= 80) return 0;
  if (urgency >= 60) return 2000;
  if (urgency >= 40) return 5000;
  return 10000; // Low urgency = slow response
}

/**
 * Determine if bot should stay silent (HEARTBEAT_OK candidate)
 */
export function shouldStaySilent(urgency: number, isGroup: boolean): boolean {
  const threshold = isGroup ? 40 : 20;
  return urgency < threshold;
}
