/**
 * Resource Governor for Exec Tool
 *
 * Limits concurrent processes, memory, CPU, and output.
 * Prevents runaway processes from consuming system resources.
 */

import type { ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";

export interface ResourceLimits {
  maxConcurrent: number; // Default: 4
  maxMemoryMB: number; // Default: 512
  maxCpuPercent: number; // Default: 50
  maxOutputChars: number; // Default: 200000
  timeoutSec: number; // Default: 300
}

export interface ProcessMetrics {
  pid: number;
  memoryMB: number;
  cpuPercent: number;
  runningMs: number;
  outputChars: number;
}

interface RunningProcess {
  process: ChildProcess;
  startedAt: number;
  metrics: ProcessMetrics;
}

const DEFAULT_LIMITS: ResourceLimits = {
  maxConcurrent: 4,
  maxMemoryMB: 512,
  maxCpuPercent: 50,
  maxOutputChars: 200000,
  timeoutSec: 300,
};

// Global governor instance
let governorInstance: ResourceGovernor | null = null;

export class ResourceGovernor {
  private running = new Map<string, RunningProcess>();
  private limits: ResourceLimits;

  constructor(limits: Partial<ResourceLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  static getInstance(limits?: Partial<ResourceLimits>): ResourceGovernor {
    if (!governorInstance) {
      governorInstance = new ResourceGovernor(limits);
    }
    return governorInstance;
  }

  static resetInstance(): void {
    governorInstance = null;
  }

  canStart(): boolean {
    return this.running.size < this.limits.maxConcurrent;
  }

  getRunningCount(): number {
    return this.running.size;
  }

  register(sessionId: string, process: ChildProcess): void {
    this.running.set(sessionId, {
      process,
      startedAt: Date.now(),
      metrics: {
        pid: process.pid || 0,
        memoryMB: 0,
        cpuPercent: 0,
        runningMs: 0,
        outputChars: 0,
      },
    });
  }

  unregister(sessionId: string): void {
    this.running.delete(sessionId);
  }

  updateMetrics(sessionId: string, outputChars: number): ProcessMetrics | null {
    const entry = this.running.get(sessionId);
    if (!entry) return null;

    entry.metrics.runningMs = Date.now() - entry.startedAt;
    entry.metrics.outputChars = outputChars;

    // Try to get memory usage (platform-dependent)
    if (entry.process.pid) {
      try {
        if (process.platform === "darwin" || process.platform === "linux") {
          const result = execSync(`ps -o rss= -p ${entry.process.pid} 2>/dev/null || echo 0`, {
            encoding: "utf8",
          });
          entry.metrics.memoryMB = parseInt(result.trim(), 10) / 1024;
        }
      } catch {
        // Ignore errors - process may have exited
      }
    }

    return entry.metrics;
  }

  shouldKill(sessionId: string): { kill: boolean; reason?: string } {
    const entry = this.running.get(sessionId);
    if (!entry) return { kill: false };

    const { metrics } = entry;

    if (metrics.memoryMB > this.limits.maxMemoryMB) {
      return {
        kill: true,
        reason: `Memory limit exceeded: ${metrics.memoryMB.toFixed(1)}MB > ${this.limits.maxMemoryMB}MB`,
      };
    }

    if (metrics.runningMs > this.limits.timeoutSec * 1000) {
      return {
        kill: true,
        reason: `Timeout: ${(metrics.runningMs / 1000).toFixed(1)}s > ${this.limits.timeoutSec}s`,
      };
    }

    if (metrics.outputChars > this.limits.maxOutputChars) {
      return {
        kill: true,
        reason: `Output limit exceeded: ${metrics.outputChars} > ${this.limits.maxOutputChars} chars`,
      };
    }

    return { kill: false };
  }

  getLimits(): ResourceLimits {
    return { ...this.limits };
  }

  setLimits(limits: Partial<ResourceLimits>): void {
    this.limits = { ...this.limits, ...limits };
  }

  getStatus(): { running: number; limit: number; sessions: string[] } {
    return {
      running: this.running.size,
      limit: this.limits.maxConcurrent,
      sessions: Array.from(this.running.keys()),
    };
  }

  getMetrics(sessionId: string): ProcessMetrics | null {
    return this.running.get(sessionId)?.metrics || null;
  }
}

/**
 * Check if a new process can be started
 */
export function canStartProcess(limits?: Partial<ResourceLimits>): boolean {
  return ResourceGovernor.getInstance(limits).canStart();
}

/**
 * Get current resource status
 */
export function getResourceStatus(): { running: number; limit: number; sessions: string[] } {
  return ResourceGovernor.getInstance().getStatus();
}

/**
 * Format resource block message
 */
export function formatResourceBlockMessage(): string {
  const status = getResourceStatus();
  return `Resource limit: ${status.running}/${status.limit} processes running. Wait for completion or increase limits.`;
}
