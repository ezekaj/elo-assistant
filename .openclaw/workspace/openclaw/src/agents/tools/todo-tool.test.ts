import { describe, it, expect, beforeEach } from "vitest";
import { createTodoTool, getSessionTodos, setSessionTodos, clearSessionTodos } from "./todo-tool.js";

describe("TodoWrite Tool", () => {
  const sessionKey = "test-session";
  const tool = createTodoTool({ agentSessionKey: sessionKey });

  beforeEach(() => {
    clearSessionTodos(sessionKey);
  });

  it("should create a tool with correct name", () => {
    expect(tool.name).toBe("TodoWrite");
  });

  it("should start with empty todos", () => {
    expect(getSessionTodos(sessionKey)).toEqual([]);
  });

  it("should add todos", async () => {
    const result = await tool.execute("call-1", {
      todos: [
        { content: "Fix the bug", status: "pending", activeForm: "Fixing the bug" },
      ],
    });

    expect(result.details).toBeDefined();
    expect(result.details.oldTodos).toEqual([]);
    expect(result.details.newTodos).toHaveLength(1);
    expect(result.details.newTodos[0].content).toBe("Fix the bug");
  });

  it("should track old todos on update", async () => {
    // First update
    await tool.execute("call-1", {
      todos: [
        { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
      ],
    });

    // Second update
    const result = await tool.execute("call-2", {
      todos: [
        { content: "Task 1", status: "completed", activeForm: "Doing task 1" },
        { content: "Task 2", status: "in_progress", activeForm: "Doing task 2" },
      ],
    });

    expect(result.details.oldTodos).toHaveLength(1);
    expect(result.details.oldTodos[0].content).toBe("Task 1");
    expect(result.details.newTodos).toHaveLength(2);
  });

  it("should clear todos when all completed", async () => {
    await tool.execute("call-1", {
      todos: [
        { content: "Task 1", status: "completed", activeForm: "Doing task 1" },
        { content: "Task 2", status: "completed", activeForm: "Doing task 2" },
      ],
    });

    // All completed = cleared
    expect(getSessionTodos(sessionKey)).toEqual([]);
  });

  it("should persist todos in session store", async () => {
    await tool.execute("call-1", {
      todos: [
        { content: "Task 1", status: "in_progress", activeForm: "Doing task 1" },
      ],
    });

    const stored = getSessionTodos(sessionKey);
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Task 1");
    expect(stored[0].status).toBe("in_progress");
  });
});

describe("getTodosAsPrompt", () => {
  const sessionKey = "prompt-test-session";

  beforeEach(() => {
    clearSessionTodos(sessionKey);
  });

  it("should return null for empty todos", async () => {
    const { getTodosAsPrompt } = await import("./todo-tool.js");
    expect(getTodosAsPrompt(sessionKey)).toBeNull();
  });

  it("should format todos with status indicators", async () => {
    setSessionTodos(sessionKey, [
      { content: "Pending task", status: "pending", activeForm: "Pending" },
      { content: "In progress task", status: "in_progress", activeForm: "In progress" },
      { content: "Completed task", status: "completed", activeForm: "Completed" },
    ]);

    const { getTodosAsPrompt } = await import("./todo-tool.js");
    const prompt = getTodosAsPrompt(sessionKey);

    expect(prompt).toContain("○ Pending task");
    expect(prompt).toContain("▶ In progress task");
    expect(prompt).toContain("☑ Completed task");
  });
});

describe("getTodoReminder", () => {
  const sessionKey = "reminder-test-session";

  beforeEach(() => {
    clearSessionTodos(sessionKey);
  });

  it("should return null for empty todos", async () => {
    const { getTodoReminder } = await import("./todo-tool.js");
    expect(getTodoReminder(sessionKey)).toBeNull();
  });

  it("should warn when no task is in_progress", async () => {
    setSessionTodos(sessionKey, [
      { content: "Pending task", status: "pending", activeForm: "Pending" },
    ]);

    const { getTodoReminder } = await import("./todo-tool.js");
    const reminder = getTodoReminder(sessionKey);

    expect(reminder).toContain("1 todos");
    expect(reminder).toContain("none are in_progress");
  });

  it("should return null when a task is in_progress", async () => {
    setSessionTodos(sessionKey, [
      { content: "Active task", status: "in_progress", activeForm: "Active" },
    ]);

    const { getTodoReminder } = await import("./todo-tool.js");
    expect(getTodoReminder(sessionKey)).toBeNull();
  });
});
