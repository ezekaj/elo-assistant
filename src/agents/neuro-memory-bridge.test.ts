import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NeuroMemoryBridge, type NeuroMemoryConfig } from "./neuro-memory-bridge.js";

// Create mock process
function createMockProcess() {
  const callbacks: Record<string, Function[]> = {};
  let stdinBuffer = "";

  return {
    stdin: {
      write: vi.fn((data: string) => {
        stdinBuffer += data;
        return true;
      }),
    },
    stdout: {
      on: vi.fn((event: string, cb: Function) => {
        callbacks[`stdout:${event}`] = callbacks[`stdout:${event}`] || [];
        callbacks[`stdout:${event}`].push(cb);
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: Function) => {
        callbacks[`stderr:${event}`] = callbacks[`stderr:${event}`] || [];
        callbacks[`stderr:${event}`].push(cb);
      }),
    },
    on: vi.fn((event: string, cb: Function) => {
      callbacks[event] = callbacks[event] || [];
      callbacks[event].push(cb);
    }),
    kill: vi.fn((signal?: string) => {
      // Trigger exit callback
      const exitCbs = callbacks["exit"] || [];
      exitCbs.forEach((cb) => cb(0));
    }),
    _callbacks: callbacks,
    _emitStderr: (data: string) => {
      const cbs = callbacks["stderr:data"] || [];
      cbs.forEach((cb) => cb(Buffer.from(data)));
    },
    _emitStdout: (data: string) => {
      const cbs = callbacks["stdout:data"] || [];
      cbs.forEach((cb) => cb(Buffer.from(data)));
    },
    _emitExit: (code: number) => {
      const cbs = callbacks["exit"] || [];
      cbs.forEach((cb) => cb(code));
    },
    _emitError: (err: Error) => {
      const cbs = callbacks["error"] || [];
      cbs.forEach((cb) => cb(err));
    },
  };
}

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock logging
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("NeuroMemoryBridge", () => {
  let bridge: NeuroMemoryBridge;
  let mockProcess: ReturnType<typeof createMockProcess>;

  const defaultConfig: NeuroMemoryConfig = {
    agentPath: "/test/neuro-memory-agent",
    pythonPath: "python3",
    inputDim: 768,
    autoConsolidate: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockProcess = createMockProcess();

    // Import spawn after clearing mocks
    const { spawn } = await import("node:child_process");
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    bridge = new NeuroMemoryBridge(defaultConfig);
  });

  afterEach(async () => {
    if (bridge) {
      try {
        await bridge.stop();
      } catch {}
    }
  });

  describe("constructor", () => {
    it("should use default values when not specified", () => {
      const minimalConfig = { agentPath: "/test/path" };
      const b = new NeuroMemoryBridge(minimalConfig);
      expect(b).toBeDefined();
      expect(b.isRunning()).toBe(false);
    });

    it("should accept full config", () => {
      const fullConfig: NeuroMemoryConfig = {
        agentPath: "/custom/path",
        pythonPath: "python3.11",
        inputDim: 512,
        autoConsolidate: true,
        consolidateIntervalMs: 1800000,
      };
      const b = new NeuroMemoryBridge(fullConfig);
      expect(b).toBeDefined();
    });
  });

  describe("isRunning", () => {
    it("should return false before start", () => {
      expect(bridge.isRunning()).toBe(false);
    });

    it("should return true after successful start", async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
      expect(bridge.isRunning()).toBe(true);
    });

    it("should return false after stop", async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;

      await bridge.stop();
      expect(bridge.isRunning()).toBe(false);
    });
  });

  describe("start", () => {
    it("should spawn Python MCP server", async () => {
      const { spawn } = await import("node:child_process");

      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;

      expect(spawn).toHaveBeenCalledWith(
        "python3",
        ["/test/neuro-memory-agent/mcp_server.py"],
        expect.objectContaining({
          cwd: "/test/neuro-memory-agent",
          stdio: ["pipe", "pipe", "pipe"],
        }),
      );
    });

    it("should reject on spawn error", async () => {
      vi.useFakeTimers();

      const startPromise = bridge.start();

      // Trigger error before timeout
      mockProcess._emitError(new Error("Spawn failed"));

      await expect(startPromise).rejects.toThrow("Spawn failed");

      vi.useRealTimers();
    });

    it("should reject on startup timeout", async () => {
      vi.useFakeTimers();

      const startPromise = bridge.start();

      // Advance past 10s timeout without server starting
      vi.advanceTimersByTime(11000);

      await expect(startPromise).rejects.toThrow("startup timeout");

      vi.useRealTimers();
    });
  });

  describe("stop", () => {
    it("should send SIGTERM to process", async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;

      await bridge.stop();
      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should handle already stopped process", async () => {
      const b = new NeuroMemoryBridge(defaultConfig);
      await b.stop(); // Should not throw
      expect(mockProcess.kill).not.toHaveBeenCalled();
    });
  });

  describe("storeMemory", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should send store request with content", async () => {
      const storePromise = bridge.storeMemory("Test memory", { source: "test" });

      // Check request was written
      expect(mockProcess.stdin.write).toHaveBeenCalled();
      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      expect(request.method).toBe("store_memory");
      expect(request.params.content).toBe("Test memory");
      expect(request.params.metadata).toEqual({ source: "test" });

      // Send response
      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: { stored: true, episode_id: "ep-123", surprise: 0.85, is_novel: true },
        }) + "\n",
      );

      const result = await storePromise;
      expect(result.stored).toBe(true);
      expect(result.episode_id).toBe("ep-123");
    });

    it("should handle non-novel memories", async () => {
      const storePromise = bridge.storeMemory("duplicate");

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: { stored: false, surprise: 0.1, is_novel: false, reason: "Not surprising" },
        }) + "\n",
      );

      const result = await storePromise;
      expect(result.stored).toBe(false);
      expect(result.is_novel).toBe(false);
    });

    it("should throw if not running", async () => {
      await bridge.stop();
      await expect(bridge.storeMemory("test")).rejects.toThrow("not running");
    });
  });

  describe("storeMemoryWithEmbedding", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should include embedding in request", async () => {
      const embedding = [0.1, 0.2, 0.3];
      const storePromise = bridge.storeMemoryWithEmbedding("content", embedding);

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      expect(request.params.embedding).toEqual(embedding);

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: { stored: true, surprise: 0.9, is_novel: true },
        }) + "\n",
      );

      await storePromise;
    });
  });

  describe("retrieveMemories", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should send retrieve request with query", async () => {
      const retrievePromise = bridge.retrieveMemories("find this", 5);

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      expect(request.method).toBe("retrieve_memories");
      expect(request.params.query).toBe("find this");
      expect(request.params.k).toBe(5);

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: [
            {
              content: { text: "Memory 1" },
              surprise: 0.7,
              timestamp: "2026-02-21T00:00:00",
              similarity: 0.95,
            },
          ],
        }) + "\n",
      );

      const result = await retrievePromise;
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toBe("Memory 1");
    });

    it("should return empty array for no results", async () => {
      const retrievePromise = bridge.retrieveMemories("nothing");

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: [],
        }) + "\n",
      );

      const result = await retrievePromise;
      expect(result).toEqual([]);
    });
  });

  describe("retrieveMemoriesByEmbedding", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should send embedding in request", async () => {
      const embedding = [0.5, 0.6, 0.7];
      const retrievePromise = bridge.retrieveMemoriesByEmbedding(embedding, 10);

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      expect(request.params.embedding).toEqual(embedding);
      expect(request.params.k).toBe(10);

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: [],
        }) + "\n",
      );

      await retrievePromise;
    });
  });

  describe("consolidateMemories", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should run consolidation", async () => {
      const consolidatePromise = bridge.consolidateMemories();

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      expect(request.method).toBe("consolidate_memories");

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: { replay_count: 50, schemas_extracted: 3, schemas: ["s1", "s2", "s3"] },
        }) + "\n",
      );

      const result = await consolidatePromise;
      expect(result.replay_count).toBe(50);
      expect(result.schemas_extracted).toBe(3);
    });
  });

  describe("getStats", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should return statistics", async () => {
      const statsPromise = bridge.getStats();

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      expect(request.method).toBe("get_stats");

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          result: {
            total_episodes: 42,
            mean_surprise: 0.65,
            std_surprise: 0.15,
            observation_count: 100,
          },
        }) + "\n",
      );

      const result = await statsPromise;
      expect(result.total_episodes).toBe(42);
      expect(result.mean_surprise).toBe(0.65);
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should reject on error response", async () => {
      const storePromise = bridge.storeMemory("test");

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      mockProcess._emitStdout(
        JSON.stringify({
          id: request.id,
          error: "Something went wrong",
        }) + "\n",
      );

      await expect(storePromise).rejects.toThrow("Something went wrong");
    });

    it("should timeout on no response", async () => {
      vi.useFakeTimers();

      const storePromise = bridge.storeMemory("test");

      vi.advanceTimersByTime(31000);

      await expect(storePromise).rejects.toThrow("timeout");

      vi.useRealTimers();
    });
  });

  describe("buffer handling", () => {
    beforeEach(async () => {
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;
    });

    it("should handle multiple responses", async () => {
      const store1 = bridge.storeMemory("m1");
      const store2 = bridge.storeMemory("m2");

      const data1 = mockProcess.stdin.write.mock.calls[0][0];
      const data2 = mockProcess.stdin.write.mock.calls[1][0];
      const req1 = JSON.parse(data1);
      const req2 = JSON.parse(data2);

      mockProcess._emitStdout(
        JSON.stringify({ id: req1.id, result: { stored: true, surprise: 0.5, is_novel: true } }) +
          "\n" +
          JSON.stringify({ id: req2.id, result: { stored: true, surprise: 0.6, is_novel: true } }) +
          "\n",
      );

      const [r1, r2] = await Promise.all([store1, store2]);
      expect(r1.stored).toBe(true);
      expect(r2.stored).toBe(true);
    });

    it("should handle partial responses", async () => {
      const storePromise = bridge.storeMemory("test");

      const writtenData = mockProcess.stdin.write.mock.calls[0][0];
      const request = JSON.parse(writtenData);

      const response =
        JSON.stringify({
          id: request.id,
          result: { stored: true, surprise: 0.5, is_novel: true },
        }) + "\n";

      // Send in two chunks
      mockProcess._emitStdout(response.slice(0, 20));
      mockProcess._emitStdout(response.slice(20));

      const result = await storePromise;
      expect(result.stored).toBe(true);
    });
  });

  describe("auto-consolidation", () => {
    it("should not start timer when disabled", async () => {
      const config: NeuroMemoryConfig = {
        ...defaultConfig,
        autoConsolidate: false,
      };

      bridge = new NeuroMemoryBridge(config);
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;

      // Bridge should be running without auto-consolidation
      expect(bridge.isRunning()).toBe(true);
      // No stdin writes should have happened (no consolidation calls)
      expect(mockProcess.stdin.write).toHaveBeenCalledTimes(0);
    });

    it("should start timer when enabled", async () => {
      vi.useFakeTimers();

      const config: NeuroMemoryConfig = {
        ...defaultConfig,
        autoConsolidate: true,
        consolidateIntervalMs: 1000, // Short for testing
      };

      bridge = new NeuroMemoryBridge(config);
      const startPromise = bridge.start();
      mockProcess._emitStderr("MCP Server started\n");
      await startPromise;

      // Advance past consolidation interval
      vi.advanceTimersByTime(1100);

      // Should have sent consolidation request
      const calls = mockProcess.stdin.write.mock.calls;
      const consolidationCall = calls.find((c: any) => {
        try {
          const req = JSON.parse(c[0]);
          return req.method === "consolidate_memories";
        } catch {
          return false;
        }
      });

      // Respond to any pending consolidation
      if (consolidationCall) {
        const req = JSON.parse(consolidationCall[0]);
        mockProcess._emitStdout(
          JSON.stringify({
            id: req.id,
            result: { replay_count: 0, schemas_extracted: 0, schemas: [] },
          }) + "\n",
        );
      }

      vi.useRealTimers();
    });
  });
});

describe("singleton", () => {
  it("should export singleton functions", async () => {
    // Re-import to get fresh module
    const module = await import("./neuro-memory-bridge.js");
    expect(typeof module.initNeuroMemoryBridge).toBe("function");
    expect(typeof module.getNeuroMemoryBridge).toBe("function");
  });
});
