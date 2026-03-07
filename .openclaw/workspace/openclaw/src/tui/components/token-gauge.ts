/**
 * Animated Token Gauge Component
 *
 * Displays real-time context usage with animated progress bar
 */

import chalk from "chalk";

export interface TokenGaugeOptions {
  total: number;
  context: number;
  width?: number;
  showEmoji?: boolean;
}

/**
 * Get color based on usage percentage
 */
function getColorForPercent(percent: number): (text: string) => string {
  if (percent < 0.5) return chalk.green; // < 50% - green
  if (percent < 0.7) return chalk.yellow; // < 70% - yellow
  if (percent < 0.85) return chalk.hex("#FFA500"); // < 85% - orange
  return chalk.red; // >= 85% - red
}

/**
 * Get emoji indicator based on usage
 */
function getEmojiForPercent(percent: number): string {
  if (percent < 0.5) return "🟢";
  if (percent < 0.7) return "🟡";
  if (percent < 0.85) return "🟠";
  return "🔴";
}

/**
 * Format token count with K suffix
 */
function formatTokenShort(count: number): string {
  if (count >= 1000) {
    return `${Math.floor(count / 1000)}k`;
  }
  return String(count);
}

/**
 * Create animated token gauge
 * 
 * Example output:
 * 📚 [████████░░░░░░░░] 56k/64k (88%) 🔴
 */
export function createTokenGauge(options: TokenGaugeOptions): string {
  const { total, context, width = 16, showEmoji = true } = options;
  
  if (context <= 0) {
    return `📚 Context: ${formatTokenShort(total)}/? (unknown)`;
  }
  
  const percent = total / context;
  const percentLabel = Math.round(percent * 100);
  const filled = Math.min(Math.floor(percent * width), width);
  const empty = width - filled;
  
  // Create progress bar
  const colorFn = getColorForPercent(percent);
  const bar = colorFn("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  
  // Format labels
  const totalLabel = formatTokenShort(total);
  const contextLabel = formatTokenShort(context);
  const emoji = showEmoji ? ` ${getEmojiForPercent(percent)}` : "";
  
  return `📚 [${bar}] ${totalLabel}/${contextLabel} (${percentLabel}%)${emoji}`;
}

/**
 * Create mini token gauge (compact version)
 * 
 * Example: 📚 56k/64k (88%)
 */
export function createMiniTokenGauge(total: number, context: number): string {
  if (context <= 0) {
    return `📚 ${formatTokenShort(total)}/?`;
  }
  
  const percent = total / context;
  const percentLabel = Math.round(percent * 100);
  const totalLabel = formatTokenShort(total);
  const contextLabel = formatTokenShort(context);
  const emoji = getEmojiForPercent(percent);
  
  const colorFn = getColorForPercent(percent);
  return colorFn(`📚 ${totalLabel}/${contextLabel} (${percentLabel}%) ${emoji}`);
}

/**
 * Create detailed token gauge with breakdown
 * 
 * Example:
 * ┌─ Context Usage ─────────────────┐
 * │ [████████░░░░░░░░] 56k/64k      │
 * │ 88% used · 8k remaining         │
 * │ ⚡ Auto-compact at 64k          │
 * └─────────────────────────────────┘
 */
export function createDetailedTokenGauge(total: number, context: number): string {
  const lines: string[] = [];
  
  const header = chalk.bold("Context Usage");
  lines.push(`┌─ ${header} ${"─".repeat(28)}┐`);
  
  if (context <= 0) {
    lines.push(`│ ${"Context size unknown".padEnd(32)}│`);
    lines.push(`└${"─".repeat(34)}┘`);
    return lines.join("\n");
  }
  
  const percent = total / context;
  const percentLabel = Math.round(percent * 100);
  const remaining = Math.max(0, context - total);
  const remainingLabel = formatTokenShort(remaining);
  
  // Progress bar
  const filled = Math.min(Math.floor(percent * 16), 16);
  const empty = 16 - filled;
  const colorFn = getColorForPercent(percent);
  const bar = colorFn("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  const totalLabel = formatTokenShort(total);
  const contextLabel = formatTokenShort(context);
  
  lines.push(`│ [${bar}] ${totalLabel}/${contextLabel}`.padEnd(35) + "│");
  lines.push(`│ ${percentLabel}% used · ${remainingLabel} remaining`.padEnd(35) + "│");
  lines.push(`│ ⚡ Auto-compact at ${contextLabel}`.padEnd(35) + "│");
  lines.push(`└${"─".repeat(34)}┘`);
  
  return lines.join("\n");
}
