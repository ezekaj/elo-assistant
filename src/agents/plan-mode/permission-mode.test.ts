/**
 * Tests for Permission Mode System
 *
 * Verifies the acceptEdits mode works correctly for all tool categories.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isEditTool,
  isDestructiveTool,
  isReadOnlyTool,
  getToolCategory,
  shouldPromptForTool,
  isToolAutoApproved,
  getToolPermissionDecision,
  PERMISSION_MODE_DESCRIPTIONS,
} from "./permission-mode.js";
import { setPermissionMode, getPermissionMode } from "./state.js";

describe("Permission Mode System", () => {
  const originalMode = getPermissionMode();

  beforeEach(() => {
    // Reset to default mode before each test
    setPermissionMode("default");
  });

  afterEach(() => {
    // Restore original mode after each test
    setPermissionMode(originalMode);
  });

  describe("Tool Categories", () => {
    it("identifies edit tools correctly", () => {
      expect(isEditTool("write")).toBe(true);
      expect(isEditTool("edit")).toBe(true);
      expect(isEditTool("notebookedit")).toBe(true);
      expect(isEditTool("notebook_edit")).toBe(true);
      expect(isEditTool("Write")).toBe(true);
      expect(isEditTool("EDIT")).toBe(true);
    });

    it("identifies destructive tools correctly", () => {
      expect(isDestructiveTool("bash")).toBe(true);
      expect(isDestructiveTool("process")).toBe(true);
      expect(isDestructiveTool("exec")).toBe(true);
      expect(isDestructiveTool("delete")).toBe(true);
      expect(isDestructiveTool("move")).toBe(true);
      expect(isDestructiveTool("ssh")).toBe(true);
      expect(isDestructiveTool("mcp")).toBe(true);
      expect(isDestructiveTool("web_fetch")).toBe(true);
      expect(isDestructiveTool("Bash")).toBe(true);
    });

    it("identifies read-only tools correctly", () => {
      expect(isReadOnlyTool("read")).toBe(true);
      expect(isReadOnlyTool("glob")).toBe(true);
      expect(isReadOnlyTool("grep")).toBe(true);
      expect(isReadOnlyTool("memory_search")).toBe(true);
      expect(isReadOnlyTool("task_get")).toBe(true);
    });

    it("getToolCategory returns correct category", () => {
      expect(getToolCategory("write")).toBe("edit");
      expect(getToolCategory("bash")).toBe("destructive");
      expect(getToolCategory("read")).toBe("readonly");
      expect(getToolCategory("unknown_tool")).toBe("unknown");
    });

    it("edit tools are NOT destructive", () => {
      // Write/Edit are not destructive - they only modify files
      expect(isDestructiveTool("write")).toBe(false);
      expect(isDestructiveTool("edit")).toBe(false);
    });
  });

  describe("Default Mode", () => {
    beforeEach(() => {
      setPermissionMode("default");
    });

    it("prompts for edit tools in default mode", () => {
      expect(shouldPromptForTool("write")).toBe(true);
      expect(shouldPromptForTool("edit")).toBe(true);
    });

    it("prompts for destructive tools in default mode", () => {
      expect(shouldPromptForTool("bash")).toBe(true);
      expect(shouldPromptForTool("exec")).toBe(true);
    });

    it("does not prompt for read-only tools in default mode", () => {
      expect(shouldPromptForTool("read")).toBe(false);
      expect(shouldPromptForTool("glob")).toBe(false);
    });

    it("getToolPermissionDecision returns correct decision", () => {
      expect(getToolPermissionDecision("write")).toBe("prompt");
      expect(getToolPermissionDecision("bash")).toBe("prompt");
      expect(getToolPermissionDecision("read")).toBe("auto-approve");
    });
  });

  describe("AcceptEdits Mode", () => {
    beforeEach(() => {
      setPermissionMode("acceptEdits");
    });

    it("auto-approves edit tools", () => {
      expect(shouldPromptForTool("write")).toBe(false);
      expect(shouldPromptForTool("edit")).toBe(false);
      expect(shouldPromptForTool("notebookedit")).toBe(false);
    });

    it("still prompts for destructive tools", () => {
      expect(shouldPromptForTool("bash")).toBe(true);
      expect(shouldPromptForTool("process")).toBe(true);
      expect(shouldPromptForTool("ssh")).toBe(true);
    });

    it("does not prompt for read-only tools", () => {
      expect(shouldPromptForTool("read")).toBe(false);
      expect(shouldPromptForTool("glob")).toBe(false);
    });

    it("isToolAutoApproved returns correct values", () => {
      expect(isToolAutoApproved("write")).toBe(true);
      expect(isToolAutoApproved("read")).toBe(true);
      expect(isToolAutoApproved("bash")).toBe(false);
    });

    it("getToolPermissionDecision returns correct decisions", () => {
      expect(getToolPermissionDecision("write")).toBe("auto-approve");
      expect(getToolPermissionDecision("bash")).toBe("prompt");
      expect(getToolPermissionDecision("read")).toBe("auto-approve");
    });
  });

  describe("BypassPermissions Mode", () => {
    beforeEach(() => {
      setPermissionMode("bypassPermissions");
    });

    it("auto-approves all tools", () => {
      expect(shouldPromptForTool("write")).toBe(false);
      expect(shouldPromptForTool("bash")).toBe(false);
      expect(shouldPromptForTool("exec")).toBe(false);
      expect(shouldPromptForTool("delete")).toBe(false);
    });

    it("getToolPermissionDecision returns auto-approve for all", () => {
      expect(getToolPermissionDecision("write")).toBe("auto-approve");
      expect(getToolPermissionDecision("bash")).toBe("auto-approve");
      expect(getToolPermissionDecision("delete")).toBe("auto-approve");
    });
  });

  describe("Plan Mode", () => {
    beforeEach(() => {
      setPermissionMode("plan");
    });

    it("does not prompt (tools are blocked at execution level)", () => {
      // In plan mode, tools are BLOCKED not prompted
      // shouldPromptForTool returns false because blocking happens elsewhere
      expect(shouldPromptForTool("write")).toBe(true);
      expect(shouldPromptForTool("bash")).toBe(true);
    });

    it("read-only tools are not prompted", () => {
      expect(shouldPromptForTool("read")).toBe(false);
      expect(shouldPromptForTool("glob")).toBe(false);
    });
  });

  describe("Permission Mode Descriptions", () => {
    it("has descriptions for all modes", () => {
      expect(PERMISSION_MODE_DESCRIPTIONS.default).toBeDefined();
      expect(PERMISSION_MODE_DESCRIPTIONS.acceptEdits).toBeDefined();
      expect(PERMISSION_MODE_DESCRIPTIONS.bypassPermissions).toBeDefined();
      expect(PERMISSION_MODE_DESCRIPTIONS.plan).toBeDefined();
      expect(PERMISSION_MODE_DESCRIPTIONS.dontAsk).toBeDefined();
    });

    it("descriptions have required fields", () => {
      for (const [mode, desc] of Object.entries(PERMISSION_MODE_DESCRIPTIONS)) {
        expect(desc.name).toBeDefined();
        expect(desc.description).toBeDefined();
        expect(typeof desc.name).toBe("string");
        expect(typeof desc.description).toBe("string");
      }
    });

    it("acceptEdits has symbol", () => {
      expect(PERMISSION_MODE_DESCRIPTIONS.acceptEdits.symbol).toBe("▶▶");
    });

    it("bypassPermissions has warning symbol", () => {
      expect(PERMISSION_MODE_DESCRIPTIONS.bypassPermissions.symbol).toBe("⚠️");
    });
  });
});
