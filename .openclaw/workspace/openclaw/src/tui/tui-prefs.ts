/**
 * TUI User Preferences
 *
 * Persistent settings for TUI behavior
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("tui-prefs");

export interface TuiPreferences {
  /** Enable vim mode by default */
  vimMode: boolean;
  
  /** Default theme */
  theme: string;
  
  /** Show line numbers in code */
  showLineNumbers: boolean;
  
  /** Auto-collapse long code blocks */
  autoCollapseCode: boolean;
}

const DEFAULT_PREFS: TuiPreferences = {
  vimMode: false,
  theme: "default",
  showLineNumbers: true,
  autoCollapseCode: true,
};

const PREFS_FILE = join(homedir(), ".openclaw", "tui-prefs.json");

/**
 * Load TUI preferences
 */
export function loadTuiPrefs(): TuiPreferences {
  try {
    if (existsSync(PREFS_FILE)) {
      const data = readFileSync(PREFS_FILE, "utf-8");
      const prefs: unknown = JSON.parse(data);
      if (typeof prefs === "object" && prefs !== null) {
        const typedPrefs = prefs as Record<string, unknown>;
        return {
          ...DEFAULT_PREFS,
          vimMode: typeof typedPrefs.vimMode === "boolean" ? typedPrefs.vimMode : DEFAULT_PREFS.vimMode,
          theme: typeof typedPrefs.theme === "string" ? typedPrefs.theme : DEFAULT_PREFS.theme,
          showLineNumbers: typeof typedPrefs.showLineNumbers === "boolean" ? typedPrefs.showLineNumbers : DEFAULT_PREFS.showLineNumbers,
          autoCollapseCode: typeof typedPrefs.autoCollapseCode === "boolean" ? typedPrefs.autoCollapseCode : DEFAULT_PREFS.autoCollapseCode,
        };
      }
    }
  } catch (error) {
    log.warn("Failed to load TUI prefs, using defaults:", { error: String(error) });
  }
  return { ...DEFAULT_PREFS };
}

/**
 * Save TUI preferences
 */
export function saveTuiPrefs(prefs: Partial<TuiPreferences>): void {
  try {
    const current = loadTuiPrefs();
    const updated = { ...current, ...prefs };
    writeFileSync(PREFS_FILE, JSON.stringify(updated, null, 2), "utf-8");
    log.info("TUI prefs saved:", { prefs: updated });
  } catch (error) {
    log.error("Failed to save TUI prefs:", { error: String(error) });
  }
}

/**
 * Set vim mode preference
 */
export function setVimModePref(enabled: boolean): void {
  saveTuiPrefs({ vimMode: enabled });
}

/**
 * Get vim mode preference
 */
export function getVimModePref(): boolean {
  return loadTuiPrefs().vimMode;
}

/**
 * Set theme preference
 */
export function setThemePref(theme: string): void {
  saveTuiPrefs({ theme });
}

/**
 * Get theme preference
 */
export function getThemePref(): string {
  return loadTuiPrefs().theme;
}
