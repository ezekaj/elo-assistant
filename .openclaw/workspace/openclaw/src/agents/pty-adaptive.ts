/**
 * PTY Adaptive Security
 *
 * Dynamic security policy adjustment based on:
 *
 * 1. Runtime threat signals
 * 2. Session risk scoring
 * 3. Historical anomaly patterns
 * 4. External threat intelligence (optional)
 *
 * Automatically tightens or relaxes security based on context.
 */

import type { AnomalyScore, AnomalyConfig } from "./pty-anomaly.js";
import type { SecurityConfig } from "./pty-security.js";

export interface ThreatSignal {
  type: string;
  severity: number;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface AdaptiveConfig {
  /** Base security level 1-10 */
  baseSecurityLevel: number;
  /** Auto-adjust security based on signals */
  enableAdaptation: boolean;
  /** Signal decay half-life in ms */
  signalDecayMs: number;
  /** Maximum security level */
  maxSecurityLevel: number;
  /** Minimum security level */
  minSecurityLevel: number;
  /** Time window for signal aggregation (ms) */
  aggregationWindow: number;
}

export interface SecurityProfile {
  level: number;
  securityConfig: Partial<SecurityConfig>;
  anomalyConfig: Partial<AnomalyConfig>;
  description: string;
}

const DEFAULT_CONFIG: AdaptiveConfig = {
  baseSecurityLevel: 5,
  enableAdaptation: true,
  signalDecayMs: 300000, // 5 minutes
  maxSecurityLevel: 10,
  minSecurityLevel: 1,
  aggregationWindow: 60000, // 1 minute
};

/**
 * Security profiles by level (1-10)
 */
const SECURITY_PROFILES: Record<number, SecurityProfile> = {
  1: {
    level: 1,
    description: "Minimal - Development/Testing",
    securityConfig: {
      allowClipboard: true,
      allowWindowTitle: true,
      allowHyperlinks: true,
      allowAlternateScreen: true,
      allowBracketedPaste: true,
    },
    anomalyConfig: {
      enablePatternDetection: false,
      enableStatistical: false,
      enableBehavioral: false,
      warnThreshold: 0.95,
      blockThreshold: 0.99,
    },
  },
  3: {
    level: 3,
    description: "Low - Trusted Environment",
    securityConfig: {
      allowClipboard: false,
      allowWindowTitle: true,
      allowHyperlinks: true,
      allowAlternateScreen: true,
      allowBracketedPaste: true,
    },
    anomalyConfig: {
      enablePatternDetection: true,
      enableStatistical: false,
      enableBehavioral: false,
      warnThreshold: 0.8,
      blockThreshold: 0.95,
    },
  },
  5: {
    level: 5,
    description: "Standard - Normal Operations",
    securityConfig: {
      allowClipboard: false,
      allowWindowTitle: false,
      allowHyperlinks: false,
      allowAlternateScreen: true,
      allowBracketedPaste: true,
    },
    anomalyConfig: {
      enablePatternDetection: true,
      enableStatistical: true,
      enableBehavioral: true,
      warnThreshold: 0.5,
      blockThreshold: 0.85,
    },
  },
  7: {
    level: 7,
    description: "Elevated - High Security",
    securityConfig: {
      allowClipboard: false,
      allowWindowTitle: false,
      allowHyperlinks: false,
      allowAlternateScreen: true,
      allowBracketedPaste: false,
    },
    anomalyConfig: {
      enablePatternDetection: true,
      enableStatistical: true,
      enableBehavioral: true,
      warnThreshold: 0.3,
      blockThreshold: 0.7,
      rateLimit: 30,
    },
  },
  10: {
    level: 10,
    description: "Maximum - Lockdown Mode",
    securityConfig: {
      allowClipboard: false,
      allowWindowTitle: false,
      allowHyperlinks: false,
      allowAlternateScreen: false,
      allowBracketedPaste: false,
      maxOutputLength: 512 * 1024, // 512KB limit
    },
    anomalyConfig: {
      enablePatternDetection: true,
      enableStatistical: true,
      enableBehavioral: true,
      warnThreshold: 0.2,
      blockThreshold: 0.5,
      rateLimit: 10,
    },
  },
};

/**
 * Threat signal types and their severity weights
 */
const SIGNAL_WEIGHTS: Record<string, number> = {
  // High severity
  "reverse-shell-detected": 5.0,
  "credential-exfil": 4.5,
  "privilege-escalation": 4.0,
  "cryptominer-detected": 4.0,

  // Medium severity
  "suspicious-network": 2.5,
  "encoded-payload": 2.5,
  "persistence-attempt": 2.0,
  "defense-evasion": 2.0,

  // Low severity
  "rate-limit-exceeded": 1.0,
  "statistical-anomaly": 0.8,
  "behavioral-anomaly": 0.5,
  "unknown-pattern": 0.3,
};

/**
 * Exponential decay for signal severity over time
 */
class SignalDecay {
  private halfLife: number;

  constructor(halfLifeMs: number) {
    this.halfLife = halfLifeMs;
  }

  /**
   * Calculate decayed severity
   */
  decay(severity: number, ageMs: number): number {
    return severity * Math.pow(0.5, ageMs / this.halfLife);
  }
}

/**
 * Sliding window for signal aggregation
 */
class SignalWindow {
  private signals: ThreatSignal[] = [];
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /**
   * Add a signal
   */
  add(signal: ThreatSignal): void {
    this.signals.push(signal);
    this.prune();
  }

  /**
   * Get signals in current window
   */
  getActive(): ThreatSignal[] {
    this.prune();
    return [...this.signals];
  }

  /**
   * Remove old signals
   */
  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    this.signals = this.signals.filter((s) => s.timestamp > cutoff);
  }

  /**
   * Get count by type
   */
  getCountByType(): Record<string, number> {
    this.prune();
    const counts: Record<string, number> = {};
    for (const signal of this.signals) {
      counts[signal.type] = (counts[signal.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Clear all signals
   */
  clear(): void {
    this.signals = [];
  }
}

/**
 * Adaptive Security Manager
 *
 * Dynamically adjusts security settings based on threat signals.
 */
export class AdaptiveSecurityManager {
  private config: AdaptiveConfig;
  private currentLevel: number;
  private signalWindow: SignalWindow;
  private signalDecay: SignalDecay;
  private manualOverride: number | null = null;
  private levelHistory: Array<{ level: number; timestamp: number; reason: string }> = [];
  private maxHistorySize = 100;

  constructor(config: Partial<AdaptiveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLevel = this.config.baseSecurityLevel;
    this.signalWindow = new SignalWindow(this.config.aggregationWindow);
    this.signalDecay = new SignalDecay(this.config.signalDecayMs);
  }

  /**
   * Record a threat signal
   */
  recordSignal(type: string, severity?: number, details?: Record<string, unknown>): void {
    const signal: ThreatSignal = {
      type,
      severity: severity ?? SIGNAL_WEIGHTS[type] ?? 1.0,
      timestamp: Date.now(),
      details,
    };

    this.signalWindow.add(signal);

    if (this.config.enableAdaptation && !this.manualOverride) {
      this.recalculateLevel("signal:" + type);
    }
  }

  /**
   * Record anomaly score from detector
   */
  recordAnomalyScore(score: AnomalyScore): void {
    // Convert anomaly indicators to signals
    for (const indicator of score.indicators) {
      this.recordSignal(indicator, score.overall);
    }

    // Record action-level signals
    if (score.action === "block") {
      this.recordSignal("block-action", 3.0);
    } else if (score.action === "warn") {
      this.recordSignal("warn-action", 1.5);
    }
  }

  /**
   * Recalculate security level based on active signals
   */
  private recalculateLevel(reason: string): void {
    const signals = this.signalWindow.getActive();
    const now = Date.now();

    // Calculate weighted threat score
    let totalScore = 0;
    for (const signal of signals) {
      const age = now - signal.timestamp;
      const decayedSeverity = this.signalDecay.decay(signal.severity, age);
      totalScore += decayedSeverity;
    }

    // Map score to security level
    // Score 0 = base level
    // Score 10+ = max level
    const levelDelta = Math.min(
      this.config.maxSecurityLevel - this.config.baseSecurityLevel,
      Math.floor(totalScore / 2),
    );

    const newLevel = Math.max(
      this.config.minSecurityLevel,
      Math.min(this.config.maxSecurityLevel, this.config.baseSecurityLevel + levelDelta),
    );

    if (newLevel !== this.currentLevel) {
      this.setLevel(newLevel, reason);
    }
  }

  /**
   * Set security level
   */
  private setLevel(level: number, reason: string): void {
    this.currentLevel = level;

    // Record history
    this.levelHistory.push({
      level,
      timestamp: Date.now(),
      reason,
    });

    if (this.levelHistory.length > this.maxHistorySize) {
      this.levelHistory.shift();
    }
  }

  /**
   * Get current security profile
   */
  getProfile(): SecurityProfile {
    const effectiveLevel = this.manualOverride ?? this.currentLevel;

    // Find closest defined profile
    const definedLevels = Object.keys(SECURITY_PROFILES)
      .map(Number)
      .sort((a, b) => a - b);
    let closestLevel = definedLevels[0];

    for (const level of definedLevels) {
      if (level <= effectiveLevel) {
        closestLevel = level;
      }
    }

    return {
      ...SECURITY_PROFILES[closestLevel],
      level: effectiveLevel,
    };
  }

  /**
   * Get security filter config for current level
   */
  getSecurityConfig(): Partial<SecurityConfig> {
    return this.getProfile().securityConfig;
  }

  /**
   * Get anomaly detector config for current level
   */
  getAnomalyConfig(): Partial<AnomalyConfig> {
    return this.getProfile().anomalyConfig;
  }

  /**
   * Get current security level
   */
  getLevel(): number {
    return this.manualOverride ?? this.currentLevel;
  }

  /**
   * Set manual override (bypasses adaptive adjustment)
   */
  setManualOverride(level: number | null): void {
    if (level !== null) {
      level = Math.max(this.config.minSecurityLevel, Math.min(this.config.maxSecurityLevel, level));
    }
    this.manualOverride = level;
    if (level !== null) {
      this.setLevel(level, "manual-override");
    }
  }

  /**
   * Clear manual override (resume adaptive adjustment)
   */
  clearManualOverride(): void {
    this.manualOverride = null;
    this.recalculateLevel("override-cleared");
  }

  /**
   * Get active signals
   */
  getActiveSignals(): ThreatSignal[] {
    return this.signalWindow.getActive();
  }

  /**
   * Get level history
   */
  getLevelHistory(): Array<{ level: number; timestamp: number; reason: string }> {
    return [...this.levelHistory];
  }

  /**
   * Get comprehensive status
   */
  getStatus(): {
    currentLevel: number;
    effectiveLevel: number;
    profile: SecurityProfile;
    activeSignals: ThreatSignal[];
    signalCounts: Record<string, number>;
    isOverridden: boolean;
    lastLevelChange: { level: number; timestamp: number; reason: string } | null;
  } {
    const history = this.levelHistory;
    return {
      currentLevel: this.currentLevel,
      effectiveLevel: this.getLevel(),
      profile: this.getProfile(),
      activeSignals: this.getActiveSignals(),
      signalCounts: this.signalWindow.getCountByType(),
      isOverridden: this.manualOverride !== null,
      lastLevelChange: history.length > 0 ? history[history.length - 1] : null,
    };
  }

  /**
   * Reset to base level
   */
  reset(): void {
    this.currentLevel = this.config.baseSecurityLevel;
    this.manualOverride = null;
    this.signalWindow.clear();
    this.levelHistory = [];
    this.setLevel(this.config.baseSecurityLevel, "reset");
  }
}

/**
 * Create adaptive manager with standard settings
 */
export function createAdaptiveManager(): AdaptiveSecurityManager {
  return new AdaptiveSecurityManager();
}

/**
 * Create high-security adaptive manager
 */
export function createHighSecurityManager(): AdaptiveSecurityManager {
  return new AdaptiveSecurityManager({
    baseSecurityLevel: 7,
    minSecurityLevel: 5,
    maxSecurityLevel: 10,
    signalDecayMs: 600000, // 10 minutes
  });
}

/**
 * Create development-friendly adaptive manager
 */
export function createDevManager(): AdaptiveSecurityManager {
  return new AdaptiveSecurityManager({
    baseSecurityLevel: 3,
    minSecurityLevel: 1,
    maxSecurityLevel: 7,
    enableAdaptation: false, // Manual control only
  });
}

/**
 * Utility: Get security level description
 */
export function getSecurityLevelDescription(level: number): string {
  const profiles = Object.values(SECURITY_PROFILES);
  for (const profile of profiles.reverse()) {
    if (profile.level <= level) {
      return profile.description;
    }
  }
  return "Unknown";
}

/**
 * Utility: Get all defined security profiles
 */
export function getSecurityProfiles(): SecurityProfile[] {
  return Object.values(SECURITY_PROFILES);
}
