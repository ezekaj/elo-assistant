/**
 * Plugin Hooks System - Configuration Loading
 *
 * Loads hook configurations from settings files
 * (user, project, local, managed settings)
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { parseMatcher } from "./matchers.js";
import { HookRegistration, HookConfig, HookMatcher } from "./types.js";

/**
 * Hook configuration from settings.json
 */
interface SettingsHooksConfig {
  [event: string]: Array<{
    matcher?: HookMatcher | string | null;
    hooks: HookConfig[];
  }>;
}

/**
 * Load hooks from configuration
 */
export async function loadHooksFromConfig(): Promise<HookRegistration[]> {
  const hooks: HookRegistration[] = [];

  // Load from user settings
  try {
    const userSettingsPath = join(getHomeDir(), ".claude", "settings.json");
    const userConfig = JSON.parse(await readFile(userSettingsPath, "utf8"));
    if (userConfig.hooks) {
      hooks.push(...parseHooksConfig(userConfig.hooks, "user"));
    }
  } catch {
    // No user settings
  }

  // Load from project settings
  try {
    const projectSettingsPath = join(process.cwd(), ".claude", "settings.json");
    const projectConfig = JSON.parse(await readFile(projectSettingsPath, "utf8"));
    if (projectConfig.hooks) {
      hooks.push(...parseHooksConfig(projectConfig.hooks, "project"));
    }
  } catch {
    // No project settings
  }

  // Load from local settings
  try {
    const localSettingsPath = join(process.cwd(), ".claude", "settings.local.json");
    const localConfig = JSON.parse(await readFile(localSettingsPath, "utf8"));
    if (localConfig.hooks) {
      hooks.push(...parseHooksConfig(localConfig.hooks, "local"));
    }
  } catch {
    // No local settings
  }

  return hooks;
}

/**
 * Parse hooks configuration
 */
function parseHooksConfig(
  config: SettingsHooksConfig,
  source: "user" | "project" | "local" | "managed",
): HookRegistration[] {
  const hooks: HookRegistration[] = [];

  for (const [event, matchers] of Object.entries(config)) {
    if (!Array.isArray(matchers)) continue;

    for (const matcherConfig of matchers) {
      if (!matcherConfig || !Array.isArray(matcherConfig.hooks)) continue;

      const matcher = parseMatcher(matcherConfig.matcher);

      hooks.push({
        event: event as HookRegistration["event"],
        matcher,
        hooks: matcherConfig.hooks,
        source,
      });
    }
  }

  return hooks;
}

/**
 * Get home directory
 */
function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd();
}

/**
 * Save hooks to configuration
 */
export async function saveHooksToConfig(
  hooks: HookRegistration[],
  source: "user" | "project" | "local",
): Promise<void> {
  const configPath = getConfigPath(source);

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    // File doesn't exist, create new config
  }

  // Convert hooks to settings format
  const hooksConfig: SettingsHooksConfig = {};

  for (const hook of hooks) {
    if (hook.source !== source) continue;

    if (!hooksConfig[hook.event]) {
      hooksConfig[hook.event] = [];
    }

    hooksConfig[hook.event].push({
      matcher: hook.matcher,
      hooks: hook.hooks,
    });
  }

  config.hooks = hooksConfig;

  // Write config
  const { writeFile } = await import("fs/promises");
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

/**
 * Get config path for source
 */
function getConfigPath(source: "user" | "project" | "local"): string {
  switch (source) {
    case "user":
      return join(getHomeDir(), ".claude", "settings.json");
    case "project":
      return join(process.cwd(), ".claude", "settings.json");
    case "local":
      return join(process.cwd(), ".claude", "settings.local.json");
  }
}

/**
 * Delete hooks from configuration
 */
export async function deleteHooksFromConfig(
  event: string,
  source: "user" | "project" | "local",
): Promise<void> {
  const configPath = getConfigPath(source);

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    // File doesn't exist
    return;
  }

  if (config.hooks && typeof config.hooks === "object") {
    delete (config.hooks as Record<string, unknown>)[event];
  }

  const { writeFile } = await import("fs/promises");
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

/**
 * Check if a hook should be included based on config
 * (For existing plugin hooks system)
 */
export function shouldIncludeHook(_opts: {
  entry?: any;
  config?: any;
  eligibility?: any;
}): boolean {
  // Default: include all hooks
  return true;
}

/**
 * Resolve hook configuration path
 */
export function resolveHookConfig(source: "user" | "project" | "local"): string {
  return getConfigPath(source);
}

/**
 * Resolve configuration path for hooks
 */
export function resolveConfigPath(source: "user" | "project" | "local"): string {
  return getConfigPath(source);
}

/**
 * Check if a configuration path is truthy/enabled
 */
export function isConfigPathTruthy(path: string): boolean {
  return path.length > 0;
}

/**
 * Check if hooks have binary content
 */
export function hasBinary(_config: any): boolean {
  // Default: no binary content in hooks
  return false;
}
