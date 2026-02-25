import { Type } from "@sinclair/typebox";
import * as crypto from "crypto";
import { EventEmitter } from "events";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam } from "./common.js";

// ============================================================================
// MCP TASK PROTOCOL CONSTANTS
// ============================================================================

export const MCP_TASK_PROTOCOL_VERSION = "2024-11-05";
export const MCP_TASK_METHODS = {
  TASKS_GET: "tasks/get",
  TASKS_LIST: "tasks/list",
  TASKS_RESULT: "tasks/result",
  TASKS_CANCEL: "tasks/cancel",
  NOTIFICATIONS_TASKS_STATUS: "notifications/tasks/status",
} as const;

// ============================================================================
// TASK STORE INTERFACE (for MCP protocol)
// ============================================================================

export interface TaskStore {
  getTask(taskId: string, sessionId?: string): Promise<TaskInfo | undefined>;
  listTasks(cursor?: string, sessionId?: string): Promise<{ tasks: TaskInfo[]; cursor?: string }>;
  updateTaskStatus(
    taskId: string,
    status: TaskInfo["status"],
    reason?: string,
    sessionId?: string,
  ): Promise<void>;
  getTaskResult(taskId: string, sessionId?: string): Promise<{ result: string; exitCode?: number }>;
}

// ============================================================================
// TASK MESSAGE QUEUE INTERFACE
// ============================================================================

export interface TaskMessageQueue {
  enqueue(taskId: string, message: unknown): Promise<void>;
  dequeue(taskId: string, sessionId?: string): Promise<unknown | undefined>;
}

// ============================================================================
// TASK SCHEMA
// ============================================================================

const TaskSchema = Type.Object({
  subject: Type.Optional(
    Type.String({
      description: "Task subject/title (for team coordination)",
    }),
  ),
  command: Type.String({
    description: "Shell command to execute in the background",
  }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the command",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: "Timeout in seconds (0 = no timeout)",
      default: 0,
    }),
  ),
  description: Type.Optional(
    Type.String({
      description: "Human-readable description of what this task does",
    }),
  ),
  activeForm: Type.Optional(
    Type.String({
      description: "Active form description for team notifications",
    }),
  ),
  owner: Type.Optional(
    Type.String({
      description: 'Task owner (agent name or ID). If specified, task starts in "pending" status.',
    }),
  ),
  blocks: Type.Optional(
    Type.Array(Type.String(), {
      description: "List of task IDs that this task blocks (dependencies)",
    }),
  ),
  blockedBy: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "List of task IDs that block this task (must complete before this task can start)",
    }),
  ),
  metadata: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: "Additional task metadata",
    }),
  ),
});

// ============================================================================
// TASK OUTPUT SCHEMAS
// ============================================================================

const TaskOutputSchema = Type.Object({
  taskId: Type.String({ description: "Task identifier" }),
  status: Type.String({ description: "Task status" }),
  pid: Type.Optional(Type.Number({ description: "Process ID" })),
  command: Type.Optional(Type.String({ description: "Command being executed" })),
  description: Type.Optional(Type.String({ description: "Task description" })),
  cwd: Type.Optional(Type.String({ description: "Working directory" })),
  owner: Type.Optional(Type.String({ description: "Task owner" })),
  blocks: Type.Optional(Type.Array(Type.String())),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
  message: Type.Optional(Type.String()),
  startedAt: Type.String({ description: "Task start time" }),
});

const TaskGetOutputSchema = Type.Object({
  taskId: Type.String(),
  status: Type.String(),
  pid: Type.Optional(Type.Number()),
  command: Type.String(),
  description: Type.Optional(Type.String()),
  owner: Type.Optional(Type.String()),
  blocks: Type.Optional(Type.Array(Type.String())),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  comments: Type.Optional(
    Type.Array(
      Type.Object({
        text: Type.String(),
        timestamp: Type.String(),
        author: Type.Optional(Type.String()),
      }),
    ),
  ),
  output: Type.String(),
  exitCode: Type.Optional(Type.Number()),
  error: Type.Optional(Type.String()),
  startedAt: Type.String(),
  completedAt: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String()),
});

const TaskListOutputSchema = Type.Object({
  count: Type.Number(),
  tasks: Type.Array(
    Type.Object({
      taskId: Type.String(),
      subject: Type.Optional(Type.String()),
      status: Type.String(),
      owner: Type.Optional(Type.String()),
      pid: Type.Optional(Type.Number()),
      command: Type.String(),
      description: Type.Optional(Type.String()),
      activeForm: Type.Optional(Type.String()),
      blocks: Type.Optional(Type.Array(Type.String())),
      blockedBy: Type.Optional(Type.Array(Type.String())),
      startedAt: Type.String(),
      completedAt: Type.Optional(Type.String()),
    }),
  ),
});

const TaskCancelOutputSchema = Type.Object({
  message: Type.String(),
  taskId: Type.String(),
  status: Type.String(),
  cancelledAt: Type.String(),
});

const TaskUpdateOutputSchema = Type.Object({
  message: Type.String(),
  taskId: Type.String(),
  status: Type.String(),
  owner: Type.Optional(Type.String()),
  blocks: Type.Optional(Type.Array(Type.String())),
  blockedBy: Type.Optional(Type.Array(Type.String())),
  description: Type.Optional(Type.String()),
  activeForm: Type.Optional(Type.String()),
  subject: Type.Optional(Type.String()),
  comments: Type.Optional(
    Type.Array(
      Type.Object({
        text: Type.String(),
        timestamp: Type.String(),
        author: Type.Optional(Type.String()),
      }),
    ),
  ),
  completedAt: Type.Optional(Type.String()),
});

const TaskOutputToolOutputSchema = Type.Object({
  taskId: Type.String(),
  output: Type.String(),
  isComplete: Type.Boolean(),
  exitCode: Type.Optional(Type.Number()),
  bytesRead: Type.Number(),
  nextOffset: Type.Optional(Type.Number()),
});

interface TaskComment {
  text: string;
  timestamp: string;
  author?: string;
}

interface TaskInfo {
  id: string;
  subject?: string;
  command: string;
  description?: string;
  activeForm?: string;
  status:
    | "pending"
    | "running"
    | "in_progress"
    | "completed"
    | "failed"
    | "cancelled"
    | "input_required";
  pid?: number;
  output: string;
  exitCode?: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
  cwd?: string;
  owner?: string;
  blocks?: string[];
  blockedBy?: string[];
  comments?: TaskComment[];
  outputOffset?: number;
  metadata?: Record<string, unknown>;
  reason?: string; // For status change explanations
}

interface TaskOutputEvent {
  taskId: string;
  output: string;
  isError?: boolean;
}

interface TaskCompleteEvent {
  taskId: string;
  exitCode?: number;
}

interface TaskErrorEvent {
  taskId: string;
  error: string;
}

export class TaskManager extends EventEmitter {
  private tasks: Map<string, TaskInfo> = new Map();
  private processes: Map<string, import("child_process").ChildProcess> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  // MCP Protocol support
  private taskStore: TaskStore | null = null;
  private taskMessageQueue: TaskMessageQueue | null = null;
  private statusListeners: Set<(taskId: string, status: TaskInfo["status"]) => void> = new Set();

  setTaskStore(store: TaskStore): void {
    this.taskStore = store;
  }

  setTaskMessageQueue(queue: TaskMessageQueue): void {
    this.taskMessageQueue = queue;
  }

  onTaskStatusChange(callback: (taskId: string, status: TaskInfo["status"]) => void): void {
    this.statusListeners.add(callback);
  }

  private notifyStatusChange(taskId: string, status: TaskInfo["status"]): void {
    for (const listener of this.statusListeners) {
      try {
        listener(taskId, status);
      } catch (err) {
        console.error("Task status listener error:", err);
      }
    }
  }

  async create(
    id: string,
    command: string,
    cwd?: string,
    timeout?: number,
    description?: string,
    owner?: string,
    blocks?: string[],
    blockedBy?: string[],
    subject?: string,
    activeForm?: string,
    metadata?: Record<string, unknown>,
  ): Promise<TaskInfo> {
    const task: TaskInfo = {
      id,
      subject,
      command,
      description,
      activeForm,
      status: owner ? "pending" : "running",
      output: "",
      startedAt: new Date().toISOString(),
      cwd,
      owner,
      blocks: blocks || [],
      blockedBy: blockedBy || [],
      comments: [],
      outputOffset: 0,
      metadata,
    };

    const { spawn } = await import("child_process");
    const proc = spawn(command, {
      shell: true,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.tasks.set(id, task);
    this.processes.set(id, proc);
    task.pid = proc.pid;

    // Setup timeout if specified
    if (timeout && timeout > 0) {
      const timeoutHandle = setTimeout(async () => {
        await this.cancel(id);
      }, timeout * 1000);
      this.timeouts.set(id, timeoutHandle);
    }

    // Capture stdout
    proc.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      task.output += output;
      this.emit("output", { taskId: id, output, isError: false } as TaskOutputEvent);
    });

    // Capture stderr
    proc.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      task.output += output;
      this.emit("output", { taskId: id, output, isError: true } as TaskOutputEvent);
    });

    // Handle process exit
    proc.on("exit", (code: number | null) => {
      task.exitCode = code ?? 0;
      task.status = code === 0 ? "completed" : "failed";
      task.completedAt = new Date().toISOString();
      this.processes.delete(id);

      // Clear timeout if exists
      const timeoutHandle = this.timeouts.get(id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.timeouts.delete(id);
      }

      this.emit("complete", { taskId: id, exitCode: code } as TaskCompleteEvent);
    });

    // Handle process error
    proc.on("error", (err: Error) => {
      task.error = err.message;
      task.status = "failed";
      task.completedAt = new Date().toISOString();
      this.processes.delete(id);

      // Clear timeout if exists
      const timeoutHandle = this.timeouts.get(id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.timeouts.delete(id);
      }

      this.emit("error", { taskId: id, error: err.message } as TaskErrorEvent);
    });

    return task;
  }

  async get(id: string): Promise<TaskInfo | undefined> {
    return this.tasks.get(id);
  }

  async cancel(id: string): Promise<void> {
    const proc = this.processes.get(id);
    const task = this.tasks.get(id);

    if (proc && task) {
      proc.kill("SIGTERM");
      task.status = "cancelled";
      task.completedAt = new Date().toISOString();
      this.processes.delete(id);

      // Clear timeout if exists
      const timeoutHandle = this.timeouts.get(id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        this.timeouts.delete(id);
      }
    }
  }

  async list(): Promise<TaskInfo[]> {
    return Array.from(this.tasks.values());
  }

  async listByStatus(status: TaskInfo["status"]): Promise<TaskInfo[]> {
    return Array.from(this.tasks.values()).filter((t) => t.status === status);
  }

  async update(
    id: string,
    updates: {
      status?: TaskInfo["status"];
      owner?: string;
      blocks?: string[];
      blockedBy?: string[];
      description?: string;
      subject?: string;
      activeForm?: string;
      metadata?: Record<string, unknown>;
      reason?: string;
    },
  ): Promise<TaskInfo | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    // Validate status transitions (terminal states cannot be changed)
    const terminalStates = ["completed", "failed", "cancelled"] as const;
    if (updates.status !== undefined && terminalStates.includes(task.status as any)) {
      throw new Error(
        `Cannot update task "${id}" from terminal status "${task.status}" to "${updates.status}". Terminal states cannot transition to other states.`,
      );
    }

    if (updates.status !== undefined) {
      const oldStatus = task.status;
      task.status = updates.status;
      if (
        updates.status === "completed" ||
        updates.status === "failed" ||
        updates.status === "cancelled"
      ) {
        task.completedAt = new Date().toISOString();
      }
      if (updates.reason !== undefined) {
        task.reason = updates.reason;
      }
      // Notify status change
      this.notifyStatusChange(id, updates.status);
    }
    if (updates.owner !== undefined) task.owner = updates.owner;
    if (updates.blocks !== undefined) task.blocks = updates.blocks;
    if (updates.blockedBy !== undefined) task.blockedBy = updates.blockedBy;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.subject !== undefined) task.subject = updates.subject;
    if (updates.activeForm !== undefined) task.activeForm = updates.activeForm;
    if (updates.metadata !== undefined) task.metadata = updates.metadata;

    this.tasks.set(id, task);
    return task;
  }

  async addComment(id: string, text: string, author?: string): Promise<TaskInfo | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    if (!task.comments) task.comments = [];
    task.comments.push({
      text,
      timestamp: new Date().toISOString(),
      author,
    });

    this.tasks.set(id, task);
    return task;
  }

  async getOutput(
    id: string,
    since?: number,
  ): Promise<{ output: string; isComplete: boolean; exitCode?: number } | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const startOffset = since ?? task.outputOffset ?? 0;
    const output = task.output.substring(startOffset);
    task.outputOffset = task.output.length;

    return {
      output,
      isComplete:
        task.status === "completed" || task.status === "failed" || task.status === "cancelled",
      exitCode: task.exitCode,
    };
  }

  cleanup(): void {
    // Kill all running processes
    for (const [id, proc] of this.processes.entries()) {
      proc.kill("SIGTERM");
    }
    this.processes.clear();

    // Clear all timeouts
    for (const [id, timeout] of this.timeouts.entries()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    this.tasks.clear();
  }
}

// Global task manager instance
const globalTaskManager = new TaskManager();

export function getTaskManager(): TaskManager {
  return globalTaskManager;
}

export function createTaskTool(config?: OpenClawConfig): AnyAgentTool {
  const manager = getTaskManager();

  return {
    label: "Task",
    name: "task",
    description:
      "Execute long-running commands in the background. Returns immediately with a task ID for tracking.",
    parameters: TaskSchema,
    outputSchema: TaskOutputSchema,
    // @ts-expect-error - inputParamAliases is supported at runtime by the agent framework
    inputParamAliases: {
      cmd: "command",
      dir: "cwd",
      desc: "description",
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => true,

    // @ts-expect-error - description method shadows string property (runtime pattern)
    async description(params: Record<string, unknown>) {
      const command = (params.command as string) || "command";
      const description = params.description as string;
      if (description) {
        return `Running task: ${description}`;
      }
      return `Executing: ${command.substring(0, 50)}${command.length > 50 ? "..." : ""}`;
    },

    userFacingName() {
      return "Background Task";
    },

    async validateInput({ command }: { command?: string }) {
      if (!command || typeof command !== "string" || command.trim().length === 0) {
        return {
          result: false,
          message: "Command is required and must be a non-empty string",
          errorCode: 1,
        };
      }

      // Basic security check - reject dangerous commands
      const dangerousPatterns = [
        "rm -rf /",
        "rm -rf /*",
        "mkfs",
        "dd if=/dev/zero",
        ":(){:|:&};:",
        "chmod -R 777 /",
        "chown -R",
      ];

      const cmdLower = command.toLowerCase();
      for (const pattern of dangerousPatterns) {
        if (cmdLower.includes(pattern.toLowerCase())) {
          return {
            result: false,
            message: "Command contains potentially dangerous operations",
            errorCode: 2,
          };
        }
      }

      return { result: true };
    },

    async call(
      args: Record<string, unknown>,
      { abortController }: { abortController?: AbortController },
    ) {
      const params = args as Record<string, unknown>;
      const subject = readStringParam(params, "subject");
      const command = readStringParam(params, "command", { required: true });
      const cwd = readStringParam(params, "cwd");
      const timeout = readNumberParam(params, "timeout") || 0;
      const description = readStringParam(params, "description");
      const activeForm = readStringParam(params, "activeForm");
      const owner = readStringParam(params, "owner");
      const blocks = params.blocks as string[] | undefined;
      const blockedBy = params.blockedBy as string[] | undefined;
      const metadata = params.metadata as Record<string, unknown> | undefined;

      // Generate unique task ID
      const id = `task_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

      // Create the task
      const task = await manager.create(
        id,
        command,
        cwd,
        timeout,
        description,
        owner,
        blocks,
        blockedBy,
        subject,
        activeForm,
        metadata,
      );

      // Setup abort handler
      if (abortController?.signal) {
        abortController.signal.addEventListener("abort", async () => {
          await manager.cancel(id);
        });
      }

      return jsonResult({
        taskId: id,
        status: task.status,
        pid: task.pid,
        subject: task.subject,
        command: task.command,
        description: task.description,
        activeForm: task.activeForm,
        cwd: task.cwd,
        owner: task.owner,
        blocks: task.blocks,
        blockedBy: task.blockedBy,
        metadata: task.metadata,
        timeout: timeout > 0 ? timeout : undefined,
        message: `Task started successfully (PID: ${task.pid})`,
        startedAt: task.startedAt,
      });
    },
  };
}

// Additional tool: Get task status
export function createTaskGetTool(): AnyAgentTool {
  const manager = getTaskManager();

  return {
    label: "Get Task",
    name: "task_get",
    description: "Get the status and output of a background task",
    parameters: Type.Object({
      taskId: Type.String({ description: "The task ID to query" }),
    }),
    outputSchema: TaskGetOutputSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });

      const task = await manager.get(taskId);
      if (!task) {
        return jsonResult({
          error: `Task not found: ${taskId}`,
          errorCode: 1,
        });
      }

      return jsonResult({
        taskId: task.id,
        status: task.status,
        pid: task.pid,
        command: task.command,
        description: task.description,
        owner: task.owner,
        blocks: task.blocks,
        blockedBy: task.blockedBy,
        comments: task.comments,
        output: task.output,
        exitCode: task.exitCode,
        error: task.error,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        cwd: task.cwd,
      });
    },
  };
}

// Additional tool: List all tasks
export function createTaskListTool(): AnyAgentTool {
  const manager = getTaskManager();

  return {
    label: "List Tasks",
    name: "task_list",
    description: "List all background tasks",
    parameters: Type.Object({
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal("pending"),
            Type.Literal("running"),
            Type.Literal("completed"),
            Type.Literal("failed"),
            Type.Literal("cancelled"),
          ],
          {
            description: "Filter by status (optional)",
          },
        ),
      ),
      owner: Type.Optional(
        Type.String({
          description: "Filter by owner (optional)",
        }),
      ),
    }),
    outputSchema: TaskListOutputSchema,
    // @ts-expect-error - isReadOnly is supported at runtime by the agent framework
    isReadOnly: () => true,
    // @ts-expect-error - isConcurrencySafe is supported at runtime by the agent framework
    isConcurrencySafe: () => true,

    // execute method for compatibility with pi-tool-definition-adapter
    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const args = params as Record<string, unknown>;
      return this.call(args);
    },

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const status = params.status as TaskInfo["status"] | undefined;
      const owner = readStringParam(params, "owner");

      let tasks: TaskInfo[];
      if (status) {
        tasks = await manager.listByStatus(status);
      } else {
        tasks = await manager.list();
      }

      // Filter by owner if specified
      if (owner) {
        tasks = tasks.filter((t) => t.owner === owner);
      }

      return jsonResult({
        count: tasks.length,
        tasks: tasks.map((t) => ({
          taskId: t.id,
          subject: t.subject,
          status: t.status,
          owner: t.owner,
          pid: t.pid,
          command: t.command,
          description: t.description,
          activeForm: t.activeForm,
          blocks: t.blocks,
          blockedBy: t.blockedBy,
          startedAt: t.startedAt,
          completedAt: t.completedAt,
        })),
      });
    },
  };
}

// Additional tool: Cancel a task
export function createTaskCancelTool(): AnyAgentTool {
  const manager = getTaskManager();

  return {
    label: "Cancel Task",
    name: "task_cancel",
    description: "Cancel a running background task",
    parameters: Type.Object({
      taskId: Type.String({ description: "The task ID to cancel" }),
    }),
    outputSchema: TaskCancelOutputSchema,
    // @ts-expect-error - isReadOnly is supported at runtime by the agent framework
    isReadOnly: () => false,
    // @ts-expect-error - isConcurrencySafe is supported at runtime by the agent framework
    isConcurrencySafe: () => true,

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });

      const task = await manager.get(taskId);
      if (!task) {
        return jsonResult({
          error: `Task not found: ${taskId}`,
          errorCode: 1,
        });
      }

      if (task.status !== "running") {
        return jsonResult({
          message: `Task is not running (status: ${task.status})`,
          taskId,
          status: task.status,
        });
      }

      await manager.cancel(taskId);

      return jsonResult({
        message: "Task cancelled successfully",
        taskId,
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });
    },
  };
}

// Additional tool: Update a task
export function createTaskUpdateTool(): AnyAgentTool {
  const manager = getTaskManager();

  const TaskUpdateSchema = Type.Object({
    taskId: Type.String({ description: "The task ID to update" }),
    subject: Type.Optional(
      Type.String({
        description: "Task subject/title",
      }),
    ),
    description: Type.Optional(
      Type.String({
        description: "Task description",
      }),
    ),
    activeForm: Type.Optional(
      Type.String({
        description: "Active form description for team notifications",
      }),
    ),
    status: Type.Optional(
      Type.Union(
        [
          Type.Literal("pending"),
          Type.Literal("running"),
          Type.Literal("in_progress"),
          Type.Literal("completed"),
          Type.Literal("failed"),
          Type.Literal("cancelled"),
          Type.Literal("input_required"),
        ],
        {
          description: "New task status",
        },
      ),
    ),
    owner: Type.Optional(
      Type.String({
        description: "Task owner (agent name or ID)",
      }),
    ),
    blocks: Type.Optional(
      Type.Array(Type.String(), {
        description: "List of task IDs that this task blocks",
      }),
    ),
    blockedBy: Type.Optional(
      Type.Array(Type.String(), {
        description: "List of task IDs that block this task",
      }),
    ),
    metadata: Type.Optional(
      Type.Record(Type.String(), Type.Any(), {
        description: "Additional task metadata",
      }),
    ),
    comment: Type.Optional(
      Type.String({
        description: "Add a comment to the task",
      }),
    ),
    reason: Type.Optional(
      Type.String({
        description: "Reason for status change",
      }),
    ),
  });

  return {
    label: "Update Task",
    name: "task_update",
    description:
      "Update task status, owner, dependencies, or add comments. Use to claim tasks, mark completion, or track progress.",
    parameters: TaskUpdateSchema,
    outputSchema: TaskUpdateOutputSchema,
    // @ts-expect-error - inputParamAliases is supported at runtime by the agent framework
    inputParamAliases: {
      id: "taskId",
      task_id: "taskId",
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => true,

    // @ts-expect-error - description method shadows string property (runtime pattern)
    async description(params: Record<string, unknown>) {
      const taskId = (params.taskId as string) || "unknown";
      const status = params.status as string;
      const owner = params.owner as string;
      if (status) return `Updating task ${taskId}: status=${status}`;
      if (owner) return `Updating task ${taskId}: owner=${owner}`;
      return `Updating task ${taskId}`;
    },

    userFacingName() {
      return "Update Task";
    },

    async validateInput(params: Record<string, unknown>) {
      const taskId = readStringParam(params, "taskId");
      const status = params.status as string | undefined;
      const owner = readStringParam(params, "owner");
      const comment = readStringParam(params, "comment");

      if (!taskId && !status && !owner && !comment) {
        return {
          result: false,
          message: "At least one of taskId, status, owner, or comment must be provided",
          errorCode: 1,
        };
      }

      return { result: true };
    },

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const subject = readStringParam(params, "subject");
      const status = params.status as TaskInfo["status"] | undefined;
      const owner = readStringParam(params, "owner");
      const blocks = params.blocks as string[] | undefined;
      const blockedBy = params.blockedBy as string[] | undefined;
      const description = readStringParam(params, "description");
      const activeForm = readStringParam(params, "activeForm");
      const comment = readStringParam(params, "comment");
      const reason = readStringParam(params, "reason");
      const metadata = params.metadata as Record<string, unknown> | undefined;

      const task = await manager.get(taskId);
      if (!task) {
        return jsonResult({
          error: `Task not found: ${taskId}`,
          errorCode: 1,
        });
      }

      // Add comment if provided
      if (comment) {
        await manager.addComment(taskId, comment, owner);
      }

      // Update task fields
      try {
        const updated = await manager.update(taskId, {
          subject,
          status,
          owner,
          blocks,
          blockedBy,
          description,
          activeForm,
          metadata,
          reason,
        });

        if (!updated) {
          return jsonResult({
            error: `Failed to update task ${taskId}`,
            errorCode: 2,
          });
        }

        return jsonResult({
          message: "Task updated successfully",
          taskId: updated.id,
          status: updated.status,
          owner: updated.owner,
          blocks: updated.blocks,
          blockedBy: updated.blockedBy,
          description: updated.description,
          activeForm: updated.activeForm,
          subject: updated.subject,
          comments: updated.comments,
          completedAt: updated.completedAt,
        });
      } catch (err: any) {
        return jsonResult({
          error: err.message,
          errorCode: 3,
        });
      }
    },
  };
}

// Additional tool: Get task output
export function createTaskOutputTool(): AnyAgentTool {
  const manager = getTaskManager();

  return {
    label: "Task Output",
    name: "task_output",
    description:
      'Get output from a background task. Use "since" parameter to get only new output since last read.',
    parameters: Type.Object({
      taskId: Type.String({ description: "The task ID to get output from" }),
      since: Type.Optional(
        Type.Number({
          description: "Byte offset to read from (for incremental output)",
          default: 0,
        }),
      ),
    }),
    outputSchema: TaskOutputToolOutputSchema,
    // @ts-expect-error - isReadOnly is supported at runtime by the agent framework
    isReadOnly: () => true,
    // @ts-expect-error - isConcurrencySafe is supported at runtime by the agent framework
    isConcurrencySafe: () => true,

    async call(args: Record<string, unknown>) {
      const params = args as Record<string, unknown>;
      const taskId = readStringParam(params, "taskId", { required: true });
      const since = readNumberParam(params, "since");

      const result = await manager.getOutput(taskId, since);
      if (!result) {
        return jsonResult({
          error: `Task not found: ${taskId}`,
          errorCode: 1,
        });
      }

      return jsonResult({
        taskId,
        output: result.output,
        isComplete: result.isComplete,
        exitCode: result.exitCode,
        bytesRead: result.output.length,
        nextOffset: since ? since + result.output.length : undefined,
      });
    },
  };
}

// ============================================================================
// MCP PROTOCOL HANDLERS
// ============================================================================

/**
 * MCP Task Protocol Handler
 * Implements the MCP tasks/* methods for remote task control
 */
export class McpTaskProtocol {
  constructor(private manager: TaskManager) {}

  /**
   * Handle tasks/get method
   */
  async handleGet(
    params: { taskId: string },
    sessionId?: string,
  ): Promise<{
    task: Omit<
      TaskInfo,
      | "command"
      | "output"
      | "startedAt"
      | "completedAt"
      | "cwd"
      | "pid"
      | "exitCode"
      | "error"
      | "comments"
      | "outputOffset"
      | "metadata"
      | "reason"
      | "activeForm"
    > | null;
  }> {
    const task = await this.manager.get(params.taskId);
    if (!task) {
      return { task: null };
    }
    return {
      task: {
        id: task.id,
        subject: task.subject || "",
        description: task.description || "",
        status: task.status,
        blocks: task.blocks || [],
        blockedBy: task.blockedBy || [],
        owner: task.owner,
      },
    };
  }

  /**
   * Handle tasks/list method
   */
  async handleList(
    params?: { status?: TaskInfo["status"]; owner?: string },
    sessionId?: string,
  ): Promise<{
    tasks: Array<{ id: string; subject: string; status: TaskInfo["status"]; owner?: string }>;
  }> {
    let tasks = await this.manager.list();

    if (params?.status) {
      tasks = tasks.filter((t) => t.status === params.status);
    }
    if (params?.owner) {
      tasks = tasks.filter((t) => t.owner === params.owner);
    }

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        subject: t.subject || "",
        status: t.status,
        owner: t.owner,
      })),
    };
  }

  /**
   * Handle tasks/cancel method
   */
  async handleCancel(
    params: { taskId: string },
    sessionId?: string,
  ): Promise<{ success: boolean; taskId: string }> {
    const task = await this.manager.get(params.taskId);
    if (!task) {
      throw new Error(`Task not found: ${params.taskId}`);
    }

    const terminalStates = ["completed", "failed", "cancelled"] as const;
    if (terminalStates.includes(task.status as any)) {
      throw new Error(`Cannot cancel task in terminal status: ${task.status}`);
    }

    await this.manager.cancel(params.taskId);
    return { success: true, taskId: params.taskId };
  }

  /**
   * Handle tasks/result method
   */
  async handleResult(
    params: { taskId: string },
    sessionId?: string,
  ): Promise<{ result: string; exitCode?: number }> {
    const task = await this.manager.get(params.taskId);
    if (!task) {
      throw new Error(`Task not found: ${params.taskId}`);
    }

    const terminalStates = ["completed", "failed", "cancelled"] as const;
    if (!terminalStates.includes(task.status as any)) {
      throw new Error(`Task not yet complete (status: ${task.status})`);
    }

    return {
      result: task.output,
      exitCode: task.exitCode,
    };
  }

  /**
   * Register status change notifications
   */
  registerNotifications(
    onStatusChange: (taskId: string, status: TaskInfo["status"]) => void,
  ): void {
    this.manager.onTaskStatusChange(onStatusChange);
  }
}
