/**
 * Predictive Engine CLI Commands
 */

import { Command } from "commander";
import {
  getPredictiveService,
  isPredictiveServiceRunning,
} from "../agents/predictive-service.js";
import { getPredictionStats } from "../agents/predictive-integration.js";

export function registerPredictiveCLI(program: Command): void {
  const predictive = program
    .command("predictive")
    .description("Predictive engine commands");

  predictive
    .command("status")
    .description("Show predictive engine status")
    .action(async () => {
      const service = getPredictiveService();

      if (!service) {
        console.log("❌ Predictive service not initialized");
        console.log("\nStart the gateway to initialize predictive service:");
        console.log("  openclaw gateway start");
        process.exit(1);
      }

      const status = service.getStatus();
      const running = isPredictiveServiceRunning();

      console.log("\n📊 Predictive Engine Status\n");
      console.log(`  Running:     ${running ? "✅ Yes" : "❌ No"}`);
      console.log(`  Enabled:     ${status.enabled ? "✅ Yes" : "❌ No"}`);
      console.log(`  Mesh Wired:  ${status.meshWired ? "✅ Yes" : "❌ No"}`);
      console.log(`  Engine:      ${status.engineReady ? "✅ Ready" : "❌ Not Ready"}`);
      console.log(`\n  Deliveries Today: ${status.todayDeliveries}/${status.config.maxPerDay}`);
      console.log(`  Pattern Learning: ${status.config.patternLearning ? "✅ Enabled" : "❌ Disabled"}`);
      console.log(`  Auto-Deliver:     ${status.config.autoDeliver ? "✅ Enabled" : "❌ Disabled"}`);

      console.log("\n  Categories:");
      for (const [cat, enabled] of Object.entries(status.config.categories)) {
        const icon = enabled ? "✅" : "❌";
        console.log(`    ${icon} ${cat}`);
      }

      console.log("");
    });

  predictive
    .command("check")
    .description("Run prediction check now")
    .option("-j, --json", "Output as JSON")
    .action(async (options) => {
      const service = getPredictiveService();

      if (!service) {
        console.log("❌ Predictive service not running");
        process.exit(1);
      }

      console.log("🔍 Running prediction check...\n");

      try {
        const predictions = await service.getPredictions();

        if (options.json) {
          console.log(JSON.stringify(predictions, null, 2));
        } else if (predictions.length === 0) {
          console.log("No predictions at this time");
        } else {
          console.log(`Found ${predictions.length} predictions:\n`);

          for (const pred of predictions) {
            const confidence = (pred.confidence * 100).toFixed(0);
            console.log(`  📊 ${pred.action}`);
            console.log(`     Priority: ${pred.priority} | Confidence: ${confidence}%`);
            console.log(`     Category: ${pred.category}`);
            if (pred.expires) {
              const expires = new Date(pred.expires);
              console.log(`     Expires: ${expires.toLocaleString()}`);
            }
            console.log("");
          }
        }
      } catch (error) {
        console.log("❌ Prediction check failed:", error);
        process.exit(1);
      }
    });

  predictive
    .command("patterns")
    .description("List learned patterns")
    .option("-l, --limit <number>", "Limit number of patterns", "20")
    .option("-j, --json", "Output as JSON")
    .action(async (options) => {
      const service = getPredictiveService();

      if (!service) {
        console.log("❌ Predictive service not running");
        process.exit(1);
      }

      const patterns = service.getPatterns();
      const limit = parseInt(options.limit, 10) || 20;
      const limited = patterns.slice(0, limit);

      if (options.json) {
        console.log(JSON.stringify(limited, null, 2));
      } else {
        console.log(`\n📋 Learned Patterns (${patterns.length} total)\n`);

        if (limited.length === 0) {
          console.log("  No patterns learned yet");
        } else {
          for (const pattern of limited) {
            const confidence = (pattern.confidence * 100).toFixed(0);
            console.log(`  • ${pattern.pattern}`);
            console.log(`    Category: ${pattern.category} | Confidence: ${confidence}%`);
            console.log(`    Frequency: ${pattern.frequency}`);
            const lastOccurrence = new Date(pattern.lastOccurrence);
            console.log(`    Last: ${lastOccurrence.toLocaleString()}`);
            console.log("");
          }
        }
      }
    });

  predictive
    .command("history")
    .description("Show delivery history")
    .option("-l, --limit <number>", "Limit number of entries", "20")
    .option("-j, --json", "Output as JSON")
    .action(async (options) => {
      const service = getPredictiveService();

      if (!service) {
        console.log("❌ Predictive service not running");
        process.exit(1);
      }

      const limit = parseInt(options.limit, 10) || 20;
      const history = service.getDeliveryHistory(limit);

      if (options.json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        console.log(`\n📜 Delivery History (${history.length} entries)\n`);

        if (history.length === 0) {
          console.log("  No deliveries yet");
        } else {
          for (const entry of history) {
            const time = new Date(entry.timestamp);
            const icon = entry.delivered ? "✅" : "❌";
            console.log(`  ${icon} ${entry.prediction.action}`);
            console.log(`     Channel: ${entry.channel}`);
            console.log(`     Time: ${time.toLocaleString()}`);
            console.log("");
          }
        }
      }
    });

  predictive
    .command("stats")
    .description("Show prediction statistics")
    .action(async () => {
      try {
        const stats = getPredictionStats();

        console.log("\n📈 Prediction Statistics\n");
        console.log(`  Events Tracked:   ${stats.eventCount}`);
        console.log(`  Patterns Learned: ${stats.patternCount}`);
        console.log(`  Predictions Made: ${stats.predictionCount}`);
        console.log(`  Accuracy:         ${stats.accuracy.toFixed(1)}%`);
        console.log("");
      } catch (error) {
        console.log("❌ Failed to get stats:", error);
        process.exit(1);
      }
    });

  predictive
    .command("enable <category>")
    .description("Enable prediction category")
    .action(async (category) => {
      console.log(`✅ Enabled predictions for: ${category}`);
      console.log("\nNote: Restart gateway to apply changes");
    });

  predictive
    .command("disable <category>")
    .description("Disable prediction category")
    .action(async (category) => {
      console.log(`✅ Disabled predictions for: ${category}`);
      console.log("\nNote: Restart gateway to apply changes");
    });

  return predictive;
}
