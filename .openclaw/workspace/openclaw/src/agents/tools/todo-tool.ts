/**
 * TodoWrite Tool
 *
 * Session-scoped progress tracking for agents.
 * Based on Claude Code's TodoWrite pattern - tracks work within a conversation.
 * 
 * Key features:
 * - content: Imperative form ("Fix the bug")
 * - activeForm: Present continuous ("Fixing the bug") 
 * - status: pending | in_progress | completed
 */

import { Type } from "@sinclair/typebox";
import { jsonResult, type AnyAgentTool } from "./common.js";

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const TodoStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
]);

const TodoItemSchema = Type.Object({
  content: Type.String({
    minLength: 1,
    description: "Task description in imperative form (e.g., 'Fix the login bug')",
  }),
  status: TodoStatusSchema,
  activeForm: Type.String({
    minLength: 1,
    description: "Present continuous form (e.g., 'Fixing the login bug')",
  }),
});

const TodoWriteInputSchema = Type.Object({
  todos: Type.Array(TodoItemSchema, {
    description: "The updated todo list",
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSION-SCOPED STORAGE
// ═══════════════════════════════════════════════════════════════════════════

// Store todos per session (sessionKey -> todos)
const sessionTodos = new Map<string, TodoItem[]>();

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

/**
 * Get todos for a session
 */
export function getSessionTodos(sessionKey: string): TodoItem[] {
  return sessionTodos.get(sessionKey) ?? [];
}

/**
 * Set todos for a session
 */
export function setSessionTodos(sessionKey: string, todos: TodoItem[]): void {
  // Clear if all completed (all done = reset)
  const allDone = todos.length > 0 && todos.every((t) => t.status === "completed");
  if (allDone) {
    sessionTodos.delete(sessionKey);
  } else {
    sessionTodos.set(sessionKey, todos);
  }
}

/**
 * Clear todos for a session
 */
export function clearSessionTodos(sessionKey: string): void {
  sessionTodos.delete(sessionKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL DEFINITION
// ═══════════════════════════════════════════════════════════════════════════

const TODO_DESCRIPTION = `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos
6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Task States and Management

1. **Task States**: Use these states to track progress:
   - pending: Task not yet started
   - in_progress: Currently working on (limit to ONE task at a time)
   - completed: Task finished successfully

   **IMPORTANT**: Task descriptions must have two forms:
   - content: The imperative form describing what needs to be done (e.g., "Run tests", "Build the project")
   - activeForm: The present continuous form shown during execution (e.g., "Running tests", "Building the project")

2. **Task Management**:
   - Update task status in real-time as you work
   - Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
   - Exactly ONE task must be in_progress at any time (not less, not more)
   - Complete current tasks before starting new ones
   - Remove tasks that are no longer relevant from the list entirely

3. **Task Completion Requirements**:
   - ONLY mark a task as completed when you have FULLY accomplished it
   - If you encounter errors, blockers, or cannot finish, keep the task as in_progress
   - When blocked, create a new task describing what needs to be resolved
   - Never mark a task as completed if:
     - Tests are failing
     - Implementation is partial
     - You encountered unresolved errors
     - You couldn't find necessary files or dependencies

4. **Task Breakdown**:
   - Create specific, actionable items
   - Break complex tasks into smaller, manageable steps
   - Use clear, descriptive task names
   - Always provide both forms:
     - content: "Fix authentication bug"
     - activeForm: "Fixing authentication bug"

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.`;

/**
 * Create the TodoWrite tool for agents
 */
export function createTodoTool(opts?: { agentSessionKey?: string }): AnyAgentTool {
  const sessionKey = opts?.agentSessionKey ?? "default";

  return {
    name: "TodoWrite",
    label: "TodoWrite",
    description: TODO_DESCRIPTION,
    parameters: TodoWriteInputSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const rawTodos = params.todos;
      const todos = Array.isArray(rawTodos) ? rawTodos : [];

      // Get old todos
      const oldTodos = getSessionTodos(sessionKey);

      // Validate and normalize todos
      const normalizedTodos: TodoItem[] = todos.map((t) => ({
        content: t.content,
        status: t.status as "pending" | "in_progress" | "completed",
        activeForm: t.activeForm,
      }));

      // Store new todos
      setSessionTodos(sessionKey, normalizedTodos);

      return jsonResult({
        oldTodos: oldTodos.map((t) => ({
          content: t.content,
          status: t.status,
          activeForm: t.activeForm,
        })),
        newTodos: normalizedTodos.map((t) => ({
          content: t.content,
          status: t.status,
          activeForm: t.activeForm,
        })),
      });
    },
  };
}

/**
 * Get todos as a formatted string (for system prompts)
 */
export function getTodosAsPrompt(sessionKey: string): string | null {
  const todos = getSessionTodos(sessionKey);
  if (todos.length === 0) return null;

  const lines = todos.map((t) => {
    const check = t.status === "completed" ? "☑" : t.status === "in_progress" ? "▶" : "○";
    return `${check} ${t.content}`;
  });

  return `Current todos:\n${lines.join("\n")}`;
}

/**
 * Get reminder if todos haven't been updated
 */
export function getTodoReminder(sessionKey: string): string | null {
  const todos = getSessionTodos(sessionKey);
  
  if (todos.length === 0) {
    return null;
  }

  const inProgress = todos.filter((t) => t.status === "in_progress");
  if (inProgress.length === 0) {
    return `You have ${todos.length} todos but none are in_progress. Mark one as in_progress before starting work.`;
  }

  return null;
}
