/**
 * EloClaw Features - Index
 *
 * Exports all implemented EloClaw features.
 * Universal LLM support - works with ANY provider.
 */

// ============================================================================
// FEATURE 1: TOOL RESULT PERSISTENCE
// ============================================================================

export * from "./tools/tool-result-persist.types.js";
export * from "./tools/tool-result-persist.js";

// ============================================================================
// FEATURE 2: CONVERSATION SUMMARIZATION
// ============================================================================

export * from "./conversation-summarizer.types.js";
export * from "./conversation-summarizer.js";

// ============================================================================
// FEATURE 3: STREAMING EVENTS
// ============================================================================

export * from "./streaming-events.types.js";
export * from "./streaming-events.js";

// ============================================================================
// FEATURE 4: RATE LIMITING & THROTTLING
// ============================================================================

export * from "./rate-limiter.types.js";
export * from "./rate-limiter.js";

// ============================================================================
// FEATURE SUMMARY
// ============================================================================

/**
 * EloClaw Features:
 *
 * 1. Tool Result Persistence
 *    - Persist large tool results (>100KB) to disk
 *    - Replace with preview + filepath
 *    - ~90% context token savings
 *
 * 2. Conversation Summarization
 *    - Delta summarization (incremental)
 *    - Full summarization (context threshold)
 *    - Structured summary format
 *
 * 3. Streaming Events
 *    - Standardized event types
 *    - EventEmitter-based API
 *    - Stream adapter utilities
 *
 * 4. Rate Limiting & Throttling
 *    - Token bucket algorithm
 *    - Cubic backoff for adaptive limiting
 *    - Exponential retry with jitter
 *    - Throttling error detection
 *
 * Works with: GLM5, Claude, GPT-4, Gemini, Llama, Mistral, and ALL other LLMs!
 */
