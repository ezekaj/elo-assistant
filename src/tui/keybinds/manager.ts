/**
 * Keybinding Manager
 *
 * Central manager for keybinding registration, matching, and dispatch.
 * Supports multiple profiles, custom bindings, and context-aware matching.
 */

import { matchesKey, Key } from "@mariozechner/pi-tui";
import type {
  KeyBinding,
  CompiledBinding,
  KeybindProfile,
  KeybindConfig,
  KeyAction,
  KeybindEvent,
  KeybindHandler,
  KeyModifier,
} from "./types.js";
import { PROFILES, DEFAULT_BINDINGS, ACTION_DESCRIPTIONS } from "./defaults.js";
import { bindingKey, calculatePriority, formatBinding, parseBinding } from "./types.js";

// ============================================================================
// MANAGER CLASS
// ============================================================================

export class KeybindingManager {
  /** All registered bindings, compiled for fast matching */
  private bindings: CompiledBinding[] = [];

  /** Bindings indexed by action for quick lookup */
  private byAction: Map<KeyAction, CompiledBinding[]> = new Map();

  /** Current context */
  private currentContext: "input" | "output" | "autocomplete" = "input";

  /** Active profile name */
  private activeProfile: string = "default";

  /** Custom bindings from config */
  private customBindings: KeyBinding[] = [];

  /** Disabled actions */
  private disabledActions: Set<KeyAction> = new Set();

  /** Registered handlers per action */
  private handlers: Map<KeyAction, Set<KeybindHandler>> = new Map();

  /** Global handlers (called for all actions) */
  private globalHandlers: Set<KeybindHandler> = new Set();

  constructor(config?: Partial<KeybindConfig>) {
    if (config) {
      this.loadConfig(config);
    } else {
      this.loadDefaults();
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Load default bindings
   */
  loadDefaults(): void {
    this.bindings = [];
    this.byAction.clear();
    this.registerAll(DEFAULT_BINDINGS);
    this.sortBindings();
  }

  /**
   * Load configuration
   */
  loadConfig(config: Partial<KeybindConfig>): void {
    // Load profile
    if (config.activeProfile) {
      this.loadProfile(config.activeProfile);
    } else {
      this.loadDefaults();
    }

    // Apply custom bindings
    if (config.customBindings) {
      this.customBindings = config.customBindings;
      for (const binding of config.customBindings) {
        this.register(binding);
      }
    }

    // Disable actions
    if (config.disabledActions) {
      this.disabledActions = new Set(config.disabledActions);
    }

    this.sortBindings();
  }

  /**
   * Load a named profile
   */
  loadProfile(name: string): void {
    const profile = PROFILES[name];
    if (!profile) {
      console.warn(`[KeybindManager] Unknown profile: ${name}, using default`);
      this.loadDefaults();
      return;
    }

    // If profile extends another, load base first
    if (profile.extends) {
      this.loadProfile(profile.extends);
    } else {
      this.bindings = [];
      this.byAction.clear();
    }

    // Register profile bindings
    this.registerAll(profile.bindings);
    this.activeProfile = name;
    this.sortBindings();
  }

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  /**
   * Register a single binding
   */
  register(binding: KeyBinding): void {
    const compiled = this.compile(binding);

    // Add to main list
    this.bindings.push(compiled);

    // Index by action
    const existing = this.byAction.get(binding.action) || [];
    existing.push(compiled);
    this.byAction.set(binding.action, existing);
  }

  /**
   * Register multiple bindings
   */
  registerAll(bindings: KeyBinding[]): void {
    for (const binding of bindings) {
      this.register(binding);
    }
  }

  /**
   * Unregister a binding
   */
  unregister(key: string, modifiers: KeyModifier[]): boolean {
    const keyStr = bindingKey(key, modifiers);
    const idx = this.bindings.findIndex((b) => bindingKey(b.key, b.modifiers) === keyStr);

    if (idx >= 0) {
      const removed = this.bindings.splice(idx, 1)[0];

      // Remove from action index
      const actionBindings = this.byAction.get(removed.action);
      if (actionBindings) {
        const actionIdx = actionBindings.findIndex((b) => b === removed);
        if (actionIdx >= 0) {
          actionBindings.splice(actionIdx, 1);
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.bindings = [];
    this.byAction.clear();
    this.customBindings = [];
    this.disabledActions.clear();
  }

  // ============================================================================
  // MATCHING
  // ============================================================================

  /**
   * Check if input data matches a binding and return the action
   */
  match(data: string): { action: KeyAction; binding: CompiledBinding } | null {
    // Skip if no bindings
    if (this.bindings.length === 0) return null;

    // Find matching binding
    for (const binding of this.bindings) {
      // Check context
      if (binding.context !== "always" && binding.context !== this.currentContext) {
        continue;
      }

      // Check if action is disabled
      if (this.disabledActions.has(binding.action)) {
        continue;
      }

      // Match key
      if (this.matchesBinding(data, binding)) {
        return { action: binding.action, binding };
      }
    }

    return null;
  }

  /**
   * Check if input matches a specific binding
   */
  matchesBinding(data: string, binding: CompiledBinding): boolean {
    const keyCode = binding.keyCode;

    // Handle modifier combinations
    if (binding.modifiers.length === 0) {
      return matchesKey(data, keyCode as any);
    }

    // Build modifier key
    if (binding.modifiers.includes("ctrl")) {
      if (binding.modifiers.includes("shift")) {
        return matchesKey(data, Key.ctrlShift(keyCode as any));
      }
      if (binding.modifiers.includes("alt")) {
        return matchesKey(data, Key.ctrlAlt(keyCode as any));
      }
      return matchesKey(data, Key.ctrl(keyCode as any));
    }

    if (binding.modifiers.includes("alt")) {
      if (binding.modifiers.includes("shift")) {
        return matchesKey(data, Key.altShift(keyCode as any));
      }
      return matchesKey(data, Key.alt(keyCode as any));
    }

    if (binding.modifiers.includes("shift")) {
      return matchesKey(data, Key.shift(keyCode as any));
    }

    if (binding.modifiers.includes("meta")) {
      // Meta/Command key - platform dependent
      return matchesKey(data, Key.meta(keyCode as any));
    }

    return matchesKey(data, keyCode as any);
  }

  /**
   * Check if data matches a specific action
   */
  matches(data: string, action: KeyAction): boolean {
    const result = this.match(data);
    return result?.action === action;
  }

  /**
   * Get all bindings for an action
   */
  getBindingsForAction(action: KeyAction): CompiledBinding[] {
    return this.byAction.get(action) || [];
  }

  // ============================================================================
  // DISPATCHING
  // ============================================================================

  /**
   * Process input and dispatch to handlers
   */
  dispatch(data: string): boolean {
    const match = this.match(data);
    if (!match) return false;

    const event: KeybindEvent = {
      data,
      key: match.binding.key,
      modifiers: match.binding.modifiers,
      action: match.action,
      binding: match.binding,
      context: this.currentContext,
      handled: false,
      stopPropagation: () => {
        event.handled = true;
      },
    };

    // Call global handlers first
    for (const handler of this.globalHandlers) {
      const result = handler(event);
      if (result === true || event.handled) {
        return true;
      }
    }

    // Call action-specific handlers
    const handlers = this.handlers.get(match.action);
    if (handlers) {
      for (const handler of handlers) {
        const result = handler(event);
        if (result === true || event.handled) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Register a handler for an action
   */
  on(action: KeyAction, handler: KeybindHandler): () => void {
    if (!this.handlers.has(action)) {
      this.handlers.set(action, new Set());
    }
    this.handlers.get(action)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(action)?.delete(handler);
    };
  }

  /**
   * Register a global handler (called for all actions)
   */
  onGlobal(handler: KeybindHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  // ============================================================================
  // CONTEXT
  // ============================================================================

  /**
   * Set current context
   */
  setContext(context: "input" | "output" | "autocomplete"): void {
    this.currentContext = context;
  }

  /**
   * Get current context
   */
  getContext(): "input" | "output" | "autocomplete" {
    return this.currentContext;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get all bindings
   */
  getAll(): CompiledBinding[] {
    return [...this.bindings];
  }

  /**
   * Get active profile name
   */
  getActiveProfile(): string {
    return this.activeProfile;
  }

  /**
   * List available profiles
   */
  listProfiles(): string[] {
    return Object.keys(PROFILES);
  }

  /**
   * Get action description
   */
  getActionDescription(action: KeyAction): string {
    return ACTION_DESCRIPTIONS[action] || action;
  }

  /**
   * Format bindings for display
   */
  formatBindings(bindings?: CompiledBinding[]): string[] {
    const list = bindings || this.bindings;
    return list.map((b) => `${formatBinding(b)} → ${b.description}`);
  }

  /**
   * Export current configuration
   */
  export(): KeybindConfig {
    return {
      activeProfile: this.activeProfile,
      customBindings: this.customBindings,
      disabledActions: Array.from(this.disabledActions),
    };
  }

  /**
   * Enable/disable an action
   */
  setActionEnabled(action: KeyAction, enabled: boolean): void {
    if (enabled) {
      this.disabledActions.delete(action);
    } else {
      this.disabledActions.add(action);
    }
  }

  // ============================================================================
  // PRIVATE
  // ============================================================================

  /**
   * Compile a binding for fast matching
   */
  private compile(binding: KeyBinding): CompiledBinding {
    return {
      ...binding,
      keyCode: this.normalizeKey(binding.key),
      priority: calculatePriority(binding),
    };
  }

  /**
   * Normalize key name to pi-tui format
   */
  private normalizeKey(key: string): string {
    const normalized = key.toLowerCase();

    // Map common names
    const keyMap: Record<string, string> = {
      esc: "escape",
      return: "enter",
      space: "space",
      bksp: "backspace",
      del: "delete",
      pgup: "pageup",
      pgdn: "pagedown",
    };

    return keyMap[normalized] || normalized;
  }

  /**
   * Sort bindings by priority (most specific first)
   */
  private sortBindings(): void {
    this.bindings.sort((a, b) => b.priority - a.priority);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalManager: KeybindingManager | null = null;

/**
 * Get the global keybinding manager
 */
export function getKeybindManager(): KeybindingManager {
  if (!globalManager) {
    globalManager = new KeybindingManager();
  }
  return globalManager;
}

/**
 * Reset the global manager (for testing)
 */
export function resetKeybindManager(): void {
  globalManager = null;
}
