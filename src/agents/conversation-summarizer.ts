/**
 * Conversation Summarizer
 *
 * Auto-summarizes conversation history to save context.
 * Extracted from Claude Code v2.1.50
 */

import type {
  ConversationMessage,
  ConversationSummary,
  SummarizationOptions,
  DeltaSummaryResult,
  FullSummaryResult,
} from "./conversation-summarizer.types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  DEFAULT_MAX_SUMMARY_TOKENS,
  MIN_MESSAGES_FOR_SUMMARY,
  DELTA_SUMMARY_SYSTEM_PROMPT,
  FULL_SUMMARY_SYSTEM_PROMPT,
  formatSummaryForContext,
} from "./conversation-summarizer.types.js";

const log = createSubsystemLogger("conversation-summarizer");

// ============================================================================
// DELTA SUMMARIZATION
// ============================================================================

/**
 * Extract content from message
 */
function extractMessageContent(message: ConversationMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("\n");
  }

  return "";
}

/**
 * Summarize new messages incrementally
 * Updates existing summary with new information
 */
export async function summarizeDelta(
  currentSummary: string,
  newMessages: ConversationMessage[],
  options?: SummarizationOptions,
): Promise<DeltaSummaryResult> {
  if (newMessages.length === 0) {
    return { summary: currentSummary, changed: false };
  }

  const messagesText = newMessages
    .map((m) => `${m.role}: ${extractMessageContent(m)}`)
    .join("\n\n");

  const prompt = `Summary so far: ${currentSummary || "None"}

New messages: 
${messagesText}`;

  // Use provided model or default small model
  const model = options?.model || "fast";

  try {
    // Call LLM for summarization
    // This is a placeholder - integrate with actual LLM client
    const response = await callLLMForSummary({
      systemPrompt: DELTA_SUMMARY_SYSTEM_PROMPT,
      userPrompt: prompt,
      model,
      maxTokens: 500,
    });

    // Extract summary from response
    const summaryMatch = response.match(/<summary>([\s\S]*?)<\/summary>/);
    const newSummary = summaryMatch ? summaryMatch[1].trim() : "";

    if (!newSummary) {
      return { summary: currentSummary, changed: false };
    }

    return { summary: newSummary, changed: true };
  } catch (error) {
    log.error(`Delta summarization failed: ${error}`);
    return { summary: currentSummary, changed: false };
  }
}

// ============================================================================
// FULL SUMMARIZATION
// ============================================================================

/**
 * Parse summary sections from LLM response
 */
function parseSummaryResponse(response: string): ConversationSummary | null {
  // Extract summary block
  const summaryMatch = response.match(/<summary>([\s\S]*?)<\/summary>/);
  if (!summaryMatch) {
    log.warn("No summary block found in response");
    return null;
  }

  const summaryText = summaryMatch[1];

  // Parse sections
  const sections: Record<string, string[]> = {};
  let currentSection = "";

  const lines = summaryText.split("\n");
  for (const line of lines) {
    // Check for section header (numbered)
    const sectionMatch = line.match(/^(\d+)\.\s*(.+?):/);
    if (sectionMatch) {
      currentSection = sectionMatch[2].toLowerCase().replace(/\s+/g, "_");
      sections[currentSection] = [];
      continue;
    }

    // Check for bullet point
    const bulletMatch = line.match(/^[-•]\s*(.+)/);
    if (bulletMatch && currentSection) {
      sections[currentSection].push(bulletMatch[1].trim());
      continue;
    }

    // Regular text for current section
    if (currentSection && line.trim()) {
      if (sections[currentSection].length === 0) {
        sections[currentSection].push(line.trim());
      } else {
        // Append to last item
        const lastIndex = sections[currentSection].length - 1;
        sections[currentSection][lastIndex] += " " + line.trim();
      }
    }
  }

  // Build summary object
  const summary: ConversationSummary = {
    primaryRequest:
      sections["primary_request_and_intent"]?.[0] || sections["primary_request"]?.[0] || "",
    keyConcepts: sections["key_technical_concepts"] || sections["key_concepts"] || [],
    currentState: sections["current_state"]?.[0] || "",
    discoveries: sections["important_discoveries"] || sections["discoveries"] || [],
    errorsAndFixes: parseErrorsAndFixes(sections["errors_and_fixes"] || []),
    nextSteps: sections["next_steps"] || [],
    userPreferences: sections["user_preferences"] || [],
    createdAt: Date.now(),
    tokenCount: 0,
  };

  // Estimate token count
  const formattedText = formatSummaryForContext(summary);
  summary.tokenCount = Math.ceil(formattedText.length / 4);

  return summary;
}

/**
 * Parse error/fix pairs
 */
function parseErrorsAndFixes(lines: string[]): Array<{ error: string; fix: string }> {
  const results: Array<{ error: string; fix: string }> = [];

  for (const line of lines) {
    const match = line.match(/Error:\s*(.+?)\s*Fix:\s*(.+)/i);
    if (match) {
      results.push({ error: match[1].trim(), fix: match[2].trim() });
    }
  }

  return results;
}

/**
 * Generate full conversation summary
 */
export async function generateFullSummary(
  messages: ConversationMessage[],
  options?: SummarizationOptions,
): Promise<FullSummaryResult | null> {
  if (messages.length < MIN_MESSAGES_FOR_SUMMARY) {
    log.debug(`Not enough messages for summary (${messages.length} < ${MIN_MESSAGES_FOR_SUMMARY})`);
    return null;
  }

  // Format messages for LLM
  const messagesText = messages
    .map((m) => `${m.role.toUpperCase()}: ${extractMessageContent(m)}`)
    .join("\n\n---\n\n");

  const prompt = `Please summarize the following conversation:

${messagesText}`;

  const model = options?.model || "default";
  const maxTokens = options?.maxTokens || DEFAULT_MAX_SUMMARY_TOKENS;

  try {
    const response = await callLLMForSummary({
      systemPrompt: FULL_SUMMARY_SYSTEM_PROMPT,
      userPrompt: prompt,
      model,
      maxTokens,
    });

    const summary = parseSummaryResponse(response);
    if (!summary) {
      return null;
    }

    const formattedText = formatSummaryForContext(summary);

    // Estimate token savings
    const originalTokens = Math.ceil(messagesText.length / 4);
    const tokenSavings = originalTokens - summary.tokenCount;

    log.info(
      `Generated summary: ${originalTokens} → ${summary.tokenCount} tokens (saved ${tokenSavings})`,
    );

    return {
      summary,
      formattedText,
      tokenSavings,
    };
  } catch (error) {
    log.error(`Full summarization failed: ${error}`);
    return null;
  }
}

// ============================================================================
// LLM CLIENT ADAPTER
// ============================================================================

/**
 * LLM call options for summarization
 */
interface LLMSummaryCallOptions {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
}

/**
 * Call LLM for summarization
 * This is a placeholder - integrate with actual LLM client
 */
async function callLLMForSummary(options: LLMSummaryCallOptions): Promise<string> {
  // This should be replaced with actual LLM client integration
  // For now, return a placeholder

  const { systemPrompt, userPrompt, model, maxTokens } = options;

  // TODO: Integrate with OpenClaw's LLM client
  // Example integration:
  // const client = getLLMClient();
  // const response = await client.chat({
  //   model: model === 'fast' ? 'glm-4-flash' : 'glm-5',
  //   messages: [
  //     { role: 'system', content: systemPrompt },
  //     { role: 'user', content: userPrompt }
  //   ],
  //   max_tokens: maxTokens
  // });
  // return response.content;

  log.debug(`Would call LLM with model=${model}, maxTokens=${maxTokens}`);

  // Return placeholder response
  return `<summary>
1. Primary Request and Intent:
User requested implementation of features from Claude Code.

2. Key Technical Concepts:
- Tool result persistence
- Conversation summarization
- Streaming events

3. Current State:
Implementing conversation summarizer.

4. Important Discoveries:
- OpenClaw already has many features
- Fast mode not needed with single model

5. Next Steps:
- Complete streaming events implementation
- Integrate with existing code

6. User Preferences:
User has only glm5 model
</summary>`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ConversationSummarizer = {
  summarizeDelta,
  generateFullSummary,
  formatSummaryForContext,
};

export default ConversationSummarizer;
