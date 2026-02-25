/**
 * Effort Level Environment Variables
 *
 * Matches Claude Code's CLAUDE_CODE_EFFORT_LEVEL pattern.
 * Controls default thinking depth and token spend for supported models.
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/effort.md
 */

/**
 * Environment variable for default effort level
 * Valid values: "low", "medium", "high", "max"
 */
export const OPENCLAW_EFFORT_LEVEL = process.env.OPENCLAW_EFFORT_LEVEL;

/**
 * Environment variable for default thinking level
 * Valid values: "off", "minimal", "low", "medium", "high", "xhigh"
 */
export const OPENCLAW_THINKING_LEVEL = process.env.OPENCLAW_THINKING_LEVEL;

/**
 * Type for effort levels
 */
export type EffortLevel = "low" | "medium" | "high" | "max";

/**
 * Valid effort level values
 */
export const VALID_EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "max"];

/**
 * Get default effort level from environment variable
 *
 * @returns Default effort level or undefined if not set or invalid
 *
 * @example
 * ```typescript
 * const defaultEffort = getDefaultEffortLevel();
 * if (defaultEffort) {
 *   console.log(`Default effort: ${defaultEffort}`);
 * }
 * ```
 */
export function getDefaultEffortLevel(): EffortLevel | undefined {
  if (!OPENCLAW_EFFORT_LEVEL) {
    return undefined;
  }

  const level = OPENCLAW_EFFORT_LEVEL.toLowerCase().trim();

  if (VALID_EFFORT_LEVELS.includes(level as EffortLevel)) {
    return level as EffortLevel;
  }

  return undefined;
}

/**
 * Check if an effort level is valid
 *
 * @param level - Effort level to validate
 * @returns true if valid effort level
 */
export function isValidEffortLevel(level: string): level is EffortLevel {
  return VALID_EFFORT_LEVELS.includes(level as EffortLevel);
}

/**
 * Normalize user-provided effort level string to canonical enum
 *
 * Accepts various aliases and normalizes to standard values:
 * - "low" → "low"
 * - "mid", "med", "medium" → "medium"
 * - "high", "ultra" → "high"
 * - "max", "maximum", "highest" → "max"
 *
 * @param raw - Raw effort level string
 * @returns Normalized effort level or undefined if invalid
 */
export function normalizeEffortLevel(raw?: string | null): EffortLevel | undefined {
  if (!raw) {
    return undefined;
  }

  const key = raw.toLowerCase().trim();

  if (key === "low") {
    return "low";
  }
  if (["mid", "med", "medium"].includes(key)) {
    return "medium";
  }
  if (["high", "ultra"].includes(key)) {
    return "high";
  }
  if (["max", "maximum", "highest"].includes(key)) {
    return "max";
  }

  return undefined;
}

/**
 * Get effort level description
 *
 * @param level - Effort level
 * @returns Human-readable description
 */
export function getEffortLevelDescription(level: EffortLevel): string {
  switch (level) {
    case "low":
      return "Minimal thinking, cost-optimized. Best for simple tasks and subagents.";
    case "medium":
      return "Balanced thinking and cost. Default for Opus 4.6.";
    case "high":
      return "Deep thinking. Default for most tasks.";
    case "max":
      return "Deepest reasoning. Opus 4.6 only. For critical analysis.";
  }
}

/**
 * Get effort level cost multiplier (relative to "high")
 *
 * @param level - Effort level
 * @returns Cost multiplier (1.0 = baseline)
 */
export function getEffortCostMultiplier(level: EffortLevel): number {
  switch (level) {
    case "low":
      return 0.5; // ~50% of high cost
    case "medium":
      return 0.75; // ~75% of high cost
    case "high":
      return 1.0; // Baseline
    case "max":
      return 1.5; // ~150% of high cost
  }
}
