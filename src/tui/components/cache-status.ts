/**
 * Cache Status Component for TUI
 *
 * Displays cache metrics in the TUI interface.
 */

import { Text, Box } from "@mariozechner/pi-tui";
import { getCacheMetricsTracker } from "../cache-metrics-tracker.js";

// ============================================================================
// CACHE STATUS COMPONENT
// ============================================================================

/**
 * Render cache status display
 */
export function renderCacheStatus(): any {
  const tracker = getCacheMetricsTracker();
  const metrics = tracker.getMetrics("claude");

  // Determine color based on hit rate
  let hitRateColor = "red";
  if (metrics.hitRate > 0.8) {
    hitRateColor = "green";
  } else if (metrics.hitRate > 0.5) {
    hitRateColor = "yellow";
  }

  return Box.create({
    children: [
      Text.create("Cache Status", {
        bold: true,
        color: "cyan",
      }),
      Text.create("\n"),
      Text.create(`Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%`, {
        color: hitRateColor,
      }),
      Text.create("\n"),
      Text.create(`Read: ${metrics.cacheReadTokens.toLocaleString()} tokens`, {
        color: "gray",
      }),
      Text.create("\n"),
      Text.create(`Creation: ${metrics.cacheCreationTokens.toLocaleString()} tokens`, {
        color: "gray",
      }),
      Text.create("\n"),
      Text.create(`Input: ${metrics.inputTokens.toLocaleString()} tokens`, {
        color: "gray",
      }),
      Text.create("\n"),
      Text.create(`Savings: $${metrics.estimatedSavings.toFixed(4)}`, {
        color: "green",
      }),
    ],
    border: {
      type: "rounded",
      color: "cyan",
    },
    padding: 1,
    margin: { top: 1, bottom: 0 },
  });
}

/**
 * Render compact cache status (single line)
 */
export function renderCompactCacheStatus(): any {
  const tracker = getCacheMetricsTracker();
  const metrics = tracker.getMetrics("claude");

  const hitRateColor = metrics.hitRate > 0.8 ? "green" : metrics.hitRate > 0.5 ? "yellow" : "red";

  return Text.create(
    `Cache: ${(metrics.hitRate * 100).toFixed(0)}% | $${metrics.estimatedSavings.toFixed(3)}`,
    { color: hitRateColor },
  );
}

/**
 * Render cache summary for status bar
 */
export function renderCacheStatusBar(): any {
  const tracker = getCacheMetricsTracker();
  const hitRate = tracker.getHitRate();

  const status = hitRate > 0.8 ? "✓" : hitRate > 0.5 ? "~" : "✗";
  const color = hitRate > 0.8 ? "green" : hitRate > 0.5 ? "yellow" : "red";

  return Text.create(`${status} Cache ${(hitRate * 100).toFixed(0)}%`, {
    color,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { renderCacheStatus, renderCompactCacheStatus, renderCacheStatusBar };
