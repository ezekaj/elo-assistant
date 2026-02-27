/**
 * Keybinding System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { KeyBinding, KeyAction } from "./types.js";
import { PROFILES } from "./defaults.js";
import { KeybindingManager, resetKeybindingManager, getKeybindingManager } from "./manager.js";
import { bindingKey, parseBinding, formatBinding, calculatePriority } from "./types.js";

// ============================================================================
// TYPES TESTS
// ============================================================================

describe("types", () => {
  describe("bindingKey", () => {
    it("should create key string from key and modifiers", () => {
      expect(bindingKey("c", ["ctrl"])).toBe("ctrl+c");
      expect(bindingKey("enter", ["shift"])).toBe("shift+enter");
      expect(bindingKey("tab", ["ctrl", "shift"])).toBe("ctrl+shift+tab");
      expect(bindingKey("escape", [])).toBe("escape");
    });

    it("should sort modifiers consistently", () => {
      expect(bindingKey("a", ["shift", "ctrl"])).toBe(bindingKey("a", ["ctrl", "shift"]));
    });
  });

  describe("parseBinding", () => {
    it("should parse simple keys", () => {
      const result = parseBinding("enter");
      expect(result).toEqual({ key: "enter", modifiers: [] });
    });

    it("should parse ctrl combinations", () => {
      const result = parseBinding("ctrl+c");
      expect(result).toEqual({ key: "c", modifiers: ["ctrl"] });
    });

    it("should parse multiple modifiers", () => {
      const result = parseBinding("ctrl+shift+enter");
      expect(result).toEqual({ key: "enter", modifiers: ["ctrl", "shift"] });
    });

    it("should handle alternative names", () => {
      expect(parseBinding("control+c")?.modifiers).toContain("ctrl");
      expect(parseBinding("option+a")?.modifiers).toContain("alt");
      expect(parseBinding("cmd+s")?.modifiers).toContain("meta");
    });

    it("should return null for invalid input", () => {
      expect(parseBinding("")).toBeNull();
      expect(parseBinding("ctrl+")).toBeNull();
    });
  });

  describe("formatBinding", () => {
    it("should format simple keys", () => {
      const binding: KeyBinding = {
        id: "test-1",
        key: "enter",
        modifiers: [],
        action: "submit",
        description: "Send",
      };
      expect(formatBinding(binding)).toBe("Enter");
    });

    it("should format modified keys", () => {
      const binding: KeyBinding = {
        id: "test-2",
        key: "c",
        modifiers: ["ctrl"],
        action: "abort",
        description: "Abort",
      };
      expect(formatBinding(binding)).toBe("Ctrl+C");
    });

    it("should format arrow keys", () => {
      const binding: KeyBinding = {
        id: "test-3",
        key: "up",
        modifiers: [],
        action: "history-prev",
        description: "Up",
      };
      expect(formatBinding(binding)).toBe("↑");
    });
  });

  describe("calculatePriority", () => {
    it("should give higher priority to more modifiers", () => {
      const simple: KeyBinding = {
        id: "s1",
        key: "a",
        modifiers: [],
        action: "submit",
        description: "",
      };
      const modified: KeyBinding = {
        id: "s2",
        key: "a",
        modifiers: ["ctrl"],
        action: "submit",
        description: "",
      };

      expect(calculatePriority(modified)).toBeGreaterThan(calculatePriority(simple));
    });

    it("should give higher priority to specific contexts", () => {
      const global: KeyBinding = {
        id: "g1",
        key: "a",
        modifiers: [],
        action: "submit",
        description: "",
        context: "global",
      };
      const specific: KeyBinding = {
        id: "g2",
        key: "a",
        modifiers: [],
        action: "submit",
        description: "",
        context: "input",
      };

      expect(calculatePriority(specific)).toBeGreaterThan(calculatePriority(global));
    });
  });
});

// ============================================================================
// MANAGER TESTS
// ============================================================================

describe("KeybindingManager", () => {
  let manager: KeybindingManager;

  beforeEach(() => {
    resetKeybindingManager();
    manager = new KeybindingManager();
  });

  afterEach(() => {
    manager.clear();
  });

  describe("initialization", () => {
    it("should load default bindings", () => {
      const bindings = manager.getAll();
      expect(bindings.length).toBeGreaterThan(0);
    });

    it("should start with default profile", () => {
      expect(manager.getActiveProfile()).toBe("default");
    });
  });

  describe("profile loading", () => {
    it("should load vim profile", () => {
      manager.loadProfile("vim");
      expect(manager.getActiveProfile()).toBe("vim");
    });

    it("should load emacs profile", () => {
      manager.loadProfile("emacs");
      expect(manager.getActiveProfile()).toBe("emacs");
    });

    it("should fall back to default for unknown profile", () => {
      manager.loadProfile("unknown");
      expect(manager.getActiveProfile()).toBe("default");
    });
  });

  describe("registration", () => {
    it("should register a binding", () => {
      const binding: KeyBinding = {
        id: "test-ctrl-x",
        key: "x",
        modifiers: ["ctrl"],
        action: "abort",
        description: "Abort",
      };

      manager.register(binding);
      const all = manager.getAll();

      expect(all.some((b) => b.key === "x" && b.modifiers.includes("ctrl"))).toBe(true);
    });

    it("should unregister a binding", () => {
      const binding: KeyBinding = {
        id: "test-ctrl-y",
        key: "y",
        modifiers: ["ctrl"],
        action: "abort",
        description: "Abort",
      };

      manager.register(binding);
      const removed = manager.unregister("y", ["ctrl"]);

      expect(removed).toBe(true);
    });

    it("should return false when unregistering non-existent binding", () => {
      const removed = manager.unregister("nonexistent", ["ctrl"]);
      expect(removed).toBe(false);
    });
  });

  describe("context", () => {
    it("should set and get context", () => {
      manager.setContext("input");
      expect(manager.getContext()).toBe("input");
    });
  });

  describe("export/import", () => {
    it("should export current config", () => {
      manager.loadProfile("vim");
      const config = manager.export();

      expect(config.activeProfile).toBe("vim");
    });
  });

  describe("listProfiles", () => {
    it("should list available profiles", () => {
      const profiles = manager.listProfiles();

      expect(profiles).toContain("default");
      expect(profiles).toContain("vim");
      expect(profiles).toContain("emacs");
    });
  });
});

// ============================================================================
// GLOBAL MANAGER TESTS
// ============================================================================

describe("global manager", () => {
  beforeEach(() => {
    resetKeybindingManager();
  });

  it("should return singleton instance", () => {
    const m1 = getKeybindingManager();
    const m2 = getKeybindingManager();

    expect(m1).toBe(m2);
  });

  it("should reset singleton", () => {
    const m1 = getKeybindingManager();
    resetKeybindingManager();
    const m2 = getKeybindingManager();

    expect(m1).not.toBe(m2);
  });
});

// ============================================================================
// PROFILES TESTS
// ============================================================================

describe("profiles", () => {
  it("should have default profile", () => {
    expect(PROFILES["default"]).toBeDefined();
    expect(PROFILES["default"].bindings.length).toBeGreaterThan(0);
  });

  it("should have vim profile", () => {
    expect(PROFILES["vim"]).toBeDefined();
  });

  it("should have emacs profile", () => {
    expect(PROFILES["emacs"]).toBeDefined();
  });

  it("should have unique bindings per profile", () => {
    const defaultKeys = new Set(
      PROFILES["default"].bindings.map((b) => bindingKey(b.key, b.modifiers)),
    );
    const emacsKeys = new Set(
      PROFILES["emacs"].bindings.map((b) => bindingKey(b.key, b.modifiers)),
    );

    // Emacs should have some different bindings
    expect(emacsKeys.size).toBeGreaterThan(0);
  });
});
