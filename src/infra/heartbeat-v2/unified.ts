// Unified Heartbeat System
// Main entry point for production-grade heartbeat management

import * as path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { SchedulerConfig, HeartbeatAnalytics, HeartbeatState } from "./types.js";
import { resolveDefaultAgentId, resolveAgentConfig } from "../../agents/agent-scope.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { runHeartbeatOnce } from "../heartbeat-runner.js";
import { resolveHeartbeatVisibility } from "../heartbeat-visibility.js";
import {
  HeartbeatScheduler,
  type HeartbeatSchedulerOptions,
  type HeartbeatExecutionHandler,
  getHeartbeatScheduler,
  setHeartbeatScheduler,
} from "./scheduler.js";
import { HeartbeatStateManager } from "./state-manager.js";
import { DEFAULT_SCHEDULER_CONFIG } from "./types.js";

// Helper function to normalize agent IDs
function normalizeAgentId(agentId?: string): string {
  return agentId?.trim().toLowerCase() || "default";
}

const log = createSubsystemLogger("heartbeat-v2/unified");

export interface UnifiedHeartbeatConfig {
  /** Path to store heartbeat database */
  dbPath?: string;
  /** Custom scheduler configuration */
  schedulerConfig?: Partial<SchedulerConfig>;
  /** Whether to use the new system (default: true when enabled) */
  enabled?: boolean;
}

export class UnifiedHeartbeatSystem {
  private scheduler: HeartbeatScheduler | null = null;
  private stateManager: HeartbeatStateManager | null = null;
  private config: OpenClawConfig;
  private schedulerConfig: SchedulerConfig;
  private dbPath: string;
  private isInitialized = false;

  constructor(cfg: OpenClawConfig, options?: UnifiedHeartbeatConfig) {
    this.config = cfg;
    this.schedulerConfig = {
      ...DEFAULT_SCHEDULER_CONFIG,
      ...options?.schedulerConfig,
    };
    this.dbPath = options?.dbPath ?? "./data/heartbeat-v2.db";
  }

  /**
   * Initialize the unified heartbeat system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Create execution handler that delegates to existing heartbeat logic
    const executionHandler: HeartbeatExecutionHandler = async (params) => {
      const { agentId, reason } = params;

      try {
        const result = await runHeartbeatOnce({
          cfg: this.config,
          agentId,
          reason,
        });

        return {
          status: result.status === "ran" ? "ok" : result.status,
          durationMs: result.durationMs,
          message: result.reason,
        };
      } catch (err) {
        return {
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    };

    // Create scheduler
    const schedulerOptions: HeartbeatSchedulerOptions = {
      config: this.config,
      schedulerConfig: this.schedulerConfig,
      dbPath: this.dbPath,
      onExecute: executionHandler,
    };

    this.scheduler = new HeartbeatScheduler(schedulerOptions);
    await this.scheduler.initialize();

    // Create state manager for direct access
    this.stateManager = new HeartbeatStateManager(this.dbPath, this.schedulerConfig);
    await this.stateManager.initialize();

    // Register default agent
    await this.registerDefaultAgent();

    this.isInitialized = true;
    log.info("Unified heartbeat system initialized");
  }

  /**
   * Start the heartbeat system
   */
  async start(): Promise<void> {
    if (!this.scheduler) {
      throw new Error("Heartbeat system not initialized");
    }

    await this.scheduler.start();
    setHeartbeatScheduler(this.scheduler);
    log.info("Unified heartbeat system started");
  }

  /**
   * Stop the heartbeat system
   */
  async stop(): Promise<void> {
    if (this.scheduler) {
      await this.scheduler.stop();
    }
    if (this.stateManager) {
      await this.stateManager.close();
    }
    setHeartbeatScheduler(null);
    log.info("Unified heartbeat system stopped");
  }

  /**
   * Register the default agent for heartbeats
   */
  private registerDefaultAgent(): void {
    if (!this.scheduler) return;

    const agentId = resolveDefaultAgentId(this.config);
    const agentConfig = resolveAgentConfig(this.config, agentId);
    const heartbeatConfig = agentConfig?.heartbeat ?? this.config.agents?.defaults?.heartbeat;

    if (!heartbeatConfig?.every) {
      log.debug("No heartbeat interval configured for default agent");
      return;
    }

    // Parse interval
    const intervalMs = this.parseInterval(heartbeatConfig.every);
    if (!intervalMs) {
      log.warn("Invalid heartbeat interval", { interval: heartbeatConfig.every });
      return;
    }

    // Resolve visibility
    const visibility = resolveHeartbeatVisibility({
      cfg: this.config,
      channel: "signal", // Default channel
      accountId: heartbeatConfig.accountId,
    });

    this.scheduler.registerAgent({
      agentId: normalizeAgentId(agentId),
      intervalMs,
      activeHours: heartbeatConfig.activeHours,
      visibility: {
        showOk: visibility.showOk,
        showAlerts: visibility.showAlerts,
        useIndicator: visibility.useIndicator,
      },
    });
  }

  private parseInterval(interval: string): number | null {
    const units: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60000,
      h: 3600000,
      d: 86400000,
    };

    const match = interval.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = (match[2] ?? "m").toLowerCase();

    return Math.floor(value * (units[unit] ?? 60000));
  }

  /**
   * Update configuration
   */
  updateConfig(cfg: OpenClawConfig): void {
    this.config = cfg;
    if (this.scheduler) {
      this.scheduler.updateConfig(cfg);
    }
  }

  /**
   * Trigger immediate heartbeat
   */
  triggerNow(agentId: string, reason?: string): void {
    if (!this.scheduler) {
      throw new Error("Heartbeat system not initialized");
    }
    this.scheduler.triggerNow(normalizeAgentId(agentId), reason ?? "manual");
  }

  /**
   * Pause heartbeats for an agent
   */
  pause(agentId: string, reason?: string): void {
    if (!this.scheduler) {
      throw new Error("Heartbeat system not initialized");
    }
    this.scheduler.pause(normalizeAgentId(agentId), reason);
  }

  /**
   * Resume heartbeats for an agent
   */
  resume(agentId: string): void {
    if (!this.scheduler) {
      throw new Error("Heartbeat system not initialized");
    }
    this.scheduler.resume(normalizeAgentId(agentId));
  }

  /**
   * Get current state for an agent
   */
  getState(agentId: string): HeartbeatState | null {
    if (!this.stateManager) {
      throw new Error("Heartbeat system not initialized");
    }
    return this.stateManager.getState(normalizeAgentId(agentId));
  }

  /**
   * Get analytics for an agent
   */
  getAnalytics(
    agentId: string,
    timeRange: "1h" | "24h" | "7d" | "30d" = "24h",
  ): HeartbeatAnalytics {
    if (!this.stateManager) {
      throw new Error("Heartbeat system not initialized");
    }
    return this.stateManager.getAnalytics(normalizeAgentId(agentId), timeRange);
  }

  /**
   * Get scheduler status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    activeTimers: number;
    activeExecutions: number;
  }> {
    if (!this.scheduler) {
      return { isRunning: false, activeTimers: 0, activeExecutions: 0 };
    }
    return this.scheduler.getStatus();
  }
}

// Factory function
export async function createUnifiedHeartbeatSystem(
  cfg: OpenClawConfig,
  options?: UnifiedHeartbeatConfig,
): Promise<UnifiedHeartbeatSystem> {
  const system = new UnifiedHeartbeatSystem(cfg, options);
  await system.initialize();
  await system.start();
  return system;
}

// Global instance
let globalSystem: UnifiedHeartbeatSystem | null = null;

export function getGlobalHeartbeatSystem(): UnifiedHeartbeatSystem | null {
  return globalSystem;
}

export async function initializeGlobalHeartbeatSystem(
  cfg: OpenClawConfig,
  options?: UnifiedHeartbeatConfig,
): Promise<UnifiedHeartbeatSystem> {
  if (globalSystem) {
    await globalSystem.stop();
  }

  globalSystem = new UnifiedHeartbeatSystem(cfg, options);
  await globalSystem.initialize();
  await globalSystem.start();

  return globalSystem;
}

export async function shutdownGlobalHeartbeatSystem(): Promise<void> {
  if (globalSystem) {
    await globalSystem.stop();
    globalSystem = null;
  }
}
