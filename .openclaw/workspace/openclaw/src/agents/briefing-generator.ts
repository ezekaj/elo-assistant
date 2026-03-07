/**
 * LLM-Powered Briefing Generator
 *
 * Generates intelligent briefings using OpenRouter free models
 * Integrates with OpenClaw memory for context-aware insights
 *
 * Based on 2026 research:
 * - GOD Model (privacy-preserving AI)
 * - Alpha-Service (proactive assistance)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("briefing-generator");

/**
 * Briefing generation configuration
 */
export interface BriefingConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Model to use (defaults to free gemini) */
  model?: string;
  /** Base URL for OpenRouter */
  baseUrl?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
}

/**
 * Context data for briefing generation
 */
export interface BriefingContext {
  /** Recent emails */
  emails?: Array<{
    from: string;
    subject: string;
    priority?: "high" | "medium" | "low";
  }>;
  /** Upcoming calendar events */
  calendar?: Array<{
    title: string;
    time: Date;
    duration?: number;
  }>;
  /** Tasks/todos */
  tasks?: Array<{
    title: string;
    dueDate?: Date;
    priority?: "high" | "medium" | "low";
  }>;
  /** Recent activity from memory */
  recentActivity?: string[];
  /** User preferences */
  userPreferences?: {
    workHours?: { start: number; end: number };
    focusAreas?: string[];
  };
}

/**
 * Generated briefing result
 */
export interface BriefingResult {
  /** Generated briefing text */
  content: string;
  /** Model used */
  model: string;
  /** Generation timestamp */
  timestamp: number;
  /** Token usage (if available) */
  tokensUsed?: number;
}

/**
 * Generate a daily briefing using LLM
 */
export async function generateDailyBriefing(
  context: BriefingContext,
  config: BriefingConfig,
): Promise<BriefingResult> {
  const model = config.model || "google/gemini-2.5-flash";
  const baseUrl = config.baseUrl || "https://openrouter.ai/api/v1";
  const maxTokens = config.maxTokens || 500;

  log.info(`Generating daily briefing with ${model}`);

  // Build context summary
  const contextSummary = buildContextSummary(context);

  // Create prompt
  const prompt = `You are a helpful AI assistant providing a morning briefing.

Current Context:
${contextSummary}

Generate a concise, actionable daily briefing (3-5 bullet points). Focus on:
1. Most urgent/important items
2. Time-sensitive events
3. Key priorities for today

Keep it brief, friendly, and actionable. Use emojis sparingly.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "Unable to generate briefing.";
    const tokensUsed = data.usage?.total_tokens;

    log.info(`Briefing generated successfully (${tokensUsed} tokens)`);

    return {
      content,
      model,
      timestamp: Date.now(),
      tokensUsed,
    };
  } catch (error) {
    log.error("Failed to generate briefing:", error as Record<string, unknown>);

    // Fallback to simple summary
    return {
      content: buildFallbackBriefing(context),
      model: "fallback",
      timestamp: Date.now(),
    };
  }
}

/**
 * Build context summary for LLM prompt
 */
function buildContextSummary(context: BriefingContext): string {
  const parts: string[] = [];

  if (context.emails && context.emails.length > 0) {
    const highPriority = context.emails.filter((e) => e.priority === "high");
    if (highPriority.length > 0) {
      parts.push(`Emails: ${highPriority.length} urgent emails`);
      highPriority.slice(0, 3).forEach((email) => {
        parts.push(`  - From ${email.from}: "${email.subject}"`);
      });
    } else {
      parts.push(`Emails: ${context.emails.length} new messages`);
    }
  }

  if (context.calendar && context.calendar.length > 0) {
    parts.push(`\nCalendar: ${context.calendar.length} events today`);
    context.calendar.slice(0, 3).forEach((event) => {
      const timeStr = event.time.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      parts.push(`  - ${timeStr}: ${event.title}`);
    });
  }

  if (context.tasks && context.tasks.length > 0) {
    const dueSoon = context.tasks.filter((t) => {
      if (!t.dueDate) return false;
      const diff = t.dueDate.getTime() - Date.now();
      return diff < 24 * 60 * 60 * 1000; // Due within 24 hours
    });
    if (dueSoon.length > 0) {
      parts.push(`\nTasks: ${dueSoon.length} due soon`);
      dueSoon.slice(0, 3).forEach((task) => {
        parts.push(`  - ${task.title}${task.priority === "high" ? " (HIGH PRIORITY)" : ""}`);
      });
    } else if (context.tasks.length > 0) {
      parts.push(`\nTasks: ${context.tasks.length} active tasks`);
    }
  }

  if (context.recentActivity && context.recentActivity.length > 0) {
    parts.push(`\nRecent Activity: ${context.recentActivity.slice(0, 3).join(", ")}`);
  }

  return parts.join("\n") || "No specific context available.";
}

/**
 * Build a simple fallback briefing when LLM fails
 */
function buildFallbackBriefing(context: BriefingContext): string {
  const parts: string[] = ["Good morning! Here's your quick update:"];

  if (context.emails && context.emails.length > 0) {
    const urgent = context.emails.filter((e) => e.priority === "high").length;
    if (urgent > 0) {
      parts.push(`• ${urgent} urgent email${urgent > 1 ? "s" : ""} waiting`);
    } else {
      parts.push(`• ${context.emails.length} new email${context.emails.length > 1 ? "s" : ""}`);
    }
  }

  if (context.calendar && context.calendar.length > 0) {
    const next = context.calendar[0];
    const timeStr = next.time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    parts.push(`• Next meeting: ${next.title} at ${timeStr}`);
  }

  if (context.tasks && context.tasks.length > 0) {
    const dueSoon = context.tasks.filter((t) => {
      if (!t.dueDate) return false;
      const diff = t.dueDate.getTime() - Date.now();
      return diff < 24 * 60 * 60 * 1000;
    });
    if (dueSoon.length > 0) {
      parts.push(`• ${dueSoon.length} task${dueSoon.length > 1 ? "s" : ""} due today`);
    }
  }

  if (parts.length === 1) {
    parts.push("• No urgent items - have a great day!");
  }

  return parts.join("\n");
}

/**
 * Generate a meeting preparation briefing
 */
export async function generateMeetingPrep(
  meetingTitle: string,
  meetingTime: Date,
  context: Partial<BriefingContext>,
  config: BriefingConfig,
): Promise<BriefingResult> {
  const model = config.model || "google/gemini-2.5-flash";
  const baseUrl = config.baseUrl || "https://openrouter.ai/api/v1";

  const prompt = `You are a helpful AI assistant preparing someone for an upcoming meeting.

Meeting: "${meetingTitle}"
Time: ${meetingTime.toLocaleString()}
${context.recentActivity ? `\nRecent relevant activity:\n${context.recentActivity.join("\n")}` : ""}

Provide a brief 2-3 point meeting preparation guide. Include:
- Key topics likely to come up
- Quick prep items
- Any relevant context

Keep it actionable and concise.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ||
      `Meeting prep for "${meetingTitle}" at ${meetingTime.toLocaleTimeString()}`;

    return {
      content,
      model,
      timestamp: Date.now(),
      tokensUsed: data.usage?.total_tokens,
    };
  } catch (error) {
    log.error("Failed to generate meeting prep:", error as Record<string, unknown>);
    return {
      content: `Upcoming meeting: "${meetingTitle}" at ${meetingTime.toLocaleTimeString()}\n\nPrepare key points and review recent context.`,
      model: "fallback",
      timestamp: Date.now(),
    };
  }
}
