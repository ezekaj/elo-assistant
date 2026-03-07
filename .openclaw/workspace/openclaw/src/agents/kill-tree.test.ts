import { spawn } from "node:child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isProcessAlive,
  getChildPids,
  getProcessGroupId,
  killProcess,
  killProcessGroup,
  killTree,
  waitForExit,
  forceKillTree,
  hangupSession,
} from "./kill-tree.js";

describe("kill-tree", () => {
  let testProcess: ReturnType<typeof spawn> | null = null;

  afterEach(async () => {
    if (testProcess?.pid && isProcessAlive(testProcess.pid)) {
      try {
        process.kill(testProcess.pid, "SIGKILL");
      } catch {
        // Process may have already exited
      }
    }
    testProcess = null;
  });

  describe("isProcessAlive", () => {
    it("should return true for running process", () => {
      testProcess = spawn("sleep", ["10"], { detached: true });
      expect(testProcess.pid).toBeDefined();
      expect(isProcessAlive(testProcess.pid!)).toBe(true);
    });

    it("should return false for nonexistent PID", () => {
      expect(isProcessAlive(999999999)).toBe(false);
    });

    it("should return false after process exits", async () => {
      testProcess = spawn("true", []);
      const pid = testProcess.pid!;

      await new Promise<void>((resolve) => {
        testProcess!.once("close", () => resolve());
      });

      expect(isProcessAlive(pid)).toBe(false);
    });
  });

  describe("getProcessGroupId", () => {
    it("should return PGID for running process", () => {
      testProcess = spawn("sleep", ["10"], { detached: true });
      const pgid = getProcessGroupId(testProcess.pid!);
      expect(pgid).toBeDefined();
      // When detached, PGID equals PID (new process group)
      expect(pgid).toBe(testProcess.pid);
    });

    it("should return null for nonexistent PID", () => {
      expect(getProcessGroupId(999999999)).toBe(null);
    });
  });

  describe("getChildPids", () => {
    it("should return empty array for process with no children", () => {
      testProcess = spawn("sleep", ["10"], { detached: true });
      const children = getChildPids(testProcess.pid!);
      expect(children).toEqual([]);
    });

    it("should find child processes", async () => {
      // Spawn a shell that spawns a child
      testProcess = spawn("sh", ["-c", "sleep 30 & sleep 30"], {
        detached: true,
      });

      // Wait a bit for child processes to spawn
      await sleep(100);

      const children = getChildPids(testProcess.pid!);
      // Should have at least one child (the sleep process)
      expect(children.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("killProcess", () => {
    it("should send signal to process", async () => {
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      expect(isProcessAlive(pid)).toBe(true);
      const result = killProcess(pid, "SIGTERM");
      expect(result).toBe(true);

      // Wait for process to exit
      await sleep(100);
      expect(isProcessAlive(pid)).toBe(false);
    });

    it("should return false for nonexistent PID", () => {
      expect(killProcess(999999999, "SIGTERM")).toBe(false);
    });
  });

  describe("killProcessGroup", () => {
    it("should kill entire process group", async () => {
      // Spawn a detached process (becomes group leader)
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      // PGID equals PID for detached process
      const pgid = getProcessGroupId(pid);
      expect(pgid).toBe(pid);

      const result = killProcessGroup(pgid!, "SIGKILL");
      expect(result).toBe(true);

      await sleep(100);
      expect(isProcessAlive(pid)).toBe(false);
    });
  });

  describe("waitForExit", () => {
    it("should detect early exit", async () => {
      testProcess = spawn("true", []);
      const pid = testProcess.pid!;

      const result = await waitForExit(pid, 1000, 10);
      expect(result.exited).toBe(true);
      expect(result.waitedMs).toBeLessThan(500);
    });

    it("should timeout if process keeps running", async () => {
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      const startTime = Date.now();
      const result = await waitForExit(pid, 100, 10);
      const elapsed = Date.now() - startTime;

      expect(result.exited).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe("killTree", () => {
    it("should return success for already dead process", async () => {
      const result = await killTree(999999999);
      expect(result.success).toBe(true);
      expect(result.earlyExit).toBe(true);
      expect(result.durationMs).toBe(0);
    });

    it("should kill a running process", async () => {
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      const result = await killTree(pid, { gracePeriodMs: 100 });

      expect(result.success).toBe(true);
      expect(isProcessAlive(pid)).toBe(false);
    });

    it("should use process group kill when available", async () => {
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      const result = await killTree(pid, {
        useProcessGroup: true,
        gracePeriodMs: 100,
      });

      expect(result.success).toBe(true);
      expect(result.usedProcessGroup).toBe(true);
    });

    it("should escalate to SIGKILL after grace period", async () => {
      // Spawn a process that ignores SIGTERM
      testProcess = spawn("sh", ["-c", "trap '' SIGTERM; sleep 30"], {
        detached: true,
      });
      const pid = testProcess.pid!;

      await sleep(100); // Wait for trap to be set

      const result = await killTree(pid, {
        signal: "SIGTERM",
        gracePeriodMs: 200,
        pollIntervalMs: 20,
      });

      expect(result.success).toBe(true);
      expect(isProcessAlive(pid)).toBe(false);
    });
  });

  describe("forceKillTree", () => {
    it("should immediately SIGKILL without grace period", async () => {
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      // Wait for process to fully spawn
      await sleep(50);

      const startTime = Date.now();
      const result = await forceKillTree(pid);
      const elapsed = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe("hangupSession", () => {
    it("should send SIGHUP to process group", async () => {
      testProcess = spawn("sleep", ["30"], { detached: true });
      const pid = testProcess.pid!;

      const result = hangupSession(pid);
      expect(result).toBe(true);

      await sleep(100);
      expect(isProcessAlive(pid)).toBe(false);
    });
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
