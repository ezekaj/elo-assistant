/**
 * Conversation Summarization Types
 *
 * Types for auto-summarizing conversation history.
 * Extracted from Claude Code v2.1.50
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Conversation message for summarization
 */
export interface ConversationMessage {
  /** Message role */
  role: "user" | "assistant" | "system";
  /** Message content */
  content: string | Array<{ type: string; text?: string }>;
  /** Message timestamp */
  timestamp?: number;
  /** Message ID */
  id?: string;
}

/**
 * Summary of conversation
 */
export interface ConversationSummary {
  /** Primary request and intent */
  primaryRequest: string;
  /** Key technical concepts discussed */
  keyConcepts: string[];
  /** Current state of work */
  currentState: string;
  /** Important discoveries */
  discoveries: string[];
  /** Errors encountered and fixes */
  errorsAndFixes: Array<{ error: string; fix: string }>;
  /** Next steps */
  nextSteps: string[];
  /** User preferences noted */
  userPreferences: string[];
  /** Summary creation timestamp */
  createdAt: number;
  /** Token count of summary */
  tokenCount: number;
}

/**
 * Summarization options
 */
export interface SummarizationOptions {
  /** Maximum tokens for summary */
  maxTokens?: number;
  /** Model to use for summarization */
  model?: string;
  /** Whether to include code snippets */
  includeCodeSnippets?: boolean;
  /** Custom system prompt */
  customSystemPrompt?: string;
}

/**
 * Delta summarization result
 */
export interface DeltaSummaryResult {
  /** Updated summary text */
  summary: string;
  /** Whether summary changed */
  changed: boolean;
}

/**
 * Full summarization result
 */
export interface FullSummaryResult {
  /** Generated summary */
  summary: ConversationSummary;
  /** Formatted summary text for context */
  formattedText: string;
  /** Estimated token savings */
  tokenSavings: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default max tokens for summary
 */
export const DEFAULT_MAX_SUMMARY_TOKENS = 2000;

/**
 * Minimum messages before summarization
 */
export const MIN_MESSAGES_FOR_SUMMARY = 10;

/**
 * System prompt for delta summarization
 */
export const DELTA_SUMMARY_SYSTEM_PROMPT = `You are given a few messages from a conversation, as well as a summary of the conversation so far. Your task is to summarize the new messages in the conversation based on the summary so far. Aim for 1-2 sentences at most, focusing on the most important details. The summary MUST be in <summary>summary goes here</summary> tags. If there is no new information, return an empty string: <summary></summary>.`;

/**
 * System prompt for full summarization
 */
export const FULL_SUMMARY_SYSTEM_PROMPT = `Your task is to create a detailed summary of the RECENT portion of the conversation — the messages that follow earlier retained context. The earlier messages are being kept intact and do NOT need to be summarized. Focus your summary on what was discussed, learned, and accomplished in the recent messages only.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Analyze the recent messages chronologically. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.

2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents from the recent messages
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks discussed recently.
3. Current State: What has been completed so far. Files created, modified, or analyzed (with paths if relevant). Key outputs or artifacts produced.
4. Important Discoveries: Technical constraints or requirements uncovered. Decisions made and their rationale. Errors encountered and how they were resolved. What approaches were tried that didn't work (and why).
5. Next Steps: Specific actions needed to complete the task. Any blockers or open questions to resolve. Priority order if multiple steps remain.
6. User Preferences: User preferences or style requirements. Domain-specific details that aren't obvious. Any promises made to the user.

Format your response as:
<analysis>
[Your analysis here]
</analysis>

<summary>
1. Primary Request and Intent:
[Content]

2. Key Technical Concepts:
- [Concept 1]
- [Concept 2]

3. Current State:
[Content]

4. Important Discoveries:
[Content]

5. Next Steps:
- [Step 1]
- [Step 2]

6. User Preferences:
[Content]
</summary>`;

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format summary for context injection
 */
export function formatSummaryForContext(summary: ConversationSummary): string {
  let output = `[CONVERSATION SUMMARY]\n`;
  output += `This session is being continued from a previous conversation that ran out of context.\n`;
  output += `The summary below covers the earlier portion of the conversation.\n\n`;

  output += `1. Primary Request and Intent:\n${summary.primaryRequest}\n\n`;

  if (summary.keyConcepts.length > 0) {
    output += `2. Key Technical Concepts:\n`;
    summary.keyConcepts.forEach((c) => {
      output += `- ${c}\n`;
    });
    output += "\n";
  }

  output += `3. Current State:\n${summary.currentState}\n\n`;

  if (summary.discoveries.length > 0) {
    output += `4. Important Discoveries:\n`;
    summary.discoveries.forEach((d) => {
      output += `- ${d}\n`;
    });
    output += "\n";
  }

  if (summary.errorsAndFixes.length > 0) {
    output += `5. Errors and Fixes:\n`;
    summary.errorsAndFixes.forEach(({ error, fix }) => {
      output += `- Error: ${error}\n  Fix: ${fix}\n`;
    });
    output += "\n";
  }

  if (summary.nextSteps.length > 0) {
    output += `6. Next Steps:\n`;
    summary.nextSteps.forEach((s) => {
      output += `- ${s}\n`;
    });
    output += "\n";
  }

  if (summary.userPreferences.length > 0) {
    output += `7. User Preferences:\n`;
    summary.userPreferences.forEach((p) => {
      output += `- ${p}\n`;
    });
    output += "\n";
  }

  output += `[END SUMMARY]\n`;
  output += `Recent messages are preserved verbatim below.\n`;

  return output;
}
