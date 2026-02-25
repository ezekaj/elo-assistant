/**
 * Prompt Caching Utilities
 *
 * Applies cache_control to prompts for optimal caching.
 * Integrates with CacheBreakpointManager.
 */

import type { CacheControl, CacheBreakpoint } from "../config/types.cache.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { CacheBreakpointManager } from "./cache-breakpoint-manager.js";

const log = createSubsystemLogger("prompt-caching");

// ============================================================================
// TYPES
// ============================================================================

/**
 * Content block that can have cache_control
 */
export interface CacheableContentBlock {
  type: string;
  text?: string;
  source?: any;
  cache_control?: CacheControl;
  [key: string]: any;
}

/**
 * Message with cacheable content
 */
export interface CacheableMessage {
  role: string;
  content: string | CacheableContentBlock[];
  cache_control?: CacheControl;
}

/**
 * Tool definition with cache_control support
 */
export interface CacheableTool {
  name: string;
  description?: string;
  input_schema?: any;
  cache_control?: CacheControl;
}

/**
 * Prompt components for caching
 */
export interface CacheablePrompt {
  tools?: CacheableTool[];
  system?: string | CacheableContentBlock[];
  messages: CacheableMessage[];
}

// ============================================================================
// CACHE CONTROL APPLICATION
// ============================================================================

/**
 * Apply cache_control to a content block
 */
export function applyCacheControlToBlock(
  block: CacheableContentBlock,
  control: CacheControl,
): CacheableContentBlock {
  return {
    ...block,
    cache_control: control,
  };
}

/**
 * Apply cache_control to last tool in list
 */
export function applyCacheControlToTools(
  tools: CacheableTool[],
  control: CacheControl,
): CacheableTool[] {
  if (tools.length === 0) {
    return tools;
  }

  const lastTool = tools[tools.length - 1];
  const updatedTools = [...tools];
  updatedTools[tools.length - 1] = {
    ...lastTool,
    cache_control: control,
  };

  log.debug(`Applied cache_control to last tool (${lastTool.name})`);
  return updatedTools;
}

/**
 * Apply cache_control to last system block
 */
export function applyCacheControlToSystem(
  system: string | CacheableContentBlock[],
  control: CacheControl,
): string | CacheableContentBlock[] {
  if (typeof system === "string") {
    // Convert string to block array with cache_control
    return [
      {
        type: "text",
        text: system,
        cache_control: control,
      },
    ];
  }

  if (system.length === 0) {
    return system;
  }

  const lastBlock = system[system.length - 1];
  const updatedSystem = [...system];
  updatedSystem[system.length - 1] = applyCacheControlToBlock(lastBlock, control);

  log.debug(`Applied cache_control to last system block`);
  return updatedSystem;
}

/**
 * Apply cache_control to last message content block
 */
export function applyCacheControlToMessages(
  messages: CacheableMessage[],
  control: CacheControl,
): CacheableMessage[] {
  if (messages.length === 0) {
    return messages;
  }

  const lastMessage = messages[messages.length - 1];
  const updatedMessages = [...messages];

  if (typeof lastMessage.content === "string") {
    // Convert string content to block array
    updatedMessages[messages.length - 1] = {
      ...lastMessage,
      content: [
        {
          type: "text",
          text: lastMessage.content,
          cache_control: control,
        },
      ],
    };
  } else if (Array.isArray(lastMessage.content)) {
    // Apply to last content block
    const contentBlocks = [...lastMessage.content];
    const lastBlock = contentBlocks[contentBlocks.length - 1];
    contentBlocks[contentBlocks.length - 1] = applyCacheControlToBlock(lastBlock, control);

    updatedMessages[messages.length - 1] = {
      ...lastMessage,
      content: contentBlocks,
    };
  }

  log.debug(`Applied cache_control to last message`);
  return updatedMessages;
}

// ============================================================================
// PROMPT BUILDER WITH CACHING
// ============================================================================

/**
 * Build prompt with cache_control based on breakpoints
 */
export function buildPromptWithCaching(
  prompt: CacheablePrompt,
  breakpointManager?: CacheBreakpointManager,
): CacheablePrompt {
  if (!breakpointManager || !breakpointManager.isEnabled()) {
    return prompt;
  }

  // Validate breakpoints
  const validation = breakpointManager.validate();
  if (!validation.valid) {
    log.warn(`Invalid breakpoints: ${validation.errors.join("; ")}`);
    return prompt;
  }

  const breakpoints = breakpointManager.getBreakpoints();
  const result: CacheablePrompt = {
    ...prompt,
    tools: prompt.tools ? [...prompt.tools] : undefined,
    system: prompt.system,
    messages: [...prompt.messages],
  };

  // Apply cache_control at each breakpoint
  for (const bp of breakpoints) {
    const control: CacheControl = {
      type: "ephemeral",
      ttl: bp.ttl,
    };

    if (bp.position === 0 && result.tools) {
      // Apply to tools
      result.tools = applyCacheControlToTools(result.tools, control);
      log.debug(`Applied cache_control to tools (TTL: ${bp.ttl})`);
    } else if (bp.position === 1 && result.system) {
      // Apply to system
      result.system = applyCacheControlToSystem(result.system, control);
      log.debug(`Applied cache_control to system (TTL: ${bp.ttl})`);
    } else if (bp.position === -1 && result.messages) {
      // Apply to messages
      result.messages = applyCacheControlToMessages(result.messages, control);
      log.debug(`Applied cache_control to messages (TTL: ${bp.ttl})`);
    }
  }

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create cache_control object
 */
export function createCacheControl(ttl: "5m" | "1h" = "5m"): CacheControl {
  return {
    type: "ephemeral",
    ttl,
  };
}

/**
 * Check if content block has cache_control
 */
export function hasCacheControl(block: CacheableContentBlock): boolean {
  return block.cache_control !== undefined;
}

/**
 * Get all cache_control blocks from prompt
 */
export function getCacheControlBlocks(prompt: CacheablePrompt): CacheControl[] {
  const controls: CacheControl[] = [];

  // Check tools
  if (prompt.tools) {
    for (const tool of prompt.tools) {
      if (tool.cache_control) {
        controls.push(tool.cache_control);
      }
    }
  }

  // Check system
  if (Array.isArray(prompt.system)) {
    for (const block of prompt.system) {
      if (block.cache_control) {
        controls.push(block.cache_control);
      }
    }
  }

  // Check messages
  for (const message of prompt.messages) {
    if (message.cache_control) {
      controls.push(message.cache_control);
    }

    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.cache_control) {
          controls.push(block.cache_control);
        }
      }
    }
  }

  return controls;
}

/**
 * Count cache breakpoints in prompt
 */
export function countCacheBreakpoints(prompt: CacheablePrompt): number {
  return getCacheControlBlocks(prompt).length;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  applyCacheControlToBlock,
  applyCacheControlToTools,
  applyCacheControlToSystem,
  applyCacheControlToMessages,
  buildPromptWithCaching,
  createCacheControl,
  hasCacheControl,
  getCacheControlBlocks,
  countCacheBreakpoints,
};

export type { CacheableContentBlock, CacheableMessage, CacheableTool, CacheablePrompt };
