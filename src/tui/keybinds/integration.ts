/**
 * Keybinding Integration
 *
 * Integration points for connecting the keybinding system
 * to the existing TUI code.
 */

import type { KeyAction } from "./types.js";
import { getKeybindingManager, loadKeybinds } from "./index.js";

// ============================================================================
// CUSTOM EDITOR INTEGRATION
// ============================================================================

/**
 * Patch CustomEditor to use keybinding manager
 *
 * This replaces the hardcoded key checks in custom-editor.ts
 * with calls to the keybinding manager.
 *
 * BEFORE (custom-editor.ts):
 * ```typescript
 * if (matchesKey(data, Key.ctrl("c")) && this.onCtrlC) {
 *   this.onCtrlC();
 *   return;
 * }
 * ```
 *
 * AFTER:
 * ```typescript
 * if (keybindManager.matches(data, 'abort') && this.onCtrlC) {
 *   this.onCtrlC();
 *   return;
 * }
 * ```
 */
export function createKeybindInputHandler(callbacks: {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  onCtrlG?: () => void;
  onCtrlL?: () => void;
  onCtrlO?: () => void;
  onCtrlP?: () => void;
  onCtrlT?: () => void;
  onShiftTab?: () => void;
  onAltEnter?: () => void;
}): (data: string) => boolean {
  const manager = getKeybindingManager();

  // Map actions to callbacks
  const actionCallbacks: Partial<Record<KeyAction, () => void>> = {
    abort: callbacks.onCtrlC || callbacks.onEscape,
    "clear-line": callbacks.onCtrlD,
    "toggle-help": callbacks.onCtrlG,
    refresh: callbacks.onCtrlL,
    "session-prev": callbacks.onCtrlO,
    "session-next": callbacks.onCtrlP,
    "autocomplete-prev": callbacks.onShiftTab,
    submit: callbacks.onAltEnter,
  };

  return (data: string): boolean => {
    const match = manager.match(data);

    if (match) {
      const callback = actionCallbacks[match.action];
      if (callback) {
        callback();
        return true;
      }
    }

    return false;
  };
}

// ============================================================================
// TUI INTEGRATION
// ============================================================================

/**
 * Initialize keybindings for TUI
 *
 * Call this during TUI startup.
 */
export async function initializeKeybinds(): Promise<void> {
  // Load from config
  await loadKeybinds(getKeybindingManager());
}

/**
 * Get current context for keybinding matching
 */
export function updateKeybindContext(context: "input" | "global" | "autocomplete"): void {
  getKeybindingManager().setContext(context);
}

// ============================================================================
// STATUS DISPLAY
// ============================================================================

/**
 * Get keybinding status for status bar
 */
export function getKeybindStatus(): string {
  const manager = getKeybindingManager();
  const profile = manager.getActiveProfile();
  const count = manager.getAll().length;

  return `Keybinds: ${profile} (${count})`;
}

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

/**
 * Migration guide for custom-editor.ts
 */
export const MIGRATION_GUIDE = `
# Migrating CustomEditor to KeybindingManager

## Step 1: Import

\`\`\`typescript
import { getKeybindingManager } from './keybinds';
\`\`\`

## Step 2: Replace hardcoded checks

Replace:
\`\`\`typescript
if (matchesKey(data, Key.ctrl("c")) && this.onCtrlC) {
  this.onCtrlC();
  return;
}
\`\`\`

With:
\`\`\`typescript
const manager = getKeybindingManager();

if (manager.matches(data, 'abort') && this.onCtrlC) {
  this.onCtrlC();
  return;
}
\`\`\`

## Step 3: Update context

When input field is focused:
\`\`\`typescript
manager.setContext('input');
\`\`\`

When autocomplete is open:
\`\`\`typescript
manager.setContext('autocomplete');
\`\`\`

Default context:
\`\`\`typescript
manager.setContext('global');
\`\`\`

## Step 4: Initialize on startup

\`\`\`typescript
import { initializeKeybinds } from './keybinds';

// In TUI init
await initializeKeybinds();
\`\`\`
`;

// ============================================================================
// EXAMPLE HANDLERS
// ============================================================================

/**
 * Example: Set up common handlers
 */
export function setupCommonHandlers(handlers: {
  submit: () => void;
  abort: () => void;
  historyPrev: () => void;
  historyNext: () => void;
  clearLine: () => void;
}): void {
  const manager = getKeybindingManager();

  manager.on("change", (event) => {
    if (event.binding?.action === "submit") {
      handlers.submit();
    } else if (event.binding?.action === "abort") {
      handlers.abort();
    } else if (event.binding?.action === "history-prev") {
      handlers.historyPrev();
    } else if (event.binding?.action === "history-next") {
      handlers.historyNext();
    } else if (event.binding?.action === "clear-line") {
      handlers.clearLine();
    }
  });
}
