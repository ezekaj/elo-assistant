/**
 * PTY Anomaly Detection
 *
 * Real-time behavioral analysis for PTY sessions:
 *
 * 1. Pattern-based detection for known attack signatures
 * 2. Statistical anomaly detection via EWMA/Z-score
 * 3. Command sequence analysis
 * 4. Rate limiting and burst detection
 *
 * Designed for minimal latency - heavy analysis runs async.
 */

export interface AnomalyScore {
  /** Overall risk score 0-1 */
  overall: number;
  /** Individual detector scores */
  breakdown: {
    knownPattern: number;
    statistical: number;
    behavioral: number;
    rateLimit: number;
  };
  /** Triggered indicators */
  indicators: string[];
  /** Recommended action */
  action: "allow" | "warn" | "block" | "review";
}

export interface AnomalyConfig {
  /** Enable known pattern detection */
  enablePatternDetection: boolean;
  /** Enable statistical analysis */
  enableStatistical: boolean;
  /** Enable behavioral analysis */
  enableBehavioral: boolean;
  /** Commands per second threshold */
  rateLimit: number;
  /** Burst detection window (ms) */
  burstWindow: number;
  /** Score threshold for warnings */
  warnThreshold: number;
  /** Score threshold for blocking */
  blockThreshold: number;
}

const DEFAULT_CONFIG: AnomalyConfig = {
  enablePatternDetection: true,
  enableStatistical: true,
  enableBehavioral: true,
  rateLimit: 50,
  burstWindow: 1000,
  warnThreshold: 0.5,
  blockThreshold: 0.85,
};

/**
 * Known attack patterns (regex + severity)
 */
const ATTACK_PATTERNS: Array<{ pattern: RegExp; severity: number; indicator: string }> = [
  // Credential harvesting
  {
    pattern: /password|passwd|secret|token|api[_-]?key/i,
    severity: 0.4,
    indicator: "credential-keyword",
  },
  { pattern: /curl.*[-]u\s+\w+:\w+/i, severity: 0.7, indicator: "curl-credentials" },
  { pattern: /wget.*--password/i, severity: 0.7, indicator: "wget-credentials" },

  // Reverse shell patterns
  { pattern: /bash\s+-i\s+>&?\s*\/dev\/tcp/i, severity: 0.95, indicator: "bash-reverse-shell" },
  { pattern: /nc\s+-[elp].*\s+\d+/i, severity: 0.8, indicator: "netcat-listener" },
  { pattern: /python.*socket.*connect/i, severity: 0.6, indicator: "python-socket" },
  { pattern: /perl.*socket.*INET/i, severity: 0.7, indicator: "perl-socket" },
  { pattern: /ruby.*TCPSocket/i, severity: 0.6, indicator: "ruby-socket" },
  { pattern: /php.*fsockopen/i, severity: 0.7, indicator: "php-socket" },

  // Privilege escalation
  { pattern: /sudo\s+-S/i, severity: 0.5, indicator: "sudo-stdin" },
  { pattern: /chmod\s+[47]777/i, severity: 0.6, indicator: "chmod-world-writable" },
  { pattern: /chown\s+root/i, severity: 0.5, indicator: "chown-root" },
  { pattern: /\/etc\/sudoers/i, severity: 0.8, indicator: "sudoers-access" },
  { pattern: /setuid|setgid/i, severity: 0.6, indicator: "setuid-setgid" },

  // Data exfiltration
  { pattern: /curl.*-d.*@/i, severity: 0.6, indicator: "curl-file-upload" },
  { pattern: /base64.*\|.*curl/i, severity: 0.8, indicator: "base64-exfil" },
  { pattern: /tar.*\|.*ssh/i, severity: 0.5, indicator: "tar-ssh-pipe" },
  { pattern: /scp.*@.*:/i, severity: 0.3, indicator: "scp-remote" },

  // Cryptomining
  { pattern: /xmrig|minerd|cgminer|cpuminer/i, severity: 0.9, indicator: "cryptominer" },
  { pattern: /stratum\+tcp/i, severity: 0.95, indicator: "mining-pool" },

  // Persistence mechanisms
  { pattern: /crontab\s+-[el]/i, severity: 0.4, indicator: "crontab-edit" },
  { pattern: /\.bashrc|\.profile|\.zshrc/i, severity: 0.3, indicator: "shell-rc-access" },
  { pattern: /systemctl\s+enable/i, severity: 0.4, indicator: "systemd-enable" },
  { pattern: /\/etc\/init\.d/i, severity: 0.5, indicator: "init-script" },

  // Defense evasion
  { pattern: /history\s+-[cd]/i, severity: 0.7, indicator: "history-clear" },
  { pattern: /unset\s+HISTFILE/i, severity: 0.8, indicator: "histfile-unset" },
  { pattern: /rm\s+-rf\s+\/var\/log/i, severity: 0.9, indicator: "log-deletion" },
  { pattern: /shred|srm|wipe/i, severity: 0.6, indicator: "secure-delete" },

  // Container escape
  { pattern: /docker.*--privileged/i, severity: 0.7, indicator: "docker-privileged" },
  { pattern: /nsenter\s+/i, severity: 0.6, indicator: "nsenter" },
  { pattern: /\/proc\/\d+\/root/i, severity: 0.8, indicator: "proc-root-access" },

  // Encoded payloads
  { pattern: /echo.*\|.*base64\s+-d\s*\|.*sh/i, severity: 0.9, indicator: "base64-shell" },
  { pattern: /python.*-c.*exec.*decode/i, severity: 0.85, indicator: "python-decode-exec" },
  { pattern: /eval.*\$\(.*base64/i, severity: 0.9, indicator: "eval-base64" },
];

/**
 * EWMA (Exponentially Weighted Moving Average) calculator
 */
class EWMA {
  private value = 0;
  private variance = 0;
  private alpha: number;
  private initialized = false;

  constructor(alpha = 0.1) {
    this.alpha = alpha;
  }

  update(sample: number): void {
    if (!this.initialized) {
      this.value = sample;
      this.variance = 0;
      this.initialized = true;
      return;
    }

    const diff = sample - this.value;
    this.value += this.alpha * diff;
    this.variance = (1 - this.alpha) * (this.variance + this.alpha * diff * diff);
  }

  getMean(): number {
    return this.value;
  }

  getStdDev(): number {
    return Math.sqrt(this.variance);
  }

  getZScore(sample: number): number {
    const stdDev = this.getStdDev();
    if (stdDev === 0) return 0;
    return (sample - this.value) / stdDev;
  }
}

/**
 * Rate limiter with sliding window
 */
class RateLimiter {
  private timestamps: number[] = [];
  private windowMs: number;
  private limit: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Record an event and check if rate exceeded
   */
  check(): { allowed: boolean; currentRate: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove old timestamps
    this.timestamps = this.timestamps.filter((t) => t > windowStart);

    // Add current
    this.timestamps.push(now);

    const currentRate = (this.timestamps.length / this.windowMs) * 1000;

    return {
      allowed: this.timestamps.length <= this.limit,
      currentRate,
    };
  }

  /**
   * Get burst score (0-1) based on how close to limit
   */
  getBurstScore(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > windowStart);
    return Math.min(1, this.timestamps.length / this.limit);
  }
}

/**
 * Command sequence analyzer for behavioral patterns
 */
class BehaviorAnalyzer {
  private commandHistory: string[] = [];
  private maxHistory = 100;
  private suspiciousSequences: string[][] = [
    ["whoami", "id", "uname"],
    ["cat /etc/passwd", "cat /etc/shadow"],
    ["find / -perm", "chmod 777"],
    ["wget", "chmod +x", "./"],
    ["curl", "sh"],
  ];

  recordCommand(cmd: string): number {
    // Extract command name
    const cmdName = cmd.trim().split(/\s+/)[0].toLowerCase();
    this.commandHistory.push(cmdName);

    if (this.commandHistory.length > this.maxHistory) {
      this.commandHistory.shift();
    }

    return this.analyzeSequence();
  }

  private analyzeSequence(): number {
    let maxScore = 0;

    for (const suspicious of this.suspiciousSequences) {
      const matchCount = this.countSequenceMatch(suspicious);
      const score = matchCount / suspicious.length;
      maxScore = Math.max(maxScore, score);
    }

    return maxScore;
  }

  private countSequenceMatch(sequence: string[]): number {
    let matches = 0;
    const recent = this.commandHistory.slice(-20);

    for (const target of sequence) {
      if (recent.some((cmd) => cmd.includes(target.split(" ")[0]))) {
        matches++;
      }
    }

    return matches;
  }

  getRecentCommands(count: number): string[] {
    return this.commandHistory.slice(-count);
  }
}

/**
 * PTY Anomaly Detector
 *
 * Analyzes PTY data streams for suspicious behavior.
 * Uses multiple detection methods for defense in depth.
 */
export class PtyAnomalyDetector {
  private config: AnomalyConfig;
  private rateLimiter: RateLimiter;
  private behaviorAnalyzer: BehaviorAnalyzer;
  private outputSizeEwma: EWMA;
  private commandIntervalEwma: EWMA;
  private lastCommandTime = 0;
  private totalAnalyzed = 0;
  private alertsGenerated = 0;

  constructor(config: Partial<AnomalyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rateLimiter = new RateLimiter(this.config.rateLimit, this.config.burstWindow);
    this.behaviorAnalyzer = new BehaviorAnalyzer();
    this.outputSizeEwma = new EWMA(0.1);
    this.commandIntervalEwma = new EWMA(0.1);
  }

  /**
   * Analyze PTY output for anomalies (fast path)
   */
  analyzeOutput(data: string): AnomalyScore {
    this.totalAnalyzed++;

    const indicators: string[] = [];
    let knownPatternScore = 0;
    let statisticalScore = 0;
    let behavioralScore = 0;
    let rateLimitScore = 0;

    // 1. Known pattern detection (fast regex matching)
    if (this.config.enablePatternDetection) {
      for (const { pattern, severity, indicator } of ATTACK_PATTERNS) {
        if (pattern.test(data)) {
          knownPatternScore = Math.max(knownPatternScore, severity);
          indicators.push(indicator);
        }
      }
    }

    // 2. Statistical analysis
    if (this.config.enableStatistical) {
      this.outputSizeEwma.update(data.length);
      const zScore = Math.abs(this.outputSizeEwma.getZScore(data.length));
      // Convert Z-score to 0-1 score (Z>3 is highly anomalous)
      statisticalScore = Math.min(1, zScore / 5);
      if (zScore > 3) {
        indicators.push("output-size-anomaly");
      }
    }

    // 3. Behavioral analysis (command sequences)
    if (this.config.enableBehavioral) {
      // Check if this looks like a command (has newline or looks like shell input)
      if (data.includes("\n") || data.includes("$") || data.includes("#")) {
        behavioralScore = this.behaviorAnalyzer.recordCommand(data);
        if (behavioralScore > 0.5) {
          indicators.push("suspicious-sequence");
        }
      }
    }

    // 4. Rate limiting
    const rateCheck = this.rateLimiter.check();
    rateLimitScore = this.rateLimiter.getBurstScore();
    if (!rateCheck.allowed) {
      indicators.push("rate-limit-exceeded");
    }

    // Combine scores (weighted average)
    const overall =
      knownPatternScore * 0.5 +
      statisticalScore * 0.15 +
      behavioralScore * 0.2 +
      rateLimitScore * 0.15;

    // Determine action
    let action: AnomalyScore["action"] = "allow";
    if (overall >= this.config.blockThreshold) {
      action = "block";
      this.alertsGenerated++;
    } else if (overall >= this.config.warnThreshold) {
      action = "warn";
      this.alertsGenerated++;
    } else if (indicators.length > 0) {
      action = "review";
    }

    return {
      overall,
      breakdown: {
        knownPattern: knownPatternScore,
        statistical: statisticalScore,
        behavioral: behavioralScore,
        rateLimit: rateLimitScore,
      },
      indicators,
      action,
    };
  }

  /**
   * Analyze command input (stdin)
   */
  analyzeInput(data: string): AnomalyScore {
    const now = Date.now();

    // Track command interval
    if (this.lastCommandTime > 0) {
      const interval = now - this.lastCommandTime;
      this.commandIntervalEwma.update(interval);
    }
    this.lastCommandTime = now;

    // Run same analysis as output
    return this.analyzeOutput(data);
  }

  /**
   * Quick check if data needs full analysis
   */
  needsAnalysis(data: string): boolean {
    // Skip tiny data chunks (likely just cursor output)
    if (data.length < 5) return false;

    // Skip pure whitespace
    if (/^\s*$/.test(data)) return false;

    // Analyze everything else
    return true;
  }

  /**
   * Get detection statistics
   */
  getStats(): {
    totalAnalyzed: number;
    alertsGenerated: number;
    alertRate: number;
    recentCommands: string[];
  } {
    return {
      totalAnalyzed: this.totalAnalyzed,
      alertsGenerated: this.alertsGenerated,
      alertRate: this.totalAnalyzed > 0 ? this.alertsGenerated / this.totalAnalyzed : 0,
      recentCommands: this.behaviorAnalyzer.getRecentCommands(10),
    };
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.totalAnalyzed = 0;
    this.alertsGenerated = 0;
    this.lastCommandTime = 0;
  }
}

/**
 * Create detector with default configuration
 */
export function createAnomalyDetector(): PtyAnomalyDetector {
  return new PtyAnomalyDetector();
}

/**
 * Create high-security detector (more sensitive)
 */
export function createHighSecurityDetector(): PtyAnomalyDetector {
  return new PtyAnomalyDetector({
    warnThreshold: 0.3,
    blockThreshold: 0.7,
    rateLimit: 30,
  });
}

/**
 * Create permissive detector (fewer false positives)
 */
export function createPermissiveDetector(): PtyAnomalyDetector {
  return new PtyAnomalyDetector({
    warnThreshold: 0.7,
    blockThreshold: 0.95,
    rateLimit: 100,
    enableBehavioral: false,
  });
}
