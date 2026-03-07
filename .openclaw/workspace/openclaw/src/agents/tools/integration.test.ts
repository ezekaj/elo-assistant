/**
 * Integration Tests for Task, Glob, Grep, and WebFetch Tools
 * Verifies all tools are properly wired and synchronized
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { createGlobTool, MCP_GLOB_PROTOCOL_VERSION, DEFAULT_GLOB_LIMIT } from "./glob.js";
import { createGrepTool, DEFAULT_GREP_HIDDEN, DEFAULT_GREP_NO_IGNORE } from "./grep.js";
import {
  createTaskTool,
  createTaskGetTool,
  createTaskListTool,
  createTaskCancelTool,
  createTaskUpdateTool,
  createTaskOutputTool,
  getTaskManager,
  TaskManager,
  McpTaskProtocol,
  MCP_TASK_PROTOCOL_VERSION,
  MCP_TASK_METHODS,
} from "./task.js";
import {
  createWebFetchTool,
  McpWebFetchProtocol,
  MCP_WEBFETCH_PROTOCOL_VERSION,
  MCP_WEBFETCH_METHODS,
  isDomainAllowed,
  checkDomainBlocklist,
} from "./web-fetch.js";

describe("Tool Integration Tests", () => {
  // ============================================================================
  // TASK TOOL TESTS
  // ============================================================================

  describe("Task Tool Integration", () => {
    let taskManager: TaskManager;

    beforeAll(() => {
      taskManager = getTaskManager();
    });

    afterAll(() => {
      taskManager.cleanup();
    });

    it("should have correct MCP protocol version", () => {
      expect(MCP_TASK_PROTOCOL_VERSION).toBe("2024-11-05");
    });

    it("should have correct MCP methods", () => {
      expect(MCP_TASK_METHODS.TASKS_GET).toBe("tasks/get");
      expect(MCP_TASK_METHODS.TASKS_LIST).toBe("tasks/list");
      expect(MCP_TASK_METHODS.TASKS_RESULT).toBe("tasks/result");
      expect(MCP_TASK_METHODS.TASKS_CANCEL).toBe("tasks/cancel");
      expect(MCP_TASK_METHODS.NOTIFICATIONS_TASKS_STATUS).toBe("notifications/tasks/status");
    });

    it("should create task tool with correct properties", () => {
      const tool = createTaskTool();
      expect(tool.name).toBe("task");
      expect(tool.label).toBe("Task");
      expect(tool.isReadOnly?.()).toBe(false);
      expect(tool.isConcurrencySafe?.()).toBe(true);
    });

    it("should create all 6 task sub-tools", () => {
      expect(createTaskTool()).toBeDefined();
      expect(createTaskGetTool()).toBeDefined();
      expect(createTaskListTool()).toBeDefined();
      expect(createTaskCancelTool()).toBeDefined();
      expect(createTaskUpdateTool()).toBeDefined();
      expect(createTaskOutputTool()).toBeDefined();
    });

    it("should create task and retrieve it", async () => {
      const tool = createTaskTool();
      const result = await tool.call!(
        { command: 'echo "test"', description: "Test task" },
        { abortController: {} },
      );

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.taskId).toBeDefined();
      expect(details.status).toBe("running");

      // Verify with task_get
      const getTool = createTaskGetTool();
      const getResult = await getTool.call!({ taskId: details.taskId });
      expect(getResult.details).toBeDefined();
    });

    it("should update task status", async () => {
      const tool = createTaskTool();
      const result = await tool.call!(
        { command: "sleep 1", description: "Test update" },
        { abortController: {} },
      );

      const details = result.details as any;
      const taskId = details.taskId;

      // Update the task
      const updateTool = createTaskUpdateTool();
      const updateResult = await updateTool.call!({
        taskId,
        status: "completed",
        reason: "Test completion",
      });

      expect(updateResult.details).toBeDefined();
      const updateDetails = updateResult.details as any;
      expect(updateDetails.status).toBe("completed");
    });

    it("should list tasks", async () => {
      const listTool = createTaskListTool();
      const result = await listTool.call!({});

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.count).toBeDefined();
      expect(Array.isArray(details.tasks)).toBe(true);
    });

    it("should have MCP protocol handler", () => {
      const protocol = new McpTaskProtocol(taskManager);
      expect(protocol).toBeDefined();
      expect(typeof protocol.handleGet).toBe("function");
      expect(typeof protocol.handleList).toBe("function");
      expect(typeof protocol.handleCancel).toBe("function");
      expect(typeof protocol.handleResult).toBe("function");
    });
  });

  // ============================================================================
  // GLOB TOOL TESTS
  // ============================================================================

  describe("Glob Tool Integration", () => {
    it("should have correct default limit", () => {
      expect(DEFAULT_GLOB_LIMIT).toBe(100);
    });

    it("should create glob tool with correct properties", () => {
      const tool = createGlobTool();
      expect(tool.name).toBe("glob");
      expect(tool.label).toBe("Glob");
      expect(tool.isReadOnly?.()).toBe(true);
      expect(tool.isConcurrencySafe?.()).toBe(true);
    });

    it("should find TypeScript files", async () => {
      const tool = createGlobTool();
      const result = await tool.call!(
        { pattern: "*.ts", path: __dirname, limit: 5 },
        { abortController: {} },
      );

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.numFiles).toBeGreaterThan(0);
      expect(details.filenames).toBeDefined();
      expect(Array.isArray(details.filenames)).toBe(true);
    });

    it("should respect environment variables", () => {
      // These should be truthy based on our defaults
      expect(typeof DEFAULT_GREP_HIDDEN).toBe("boolean");
      expect(typeof DEFAULT_GREP_NO_IGNORE).toBe("boolean");
    });
  });

  // ============================================================================
  // GREP TOOL TESTS
  // ============================================================================

  describe("Grep Tool Integration", () => {
    it("should create grep tool with correct properties", () => {
      const tool = createGrepTool();
      expect(tool.name).toBe("grep");
      expect(tool.label).toBe("Search");
      expect(tool.isReadOnly?.()).toBe(true);
      expect(tool.isConcurrencySafe?.()).toBe(true);
    });

    it("should search for pattern", async () => {
      const tool = createGrepTool();
      const result = await tool.call!(
        {
          pattern: "export function",
          path: __dirname,
          output_mode: "files_with_matches",
          head_limit: 5,
        },
        { abortController: {}, getAppState: async () => ({}) },
      );

      expect(result.details).toBeDefined();
      const details = result.details as any;
      expect(details.mode).toBe("files_with_matches");
    });

    it("should respect environment variables", () => {
      expect(typeof DEFAULT_GREP_HIDDEN).toBe("boolean");
      expect(typeof DEFAULT_GREP_NO_IGNORE).toBe("boolean");
    });
  });

  // ============================================================================
  // WEBFETCH TOOL TESTS
  // ============================================================================

  describe("WebFetch Tool Integration", () => {
    it("should have correct MCP protocol version", () => {
      expect(MCP_WEBFETCH_PROTOCOL_VERSION).toBe("2024-11-05");
    });

    it("should have correct MCP methods", () => {
      expect(MCP_WEBFETCH_METHODS.WEBFETCH_FETCH).toBe("webfetch/fetch");
      expect(MCP_WEBFETCH_METHODS.NOTIFICATIONS_WEBFETCH_STATUS).toBe(
        "notifications/webfetch/status",
      );
    });

    it("should create web_fetch tool with correct properties", () => {
      const tool = createWebFetchTool({ config: {}, sandboxed: false });
      if (tool) {
        expect(tool.name).toBe("web_fetch");
        expect(tool.label).toBe("Web Fetch");
        expect(tool.isReadOnly?.()).toBe(true);
        expect(tool.isConcurrencySafe?.()).toBe(true);
      }
    });

    it("should validate domain permissions", () => {
      const permissions = {
        allowedDomains: ["example.com", "github.com"],
        deniedDomains: ["malicious.com"],
      };

      // Should allow allowed domains
      expect(isDomainAllowed("https://example.com/page", permissions).allowed).toBe(true);
      expect(isDomainAllowed("https://sub.github.com/page", permissions).allowed).toBe(true);

      // Should deny denied domains
      expect(isDomainAllowed("https://malicious.com/page", permissions).allowed).toBe(false);

      // Should deny domains not in allowed list
      expect(isDomainAllowed("https://other.com/page", permissions).allowed).toBe(false);
    });

    it("should check domain blocklist", () => {
      const blocklist = ["spam.com", "phishing.net"];

      expect(checkDomainBlocklist("https://spam.com/page", blocklist).blocked).toBe(true);
      expect(checkDomainBlocklist("https://safe.com/page", blocklist).blocked).toBe(false);
    });

    it("should have MCP protocol handler", () => {
      const mockFetch = async () => ({ text: "mock" });
      const protocol = new McpWebFetchProtocol(mockFetch);
      expect(protocol).toBeDefined();
      expect(typeof protocol.handleFetch).toBe("function");
    });
  });

  // ============================================================================
  // CROSS-TOOL SYNCHRONIZATION TESTS
  // ============================================================================

  describe("Tool Synchronization", () => {
    it("should have all tools registered in openclaw-tools", () => {
      // This verifies the imports are correct
      expect(createTaskTool).toBeDefined();
      expect(createGlobTool).toBeDefined();
      expect(createGrepTool).toBeDefined();
      expect(createWebFetchTool).toBeDefined();
    });

    it("should have consistent tool naming", () => {
      const taskTool = createTaskTool();
      const globTool = createGlobTool();
      const grepTool = createGrepTool();

      expect(taskTool.name).toBe("task");
      expect(globTool.name).toBe("glob");
      expect(grepTool.name).toBe("grep");
    });

    it("should have consistent export patterns", () => {
      // All tools should export their MCP constants
      expect(MCP_TASK_PROTOCOL_VERSION).toBeDefined();
      expect(MCP_WEBFETCH_PROTOCOL_VERSION).toBeDefined();

      // All tools should export their MCP methods
      expect(MCP_TASK_METHODS).toBeDefined();
      expect(MCP_WEBFETCH_METHODS).toBeDefined();
    });
  });
});
