/**
 * Neuro-Memory-Agent Bridge
 *
 * Connects OpenClaw's event mesh to the neuro-memory-agent Python system
 * for episodic memory with Bayesian surprise detection, consolidation, and retrieval.
 */

import { spawn, ChildProcess } from "node:child_process";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("neuro-memory");

export type NeuroMemoryConfig = {
  pythonPath?: string;
  agentPath: string;
  inputDim?: number;
  autoConsolidate?: boolean;
  consolidateIntervalMs?: number;
};

export type Episode = {
  id: string;
  content: {
    text: string;
    metadata: Record<string, unknown>;
  };
  surprise: number;
  timestamp: string;
  similarity?: number;
};

export type StoreResult = {
  stored: boolean;
  episode_id?: string;
  surprise: number;
  is_novel: boolean;
  reason?: string;
};

export type ConsolidationResult = {
  replay_count: number;
  schemas_extracted: number;
  schemas: string[];
};

export type MemoryStats = {
  total_episodes: number;
  mean_surprise: number;
  std_surprise: number;
  observation_count: number;
};

/**
 * Neuro-Memory-Agent Bridge
 *
 * Uses MCP protocol over stdio to communicate with Python memory system
 */
export class NeuroMemoryBridge {
  private process: ChildProcess | null = null;
  private config: NeuroMemoryConfig;
  private requestCallbacks: Map<string, { resolve: Function; reject: Function }> = new Map();
  private requestId = 0;
  private buffer = "";
  private isReady = false;
  private consolidateTimer?: ReturnType<typeof setInterval>;

  constructor(config: NeuroMemoryConfig) {
    this.config = {
      pythonPath: config.pythonPath || "python3",
      inputDim: config.inputDim || 768,
      autoConsolidate: config.autoConsolidate ?? true,
      consolidateIntervalMs: config.consolidateIntervalMs || 3600000, // 1 hour
      ...config,
    };
  }

  /**
   * Start the neuro-memory-agent MCP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      log.info(`Starting neuro-memory-agent from ${this.config.agentPath}`);

      this.process = spawn(this.config.pythonPath!, [`${this.config.agentPath}/mcp_server.py`], {
        cwd: this.config.agentPath,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.process.stderr?.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg.includes("MCP Server started")) {
          this.isReady = true;
          log.info("✅ Neuro-memory-agent MCP server ready");

          // Start auto-consolidation if enabled
          if (this.config.autoConsolidate) {
            this.startAutoConsolidation();
          }

          resolve();
        } else {
          log.debug("[neuro-memory stderr]", msg);
        }
      });

      this.process.stdout?.on("data", (data) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      this.process.on("error", (error) => {
        log.error("Neuro-memory-agent process error:", error);
        this.isReady = false;
        reject(error);
      });

      this.process.on("exit", (code) => {
        log.warn(`Neuro-memory-agent exited with code ${code}`);
        this.isReady = false;
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error("Neuro-memory-agent startup timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Stop the neuro-memory-agent MCP server
   */
  async stop(): Promise<void> {
    if (this.consolidateTimer) {
      clearInterval(this.consolidateTimer);
    }

    if (this.process) {
      return new Promise((resolve) => {
        this.process!.on("exit", () => {
          log.info("Neuro-memory-agent stopped");
          resolve();
        });
        this.process!.kill("SIGTERM");

        // Force kill after 5s
        setTimeout(() => {
          if (this.process) {
            this.process.kill("SIGKILL");
          }
        }, 5000);
      });
    }
  }

  /**
   * Store a memory episode (embedding auto-generated in Python)
   */
  async storeMemory(content: string, metadata?: Record<string, unknown>): Promise<StoreResult> {
    this.ensureReady();
    return this.request("store_memory", { content, metadata });
  }

  /**
   * Store a memory episode with provided embedding
   */
  async storeMemoryWithEmbedding(
    content: string,
    embedding: number[],
    metadata?: Record<string, unknown>,
  ): Promise<StoreResult> {
    this.ensureReady();
    return this.request("store_memory", { content, embedding, metadata });
  }

  /**
   * Retrieve relevant memories (using text query)
   */
  async retrieveMemories(query: string, k: number = 5): Promise<Episode[]> {
    this.ensureReady();
    return this.request("retrieve_memories", { query, k });
  }

  /**
   * Retrieve relevant memories (using embedding)
   */
  async retrieveMemoriesByEmbedding(queryEmbedding: number[], k: number = 5): Promise<Episode[]> {
    this.ensureReady();
    return this.request("retrieve_memories", { embedding: queryEmbedding, k });
  }

  /**
   * Run memory consolidation (sleep-like replay)
   */
  async consolidateMemories(): Promise<ConsolidationResult> {
    this.ensureReady();
    return this.request("consolidate_memories", {});
  }

  /**
   * Get memory system statistics
   */
  async getStats(): Promise<MemoryStats> {
    this.ensureReady();
    return this.request("get_stats", {});
  }

  /**
   * Check if bridge is ready
   */
  isRunning(): boolean {
    return this.isReady && this.process !== null;
  }

  /**
   * Send request to MCP server
   */
  private async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = String(++this.requestId);

      this.requestCallbacks.set(id, { resolve, reject });

      const request = JSON.stringify({ id, method, params }) + "\n";
      this.process?.stdin?.write(request);

      // Timeout after 30s
      setTimeout(() => {
        if (this.requestCallbacks.has(id)) {
          this.requestCallbacks.delete(id);
          reject(new Error(`Request ${method} timeout`));
        }
      }, 30000);
    });
  }

  /**
   * Process stdout buffer for responses
   */
  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line);
        const callback = this.requestCallbacks.get(response.id);

        if (callback) {
          this.requestCallbacks.delete(response.id);

          if (response.error) {
            callback.reject(new Error(response.error));
          } else {
            callback.resolve(response.result);
          }
        }
      } catch (error) {
        log.warn("Failed to parse response:", line);
      }
    }
  }

  /**
   * Ensure bridge is ready
   */
  private ensureReady(): void {
    if (!this.isReady || !this.process) {
      throw new Error("Neuro-memory-agent not running. Call start() first.");
    }
  }

  /**
   * Start automatic consolidation timer
   */
  private startAutoConsolidation(): void {
    this.consolidateTimer = setInterval(async () => {
      try {
        const result = await this.consolidateMemories();
        log.info(
          `Memory consolidation complete: ${result.replay_count} replays, ${result.schemas_extracted} schemas`,
        );
      } catch (error) {
        log.error("Auto-consolidation failed:", error);
      }
    }, this.config.consolidateIntervalMs!);

    log.info(
      `Auto-consolidation enabled (every ${this.config.consolidateIntervalMs! / 60000} minutes)`,
    );
  }
}

// Singleton
let instance: NeuroMemoryBridge | null = null;

export function getNeuroMemoryBridge(): NeuroMemoryBridge | null {
  return instance;
}

export async function initNeuroMemoryBridge(
  agentPath: string = "/Users/tolga/Desktop/neuro-memory-agent",
): Promise<NeuroMemoryBridge> {
  if (instance) {
    return instance;
  }

  instance = new NeuroMemoryBridge({ agentPath });
  await instance.start();
  return instance;
}
