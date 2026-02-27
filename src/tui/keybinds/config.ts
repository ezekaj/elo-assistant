/**
 * Keybinding Configuration
 *
 * Integration with OpenClaw's config system for persisting keybindings.
 */

import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type {
  KeybindConfig,
  KeyBinding,
  KeyAction,
  KeybindProfile,
  KeybindContext,
} from "./types.js";
import { KeybindingManager, getKeybindingManager } from "./manager.js";
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
  customBindings: {},
  disabledBindings: [],
  profiles: {},
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
  const mgr = manager || getKeybindingManager();
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
  const mgr = manager || getKeybindingManager();
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

  // Custom bindings - support both array and object formats
  if (Array.isArray(raw.customBindings)) {
    // Convert array to object
    const bindings: Record<string, KeyBinding> = {};
    for (const b of raw.customBindings) {
      const normalized = normalizeBinding(b);
      if (normalized) {
        bindings[normalized.id] = normalized;
      }
    }
    config.customBindings = bindings;
  } else if (typeof raw.customBindings === "object") {
    // Already an object
    const bindings: Record<string, KeyBinding> = {};
    for (const [id, b] of Object.entries(raw.customBindings)) {
      const normalized = normalizeBinding(b);
      if (normalized) {
        bindings[id] = normalized;
      }
    }
    config.customBindings = bindings;
  }

  // Disabled bindings
  if (Array.isArray(raw.disabledBindings)) {
    config.disabledBindings = raw.disabledBindings.filter(
      (s): s is string => typeof s === "string",
    );
  } else if (Array.isArray(raw.disabledActions)) {
    // Legacy field name
    config.disabledBindings = raw.disabledActions.filter((s): s is string => typeof s === "string");
  }

  // Profiles
  if (typeof raw.profiles === "object") {
    config.profiles = raw.profiles;
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
    const validModifiers = ["ctrl", "alt", "shift", "meta", "none"];
    for (const m of raw.modifiers) {
      if (validModifiers.includes(m) && !modifiers.includes(m)) {
        modifiers.push(m);
      }
    }
  }

  // Action
  if (typeof raw.action !== "string") return null;

  // ID
  const id = typeof raw.id === "string" ? raw.id : `${raw.action}:${key}`;

  // Description
  const description = typeof raw.description === "string" ? raw.description : raw.action;

  // Context - normalize 'always' to 'global'
  const validContexts: KeybindContext[] = [
    "global",
    "input",
    "autocomplete",
    "vim-normal",
    "vim-insert",
    "vim-visual",
    "browser",
  ];
  let context: KeybindContext | undefined;
  if (raw.context === "always") {
    context = "global";
  } else if (validContexts.includes(raw.context)) {
    context = raw.context;
  }

  return {
    id,
    key,
    modifiers: modifiers as any,
    action: raw.action as KeyAction,
    description,
    context,
    enabled: raw.enabled !== false,
    priority: typeof raw.priority === "number" ? raw.priority : undefined,
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
    customBindings: {
      "history-up-override": {
        id: "history-up-override",
        key: "up",
        modifiers: [],
        action: "refresh",
        description: "Refresh (arrow up disabled for history)",
        context: "global",
      },
      "history-down-override": {
        id: "history-down-override",
        key: "down",
        modifiers: [],
        action: "refresh",
        description: "Refresh (arrow down disabled for history)",
        context: "global",
      },
    },
    disabledBindings: ["history-up", "history-down"],
  }),

  /**
   * Use Ctrl+Enter to send (Enter for newline)
   * Note: This would require extending the editor to support multi-line input
   */
  ctrlEnterToSend: (): Partial<KeybindConfig> => ({
    customBindings: {
      "enter-newline": {
        id: "enter-newline",
        key: "enter",
        modifiers: [],
        action: "submit",
        description: "Send message",
        context: "input",
      },
      "ctrl-enter-send": {
        id: "ctrl-enter-send",
        key: "enter",
        modifiers: ["ctrl"],
        action: "submit",
        description: "Send message (alternative)",
        context: "input",
      },
    },
  }),
};
