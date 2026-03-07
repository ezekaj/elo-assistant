/**
 * Cache Status Component for TUI
 *
 * Displays cache metrics in the TUI interface.
 */

import { createText, createBox } from "./component-helpers.js";

// ============================================================================
// TYPES
// ============================================================================

interface CacheMetrics {
  hitRate: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  estimatedSavings: number;
}

// ============================================================================
// STUB TRACKER (until cache-metrics-tracker is available)
// ============================================================================

function getCacheMetrics(): CacheMetrics {
  return {
    hitRate: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    inputTokens: 0,
    estimatedSavings: 0,
  };
}

// ============================================================================
// CACHE STATUS COMPONENT
// ============================================================================

/**
 * Render cache status display
 */
export function renderCacheStatus(): any {
  const metrics = getCacheMetrics();

  // Determine color based on hit rate
  let hitRateColor = "red";
  if (metrics.hitRate > 0.8) {
    hitRateColor = "green";
  } else if (metrics.hitRate > 0.5) {
    hitRateColor = "yellow";
  }

  return createBox({
    children: [
      createText("Cache Status", {
        bold: true,
        color: "cyan",
      }),
      createText("\n"),
      createText(`Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%`, {
        color: hitRateColor,
      }),
      createText("\n"),
      createText(`Read: ${metrics.cacheReadTokens.toLocaleString()} tokens`, {
        color: "gray",
      }),
      createText("\n"),
      createText(`Creation: ${metrics.cacheCreationTokens.toLocaleString()} tokens`, {
        color: "gray",
      }),
      createText("\n"),
      createText(`Input: ${metrics.inputTokens.toLocaleString()} tokens`, {
        color: "gray",
      }),
      createText("\n"),
      createText(`Savings: $${metrics.estimatedSavings.toFixed(4)}`, {
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
  const metrics = getCacheMetrics();

  const hitRateColor = metrics.hitRate > 0.8 ? "green" : metrics.hitRate > 0.5 ? "yellow" : "red";

  return createText(
    `Cache: ${(metrics.hitRate * 100).toFixed(0)}% | $${metrics.estimatedSavings.toFixed(3)}`,
    { color: hitRateColor },
  );
}

/**
 * Render cache summary for status bar
 */
export function renderCacheStatusBar(): any {
  const metrics = getCacheMetrics();
  const hitRate = metrics.hitRate;

  const status = hitRate > 0.8 ? "✓" : hitRate > 0.5 ? "~" : "✗";
  const color = hitRate > 0.8 ? "green" : hitRate > 0.5 ? "yellow" : "red";

  return createText(`${status} Cache ${(hitRate * 100).toFixed(0)}%`, {
    color,
  });
}
