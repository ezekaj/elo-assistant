/**
 * Keybinding Manager
 *
 * Central manager for all keybindings in the TUI.
 * Handles registration, lookup, conflict detection, and profiles.
 */

import { EventEmitter } from "events";
import type {
  KeyBinding,
  KeybindConfig,
  KeybindProfile,
  KeyAction,
  KeybindContext,
  KeybindConflict,
  KeybindChangeEvent,
  KeyModifier,
} from "./types.js";
import { DEFAULT_PROFILE, DEFAULT_BINDINGS, PROFILES } from "./defaults.js";
import { KeyParser, keyParser } from "./parser.js";
import { MODIFIER_ORDER } from "./types.js";

/**
 * Keybinding Manager
 *
 * Manages all keybindings, profiles, and provides lookup functionality.
 */
export class KeybindingManager extends EventEmitter {
  private bindings: Map<string, KeyBinding> = new Map();
  private bindingsByAction: Map<KeyAction, Set<string>> = new Map();
  private activeProfile: string = "default";
  private disabledBindings: Set<string> = new Set();
  private parser: KeyParser;
  private currentContext: KeybindContext = "global";

  /**
   * Built-in profiles (vim and emacs will be added later)
   */
  private builtinProfiles: Record<string, KeybindProfile> = PROFILES;

  /**
   * Custom user profiles
   */
  private customProfiles: Record<string, KeybindProfile> = {};

  constructor(config?: Partial<KeybindConfig>) {
    super();
    this.parser = keyParser;

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
    this.bindings.clear();
    this.bindingsByAction.clear();
    this.disabledBindings.clear();
    this.activeProfile = "default";

    for (const binding of DEFAULT_BINDINGS) {
      this.register(binding);
    }
  }

  /**
   * Load configuration
   */
  loadConfig(config: Partial<KeybindConfig>): void {
    this.loadDefaults();

    // Load active profile
    if (config.activeProfile && config.activeProfile !== "default") {
      try {
        this.loadProfile(config.activeProfile);
      } catch (err) {
        console.warn(`Failed to load profile ${config.activeProfile}:`, err);
      }
    }

    // Apply custom bindings
    if (config.customBindings) {
      for (const binding of Object.values(config.customBindings)) {
        this.register(binding);
      }
    }

    // Apply disabled bindings
    if (config.disabledBindings) {
      for (const id of config.disabledBindings) {
        this.disable(id);
      }
    }

    // Load custom profiles
    if (config.profiles) {
      for (const [name, profile] of Object.entries(config.profiles)) {
        if (!profile.builtin) {
          this.customProfiles[name] = profile;
        }
      }
    }
  }

  /**
   * Load a profile by name
   */
  loadProfile(name: string): void {
    let profile = this.builtinProfiles[name] ?? this.customProfiles[name];

    if (!profile) {
      // Fall back to default profile if requested profile doesn't exist
      console.warn(`Unknown profile: ${name}, falling back to default`);
      profile = this.builtinProfiles["default"];
      name = "default";
    }

    const oldProfile = this.activeProfile;

    // Clear current bindings
    this.bindings.clear();
    this.bindingsByAction.clear();

    // Load profile bindings
    for (const binding of profile.bindings) {
      this.register(binding);
    }

    this.activeProfile = name;
    this.emit("profile-change", { type: "profile-change", oldProfile, newProfile: name });
  }

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  /**
   * Register a keybinding
   */
  register(binding: KeyBinding): void {
    // Validate
    this.validateBinding(binding);

    // Check for conflicts
    const conflicts = this.findConflicts(binding);
    if (conflicts.length > 0) {
      // Higher priority wins, warn if equal or lower
      const bindingPriority = binding.priority ?? 50;
      const hasLowerPriorityOnly = conflicts.every((c) => (c.priority ?? 50) < bindingPriority);

      if (!hasLowerPriorityOnly) {
        // Still register, but warn
        const conflictIds = conflicts.map((c) => c.id).join(", ");
        console.warn(`[KeybindManager] Binding "${binding.id}" conflicts with: ${conflictIds}`);
      }
    }

    // Generate lookup key
    const key = this.bindingToKey(binding);

    // Add to bindings map
    this.bindings.set(key, binding);

    // Add to action index
    if (!this.bindingsByAction.has(binding.action)) {
      this.bindingsByAction.set(binding.action, new Set());
    }
    this.bindingsByAction.get(binding.action)!.add(key);

    this.emit("change", { type: "add", binding });
  }

  /**
   * Unregister a keybinding by ID
   */
  unregister(bindingId: string): void;
  /**
   * Unregister a keybinding by key and modifiers
   */
  unregister(key: string, modifiers: KeyModifier[]): boolean;
  unregister(bindingIdOrKey: string, modifiers?: KeyModifier[]): void | boolean {
    // Determine which overload
    if (modifiers !== undefined) {
      // Called as unregister(key, modifiers)
      const bindingKey =
        modifiers.length > 0
          ? `${modifiers.sort().join("+")}+${bindingIdOrKey.toLowerCase()}`
          : bindingIdOrKey.toLowerCase();

      const binding = this.bindings.get(bindingKey);
      if (binding) {
        this.bindings.delete(bindingKey);
        const actionBindings = this.bindingsByAction.get(binding.action);
        if (actionBindings) {
          actionBindings.delete(bindingKey);
          if (actionBindings.size === 0) {
            this.bindingsByAction.delete(binding.action);
          }
        }
        this.emit("change", { type: "remove", binding });
        return true;
      }
      return false;
    }

    // Called as unregister(bindingId)
    const binding = this.findById(bindingIdOrKey);
    if (!binding) return;

    const key = this.bindingToKey(binding);
    this.bindings.delete(key);

    const actionBindings = this.bindingsByAction.get(binding.action);
    if (actionBindings) {
      actionBindings.delete(key);
      if (actionBindings.size === 0) {
        this.bindingsByAction.delete(binding.action);
      }
    }

    this.emit("change", { type: "remove", binding });
  }

  /**
   * Disable a binding by ID
   */
  disable(bindingId: string): void {
    this.disabledBindings.add(bindingId);
  }

  /**
   * Enable a binding by ID
   */
  enable(bindingId: string): void {
    this.disabledBindings.delete(bindingId);
  }

  /**
   * Check if a binding is disabled
   */
  isDisabled(bindingId: string): boolean {
    return this.disabledBindings.has(bindingId);
  }

  // ============================================================================
  // LOOKUP
  // ============================================================================

  /**
   * Check if raw input matches an action
   */
  matches(data: string, action: KeyAction): boolean {
    const binding = this.getBinding(data);
    return binding?.action === action;
  }

  /**
   * Match raw input and return the binding
   */
  match(data: string): KeyBinding | undefined {
    return this.getBinding(data);
  }

  /**
   * Get binding for raw input data
   */
  getBinding(data: string): KeyBinding | undefined {
    const event = this.parser.parse(data);
    const key = this.parser.toBindingKey(event);

    // Look up by key
    let binding = this.bindings.get(key);

    if (!binding) {
      return undefined;
    }

    // Check if disabled
    if (this.disabledBindings.has(binding.id)) {
      return undefined;
    }

    // Check if enabled
    if (binding.enabled === false) {
      return undefined;
    }

    // Check context
    if (
      binding.context &&
      binding.context !== "global" &&
      binding.context !== this.currentContext
    ) {
      // Try to find a global binding for this key
      const allBindings = this.getByKey(key);
      const globalBinding = allBindings.find(
        (b) => !b.context || b.context === "global" || b.context === this.currentContext,
      );

      if (
        globalBinding &&
        !this.disabledBindings.has(globalBinding.id) &&
        globalBinding.enabled !== false
      ) {
        return globalBinding;
      }

      return undefined;
    }

    return binding;
  }

  /**
   * Get all bindings for an action
   */
  getByAction(action: KeyAction): KeyBinding[] {
    const keys = this.bindingsByAction.get(action);
    if (!keys) return [];

    return Array.from(keys)
      .map((k) => this.bindings.get(k))
      .filter((b): b is KeyBinding => b !== undefined);
  }

  /**
   * Get all bindings for a key (regardless of context)
   */
  getByKey(key: string): KeyBinding[] {
    return Array.from(this.bindings.values()).filter((b) => this.bindingToKey(b) === key);
  }

  /**
   * Find binding by ID
   */
  findById(id: string): KeyBinding | undefined {
    return Array.from(this.bindings.values()).find((b) => b.id === id);
  }

  /**
   * List all bindings
   */
  list(options?: { includeDisabled?: boolean }): KeyBinding[] {
    return Array.from(this.bindings.values())
      .filter((b) => options?.includeDisabled || !this.disabledBindings.has(b.id))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Get all bindings (alias for list)
   */
  getAll(options?: { includeDisabled?: boolean }): KeyBinding[] {
    return this.list(options);
  }

  // ============================================================================
  // CONTEXT
  // ============================================================================

  /**
   * Set current context
   */
  setContext(context: KeybindContext): void {
    this.currentContext = context;
  }

  /**
   * Get current context
   */
  getContext(): KeybindContext {
    return this.currentContext;
  }

  // ============================================================================
  // PROFILES
  // ============================================================================

  /**
   * Get available profiles
   */
  getProfiles(): string[] {
    return [...Object.keys(this.builtinProfiles), ...Object.keys(this.customProfiles)];
  }

  /**
   * List profiles (alias for getProfiles)
   */
  listProfiles(): string[] {
    return this.getProfiles();
  }

  /**
   * Get current profile name
   */
  getActiveProfile(): string {
    return this.activeProfile;
  }

  /**
   * Check if profile exists
   */
  hasProfile(name: string): boolean {
    return name in this.builtinProfiles || name in this.customProfiles;
  }

  /**
   * Add custom profile
   */
  addProfile(profile: KeybindProfile): void {
    this.customProfiles[profile.name] = profile;
  }

  /**
   * Remove custom profile
   */
  removeProfile(name: string): boolean {
    if (name in this.customProfiles) {
      delete this.customProfiles[name];
      return true;
    }
    return false;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate a binding
   */
  private validateBinding(binding: KeyBinding): void {
    if (!binding.id) {
      throw new Error("Binding must have an id");
    }
    if (!binding.key) {
      throw new Error("Binding must have a key");
    }
    if (!binding.action) {
      throw new Error("Binding must have an action");
    }
  }

  /**
   * Find conflicts with a binding
   */
  private findConflicts(binding: KeyBinding): KeyBinding[] {
    const conflicts: KeyBinding[] = [];
    const bindingKey = this.bindingToKey(binding);

    for (const existing of Array.from(this.bindings.values())) {
      // Same key + modifiers
      if (this.bindingToKey(existing) === bindingKey) {
        // Same context or both global
        if (
          !existing.context ||
          !binding.context ||
          existing.context === binding.context ||
          existing.context === "global" ||
          binding.context === "global"
        ) {
          // Different ID = conflict
          if (existing.id !== binding.id) {
            conflicts.push(existing);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find all conflicts in current bindings
   */
  findAllConflicts(): KeybindConflict[] {
    const conflicts: KeybindConflict[] = [];
    const bindings = Array.from(this.bindings.values());

    for (let i = 0; i < bindings.length; i++) {
      for (let j = i + 1; j < bindings.length; j++) {
        const a = bindings[i];
        const b = bindings[j];

        // Same key
        if (this.bindingToKey(a) === this.bindingToKey(b)) {
          // Same context or overlapping
          if (
            !a.context ||
            !b.context ||
            a.context === b.context ||
            a.context === "global" ||
            b.context === "global"
          ) {
            conflicts.push({
              binding1: a,
              binding2: b,
              reason: "same-keys",
            });
          }
        }
      }
    }

    return conflicts;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Convert binding to lookup key
   */
  private bindingToKey(binding: KeyBinding): string {
    const mods = binding.modifiers
      .filter((m) => m !== "none")
      .sort((a, b) => (MODIFIER_ORDER[a] ?? 99) - (MODIFIER_ORDER[b] ?? 99));

    const key = binding.key.toLowerCase();
    return mods.length > 0 ? `${mods.join("+")}+${key}` : key;
  }

  /**
   * Export current configuration
   */
  export(): KeybindConfig {
    const customBindings: Record<string, KeyBinding> = {};

    for (const binding of Array.from(this.bindings.values())) {
      // Only export non-builtin bindings as custom
      if (!this.isBuiltin(binding)) {
        customBindings[binding.id] = binding;
      }
    }

    return {
      activeProfile: this.activeProfile,
      customBindings,
      disabledBindings: Array.from(this.disabledBindings),
      profiles: {
        ...this.builtinProfiles,
        ...this.customProfiles,
      },
    };
  }

  /**
   * Check if binding is built-in
   */
  private isBuiltin(binding: KeyBinding): boolean {
    for (const profile of Object.values(this.builtinProfiles)) {
      if (profile.bindings.some((b) => b.id === binding.id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get binding count
   */
  getCount(): number {
    return this.bindings.size;
  }

  /**
   * Clear all bindings
   */
  clear(): void {
    this.bindings.clear();
    this.bindingsByAction.clear();
    this.disabledBindings.clear();
    this.emit("change", { type: "update" });
  }

  /**
   * Check if manager has any bindings
   */
  isEmpty(): boolean {
    return this.bindings.size === 0;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

let managerInstance: KeybindingManager | null = null;

/**
 * Get the singleton keybinding manager instance
 */
export function getKeybindingManager(config?: Partial<KeybindConfig>): KeybindingManager {
  if (!managerInstance) {
    managerInstance = new KeybindingManager(config);
  }
  return managerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetKeybindingManager(): void {
  if (managerInstance) {
    managerInstance.removeAllListeners();
    managerInstance = null;
  }
}

/**
 * Create a new manager instance (not singleton)
 */
export function createKeybindingManager(config?: Partial<KeybindConfig>): KeybindingManager {
  return new KeybindingManager(config);
}
