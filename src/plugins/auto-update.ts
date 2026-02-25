/**
 * Plugin Auto-Update System
 *
 * Provides automatic plugin update checking and installation.
 * Matches Claude Code's auto-update functionality.
 */

import { installPluginFromNpmSpec } from "./install.js";
import { loadPluginRegistry } from "./registry.js";

/**
 * Plugin update information
 */
export interface PluginUpdateInfo {
  /** Plugin ID */
  pluginId: string;
  /** Current installed version */
  currentVersion: string;
  /** Latest available version */
  availableVersion: string;
  /** Whether update is needed */
  needsUpdate: boolean;
}

/**
 * Check for plugin updates
 *
 * @returns Array of plugins with available updates
 */
export async function checkForUpdates(): Promise<PluginUpdateInfo[]> {
  const registry = loadPluginRegistry();
  const updates: PluginUpdateInfo[] = [];

  for (const plugin of registry.plugins) {
    // Only check npm-installed plugins
    if (plugin.installSource !== "npm" || !plugin.packageName) {
      continue;
    }

    try {
      // Check npm for latest version
      const response = await fetch(`https://registry.npmjs.org/${plugin.packageName}/latest`);

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const latestVersion = data.version;

      if (latestVersion !== plugin.version) {
        updates.push({
          pluginId: plugin.id,
          currentVersion: plugin.version,
          availableVersion: latestVersion,
          needsUpdate: true,
        });
      }
    } catch (error) {
      console.error(`[AutoUpdate] Failed to check ${plugin.packageName}:`, error);
      // Skip on error
    }
  }

  return updates;
}

/**
 * Update a single plugin
 *
 * @param pluginId - Plugin ID to update
 * @returns Update result
 */
export async function updatePlugin(pluginId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const registry = loadPluginRegistry();
  const plugin = registry.plugins.find((p) => p.id === pluginId);

  if (!plugin) {
    return { ok: false, error: "Plugin not found" };
  }

  if (plugin.installSource !== "npm" || !plugin.packageName) {
    return { ok: false, error: "Plugin is not npm-installed" };
  }

  try {
    await installPluginFromNpmSpec({
      npmSpec: `${plugin.packageName}@latest`,
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

/**
 * Update all plugins with available updates
 *
 * @returns Update summary
 */
export async function updateAllPlugins(): Promise<{
  updated: number;
  failed: number;
  errors: string[];
}> {
  const updates = await checkForUpdates();
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const update of updates) {
    const result = await updatePlugin(update.pluginId);
    if (result.ok) {
      updated++;
      console.log(`[AutoUpdate] Updated ${update.pluginId} to ${update.availableVersion}`);
    } else {
      failed++;
      errors.push(`${update.pluginId}: ${result.error}`);
      console.error(`[AutoUpdate] Failed to update ${update.pluginId}:`, result.error);
    }
  }

  if (updates.length === 0) {
    console.log("[AutoUpdate] All plugins up to date");
  }

  return { updated, failed, errors };
}

/**
 * Get update summary for display
 */
export async function getUpdateSummary(): Promise<string> {
  const updates = await checkForUpdates();

  if (updates.length === 0) {
    return "✅ All plugins up to date";
  }

  const lines = [`Found ${updates.length} update(s):`];
  for (const update of updates) {
    lines.push(`  - ${update.pluginId}: ${update.currentVersion} → ${update.availableVersion}`);
  }

  return lines.join("\n");
}
