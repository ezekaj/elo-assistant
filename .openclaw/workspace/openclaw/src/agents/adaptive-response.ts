/**
 * Adaptive Response System
 *
 * Next-level auto-reply that learns from user behavior:
 * - Intent classification (response needed?)
 * - Urgency scoring (when to respond?)
 * - Response mode selection (reaction/short/full)
 * - Pattern learning from past interactions
 *
 * Based on Anthropic research: experienced users auto-approve more
 * but interrupt more often → let agent run, intervene when needed.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("adaptive-response");

// Response modes
export type ResponseMode = "silent" | "reaction" | "short" | "full" | "proactive";

// Message classification
export interface MessageClassification {
  needsResponse: boolean;
  urgency: number; // 0-100
  mode: ResponseMode;
  confidence: number; // 0-1
  reasoning: string;
  suggestedDelay?: number; // ms to wait before responding
}

// User interaction pattern
export interface UserPattern {
  type: string;
  count: number;
  lastSeen: number;
  avgResponseTime: number;
  preferredMode: ResponseMode;
}

// Pattern store (in-memory for now, could persist)
const patterns = new Map<string, UserPattern>();

// Configuration
export interface AdaptiveResponseConfig {
  /** Local model for fast classification (default: lfm2.5) */
  classifierModel?: string;
  /** Minimum urgency to respond in groups (default: 40) */
  groupUrgencyThreshold?: number;
  /** Minimum urgency to respond in DMs (default: 20) */
  dmUrgencyThreshold?: number;
  /** Learn from user corrections (default: true) */
  learningEnabled?: boolean;
  /** Hours to avoid proactive messages (default: 23-8) */
  quietHours?: { start: number; end: number };
}

let config: AdaptiveResponseConfig = {
  classifierModel: "lmstudio/liquidai_lfm2.5-1.2b-instruct",
  groupUrgencyThreshold: 40,
  dmUrgencyThreshold: 20,
  learningEnabled: true,
  quietHours: { start: 23, end: 8 },
};

/**
 * Classify a message and determine response strategy
 */
export async function classifyMessage(params: {
  message: string;
  sender?: string;
  channelId?: string;
  isGroup: boolean;
  isMentioned: boolean;
  isReply: boolean;
  recentContext?: string[];
  timeOfDay?: number;
}): Promise<MessageClassification> {
  const { message, isGroup, isMentioned, isReply, recentContext, timeOfDay } = params;

  // Fast path: explicit mentions/replies always need response
  if (isMentioned || isReply) {
    const urgency = isGroup ? 70 : 85;
    return {
      needsResponse: true,
      urgency,
      mode: urgency > 80 ? "full" : "short",
      confidence: 0.95,
      reasoning: isMentioned ? "Direct mention" : "Reply to bot",
    };
  }

  // Check learned patterns first
  const patternKey = extractPatternKey(message);
  const learned = patterns.get(patternKey);
  if (learned && learned.count >= 3) {
    // We've seen this pattern before, use learned behavior
    return {
      needsResponse: learned.preferredMode !== "silent",
      urgency: isGroup ? config.groupUrgencyThreshold! : config.dmUrgencyThreshold!,
      mode: learned.preferredMode,
      confidence: Math.min(0.9, 0.5 + learned.count * 0.1),
      reasoning: `Learned pattern: ${learned.type} (${learned.count} occurrences)`,
    };
  }

  // Classify using rules + context
  const classification = await classifyWithRules(params);

  // Apply quiet hours
  const hour = timeOfDay ?? new Date().getHours();
  if (classification.mode === "proactive" && isInQuietHours(hour)) {
    classification.mode = "silent";
    classification.needsResponse = false;
    classification.reasoning += " (quiet hours)";
  }

  return classification;
}

/**
 * Rule-based classification (fast, no LLM needed)
 */
async function classifyWithRules(params: {
  message: string;
  isGroup: boolean;
  isMentioned: boolean;
  isReply: boolean;
  recentContext?: string[];
}): Promise<MessageClassification> {
  const { message, isGroup, recentContext } = params;
  const lower = message.toLowerCase();

  // Question detection
  const hasQuestion =
    /\?|^(what|how|why|when|where|who|can|could|would|should|is|are|do|does)/i.test(message);

  // Urgent keywords
  const urgentKeywords =
    /urgent|emergency|asap|right now|immediately|critical|important|help me|stuck|broken|error|fail/i;
  const isUrgent = urgentKeywords.test(lower);

  // Greeting patterns
  const isGreeting = /^(hi|hello|hey|good morning|good evening|yo|sup)\b/i.test(lower);

  // Casual conversation
  const isCasual = /^(nice|cool|ok|yeah|yep|nope|lol|haha|thanks|thx|ty)\b/i.test(lower);

  // Command-like
  const isCommand = /^(\/|!|\.)|(please|pls|can you|could you)/i.test(lower);

  // Calculate urgency
  let urgency = 0;
  let mode: ResponseMode = "silent";
  let reasoning = "";

  if (isUrgent) {
    urgency = 90;
    mode = "full";
    reasoning = "Urgent keywords detected";
  } else if (hasQuestion) {
    urgency = isGroup ? 50 : 70;
    mode = "short";
    reasoning = "Question detected";
  } else if (isCommand) {
    urgency = isGroup ? 60 : 80;
    mode = "full";
    reasoning = "Command-like message";
  } else if (isGreeting) {
    urgency = isGroup ? 30 : 60;
    mode = "short";
    reasoning = "Greeting";
  } else if (isCasual) {
    urgency = 10;
    mode = "reaction";
    reasoning = "Casual conversation";
  } else {
    // Default: check if it's substantive
    const wordCount = message.split(/\s+/).length;
    if (wordCount > 20) {
      urgency = isGroup ? 35 : 50;
      mode = "short";
      reasoning = "Substantive message in context";
    } else {
      urgency = 5;
      mode = "silent";
      reasoning = "No response needed";
    }
  }

  // Group threshold check
  const threshold = isGroup ? config.groupUrgencyThreshold! : config.dmUrgencyThreshold!;
  const needsResponse = urgency >= threshold;

  if (!needsResponse && mode !== "silent") {
    mode = "silent";
  }

  return {
    needsResponse,
    urgency,
    mode,
    confidence: 0.7,
    reasoning,
    suggestedDelay: mode === "proactive" ? 60000 : undefined,
  };
}

/**
 * Learn from user feedback
 */
export function learnFromFeedback(params: {
  message: string;
  userAction: "responded" | "ignored" | "interrupted" | "corrected";
  botMode: ResponseMode;
}): void {
  if (!config.learningEnabled) return;

  const { message, userAction, botMode } = params;
  const patternKey = extractPatternKey(message);

  let pattern = patterns.get(patternKey);
  if (!pattern) {
    pattern = {
      type: categorizeMessage(message),
      count: 0,
      lastSeen: Date.now(),
      avgResponseTime: 0,
      preferredMode: "silent",
    };
    patterns.set(patternKey, pattern);
  }

  pattern.count++;
  pattern.lastSeen = Date.now();

  // Update preferred mode based on user action
  if (userAction === "ignored") {
    pattern.preferredMode = "silent";
  } else if (userAction === "interrupted") {
    // User wanted different response
    pattern.preferredMode = botMode === "full" ? "short" : "full";
  } else if (userAction === "responded") {
    pattern.preferredMode = botMode;
  }

  log.debug(
    `Learned pattern: ${patternKey} → ${pattern.preferredMode} (${pattern.count} occurrences)`,
  );
}

/**
 * Check if current time is in quiet hours
 */
function isInQuietHours(hour: number): boolean {
  const { start, end } = config.quietHours!;
  if (start > end) {
    // Crosses midnight (e.g., 23-8)
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

/**
 * Extract pattern key for learning
 */
function extractPatternKey(message: string): string {
  const lower = message.toLowerCase().trim();

  // Normalize common variations
  const normalized = lower
    .replace(/\b(hi|hello|hey|yo)\b/g, "greeting")
    .replace(/\b(thanks|thank you|thx|ty)\b/g, "thanks")
    .replace(/\?/g, " question")
    .replace(/\d+/g, "NUM");

  // Get first ~30 chars as key
  return normalized.slice(0, 30);
}

/**
 * Categorize message type
 */
function categorizeMessage(message: string): string {
  const lower = message.toLowerCase();

  if (/\?/.test(message)) return "question";
  if (/^(hi|hello|hey)/i.test(message)) return "greeting";
  if (/^(thanks|thx|ty)/i.test(message)) return "thanks";
  if (/^(nice|cool|ok|yeah)/i.test(message)) return "casual";
  if (/^(\/|!|\.)/.test(message)) return "command";
  if (/urgent|emergency|asap/i.test(message)) return "urgent";

  return "general";
}

/**
 * Get current patterns (for debugging/inspection)
 */
export function getPatterns(): Map<string, UserPattern> {
  return new Map(patterns);
}

/**
 * Update configuration
 */
export function updateAdaptiveConfig(cfg: Partial<AdaptiveResponseConfig>): void {
  config = { ...config, ...cfg };
}

/**
 * Get optimal response timing based on patterns
 */
export function getOptimalResponseTime(channelId: string): number {
  // Could learn from past interactions when user typically responds
  // For now, return reasonable defaults
  const hour = new Date().getHours();

  if (hour >= 9 && hour < 12) return 5000; // Morning: quick
  if (hour >= 12 && hour < 14) return 15000; // Lunch: slower
  if (hour >= 14 && hour < 18) return 8000; // Afternoon: moderate
  if (hour >= 18 && hour < 22) return 10000; // Evening: moderate
  return 30000; // Night: slow
}
