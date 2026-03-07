/**
 * Plugin Hooks System - Command Hook Execution
 *
 * Executes shell command hooks with proper stdin/stdout handling,
 * timeout management, and JSON output validation.
 */

import { spawn, ChildProcess } from "child_process";
import { validateHookOutput } from "./output-schema.js";
import { HookConfig, HookOutput } from "./types.js";

/**
 * Result from command hook execution
 */
export interface CommandHookResult {
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number;
  parsedOutput: HookOutput | null;
  validationError?: string;
  backgrounded?: boolean;
  processId?: string;
}

/**
 * Execute a command hook
 *
 * @param config - Hook configuration
 * @param stdin - JSON stdin to pass to command
 * @param env - Environment variables
 * @returns Command hook execution result
 */
export async function executeCommandHook(
  config: HookConfig,
  stdin: string,
  env: Record<string, string>,
): Promise<CommandHookResult> {
  const command = config.command!;
  const timeout = (config.timeout || 30) * 1000; // Default 30 seconds

  return new Promise((resolve) => {
    // Determine shell based on platform
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    let stdout = "";
    let stderr = "";
    let output = "";
    let processExited = false;

    // Spawn process
    const proc: ChildProcess = spawn(shell, shellArgs, {
      env: { ...process.env, ...env },
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    // Handle stdout
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      stdout += text;
      output += text;
    });

    // Handle stderr
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      stderr += text;
      output += text;
    });

    // Write stdin
    if (proc.stdin && !proc.stdin.destroyed) {
      proc.stdin.write(stdin, "utf8");
      proc.stdin.end();
    }

    // Handle timeout
    const timeoutId = setTimeout(() => {
      if (!processExited && proc.pid) {
        proc.kill("SIGTERM");

        // Force kill after grace period
        setTimeout(() => {
          if (proc.pid && !proc.killed) {
            proc.kill("SIGKILL");
          }
        }, 5000);
      }
    }, timeout);

    // Handle async mode
    if (config.async && !config.asyncTimeout) {
      // Background the process
      const processId = `async_hook_${proc.pid || Date.now()}`;

      resolve({
        stdout,
        stderr,
        output,
        exitCode: 0,
        parsedOutput: null,
        backgrounded: true,
        processId,
      });
      return;
    }

    // Handle process exit
    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      processExited = true;

      // Parse JSON output
      let parsedOutput: HookOutput | null = null;
      let validationError: string | undefined;

      try {
        const trimmed = stdout.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          const jsonOutput = JSON.parse(trimmed);
          const validation = validateHookOutput(jsonOutput);

          if (validation.valid && validation.data) {
            parsedOutput = validation.data;
          } else {
            validationError = validation.error;
          }
        }
      } catch {
        // Not JSON output, that's ok for some hooks
      }

      resolve({
        stdout,
        stderr,
        output,
        exitCode: code || 0,
        parsedOutput,
        validationError,
      });
    });

    // Handle process error
    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      processExited = true;

      resolve({
        stdout,
        stderr,
        output,
        exitCode: -1,
        parsedOutput: null,
        validationError: `Failed to execute command: ${err.message}`,
      });
    });

    // Handle EPIPE (command closed stdin early)
    proc.stdin?.on("error", (err) => {
      if (err.message.includes("EPIPE")) {
        // Command closed stdin early, continue execution
      }
    });
  });
}

/**
 * Build environment variables for hook execution
 */
export function buildHookEnv(
  context: Record<string, unknown>,
  pluginRoot?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env,
    CLAUDE_PROJECT_DIR: process.cwd(),
  };

  // Add session info
  if (context.session_id) {
    env.CLAUDE_SESSION_ID = context.session_id as string;
  }

  // Add transcript path
  if (context.transcript_path) {
    env.CLAUDE_TRANSCRIPT_PATH = context.transcript_path as string;
  }

  // Add plugin root if provided
  if (pluginRoot) {
    env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  }

  // Add CLAUDE_ENV_FILE for SessionStart/Setup hooks
  if (context.hook_event_name === "SessionStart" || context.hook_event_name === "Setup") {
    // This would be set by the session management system
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
      env.CLAUDE_ENV_FILE = envFile;
    }
  }

  return env;
}

/**
 * Format hook command for display
 */
export function formatHookCommand(config: HookConfig): string {
  const parts: string[] = [];

  if (config.command) {
    parts.push(config.command);
  }

  if (config.timeout) {
    parts.push(`(timeout: ${config.timeout}s)`);
  }

  if (config.async) {
    parts.push("(async)");
  }

  return parts.join(" ");
}
