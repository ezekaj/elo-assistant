/**
 * Optimized Process Tree Killer
 *
 * Provides efficient process tree termination using:
 * 1. Process group killing with negative PID (`kill(-pid, signal)`)
 * 2. Parallel signal delivery for multiple processes
 * 3. Early exit detection to reduce wait time
 * 4. Graceful escalation: SIGTERM -> wait -> SIGKILL
 */

import { execSync, spawn } from "node:child_process";
import { platform } from "node:os";

export interface KillTreeOptions {
  /**
   * Signal to send first (default: SIGTERM)
   */
  signal?: NodeJS.Signals;
  /**
   * Grace period in ms before escalating to SIGKILL (default: 1000)
   */
  gracePeriodMs?: number;
  /**
   * Polling interval for early exit detection (default: 50ms)
   */
  pollIntervalMs?: number;
  /**
   * Use process group kill when available (default: true)
   */
  useProcessGroup?: boolean;
  /**
   * Force SIGKILL without grace period (default: false)
   */
  force?: boolean;
}

export interface KillTreeResult {
  success: boolean;
  killedPids: number[];
  failedPids: number[];
  usedProcessGroup: boolean;
  earlyExit: boolean;
  durationMs: number;
}

/**
 * Check if a process is still alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all child PIDs of a process (recursive).
 * Works on macOS and Linux.
 */
export function getChildPids(pid: number): number[] {
  const os = platform();
  const children: number[] = [];

  try {
    if (os === "darwin") {
      // macOS: use pgrep
      const output = execSync(`pgrep -P ${pid} 2>/dev/null || true`, {
        encoding: "utf-8",
        timeout: 1000,
      });
      for (const line of output.trim().split("\n")) {
        const childPid = parseInt(line, 10);
        if (!isNaN(childPid) && childPid > 0) {
          children.push(childPid);
          // Recursively get grandchildren
          children.push(...getChildPids(childPid));
        }
      }
    } else if (os === "linux") {
      // Linux: read from /proc
      const output = execSync(`cat /proc/${pid}/task/${pid}/children 2>/dev/null || true`, {
        encoding: "utf-8",
        timeout: 1000,
      });
      for (const childPidStr of output.trim().split(/\s+/)) {
        const childPid = parseInt(childPidStr, 10);
        if (!isNaN(childPid) && childPid > 0) {
          children.push(childPid);
          children.push(...getChildPids(childPid));
        }
      }
    }
  } catch {
    // Process may have exited
  }

  return children;
}

/**
 * Get process group ID for a process.
 */
export function getProcessGroupId(pid: number): number | null {
  try {
    const os = platform();
    if (os === "darwin" || os === "linux") {
      const output = execSync(`ps -o pgid= -p ${pid} 2>/dev/null || true`, {
        encoding: "utf-8",
        timeout: 1000,
      });
      const pgid = parseInt(output.trim(), 10);
      return isNaN(pgid) ? null : pgid;
    }
  } catch {
    // Process may have exited
  }
  return null;
}

/**
 * Send a signal to a process group (all processes in the group).
 * Uses negative PID to target the entire process group.
 */
export function killProcessGroup(pgid: number, signal: NodeJS.Signals): boolean {
  try {
    // Negative PID sends signal to entire process group
    process.kill(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send signal to a single process.
 */
export function killProcess(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for a process to exit with early exit detection.
 * Returns true if process exited, false if timeout reached.
 */
export async function waitForExit(
  pid: number,
  timeoutMs: number,
  pollIntervalMs: number = 50,
): Promise<{ exited: boolean; waitedMs: number }> {
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return { exited: true, waitedMs: Date.now() - startTime };
    }
    await sleep(Math.min(pollIntervalMs, deadline - Date.now()));
  }

  return { exited: !isProcessAlive(pid), waitedMs: Date.now() - startTime };
}

/**
 * Kill a process and all its descendants.
 * Uses process group kill when possible for efficiency.
 */
export async function killTree(
  pid: number,
  options: KillTreeOptions = {},
): Promise<KillTreeResult> {
  const {
    signal = "SIGTERM",
    gracePeriodMs = 1000,
    pollIntervalMs = 50,
    useProcessGroup = true,
    force = false,
  } = options;

  const startTime = Date.now();
  const killedPids: number[] = [];
  const failedPids: number[] = [];
  let usedProcessGroup = false;
  let earlyExit = false;

  // Check if process is alive
  if (!isProcessAlive(pid)) {
    return {
      success: true,
      killedPids: [],
      failedPids: [],
      usedProcessGroup: false,
      earlyExit: true,
      durationMs: 0,
    };
  }

  // Determine effective signal
  const effectiveSignal = force ? "SIGKILL" : signal;

  // Try process group kill first (most efficient)
  if (useProcessGroup) {
    const pgid = getProcessGroupId(pid);
    // Only use process group kill if PGID matches PID (we're the group leader)
    // or if we want to kill our own process group
    if (pgid !== null && pgid === pid) {
      usedProcessGroup = killProcessGroup(pgid, effectiveSignal);
      if (usedProcessGroup) {
        killedPids.push(pid);
      }
    }
  }

  // If process group kill didn't work, fall back to individual kills
  if (!usedProcessGroup) {
    // Get all descendant PIDs first (before killing parent)
    const descendantPids = getChildPids(pid);
    const allPids = [pid, ...descendantPids];

    // Send signal to all processes in parallel
    const killResults = await Promise.all(
      allPids.map(async (targetPid) => {
        const success = killProcess(targetPid, effectiveSignal);
        return { pid: targetPid, success };
      }),
    );

    for (const result of killResults) {
      if (result.success) {
        killedPids.push(result.pid);
      } else if (isProcessAlive(result.pid)) {
        failedPids.push(result.pid);
      }
    }
  }

  // If force mode, add a brief wait for SIGKILL to take effect
  if (force) {
    await sleep(50);
  } else if (effectiveSignal !== "SIGKILL" && gracePeriodMs > 0) {
    // Wait for graceful exit then escalate
    const waitResult = await waitForExit(pid, gracePeriodMs, pollIntervalMs);

    if (waitResult.exited) {
      earlyExit = true;
    } else {
      // Escalate to SIGKILL
      if (usedProcessGroup) {
        const pgid = getProcessGroupId(pid);
        if (pgid !== null) {
          killProcessGroup(pgid, "SIGKILL");
        }
      } else {
        // Kill remaining processes
        const stillAlive = [...killedPids, ...failedPids].filter(isProcessAlive);
        await Promise.all(stillAlive.map((p) => killProcess(p, "SIGKILL")));
      }

      // Brief wait for SIGKILL to take effect
      await sleep(100);
    }
  }

  return {
    success: !isProcessAlive(pid),
    killedPids,
    failedPids,
    usedProcessGroup,
    earlyExit,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Kill a process with early exit optimization.
 * Polls during grace period to detect early exit and avoid unnecessary wait.
 */
export async function killWithEarlyExit(
  pid: number,
  options: KillTreeOptions = {},
): Promise<KillTreeResult> {
  return killTree(pid, { ...options, useProcessGroup: true });
}

/**
 * Force kill a process and all descendants immediately.
 */
export async function forceKillTree(pid: number): Promise<KillTreeResult> {
  return killTree(pid, { force: true });
}

/**
 * Kill a session by sending SIGHUP to the process group.
 * Useful for TTY-attached processes.
 */
export function hangupSession(pid: number): boolean {
  const pgid = getProcessGroupId(pid);
  if (pgid !== null) {
    return killProcessGroup(pgid, "SIGHUP");
  }
  return killProcess(pid, "SIGHUP");
}

/**
 * Create a detached process group for a spawned process.
 * This allows the child to be killed as a group later.
 */
export function spawnWithProcessGroup(
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2] = {},
): ReturnType<typeof spawn> {
  return spawn(command, args, {
    ...options,
    detached: true, // Creates new process group
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
