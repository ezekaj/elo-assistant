// Integration between Heartbeat V2 and existing HeartbeatRunner
// Provides backward compatibility and gradual migration path

import type { OpenClawConfig } from "../../config/config.js";
import type { HeartbeatRunResult } from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  startHeartbeatRunner,
  type HeartbeatRunner,
  runHeartbeatOnce,
  setHeartbeatsEnabled,
} from "../heartbeat-runner.js";
import {
  requestHeartbeatNow,
  setHeartbeatWakeHandler,
  type HeartbeatWakeHandler,
} from "../heartbeat-wake.js";
import {
  initializeGlobalHeartbeatSystem,
  shutdownGlobalHeartbeatSystem,
  getGlobalHeartbeatSystem,
  migrateHeartbeatConfig,
} from "./index.js";

const log = createSubsystemLogger("heartbeat-v2/integration");

export interface HeartbeatIntegrationOptions {
  /** Use new V2 system (default: true) */
  useV2?: boolean;
  /** Fall back to legacy runner on V2 errors */
  fallbackToLegacy?: boolean;
  /** Database path for V2 system */
  dbPath?: string;
}

/**
 * Hybrid heartbeat runner that supports both legacy and V2 systems
 */
export class HybridHeartbeatRunner {
  private legacyRunner: HeartbeatRunner | null = null;
  private useV2: boolean;
  private fallbackToLegacy: boolean;
  private cfg: OpenClawConfig;
  private dbPath: string;

  constructor(cfg: OpenClawConfig, options?: HeartbeatIntegrationOptions) {
    this.cfg = cfg;
    this.useV2 = options?.useV2 ?? true;
    this.fallbackToLegacy = options?.fallbackToLegacy ?? true;
    this.dbPath = options?.dbPath ?? "./data/heartbeat-v2.db";
  }

  /**
   * Start the heartbeat system
   */
  async start(): Promise<{ stop: () => void; updateConfig: (cfg: OpenClawConfig) => void }> {
    let v2Started = false;

    if (this.useV2) {
      try {
        const v2Config = migrateHeartbeatConfig(this.cfg);
        if (v2Config) {
          await initializeGlobalHeartbeatSystem(this.cfg, {
            dbPath: this.dbPath,
          });
          v2Started = true;
          log.info("Heartbeat V2 system started");

          // Set up wake handler to use V2 system
          setHeartbeatWakeHandler(async (params) => {
            const system = getGlobalHeartbeatSystem();
            if (system) {
              system.triggerNow("default", params.reason ?? "wake");
              return { status: "ran", durationMs: 0 };
            }
            return { status: "skipped", reason: "no-system" };
          });
        }
      } catch (err) {
        log.error("Failed to start Heartbeat V2", { error: String(err) });
        if (!this.fallbackToLegacy) {
          throw err;
        }
      }
    }

    // Start legacy runner as fallback or when V2 is disabled
    if (!v2Started || !this.useV2) {
      this.legacyRunner = startHeartbeatRunner({
        cfg: this.cfg,
      });
      log.info("Legacy heartbeat runner started");
    }

    return {
      stop: () => this.stop(),
      updateConfig: (cfg: OpenClawConfig) => this.updateConfig(cfg),
    };
  }

  /**
   * Stop the heartbeat system
   */
  async stop(): Promise<void> {
    // Stop V2 system
    try {
      await shutdownGlobalHeartbeatSystem();
      log.info("Heartbeat V2 system stopped");
    } catch (err) {
      log.error("Error stopping Heartbeat V2", { error: String(err) });
    }

    // Stop legacy runner
    if (this.legacyRunner) {
      this.legacyRunner.stop();
      this.legacyRunner = null;
      log.info("Legacy heartbeat runner stopped");
    }
  }

  /**
   * Update configuration
   */
  updateConfig(cfg: OpenClawConfig): void {
    this.cfg = cfg;

    // Update V2 system
    const system = getGlobalHeartbeatSystem();
    if (system) {
      system.updateConfig(cfg);
    }

    // Update legacy runner
    if (this.legacyRunner) {
      this.legacyRunner.updateConfig(cfg);
    }
  }

  /**
   * Trigger immediate heartbeat
   */
  triggerNow(agentId: string, reason?: string): HeartbeatRunResult | Promise<HeartbeatRunResult> {
    // Try V2 first
    const system = getGlobalHeartbeatSystem();
    if (system) {
      try {
        system.triggerNow(agentId, reason ?? "manual");
        return { status: "ran", durationMs: 0 };
      } catch (err) {
        log.error("V2 triggerNow failed", { error: String(err) });
        if (!this.fallbackToLegacy) {
          return { status: "failed", reason: String(err) };
        }
      }
    }

    // Fall back to legacy
    return requestHeartbeatNow({ reason: reason ?? "manual" });
  }

  /**
   * Pause heartbeats for an agent
   */
  pause(agentId: string, reason?: string): void {
    const system = getGlobalHeartbeatSystem();
    if (system) {
      system.pause(agentId, reason);
    }

    // Also disable legacy
    setHeartbeatsEnabled(false);
  }

  /**
   * Resume heartbeats for an agent
   */
  resume(agentId: string): void {
    const system = getGlobalHeartbeatSystem();
    if (system) {
      system.resume(agentId);
    }

    // Re-enable legacy
    setHeartbeatsEnabled(true);
  }

  /**
   * Get status of heartbeat system
   */
  getStatus(): {
    v2: {
      isRunning: boolean;
      activeTimers: number;
      activeExecutions: number;
    } | null;
    legacy: {
      isRunning: boolean;
    };
  } {
    const system = getGlobalHeartbeatSystem();

    const v2Status = system ? system.getStatus() : null;

    return {
      v2: v2Status,
      legacy: {
        isRunning: this.legacyRunner !== null,
      },
    };
  }
}

// Singleton
let hybridRunner: HybridHeartbeatRunner | null = null;

/**
 * Start hybrid heartbeat system
 */
export async function startHybridHeartbeat(
  cfg: OpenClawConfig,
  options?: HeartbeatIntegrationOptions,
): Promise<HybridHeartbeatRunner> {
  if (hybridRunner) {
    await hybridRunner.stop();
  }

  hybridRunner = new HybridHeartbeatRunner(cfg, options);
  await hybridRunner.start();

  return hybridRunner;
}

/**
 * Get hybrid runner instance
 */
export function getHybridHeartbeatRunner(): HybridHeartbeatRunner | null {
  return hybridRunner;
}

/**
 * Stop hybrid heartbeat system
 */
export async function stopHybridHeartbeat(): Promise<void> {
  if (hybridRunner) {
    await hybridRunner.stop();
    hybridRunner = null;
  }
}
