/**
 * Task Tool Unit Tests
 * Tests for all Task tool features including:
 * - Background task execution
 * - Task status tracking
 * - Owner assignment
 * - Task dependencies (blocks/blockedBy)
 * - Task comments
 * - Task output streaming
 * - Task update functionality
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TaskManager,
  getTaskManager,
  createTaskTool,
  createTaskGetTool,
  createTaskListTool,
  createTaskCancelTool,
  createTaskUpdateTool,
  createTaskOutputTool,
} from "./task.js";

describe("Task Manager", () => {
  let manager: TaskManager;

  beforeAll(() => {
    manager = getTaskManager();
  });

  afterAll(() => {
    manager.cleanup();
  });

  // ============================================================================
  // TASK CREATION TESTS
  // ============================================================================

  describe("Task Creation", () => {
    it("should create a task with basic parameters", async () => {
      const id = `test_${Date.now()}_1`;
      const task = await manager.create(id, 'echo "hello"');

      expect(task.id).toBe(id);
      expect(task.command).toBe('echo "hello"');
      expect(task.status).toBe("running");
      expect(task.output).toBe("");
      expect(task.owner).toBeUndefined();
      expect(task.blocks).toEqual([]);
      expect(task.blockedBy).toEqual([]);
      expect(task.comments).toEqual([]);
    });

    it("should create a task with owner (starts as pending)", async () => {
      const id = `test_${Date.now()}_2`;
      const task = await manager.create(id, 'echo "hello"', undefined, 0, "Test task", "agent1");

      expect(task.id).toBe(id);
      expect(task.status).toBe("pending");
      expect(task.owner).toBe("agent1");
    });

    it("should create a task with dependencies", async () => {
      const id = `test_${Date.now()}_3`;
      const task = await manager.create(
        id,
        'echo "hello"',
        undefined,
        0,
        "Test task",
        undefined,
        ["task1", "task2"],
        ["task3"],
      );

      expect(task.blocks).toEqual(["task1", "task2"]);
      expect(task.blockedBy).toEqual(["task3"]);
    });

    it("should create a task with timeout", async () => {
      const id = `test_${Date.now()}_4`;
      const task = await manager.create(id, "sleep 10", undefined, 1);

      expect(task.id).toBe(id);
      // Task should be cancelled after timeout
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const updatedTask = await manager.get(id);
      expect(updatedTask?.status).toBe("cancelled");
    });
  });

  // ============================================================================
  // TASK UPDATE TESTS
  // ============================================================================

  describe("Task Update", () => {
    it("should update task status", async () => {
      const id = `test_${Date.now()}_5`;
      await manager.create(id, 'echo "hello"');

      const updated = await manager.update(id, { status: "completed" });

      expect(updated?.status).toBe("completed");
      expect(updated?.completedAt).toBeDefined();
    });

    it("should update task owner", async () => {
      const id = `test_${Date.now()}_6`;
      await manager.create(id, 'echo "hello"');

      const updated = await manager.update(id, { owner: "agent2" });

      expect(updated?.owner).toBe("agent2");
    });

    it("should update task dependencies", async () => {
      const id = `test_${Date.now()}_7`;
      await manager.create(id, 'echo "hello"');

      const updated = await manager.update(id, {
        blocks: ["task_a"],
        blockedBy: ["task_b"],
      });

      expect(updated?.blocks).toEqual(["task_a"]);
      expect(updated?.blockedBy).toEqual(["task_b"]);
    });

    it("should update task description", async () => {
      const id = `test_${Date.now()}_8`;
      await manager.create(id, 'echo "hello"');

      const updated = await manager.update(id, { description: "Updated description" });

      expect(updated?.description).toBe("Updated description");
    });

    it("should return undefined for non-existent task", async () => {
      const updated = await manager.update("nonexistent", { status: "completed" });
      expect(updated).toBeUndefined();
    });
  });

  // ============================================================================
  // TASK COMMENTS TESTS
  // ============================================================================

  describe("Task Comments", () => {
    it("should add a comment to a task", async () => {
      const id = `test_${Date.now()}_9`;
      await manager.create(id, 'echo "hello"');

      const updated = await manager.addComment(id, "Test comment", "agent1");

      expect(updated?.comments).toHaveLength(1);
      expect(updated?.comments?.[0].text).toBe("Test comment");
      expect(updated?.comments?.[0].author).toBe("agent1");
      expect(updated?.comments?.[0].timestamp).toBeDefined();
    });

    it("should add multiple comments to a task", async () => {
      const id = `test_${Date.now()}_10`;
      await manager.create(id, 'echo "hello"');

      await manager.addComment(id, "Comment 1", "agent1");
      await manager.addComment(id, "Comment 2", "agent2");

      const task = await manager.get(id);
      expect(task?.comments).toHaveLength(2);
      expect(task?.comments?.[0].text).toBe("Comment 1");
      expect(task?.comments?.[1].text).toBe("Comment 2");
    });

    it("should add comment without author", async () => {
      const id = `test_${Date.now()}_11`;
      await manager.create(id, 'echo "hello"');

      const updated = await manager.addComment(id, "Anonymous comment");

      expect(updated?.comments?.[0].author).toBeUndefined();
    });

    it("should return undefined for non-existent task", async () => {
      const updated = await manager.addComment("nonexistent", "Test comment");
      expect(updated).toBeUndefined();
    });
  });

  // ============================================================================
  // TASK OUTPUT TESTS
  // ============================================================================

  describe("Task Output", () => {
    it("should get task output", async () => {
      const id = `test_${Date.now()}_12`;
      await manager.create(id, 'echo "hello world"');

      // Wait for task to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = await manager.getOutput(id);

      expect(result).toBeDefined();
      expect(result?.output).toContain("hello world");
      expect(result?.isComplete).toBe(true);
    });

    it("should get incremental output with since parameter", async () => {
      const id = `test_${Date.now()}_13`;
      await manager.create(id, 'echo "line1" && echo "line2"');

      // Wait for task to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get all output first
      const result1 = await manager.getOutput(id);
      expect(result1).toBeDefined();

      // Get incremental output
      const result2 = await manager.getOutput(id, result1!.output.length);
      expect(result2?.output).toBe("");
      expect(result2?.isComplete).toBe(true);
    });

    it("should return undefined for non-existent task", async () => {
      const result = await manager.getOutput("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  // ============================================================================
  // TASK LISTING TESTS
  // ============================================================================

  describe("Task Listing", () => {
    it("should list all tasks", async () => {
      const id1 = `test_${Date.now()}_14a`;
      const id2 = `test_${Date.now()}_14b`;
      await manager.create(id1, 'echo "task1"');
      await manager.create(id2, 'echo "task2"');

      const tasks = await manager.list();

      expect(tasks.length).toBeGreaterThanOrEqual(2);
      expect(tasks.map((t) => t.id)).toContainEqual(expect.stringContaining("test_"));
    });

    it("should list tasks by status", async () => {
      const id1 = `test_${Date.now()}_15a`;
      const id2 = `test_${Date.now()}_15b`;
      await manager.create(id1, 'echo "task1"');
      await manager.create(id2, 'echo "task2"');

      await manager.update(id1, { status: "completed" });

      const runningTasks = await manager.listByStatus("running");
      const completedTasks = await manager.listByStatus("completed");

      expect(runningTasks.map((t) => t.id)).toContain(id2);
      expect(completedTasks.map((t) => t.id)).toContain(id1);
    });

    it("should handle empty task list", async () => {
      // Create a fresh manager for this test
      const freshManager = new TaskManager();
      const tasks = await freshManager.list();
      expect(tasks).toHaveLength(0);
      freshManager.cleanup();
    });
  });

  // ============================================================================
  // TASK CANCELLATION TESTS
  // ============================================================================

  describe("Task Cancellation", () => {
    it("should cancel a running task", async () => {
      const id = `test_${Date.now()}_16`;
      await manager.create(id, "sleep 100");

      await manager.cancel(id);

      const task = await manager.get(id);
      expect(task?.status).toBe("cancelled");
      expect(task?.completedAt).toBeDefined();
    });

    it("should handle cancelling non-existent task gracefully", async () => {
      // Should not throw
      await expect(manager.cancel("nonexistent")).resolves.not.toThrow();
    });

    it("should handle cancelling already completed task", async () => {
      const id = `test_${Date.now()}_17`;
      await manager.create(id, 'echo "quick"');

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 500));

      await manager.cancel(id);

      const task = await manager.get(id);
      expect(task?.status).toBe("completed"); // Should remain completed
    });
  });

  // ============================================================================
  // TASK TOOL TESTS
  // ============================================================================

  describe("Task Tools", () => {
    // createTaskTool
    describe("createTaskTool", () => {
      const taskTool = createTaskTool();

      it("should have correct metadata", () => {
        expect(taskTool.name).toBe("task");
        expect(taskTool.label).toBe("Task");
        expect(taskTool.isReadOnly()).toBe(false);
        expect(taskTool.isConcurrencySafe()).toBe(true);
      });

      it("should validate input - reject empty command", async () => {
        const result = await taskTool.validateInput!({ command: "" }, {} as any);
        expect(result.result).toBe(false);
        expect(result.errorCode).toBe(1);
      });

      it("should validate input - accept valid command", async () => {
        const result = await taskTool.validateInput!({ command: "echo test" }, {} as any);
        expect(result.result).toBe(true);
      });

      it("should validate input - reject dangerous commands", async () => {
        const result = await taskTool.validateInput!({ command: "rm -rf /" }, {} as any);
        expect(result.result).toBe(false);
        expect(result.errorCode).toBe(2);
      });
    });

    // createTaskGetTool
    describe("createTaskGetTool", () => {
      const taskGetTool = createTaskGetTool();

      it("should have correct metadata", () => {
        expect(taskGetTool.name).toBe("task_get");
        expect(taskGetTool.label).toBe("Get Task");
        expect(taskGetTool.isReadOnly()).toBe(true);
      });

      it("should get task details", async () => {
        const id = `test_${Date.now()}_18`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "test"', undefined, 0, "Test task", "agent1");

        const result = await taskGetTool.call!({ taskId: id }, {} as any);

        expect(result.taskId).toBe(id);
        expect(result.owner).toBe("agent1");
        expect(result.description).toBe("Test task");
      });

      it("should return error for non-existent task", async () => {
        const result = await taskGetTool.call!({ taskId: "nonexistent" }, {} as any);
        expect(result.error).toBeDefined();
        expect(result.errorCode).toBe(1);
      });
    });

    // createTaskListTool
    describe("createTaskListTool", () => {
      const taskListTool = createTaskListTool();

      it("should have correct metadata", () => {
        expect(taskListTool.name).toBe("task_list");
        expect(taskListTool.label).toBe("List Tasks");
      });

      it("should list tasks", async () => {
        const result = await taskListTool.call!({}, {} as any);
        expect(result.count).toBeDefined();
        expect(result.tasks).toBeDefined();
        expect(Array.isArray(result.tasks)).toBe(true);
      });

      it("should filter by status", async () => {
        const id = `test_${Date.now()}_19`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "test"');
        await manager.update(id, { status: "running" });

        const result = await taskListTool.call!({ status: "running" }, {} as any);
        expect(result.tasks.some((t: any) => t.taskId === id)).toBe(true);
      });

      it("should filter by owner", async () => {
        const id = `test_${Date.now()}_20`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "test"', undefined, 0, undefined, "test_owner");

        const result = await taskListTool.call!({ owner: "test_owner" }, {} as any);
        expect(result.tasks.some((t: any) => t.taskId === id)).toBe(true);
      });
    });

    // createTaskUpdateTool
    describe("createTaskUpdateTool", () => {
      const taskUpdateTool = createTaskUpdateTool();

      it("should have correct metadata", () => {
        expect(taskUpdateTool.name).toBe("task_update");
        expect(taskUpdateTool.label).toBe("Update Task");
        expect(taskUpdateTool.isReadOnly()).toBe(false);
      });

      it("should update task status", async () => {
        const id = `test_${Date.now()}_21`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "test"');

        const result = await taskUpdateTool.call!({ taskId: id, status: "completed" }, {} as any);

        expect(result.message).toBe("Task updated successfully");
        expect(result.status).toBe("completed");
      });

      it("should update task owner", async () => {
        const id = `test_${Date.now()}_22`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "test"');

        const result = await taskUpdateTool.call!({ taskId: id, owner: "new_owner" }, {} as any);

        expect(result.owner).toBe("new_owner");
      });

      it("should add comment to task", async () => {
        const id = `test_${Date.now()}_23`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "test"');

        const result = await taskUpdateTool.call!(
          { taskId: id, comment: "Test comment" },
          {} as any,
        );

        expect(result.comments).toHaveLength(1);
        expect(result.comments?.[0].text).toBe("Test comment");
      });

      it("should return error for non-existent task", async () => {
        const result = await taskUpdateTool.call!(
          { taskId: "nonexistent", status: "completed" },
          {} as any,
        );
        expect(result.error).toBeDefined();
        expect(result.errorCode).toBe(1);
      });
    });

    // createTaskOutputTool
    describe("createTaskOutputTool", () => {
      const taskOutputTool = createTaskOutputTool();

      it("should have correct metadata", () => {
        expect(taskOutputTool.name).toBe("task_output");
        expect(taskOutputTool.label).toBe("Task Output");
        expect(taskOutputTool.isReadOnly()).toBe(true);
      });

      it("should get task output", async () => {
        const id = `test_${Date.now()}_24`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "hello output"');

        // Wait for task to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        const result = await taskOutputTool.call!({ taskId: id }, {} as any);

        expect(result.output).toBeDefined();
        expect(result.isComplete).toBe(true);
      });

      it("should get incremental output", async () => {
        const id = `test_${Date.now()}_25`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "line1" && echo "line2"');

        // Wait for task to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Get all output first
        const result1 = await taskOutputTool.call!({ taskId: id }, {} as any);

        // Get incremental output
        const result2 = await taskOutputTool.call!(
          { taskId: id, since: result1.output.length },
          {} as any,
        );
        expect(result2.output).toBe("");
      });

      it("should return error for non-existent task", async () => {
        const result = await taskOutputTool.call!({ taskId: "nonexistent" }, {} as any);
        expect(result.error).toBeDefined();
        expect(result.errorCode).toBe(1);
      });
    });

    // createTaskCancelTool
    describe("createTaskCancelTool", () => {
      const taskCancelTool = createTaskCancelTool();

      it("should have correct metadata", () => {
        expect(taskCancelTool.name).toBe("task_cancel");
        expect(taskCancelTool.label).toBe("Cancel Task");
        expect(taskCancelTool.isReadOnly()).toBe(false);
      });

      it("should cancel a running task", async () => {
        const id = `test_${Date.now()}_26`;
        const manager = getTaskManager();
        await manager.create(id, "sleep 100");

        const result = await taskCancelTool.call!({ taskId: id }, {} as any);

        expect(result.message).toBe("Task cancelled successfully");
        expect(result.status).toBe("cancelled");
      });

      it("should return error for non-existent task", async () => {
        const result = await taskCancelTool.call!({ taskId: "nonexistent" }, {} as any);
        expect(result.error).toBeDefined();
        expect(result.errorCode).toBe(1);
      });

      it("should handle already completed task", async () => {
        const id = `test_${Date.now()}_27`;
        const manager = getTaskManager();
        await manager.create(id, 'echo "quick"');

        // Wait for completion
        await new Promise((resolve) => setTimeout(resolve, 500));

        const result = await taskCancelTool.call!({ taskId: id }, {} as any);

        expect(result.status).toBe("completed"); // Should show actual status
      });
    });
  });

  // ============================================================================
  // TASK MANAGER CLEANUP TESTS
  // ============================================================================

  describe("Task Manager Cleanup", () => {
    it("should cleanup all tasks", async () => {
      const freshManager = new TaskManager();

      await freshManager.create("cleanup_1", "sleep 100");
      await freshManager.create("cleanup_2", "sleep 100");

      expect((await freshManager.list()).length).toBe(2);

      freshManager.cleanup();

      expect((await freshManager.list()).length).toBe(0);
    });
  });
});
