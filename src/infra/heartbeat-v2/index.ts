// Heartbeat V2 - Production-grade Heartbeat System
// Based on distributed scheduler patterns from Meta, Netflix, Uber

export * from "./types.js";
export * from "./state-manager.js";
export * from "./timing-wheel.js";
export * from "./scheduler.js";
export * from "./unified.js";

// Quick start for production heartbeat system
import type { OpenClawConfig } from "../../config/config.js";
import {
  UnifiedHeartbeatSystem,
  type UnifiedHeartbeatConfig,
  initializeGlobalHeartbeatSystem,
  shutdownGlobalHeartbeatSystem,
  getGlobalHeartbeatSystem,
} from "./unified.js";

/**
 * Quick start the production heartbeat system
 *
 * @example
 * ```typescript
 * import { startProductionHeartbeats } from './infra/heartbeat-v2';
 *
 * const system = await startProductionHeartbeats(config);
 *
 * // Trigger immediate heartbeat
 * await system.triggerNow('default-agent', 'user-request');
 *
 * // Pause/resume
 * await system.pause('default-agent', 'maintenance');
 * await system.resume('default-agent');
 *
 * // Get analytics
 * const analytics = await system.getAnalytics('default-agent', '24h');
 *
 * // Shutdown
 * await stopProductionHeartbeats();
 * ```
 */
export async function startProductionHeartbeats(
  cfg: OpenClawConfig,
  options?: UnifiedHeartbeatConfig,
): Promise<UnifiedHeartbeatSystem> {
  return initializeGlobalHeartbeatSystem(cfg, options);
}

export async function stopProductionHeartbeats(): Promise<void> {
  return shutdownGlobalHeartbeatSystem();
}

export function getProductionHeartbeatSystem(): UnifiedHeartbeatSystem | null {
  return getGlobalHeartbeatSystem();
}

/**
 * Migration helper: Convert legacy heartbeat config to v2 format
 */
export function migrateHeartbeatConfig(cfg: OpenClawConfig): {
  enabled: boolean;
  intervalMs: number;
  activeHours?: { start: string; end: string; timezone: string };
  visibility: { showOk: boolean; showAlerts: boolean; useIndicator: boolean };
} | null {
  const heartbeat = cfg.agents?.defaults?.heartbeat;
  if (!heartbeat?.every) {
    return null;
  }

  // Parse interval
  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  };

  const match = heartbeat.every.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = (match[2] ?? "m").toLowerCase();
  const intervalMs = Math.floor(value * (units[unit] ?? 60000));

  // Build active hours if present
  const activeHours =
    heartbeat.activeHours?.start && heartbeat.activeHours?.end && heartbeat.activeHours?.timezone
      ? {
          start: heartbeat.activeHours.start,
          end: heartbeat.activeHours.end,
          timezone: heartbeat.activeHours.timezone,
        }
      : undefined;

  // Get visibility settings (default to true if not specified)
  const visibility = {
    showOk: heartbeat.showOk !== false,
    showAlerts: heartbeat.showAlerts !== false,
    useIndicator: heartbeat.useIndicator !== false,
  };

  return {
    enabled: true,
    intervalMs,
    activeHours,
    visibility,
  };
}
