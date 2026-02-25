/**
 * Shell Context Memory for Exec Tool
 *
 * Tracks command history and working directory.
 * Provides context for AI agents.
 */

export interface CommandHistory {
  command: string;
  exitCode: number | null;
  outputPreview: string;
  timestamp: number;
  durationMs: number;
  riskLevel?: string;
}

export interface ShellContext {
  sessionId: string;
  cwd: string;
  env: Record<string, string>;
  history: CommandHistory[];
}

const MAX_HISTORY = 50;
const OUTPUT_PREVIEW_LENGTH = 200;

class ShellContextManager {
  private contexts = new Map<string, ShellContext>();

  /**
   * Get or create a shell context
   */
  getOrCreate(sessionId: string, cwd?: string): ShellContext {
    let ctx = this.contexts.get(sessionId);
    if (!ctx) {
      ctx = {
        sessionId,
        cwd: cwd || process.cwd(),
        env: {},
        history: [],
      };
      this.contexts.set(sessionId, ctx);
    }
    return ctx;
  }

  /**
   * Add a command to history
   */
  addCommand(
    sessionId: string,
    entry: {
      command: string;
      exitCode: number | null;
      output: string;
      durationMs: number;
      riskLevel?: string;
    },
  ): void {
    const ctx = this.getOrCreate(sessionId);

    ctx.history.push({
      command: entry.command,
      exitCode: entry.exitCode,
      outputPreview: entry.output.slice(0, OUTPUT_PREVIEW_LENGTH),
      timestamp: Date.now(),
      durationMs: entry.durationMs,
      riskLevel: entry.riskLevel,
    });

    // Trim history
    if (ctx.history.length > MAX_HISTORY) {
      ctx.history = ctx.history.slice(-MAX_HISTORY);
    }
  }

  /**
   * Get context summary for AI
   */
  getContextSummary(sessionId: string, maxCommands = 10): string {
    const ctx = this.contexts.get(sessionId);
    if (!ctx || ctx.history.length === 0) {
      return "";
    }

    const recent = ctx.history.slice(-maxCommands);
    const lines = recent.map((h, i) => {
      const status = h.exitCode === 0 ? "✓" : h.exitCode === null ? "?" : "✗";
      const preview = h.outputPreview.replace(/\n/g, " ").trim();
      const previewStr = preview ? ` → ${preview.slice(0, 50)}...` : "";
      return `${i + 1}. [${status}] ${h.command} (${h.durationMs}ms)${previewStr}`;
    });

    return [
      `Recent commands in session ${sessionId}:`,
      ...lines,
      `Current directory: ${ctx.cwd}`,
    ].join("\n");
  }

  /**
   * Update working directory
   */
  setCwd(sessionId: string, cwd: string): void {
    const ctx = this.getOrCreate(sessionId);
    ctx.cwd = cwd;
  }

  /**
   * Get working directory
   */
  getCwd(sessionId: string): string | null {
    return this.contexts.get(sessionId)?.cwd || null;
  }

  /**
   * Set environment variable
   */
  setEnv(sessionId: string, key: string, value: string): void {
    const ctx = this.getOrCreate(sessionId);
    ctx.env[key] = value;
  }

  /**
   * Get environment variables
   */
  getEnv(sessionId: string): Record<string, string> {
    return this.contexts.get(sessionId)?.env || {};
  }

  /**
   * Get last N commands
   */
  getLastCommands(sessionId: string, n = 5): CommandHistory[] {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return [];
    return ctx.history.slice(-n);
  }

  /**
   * Get last failed command
   */
  getLastFailure(sessionId: string): CommandHistory | null {
    const ctx = this.contexts.get(sessionId);
    if (!ctx) return null;

    for (let i = ctx.history.length - 1; i >= 0; i--) {
      if (ctx.history[i].exitCode !== 0 && ctx.history[i].exitCode !== null) {
        return ctx.history[i];
      }
    }
    return null;
  }

  /**
   * Clear context
   */
  clear(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  /**
   * Clear all contexts
   */
  clearAll(): void {
    this.contexts.clear();
  }

  /**
   * List active sessions
   */
  listSessions(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Get full context
   */
  getContext(sessionId: string): ShellContext | null {
    return this.contexts.get(sessionId) || null;
  }
}

// Singleton instance
let contextManagerInstance: ShellContextManager | null = null;

export function getShellContextManager(): ShellContextManager {
  if (!contextManagerInstance) {
    contextManagerInstance = new ShellContextManager();
  }
  return contextManagerInstance;
}

export function resetShellContextManager(): void {
  contextManagerInstance = null;
}

/**
 * Convenience function to add command to history
 */
export function recordCommand(
  sessionId: string,
  command: string,
  exitCode: number | null,
  output: string,
  durationMs: number,
  riskLevel?: string,
): void {
  getShellContextManager().addCommand(sessionId, {
    command,
    exitCode,
    output,
    durationMs,
    riskLevel,
  });
}

/**
 * Convenience function to get context summary
 */
export function getContextSummary(sessionId: string): string {
  return getShellContextManager().getContextSummary(sessionId);
}
