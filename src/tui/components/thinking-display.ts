/**
 * Thinking Display Component
 *
 * Renders thinking blocks in the TUI.
 * Supports inline, separate, and hidden display modes.
 */

import { Box, Text } from "@mariozechner/pi-tui";

// ============================================================================
// TYPES
// ============================================================================

export interface ThinkingBlock {
  type: "thinking";
  content: string;
  timestamp: number;
  duration?: number;
  interleaved?: boolean;
  model?: string;
}

export interface ThinkingDisplayOptions {
  showTimestamp?: boolean;
  showDuration?: boolean;
  showModel?: boolean;
  collapsed?: boolean;
}

// ============================================================================
// RENDERING FUNCTIONS
// ============================================================================

/**
 * Render a single thinking block
 */
export function renderThinkingBlock(
  block: ThinkingBlock,
  options: ThinkingDisplayOptions = {},
): any {
  const {
    showTimestamp = false,
    showDuration = false,
    showModel = false,
    collapsed = false,
  } = options;

  // Build header
  const headerParts: string[] = ["🤔 Thinking"];

  if (block.duration !== undefined && showDuration) {
    headerParts.push(`(${block.duration}s)`);
  }

  if (block.model && showModel) {
    headerParts.push(`[${block.model}]`);
  }

  if (showTimestamp) {
    headerParts.push(`[${new Date(block.timestamp).toLocaleTimeString()}]`);
  }

  const header = headerParts.join(" ");

  // Create thinking block widget
  return Box.create({
    children: [
      Text.create(header, {
        color: "gray",
        italic: true,
        bold: true,
      }),
      Text.create("\n"),
      Text.create(block.content, {
        color: "gray",
        italic: true,
      }),
    ],
    border: {
      type: "rounded",
      color: "gray",
    },
    padding: 1,
    margin: { top: 1, bottom: 1 },
  });
}

/**
 * Render multiple thinking blocks
 */
export function renderThinkingBlocks(
  blocks: ThinkingBlock[],
  options: ThinkingDisplayOptions = {},
): any[] {
  return blocks.map((block) => renderThinkingBlock(block, options));
}

/**
 * Render interleaved thinking (between tool calls)
 */
export function renderInterleavedThinking(blocks: ThinkingBlock[]): any {
  if (blocks.length === 0) {
    return Text.create("");
  }

  const widgets = blocks.map((block) => {
    const duration = block.duration ? ` (${block.duration}s)` : "";

    return Box.create({
      children: [
        Text.create(`💭 Thinking${duration}`, {
          color: "cyan",
          italic: true,
        }),
        Text.create("\n"),
        Text.create(block.content, {
          color: "gray",
          italic: true,
        }),
      ],
      border: {
        type: "dotted",
        color: "cyan",
      },
      padding: 1,
      margin: { top: 0, bottom: 1 },
    });
  });

  return Box.create({
    children: widgets,
    padding: 0,
    margin: 0,
  });
}

/**
 * Render thinking summary (collapsed view)
 */
export function renderThinkingSummary(blocks: ThinkingBlock[]): any {
  const totalDuration = blocks.reduce((sum, b) => sum + (b.duration || 0), 0);
  const durationStr = totalDuration > 0 ? ` (${totalDuration}s)` : "";

  return Text.create(
    `🤔 ${blocks.length} thinking block${blocks.length !== 1 ? "s" : ""}${durationStr}`,
    {
      color: "gray",
      italic: true,
    },
  );
}

// ============================================================================
// THINKING DISPLAY MANAGER
// ============================================================================

export class ThinkingDisplayManager {
  private blocks: ThinkingBlock[] = [];
  private visible = true;
  private mode: "inline" | "separate" | "hidden" = "inline";

  /**
   * Add a thinking block
   */
  addBlock(content: string, interleaved = false, model?: string): ThinkingBlock {
    const block: ThinkingBlock = {
      type: "thinking",
      content,
      timestamp: Date.now(),
      interleaved,
      model,
    };

    this.blocks.push(block);
    return block;
  }

  /**
   * Update block duration
   */
  updateDuration(block: ThinkingBlock, duration: number): void {
    block.duration = duration;
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    this.blocks = [];
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    this.visible = !this.visible;
  }

  /**
   * Set display mode
   */
  setMode(mode: "inline" | "separate" | "hidden"): void {
    this.mode = mode;
  }

  /**
   * Get all blocks
   */
  getBlocks(): ThinkingBlock[] {
    return [...this.blocks];
  }

  /**
   * Get interleaved blocks only
   */
  getInterleavedBlocks(): ThinkingBlock[] {
    return this.blocks.filter((b) => b.interleaved);
  }

  /**
   * Check if should display
   */
  shouldDisplay(): boolean {
    return this.visible && this.mode !== "hidden";
  }

  /**
   * Render all blocks
   */
  render(): any {
    if (!this.shouldDisplay()) {
      return Text.create("");
    }

    if (this.blocks.length === 0) {
      return Text.create("");
    }

    switch (this.mode) {
      case "hidden":
        return Text.create("");

      case "separate":
        return renderThinkingBlocks(this.blocks, {
          showDuration: true,
          showTimestamp: false,
        });

      case "inline":
      default:
        return renderInterleavedThinking(this.getInterleavedBlocks());
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let displayInstance: ThinkingDisplayManager | null = null;

/**
 * Get or create thinking display manager singleton
 */
export function getThinkingDisplayManager(): ThinkingDisplayManager {
  if (!displayInstance) {
    displayInstance = new ThinkingDisplayManager();
  }
  return displayInstance;
}

/**
 * Reset thinking display manager (for testing)
 */
export function resetThinkingDisplayManager(): void {
  displayInstance = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ThinkingBlock,
  ThinkingDisplayOptions,
  renderThinkingBlock,
  renderThinkingBlocks,
  renderInterleavedThinking,
  renderThinkingSummary,
  ThinkingDisplayManager,
  getThinkingDisplayManager,
  resetThinkingDisplayManager,
};
