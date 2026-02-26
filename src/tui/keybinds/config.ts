/**
 * Keybinding Configuration
 *
 * Integration with OpenClaw's config system for persisting keybindings.
 */

import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { KeybindConfig, KeyBinding, KeyAction } from "./types.js";
import { KeybindingManager, getKeybindManager } from "./manager.js";
import { parseBinding } from "./types.js";

// ============================================================================
// CONFIG PATH
// ============================================================================

/**
 * Get the path to the keybindings config file
 */
export function getKeybindConfigPath(baseDir?: string): string {
  const dir = baseDir || join(homedir(), ".openclaw");
  return join(dir, "keybindings.json");
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_KEYBIND_CONFIG: KeybindConfig = {
  activeProfile: "default",
  customBindings: [],
  disabledActions: [],
};

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load keybindings from config file
 */
export async function loadKeybindConfig(baseDir?: string): Promise<KeybindConfig> {
  const path = getKeybindConfigPath(baseDir);

  if (!existsSync(path)) {
    return { ...DEFAULT_KEYBIND_CONFIG };
  }

  try {
    const content = await readFile(path, "utf-8");
    const parsed = JSON.parse(content);

    // Validate and normalize
    return normalizeConfig(parsed);
  } catch (err) {
    console.warn(`[KeybindConfig] Failed to load ${path}:`, err);
    return { ...DEFAULT_KEYBIND_CONFIG };
  }
}

/**
 * Load and apply config to manager
 */
export async function loadKeybinds(manager?: KeybindingManager, baseDir?: string): Promise<void> {
  const config = await loadKeybindConfig(baseDir);
  const mgr = manager || getKeybindManager();
  mgr.loadConfig(config);
}

// ============================================================================
// SAVING
// ============================================================================

/**
 * Save keybindings to config file
 */
export async function saveKeybindConfig(config: KeybindConfig, baseDir?: string): Promise<void> {
  const path = getKeybindConfigPath(baseDir);

  const content = JSON.stringify(config, null, 2);
  await writeFile(path, content, "utf-8");
}

/**
 * Save current manager state to config
 */
export async function saveKeybinds(manager?: KeybindingManager, baseDir?: string): Promise<void> {
  const mgr = manager || getKeybindManager();
  const config = mgr.export();
  await saveKeybindConfig(config, baseDir);
}

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalize and validate config
 */
function normalizeConfig(raw: any): KeybindConfig {
  const config: KeybindConfig = { ...DEFAULT_KEYBIND_CONFIG };

  // Active profile
  if (typeof raw.activeProfile === "string") {
    config.activeProfile = raw.activeProfile;
  }

  // Custom bindings
  if (Array.isArray(raw.customBindings)) {
    config.customBindings = raw.customBindings
      .map(normalizeBinding)
      .filter((b): b is KeyBinding => b !== null);
  }

  // Disabled actions
  if (Array.isArray(raw.disabledActions)) {
    config.disabledActions = raw.disabledActions.filter(
      (a): a is KeyAction => typeof a === "string",
    );
  }

  return config;
}

/**
 * Normalize and validate a binding
 */
function normalizeBinding(raw: any): KeyBinding | null {
  if (!raw || typeof raw !== "object") return null;

  // Parse key + modifiers from various formats
  let key: string;
  let modifiers: string[] = [];

  if (typeof raw.key === "string") {
    // Format: { key: "ctrl+c" } or { key: "c", modifiers: ["ctrl"] }
    if (raw.key.includes("+")) {
      const parsed = parseBinding(raw.key);
      if (!parsed) return null;
      key = parsed.key;
      modifiers = parsed.modifiers.map((m) => m as any);
    } else {
      key = raw.key;
    }
  } else {
    return null;
  }

  // Merge modifiers
  if (Array.isArray(raw.modifiers)) {
    const validModifiers = ["ctrl", "alt", "shift", "meta"];
    for (const m of raw.modifiers) {
      if (validModifiers.includes(m) && !modifiers.includes(m)) {
        modifiers.push(m);
      }
    }
  }

  // Action
  if (typeof raw.action !== "string") return null;

  // Description
  const description = typeof raw.description === "string" ? raw.description : raw.action;

  // Context
  const validContexts = ["input", "output", "autocomplete", "always"];
  const context = validContexts.includes(raw.context) ? raw.context : undefined;

  return {
    key,
    modifiers: modifiers as any,
    action: raw.action as KeyAction,
    description,
    context,
    protected: Boolean(raw.protected),
  };
}

// ============================================================================
// CONFIG SCHEMA INTEGRATION
// ============================================================================

/**
 * Get keybinding config schema for OpenClaw config
 */
export function getKeybindConfigSchema() {
  return {
    type: "object",
    properties: {
      keybindings: {
        type: "object",
        description: "Custom keybindings",
        properties: {
          profile: {
            type: "string",
            enum: ["default", "vim", "emacs", "custom"],
            description: "Active keybinding profile",
          },
          bindings: {
            type: "array",
            description: "Custom keybindings (override profile)",
            items: {
              type: "object",
              properties: {
                key: { type: "string", description: 'Key (e.g., "c", "enter", "escape")' },
                modifiers: {
                  type: "array",
                  items: { type: "string", enum: ["ctrl", "alt", "shift", "meta"] },
                },
                action: { type: "string", description: "Action to perform" },
                description: { type: "string" },
                context: { type: "string", enum: ["input", "output", "autocomplete", "always"] },
              },
              required: ["key", "action"],
            },
          },
          disabledActions: {
            type: "array",
            items: { type: "string" },
            description: "Actions to disable",
          },
        },
      },
    },
  };
}

// ============================================================================
// QUICK SETUP
// ============================================================================

/**
 * Quick setup for common use cases
 */
export const QUICK_SETUPS = {
  /**
   * Emacs-style editing
   */
  emacs: (): Partial<KeybindConfig> => ({
    activeProfile: "emacs",
  }),

  /**
   * Vim-style editing
   */
  vim: (): Partial<KeybindConfig> => ({
    activeProfile: "vim",
  }),

  /**
   * Disable history navigation with arrow keys (use Ctrl+P/N instead)
   */
  noArrowHistory: (): Partial<KeybindConfig> => ({
    customBindings: [
      {
        key: "up",
        modifiers: [],
        action: "scroll-up",
        description: "Scroll up",
        context: "always",
      },
      {
        key: "down",
        modifiers: [],
        action: "scroll-down",
        description: "Scroll down",
        context: "always",
      },
    ],
  }),

  /**
   * Use Ctrl+Enter to send (Enter for newline)
   */
  ctrlEnterToSend: (): Partial<KeybindConfig> => ({
    customBindings: [
      {
        key: "enter",
        modifiers: [],
        action: "submit-alt",
        description: "Newline",
        context: "input",
      },
      {
        key: "enter",
        modifiers: ["ctrl"],
        action: "submit",
        description: "Send message",
        context: "input",
      },
    ],
  }),
};
