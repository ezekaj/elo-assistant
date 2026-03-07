// CLI commands for Heartbeat V2 management
// Allows inspecting and controlling the production heartbeat system

import { Command } from "commander";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getHeartbeatScheduler } from "./scheduler.js";
import { getGlobalHeartbeatSystem } from "./unified.js";

const log = createSubsystemLogger("heartbeat-v2/cli");

export const heartbeatV2Command = new Command("heartbeat-v2")
  .description("Production heartbeat system management")
  .alias("hb2");

heartbeatV2Command
  .command("status")
  .description("Show heartbeat system status")
  .option("-a, --agent <agentId>", "Agent ID to check")
  .action(async (options) => {
    try {
      const scheduler = getHeartbeatScheduler();

      if (!scheduler) {
        console.log("Heartbeat V2 system is not running");
        console.log("\nTo start, ensure the system is initialized in your config.");
        return;
      }

      const status = await scheduler.getStatus();

      console.log("\n📊 Heartbeat V2 Status\n");
      console.log(`  Status: ${status.isRunning ? "✅ Running" : "❌ Stopped"}`);
      console.log(`  Active timers: ${status.activeTimers}`);
      console.log(`  Active executions: ${status.activeExecutions}`);

      if (options.agent) {
        const analytics = await scheduler.getAnalytics(options.agent, "24h");
        if (analytics) {
          console.log(`\n📈 Analytics for agent "${options.agent}" (24h)\n`);
          console.log(`  Total runs: ${analytics.totalRuns}`);
          console.log(`  Alerts: ${analytics.alertCount}`);
          console.log(`  OK: ${analytics.okCount}`);
          console.log(`  Skipped: ${analytics.skippedCount}`);
          console.log(`  Errors: ${analytics.errorCount}`);
          console.log(`  Avg duration: ${analytics.avgDurationMs.toFixed(0)}ms`);
          console.log(`  P95 duration: ${analytics.p95DurationMs.toFixed(0)}ms`);
          console.log(`  Max consecutive failures: ${analytics.maxConsecutiveFailures}`);
        } else {
          console.log(`\nNo data for agent "${options.agent}"`);
        }
      }
    } catch (err) {
      console.error("Error getting status:", err);
      process.exit(1);
    }
  });

heartbeatV2Command
  .command("trigger <agentId>")
  .description("Trigger immediate heartbeat for an agent")
  .option("-r, --reason <reason>", "Reason for trigger", "manual-cli")
  .action(async (agentId: string, options) => {
    try {
      const scheduler = getHeartbeatScheduler();

      if (!scheduler) {
        console.error("Heartbeat V2 system is not running");
        process.exit(1);
      }

      console.log(`Triggering heartbeat for agent "${agentId}"...`);
      await scheduler.triggerNow(agentId, options.reason);
      console.log("✅ Heartbeat triggered");
    } catch (err) {
      console.error("Error triggering heartbeat:", err);
      process.exit(1);
    }
  });

heartbeatV2Command
  .command("pause <agentId>")
  .description("Pause heartbeats for an agent")
  .option("-r, --reason <reason>", "Reason for pause")
  .action(async (agentId: string, options) => {
    try {
      const scheduler = getHeartbeatScheduler();

      if (!scheduler) {
        console.error("Heartbeat V2 system is not running");
        process.exit(1);
      }

      await scheduler.pause(agentId, options.reason);
      console.log(`⏸️  Heartbeats paused for agent "${agentId}"`);
    } catch (err) {
      console.error("Error pausing heartbeats:", err);
      process.exit(1);
    }
  });

heartbeatV2Command
  .command("resume <agentId>")
  .description("Resume heartbeats for an agent")
  .action(async (agentId: string) => {
    try {
      const scheduler = getHeartbeatScheduler();

      if (!scheduler) {
        console.error("Heartbeat V2 system is not running");
        process.exit(1);
      }

      await scheduler.resume(agentId);
      console.log(`▶️  Heartbeats resumed for agent "${agentId}"`);
    } catch (err) {
      console.error("Error resuming heartbeats:", err);
      process.exit(1);
    }
  });

heartbeatV2Command
  .command("analytics <agentId>")
  .description("Show analytics for an agent")
  .option("-t, --time-range <range>", "Time range (1h, 24h, 7d, 30d)", "24h")
  .action(async (agentId: string, options) => {
    try {
      const scheduler = getHeartbeatScheduler();

      if (!scheduler) {
        console.error("Heartbeat V2 system is not running");
        process.exit(1);
      }

      const validRanges = ["1h", "24h", "7d", "30d"] as const;
      const timeRange = validRanges.includes(options.timeRange)
        ? (options.timeRange as (typeof validRanges)[number])
        : "24h";

      const analytics = await scheduler.getAnalytics(agentId, timeRange);

      if (!analytics) {
        console.log(`No analytics data for agent "${agentId}"`);
        return;
      }

      console.log(`\n📈 Heartbeat Analytics for "${agentId}" (${timeRange})\n`);
      console.log(`  Total runs: ${analytics.totalRuns}`);
      console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  ✅ OK:       ${analytics.okCount.toString().padStart(5)}`);
      console.log(`  ⚠️  Alerts:   ${analytics.alertCount.toString().padStart(5)}`);
      console.log(`  ⏭️  Skipped:  ${analytics.skippedCount.toString().padStart(5)}`);
      console.log(`  ❌ Errors:   ${analytics.errorCount.toString().padStart(5)}`);
      console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Avg duration:    ${analytics.avgDurationMs.toFixed(0)}ms`);
      console.log(`  P95 duration:    ${analytics.p95DurationMs.toFixed(0)}ms`);
      console.log(`  Avg interval:    ${(analytics.avgIntervalMs / 60000).toFixed(1)}m`);
      console.log(`  Max consec fail: ${analytics.maxConsecutiveFailures}`);
    } catch (err) {
      console.error("Error getting analytics:", err);
      process.exit(1);
    }
  });

// Export for registration in main CLI
export function registerHeartbeatV2Commands(program: Command): void {
  program.addCommand(heartbeatV2Command);
}
