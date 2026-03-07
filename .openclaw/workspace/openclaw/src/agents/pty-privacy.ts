/**
 * PTY Privacy Protection
 *
 * Differential privacy and data protection for PTY session logs:
 *
 * 1. Timestamp obfuscation via Laplace noise
 * 2. Command redaction for sensitive operations
 * 3. k-anonymity for pattern masking
 * 4. Secure export with privacy guarantees
 *
 * Ensures audit logs don't leak sensitive timing or content information.
 */

import { createHash } from "crypto";

export interface PrivacyConfig {
  /** Epsilon for differential privacy (lower = more private, noisier) */
  epsilon: number;
  /** Sensitivity for timestamp noise (ms) */
  timestampSensitivity: number;
  /** Minimum k for k-anonymity */
  kAnonymity: number;
  /** Enable command redaction */
  enableRedaction: boolean;
  /** Enable timestamp noise */
  enableTimestampNoise: boolean;
  /** Patterns to always redact */
  redactionPatterns: RegExp[];
}

export interface PrivacyStats {
  entriesProcessed: number;
  entriesRedacted: number;
  patternsRedacted: Record<string, number>;
  averageNoiseAdded: number;
  privacyBudgetUsed: number;
}

const DEFAULT_CONFIG: PrivacyConfig = {
  epsilon: 1.0,
  timestampSensitivity: 1000, // 1 second
  kAnonymity: 5,
  enableRedaction: true,
  enableTimestampNoise: true,
  redactionPatterns: [
    // API keys and tokens
    /(?:api[_-]?key|token|secret|password|passwd|pwd)[=:]\s*['"]?[\w-]+['"]?/gi,
    // AWS credentials
    /AKIA[0-9A-Z]{16}/g,
    /(?:aws[_-]?)?secret[_-]?access[_-]?key[=:]\s*[\w/+]+/gi,
    // Private keys
    /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/g,
    // JWT tokens
    /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    // Basic auth in URLs
    /https?:\/\/[^:]+:[^@]+@/g,
    // Credit card numbers (basic pattern)
    /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
    // SSH private key content
    /(?:[A-Za-z0-9+/]{64,}={0,2}\s*)+/g,
    // Environment variable assignments with sensitive names
    /(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)[_A-Z]*=['"][^'"]+['"]/gi,
  ],
};

/**
 * Laplace distribution for differential privacy
 */
class LaplaceNoise {
  private epsilon: number;
  private sensitivity: number;

  constructor(epsilon: number, sensitivity: number) {
    this.epsilon = epsilon;
    this.sensitivity = sensitivity;
  }

  /**
   * Generate Laplace noise
   * Scale = sensitivity / epsilon
   */
  sample(): number {
    const u = Math.random() - 0.5;
    const scale = this.sensitivity / this.epsilon;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Add noise to a value
   */
  addNoise(value: number): number {
    return value + this.sample();
  }
}

/**
 * K-Anonymity enforcer for command patterns
 */
class KAnonymizer {
  private patternCounts: Map<string, number> = new Map();
  private k: number;

  constructor(k: number) {
    this.k = k;
  }

  /**
   * Record a pattern and check if it meets k-anonymity
   */
  recordPattern(pattern: string): boolean {
    const count = (this.patternCounts.get(pattern) || 0) + 1;
    this.patternCounts.set(pattern, count);
    return count >= this.k;
  }

  /**
   * Extract pattern from command (generalization)
   */
  extractPattern(command: string): string {
    // Replace specific values with placeholders
    return command
      .replace(/\d+/g, "<NUM>")
      .replace(/[a-f0-9]{32,}/gi, "<HASH>")
      .replace(/\/[\w/.-]+/g, "<PATH>")
      .replace(/"[^"]+"/g, "<STRING>")
      .replace(/'[^']+'/g, "<STRING>")
      .trim();
  }

  /**
   * Check if command is safe to include (meets k-anonymity)
   */
  isSafeToInclude(command: string): boolean {
    const pattern = this.extractPattern(command);
    return this.recordPattern(pattern);
  }

  /**
   * Get pattern frequency map
   */
  getPatternFrequencies(): Map<string, number> {
    return new Map(this.patternCounts);
  }

  /**
   * Reset counts
   */
  reset(): void {
    this.patternCounts.clear();
  }
}

/**
 * Secure content redactor
 */
class ContentRedactor {
  private patterns: RegExp[];
  private redactionStats: Record<string, number> = {};

  constructor(patterns: RegExp[]) {
    this.patterns = patterns;
  }

  /**
   * Redact sensitive content from string
   */
  redact(content: string): { redacted: string; count: number } {
    let result = content;
    let totalCount = 0;

    for (const pattern of this.patterns) {
      const matches = result.match(pattern);
      if (matches) {
        const count = matches.length;
        totalCount += count;

        // Track which pattern matched
        const patternKey = pattern.source.slice(0, 30);
        this.redactionStats[patternKey] = (this.redactionStats[patternKey] || 0) + count;

        // Replace with hash of original (allows correlation without revealing content)
        result = result.replace(pattern, (match) => {
          const hash = createHash("sha256").update(match).digest("hex").slice(0, 8);
          return `[REDACTED:${hash}]`;
        });
      }
    }

    return { redacted: result, count: totalCount };
  }

  /**
   * Add custom redaction pattern
   */
  addPattern(pattern: RegExp): void {
    this.patterns.push(pattern);
  }

  /**
   * Get redaction statistics
   */
  getStats(): Record<string, number> {
    return { ...this.redactionStats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.redactionStats = {};
  }
}

/**
 * Privacy-preserving entry transformation
 */
export interface PrivateEntry {
  /** Original sequence number (unchanged) */
  sequence: number;
  /** Obfuscated timestamp */
  timestamp: number;
  /** Entry type */
  type: string;
  /** Redacted data */
  data: string;
  /** Privacy metadata */
  privacy: {
    noiseAdded: number;
    redactionsApplied: number;
    meetsKAnonymity: boolean;
  };
}

/**
 * PTY Privacy Protector
 *
 * Applies differential privacy and redaction to session data
 * for secure storage and export.
 */
export class PtyPrivacyProtector {
  private config: PrivacyConfig;
  private laplaceNoise: LaplaceNoise;
  private kAnonymizer: KAnonymizer;
  private contentRedactor: ContentRedactor;
  private stats: PrivacyStats = {
    entriesProcessed: 0,
    entriesRedacted: 0,
    patternsRedacted: {},
    averageNoiseAdded: 0,
    privacyBudgetUsed: 0,
  };
  private totalNoiseAdded = 0;

  constructor(config: Partial<PrivacyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.laplaceNoise = new LaplaceNoise(this.config.epsilon, this.config.timestampSensitivity);
    this.kAnonymizer = new KAnonymizer(this.config.kAnonymity);
    this.contentRedactor = new ContentRedactor(this.config.redactionPatterns);
  }

  /**
   * Transform entry with privacy protections
   */
  protect(entry: {
    sequence: number;
    timestamp: number;
    type: string;
    data: string;
  }): PrivateEntry {
    this.stats.entriesProcessed++;

    // 1. Add timestamp noise (differential privacy)
    let noiseAdded = 0;
    let obfuscatedTimestamp = entry.timestamp;

    if (this.config.enableTimestampNoise) {
      noiseAdded = this.laplaceNoise.sample();
      obfuscatedTimestamp = Math.round(entry.timestamp + noiseAdded);
      this.totalNoiseAdded += Math.abs(noiseAdded);
      this.stats.privacyBudgetUsed += 1 / this.config.epsilon;
    }

    // 2. Redact sensitive content
    let processedData = entry.data;
    let redactionsApplied = 0;

    if (this.config.enableRedaction) {
      const { redacted, count } = this.contentRedactor.redact(entry.data);
      processedData = redacted;
      redactionsApplied = count;
      if (count > 0) {
        this.stats.entriesRedacted++;
      }
    }

    // 3. Check k-anonymity for command-like entries
    const meetsKAnonymity =
      entry.type === "stdin" ? this.kAnonymizer.isSafeToInclude(processedData) : true;

    // Update stats
    this.stats.averageNoiseAdded =
      this.stats.entriesProcessed > 0 ? this.totalNoiseAdded / this.stats.entriesProcessed : 0;

    this.stats.patternsRedacted = this.contentRedactor.getStats();

    return {
      sequence: entry.sequence,
      timestamp: obfuscatedTimestamp,
      type: entry.type,
      data: processedData,
      privacy: {
        noiseAdded: Math.round(noiseAdded),
        redactionsApplied,
        meetsKAnonymity,
      },
    };
  }

  /**
   * Batch protect entries (more efficient for large exports)
   */
  protectBatch(
    entries: Array<{ sequence: number; timestamp: number; type: string; data: string }>,
  ): PrivateEntry[] {
    return entries.map((entry) => this.protect(entry));
  }

  /**
   * Protect entries for export (filters out non-k-anonymous entries)
   */
  protectForExport(
    entries: Array<{ sequence: number; timestamp: number; type: string; data: string }>,
  ): PrivateEntry[] {
    const protected_ = this.protectBatch(entries);
    return protected_.filter((e) => e.privacy.meetsKAnonymity);
  }

  /**
   * Add custom redaction pattern
   */
  addRedactionPattern(pattern: RegExp): void {
    this.contentRedactor.addPattern(pattern);
  }

  /**
   * Get privacy statistics
   */
  getStats(): PrivacyStats {
    return { ...this.stats };
  }

  /**
   * Get privacy configuration summary
   */
  getConfigSummary(): {
    epsilon: number;
    kAnonymity: number;
    redactionEnabled: boolean;
    timestampNoiseEnabled: boolean;
    patternCount: number;
  } {
    return {
      epsilon: this.config.epsilon,
      kAnonymity: this.config.kAnonymity,
      redactionEnabled: this.config.enableRedaction,
      timestampNoiseEnabled: this.config.enableTimestampNoise,
      patternCount: this.config.redactionPatterns.length,
    };
  }

  /**
   * Reset statistics and anonymizer state
   */
  reset(): void {
    this.stats = {
      entriesProcessed: 0,
      entriesRedacted: 0,
      patternsRedacted: {},
      averageNoiseAdded: 0,
      privacyBudgetUsed: 0,
    };
    this.totalNoiseAdded = 0;
    this.kAnonymizer.reset();
    this.contentRedactor.resetStats();
  }
}

/**
 * Create privacy protector with strong privacy guarantees
 */
export function createStrongPrivacyProtector(): PtyPrivacyProtector {
  return new PtyPrivacyProtector({
    epsilon: 0.1, // Very strong privacy
    timestampSensitivity: 5000, // 5 second noise
    kAnonymity: 10,
    enableRedaction: true,
    enableTimestampNoise: true,
  });
}

/**
 * Create privacy protector with balanced settings
 */
export function createBalancedPrivacyProtector(): PtyPrivacyProtector {
  return new PtyPrivacyProtector({
    epsilon: 1.0,
    timestampSensitivity: 1000,
    kAnonymity: 5,
    enableRedaction: true,
    enableTimestampNoise: true,
  });
}

/**
 * Create privacy protector for compliance (redaction only, precise timestamps)
 */
export function createComplianceProtector(): PtyPrivacyProtector {
  return new PtyPrivacyProtector({
    epsilon: 10.0, // Minimal noise
    timestampSensitivity: 100,
    kAnonymity: 1, // No k-anonymity filtering
    enableRedaction: true,
    enableTimestampNoise: false, // Precise timestamps for audit
  });
}

/**
 * Utility: Check if string contains sensitive data
 */
export function containsSensitiveData(content: string): boolean {
  for (const pattern of DEFAULT_CONFIG.redactionPatterns) {
    // Reset lastIndex to avoid global regex state issues
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      pattern.lastIndex = 0; // Reset after match too
      return true;
    }
  }
  return false;
}

/**
 * Utility: Quick redact without full protector
 */
export function quickRedact(content: string): string {
  let result = content;
  for (const pattern of DEFAULT_CONFIG.redactionPatterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
