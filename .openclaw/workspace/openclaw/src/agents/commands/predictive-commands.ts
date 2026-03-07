/**
 * User-facing chat commands for predictive engine
 * 
 * Commands:
 *   /predictions - Show current predictions
 *   /predictive - Show predictive engine status
 */

import type { AgentContext } from "../agent-context.js";
import {
  checkPredictions,
  getPredictionStats,
  getRecentDeliveries,
} from "../predictive-integration.js";
import {
  isPredictiveServiceRunning,
  getPredictiveService,
} from "../predictive-service.js";

export async function handlePredictiveCommand(
  args: string[],
  ctx: AgentContext,
): Promise<string> {
  const subCommand = args[0]?.toLowerCase();

  try {
    switch (subCommand) {
      case "status":
        return await handleStatusCommand(ctx);
      
      case "check":
        return await handleCheckCommand(ctx);
      
      case "patterns":
        return await handlePatternsCommand(args.slice(1), ctx);
      
      case "history":
        return await handleHistoryCommand(args.slice(1), ctx);
      
      case "stats":
        return await handleStatsCommand(ctx);
      
      case "enable":
        return await handleEnableCommand(ctx);
      
      case "disable":
        return await handleDisableCommand(ctx);
      
      case "help":
      default:
        return getHelpText();
    }
  } catch (error) {
    return `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function handleStatusCommand(ctx: AgentContext): Promise<string> {
  const running = isPredictiveServiceRunning();
  
  if (!running) {
    return "📊 **Predictive Engine Status**\n\n❌ Service not running\n\nStart with: `openclaw predictive enable`";
  }
  
  const service = getPredictiveService();
  if (!service) {
    return "❌ Unable to get predictive service instance";
  }
  
  const stats = getPredictionStats();
  const config = service.getConfig();
  
  return `📊 **Predictive Engine Status**

**Service**: ✅ Running
**Auto-Delivery**: ${config.autoDeliver.enabled ? "✅ Enabled" : "❌ Disabled"}
**Max Per Day**: ${config.autoDeliver.maxPerDay}
**Quiet Hours**: ${config.autoDeliver.quietHours.start}:00 - ${config.autoDeliver.quietHours.end}:00
**Min Confidence**: ${config.autoDeliver.minConfidence}

**Stats**:
- Events: ${stats?.totalEvents ?? 0}
- Patterns: ${stats?.patternCount ?? 0}
- Predictions Today: ${stats?.todayPredictions ?? 0}
- Deliveries Today: ${stats?.todayDeliveries ?? 0}`;
}

async function handleCheckCommand(ctx: AgentContext): Promise<string> {
  const predictions = await checkPredictions();
  
  if (predictions.length === 0) {
    return "🔍 No predictions at this time";
  }
  
  const lines = ["🔮 **Predictions**\n"];
  
  for (const pred of predictions.slice(0, 5)) {
    const confidence = Math.round(pred.confidence * 100);
    const emoji = confidence >= 80 ? "🟢" : confidence >= 60 ? "🟡" : "🔴";
    lines.push(`${emoji} **${pred.action}** (${confidence}% confidence)`);
    lines.push(`   ${pred.message}`);
    if (pred.data?.reason) {
      lines.push(`   _${pred.data.reason}_`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

async function handlePatternsCommand(args: string[], ctx: AgentContext): Promise<string> {
  const limit = parseInt(args[0] || "10", 10);
  const stats = getPredictionStats();
  
  // Get patterns from engine
  const service = getPredictiveService();
  if (!service) {
    return "❌ Predictive service not running";
  }
  
  const engine = service.getEngine();
  if (!engine) {
    return "❌ Predictive engine not initialized";
  }
  const patterns = engine.getPatterns().slice(0, limit);
  
  if (patterns.length === 0) {
    return "📊 No learned patterns yet";
  }
  
  const lines = [`📊 **Learned Patterns** (${patterns.length} of ${stats?.patternCount || 0})\n`];
  
  for (const pattern of patterns) {
    const confidence = Math.round(pattern.confidence * 100);
    const lastSeen = pattern.lastOccurrence ? new Date(pattern.lastOccurrence).toLocaleDateString() : "Never";
    lines.push(`• **${pattern.pattern}** (${confidence}% confidence)`);
    lines.push(`  Category: ${pattern.category} | Seen: ${pattern.frequency}x | Last: ${lastSeen}`);
    lines.push("");
  }
  
  return lines.join("\n");
}

async function handleHistoryCommand(args: string[], ctx: AgentContext): Promise<string> {
  const limit = parseInt(args[0] || "10", 10);
  const deliveries = getRecentDeliveries(limit);
  
  if (deliveries.length === 0) {
    return "📜 No prediction history";
  }
  
  const lines = ["📜 **Recent Predictions**\n"];
  
  for (const delivery of deliveries) {
    const time = new Date(delivery.timestamp).toLocaleString();
    const status = delivery.accepted === true ? "✅" : delivery.accepted === false ? "❌" : "⏳";
    lines.push(`${status} **${delivery.action}** - ${time}`);
    lines.push(`   ${delivery.message}`);
    lines.push("");
  }
  
  return lines.join("\n");
}

async function handleStatsCommand(ctx: AgentContext): Promise<string> {
  const stats = getPredictionStats();
  
  if (!stats) {
    return "❌ Predictive engine not initialized";
  }
  
  return `📈 **Predictive Engine Statistics**

**Events**:
- Total: ${stats.totalEvents}
- Today: ${stats.todayEvents || 0}

**Patterns**:
- Total: ${stats.patternCount}
- Active: ${stats.activePatterns || stats.patternCount}

**Predictions**:
- Today: ${stats.todayPredictions}
- This Week: ${stats.weekPredictions || 0}

**Deliveries**:
- Today: ${stats.todayDeliveries}
- This Week: ${stats.weekDeliveries || 0}
- Accepted: ${stats.acceptedPredictions || 0}
- Rejected: ${stats.rejectedPredictions || 0}

**Accuracy**: ${stats.accuracy ? `${Math.round(stats.accuracy * 100)}%` : "N/A"}`;
}

async function handleEnableCommand(ctx: AgentContext): Promise<string> {
  const service = getPredictiveService();
  if (!service) {
    return "❌ Predictive service not initialized. Restart gateway with predictive config.";
  }
  
  service.enableAutoDelivery();
  return "✅ Predictive engine auto-delivery enabled";
}

async function handleDisableCommand(ctx: AgentContext): Promise<string> {
  const service = getPredictiveService();
  if (!service) {
    return "❌ Predictive service not initialized";
  }
  
  service.disableAutoDelivery();
  return "✅ Predictive engine auto-delivery disabled";
}

function getHelpText(): string {
  return `🔮 **Predictive Engine Commands**

**Usage**: \`/predictions <command>\` or \`/predictive <command>\`

**Commands**:
- \`status\` - Show service status and config
- \`check\` - Check current predictions
- \`patterns [limit]\` - Show learned patterns (default: 10)
- \`history [limit]\` - Show recent deliveries (default: 10)
- \`stats\` - Show detailed statistics
- \`enable\` - Enable auto-delivery
- \`disable\` - Disable auto-delivery
- \`help\` - Show this help

**Examples**:
- \`/predictions status\` - Check if service is running
- \`/predictions check\` - See what predictions are active
- \`/predictions patterns 20\` - Show top 20 patterns
- \`/predictive stats\` - Detailed statistics`;
}

/**
 * Register predictive commands with command handler
 */
export function registerPredictiveCommands(): void {
  // This will be called by the command registration system
  // Commands: /predictions, /predictive (both aliases)
}
