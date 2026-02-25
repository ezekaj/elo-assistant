/**
 * Circuit Breaker for Exec Tool
 *
 * Auto-halts agent activity when configurable thresholds are crossed.
 * Prevents runaway agents from causing excessive damage.
 *
 * SECURITY: Implements the "dead man's switch" pattern from research.
 * If an agent exceeds rate limits or triggers too many risky operations,
 * the circuit trips and blocks further execution until manual reset.
 *
 * States:
 * - CLOSED: Normal operation, commands execute
 * - OPEN: Tripped, all commands blocked until cooldown or manual reset
 * - HALF_OPEN: Testing if system recovered, allows limited commands
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerThresholds {
  /** Max operations per minute before tripping (default: 60) */
  maxOpsPerMinute: number;

  /** Max files modified per session before tripping (default: 50) */
  maxFilesModified: number;

  /** Max destructive commands (rm, drop, delete) per session (default: 10) */
  maxDestructiveOps: number;

  /** Max consecutive failures before tripping (default: 5) */
  maxConsecutiveFailures: number;

  /** Cooldown period in ms before auto-reset from OPEN (default: 5 min) */
  cooldownMs: number;

  /** Commands allowed in HALF_OPEN before returning to CLOSED (default: 3) */
  halfOpenTestCommands: number;
}

export interface CircuitStats {
  state: CircuitState;
  opsThisMinute: number;
  filesModified: number;
  destructiveOps: number;
  consecutiveFailures: number;
  lastTrippedAt: number | null;
  tripReason: string | null;
  totalTrips: number;
}

interface TimestampedOp {
  timestamp: number;
  type: "exec" | "file_modify" | "destructive" | "failure";
}

const DEFAULT_THRESHOLDS: CircuitBreakerThresholds = {
  maxOpsPerMinute: 60,
  maxFilesModified: 50,
  maxDestructiveOps: 10,
  maxConsecutiveFailures: 5,
  cooldownMs: 5 * 60 * 1000, // 5 minutes
  halfOpenTestCommands: 3,
};

// Patterns that indicate destructive operations
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-rf?|--force|-r)\b/i,
  /\brm\b.*\*/,
  /\brmdir\b/i,
  /\bunlink\b/i,
  /\bdrop\s+(table|database|index|view)/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\bformat\b.*drive/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  />\s*\/dev\/sd[a-z]/,
  /\bgit\s+(reset\s+--hard|clean\s+-fd)/i,
  /\bgit\s+push\s+.*--force/i,
];

// Patterns for file modification detection
const FILE_MODIFY_PATTERNS = [
  /\bcp\b.*-[rf]/i,
  /\bmv\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bsed\s+-i/i,
  /\bawk\b.*-i\s+inplace/i,
  />\s*\S+/,
  />>\s*\S+/,
  /\btee\b/,
  /\binstall\b/i,
  /\bgit\s+(checkout|reset|merge|rebase)/i,
];

let circuitBreakerInstance: CircuitBreaker | null = null;

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private thresholds: CircuitBreakerThresholds;
  private ops: TimestampedOp[] = [];
  private filesModifiedSet = new Set<string>();
  private destructiveOpsCount = 0;
  private consecutiveFailures = 0;
  private lastTrippedAt: number | null = null;
  private tripReason: string | null = null;
  private totalTrips = 0;
  private halfOpenSuccesses = 0;

  constructor(thresholds: Partial<CircuitBreakerThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  static getInstance(thresholds?: Partial<CircuitBreakerThresholds>): CircuitBreaker {
    if (!circuitBreakerInstance) {
      circuitBreakerInstance = new CircuitBreaker(thresholds);
    }
    return circuitBreakerInstance;
  }

  static resetInstance(): void {
    circuitBreakerInstance = null;
  }

  /**
   * Check if a command is allowed to execute.
   * Returns { allowed: true } or { allowed: false, reason: string }
   */
  canExecute(command?: string): { allowed: boolean; reason?: string } {
    // Check if cooldown has passed and we should transition to HALF_OPEN
    if (this.state === "OPEN" && this.lastTrippedAt) {
      const elapsed = Date.now() - this.lastTrippedAt;
      if (elapsed >= this.thresholds.cooldownMs) {
        this.state = "HALF_OPEN";
        this.halfOpenSuccesses = 0;
      }
    }

    if (this.state === "OPEN") {
      const remaining = this.lastTrippedAt
        ? Math.ceil((this.thresholds.cooldownMs - (Date.now() - this.lastTrippedAt)) / 1000)
        : 0;
      return {
        allowed: false,
        reason: `Circuit OPEN: ${this.tripReason}. Cooldown: ${remaining}s remaining.`,
      };
    }

    // Clean old ops (keep only last minute)
    this.cleanOldOps();

    // Check rate limit
    const opsThisMinute = this.ops.filter((op) => op.type === "exec").length;
    if (opsThisMinute >= this.thresholds.maxOpsPerMinute) {
      this.trip(
        `Rate limit exceeded: ${opsThisMinute} ops/min (max: ${this.thresholds.maxOpsPerMinute})`,
      );
      return { allowed: false, reason: this.tripReason! };
    }

    // Check file modification limit
    if (this.filesModifiedSet.size >= this.thresholds.maxFilesModified) {
      this.trip(
        `File modification limit: ${this.filesModifiedSet.size} files (max: ${this.thresholds.maxFilesModified})`,
      );
      return { allowed: false, reason: this.tripReason! };
    }

    // Check destructive ops limit
    if (this.destructiveOpsCount >= this.thresholds.maxDestructiveOps) {
      this.trip(
        `Destructive ops limit: ${this.destructiveOpsCount} (max: ${this.thresholds.maxDestructiveOps})`,
      );
      return { allowed: false, reason: this.tripReason! };
    }

    // Check consecutive failures
    if (this.consecutiveFailures >= this.thresholds.maxConsecutiveFailures) {
      this.trip(
        `Consecutive failures: ${this.consecutiveFailures} (max: ${this.thresholds.maxConsecutiveFailures})`,
      );
      return { allowed: false, reason: this.tripReason! };
    }

    // Pre-check if command would be destructive
    if (command && this.isDestructive(command)) {
      const wouldBeCount = this.destructiveOpsCount + 1;
      if (wouldBeCount > this.thresholds.maxDestructiveOps) {
        this.trip(
          `Destructive ops limit would be exceeded: ${wouldBeCount} (max: ${this.thresholds.maxDestructiveOps})`,
        );
        return { allowed: false, reason: this.tripReason! };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a command execution
   */
  recordExec(command: string, success: boolean): void {
    this.ops.push({ timestamp: Date.now(), type: "exec" });

    if (this.isDestructive(command)) {
      this.destructiveOpsCount++;
      this.ops.push({ timestamp: Date.now(), type: "destructive" });
    }

    if (this.modifiesFiles(command)) {
      // Extract potential file paths from command
      const paths = this.extractPaths(command);
      paths.forEach((p) => this.filesModifiedSet.add(p));
      this.ops.push({ timestamp: Date.now(), type: "file_modify" });
    }

    if (success) {
      this.consecutiveFailures = 0;
      if (this.state === "HALF_OPEN") {
        this.halfOpenSuccesses++;
        if (this.halfOpenSuccesses >= this.thresholds.halfOpenTestCommands) {
          this.reset();
        }
      }
    } else {
      this.consecutiveFailures++;
      this.ops.push({ timestamp: Date.now(), type: "failure" });
    }

    this.cleanOldOps();
  }

  /**
   * Record file modification (called separately when we know specific files)
   */
  recordFileModified(filepath: string): void {
    this.filesModifiedSet.add(filepath);
    this.ops.push({ timestamp: Date.now(), type: "file_modify" });
  }

  /**
   * Manually trip the circuit
   */
  trip(reason: string): void {
    if (this.state !== "OPEN") {
      this.state = "OPEN";
      this.lastTrippedAt = Date.now();
      this.tripReason = reason;
      this.totalTrips++;
    }
  }

  /**
   * Manually reset the circuit
   */
  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.tripReason = null;
    // Don't reset filesModified or destructiveOps - those are session-level
  }

  /**
   * Full reset including session counters
   */
  fullReset(): void {
    this.reset();
    this.filesModifiedSet.clear();
    this.destructiveOpsCount = 0;
    this.ops = [];
    this.lastTrippedAt = null;
    this.totalTrips = 0;
  }

  /**
   * Get current circuit stats
   */
  getStats(): CircuitStats {
    this.cleanOldOps();
    return {
      state: this.state,
      opsThisMinute: this.ops.filter((op) => op.type === "exec").length,
      filesModified: this.filesModifiedSet.size,
      destructiveOps: this.destructiveOpsCount,
      consecutiveFailures: this.consecutiveFailures,
      lastTrippedAt: this.lastTrippedAt,
      tripReason: this.tripReason,
      totalTrips: this.totalTrips,
    };
  }

  /**
   * Get thresholds
   */
  getThresholds(): CircuitBreakerThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<CircuitBreakerThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Check if command is destructive
   */
  isDestructive(command: string): boolean {
    return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
  }

  /**
   * Check if command modifies files
   */
  modifiesFiles(command: string): boolean {
    return FILE_MODIFY_PATTERNS.some((pattern) => pattern.test(command));
  }

  private extractPaths(command: string): string[] {
    // Simple extraction of paths (anything starting with / or ./)
    const matches = command.match(/(?:^|\s)(\/[\w./-]+|\.\/[\w./-]+)/g);
    return matches ? matches.map((m) => m.trim()) : [];
  }

  private cleanOldOps(): void {
    const oneMinuteAgo = Date.now() - 60_000;
    this.ops = this.ops.filter((op) => op.timestamp > oneMinuteAgo);
  }
}

/**
 * Check if execution is allowed
 */
export function canExecuteCommand(command?: string): { allowed: boolean; reason?: string } {
  return CircuitBreaker.getInstance().canExecute(command);
}

/**
 * Record command execution result
 */
export function recordCommandExecution(command: string, success: boolean): void {
  CircuitBreaker.getInstance().recordExec(command, success);
}

/**
 * Get circuit breaker status
 */
export function getCircuitStatus(): CircuitStats {
  return CircuitBreaker.getInstance().getStats();
}

/**
 * Manually trip the circuit
 */
export function tripCircuit(reason: string): void {
  CircuitBreaker.getInstance().trip(reason);
}

/**
 * Reset the circuit
 */
export function resetCircuit(): void {
  CircuitBreaker.getInstance().reset();
}

/**
 * Format circuit status for display
 */
export function formatCircuitStatus(): string {
  const stats = getCircuitStatus();
  const thresholds = CircuitBreaker.getInstance().getThresholds();

  const lines = [
    `Circuit: ${stats.state}`,
    `Ops/min: ${stats.opsThisMinute}/${thresholds.maxOpsPerMinute}`,
    `Files modified: ${stats.filesModified}/${thresholds.maxFilesModified}`,
    `Destructive ops: ${stats.destructiveOps}/${thresholds.maxDestructiveOps}`,
    `Consecutive failures: ${stats.consecutiveFailures}/${thresholds.maxConsecutiveFailures}`,
  ];

  if (stats.state === "OPEN" && stats.tripReason) {
    lines.push(`Reason: ${stats.tripReason}`);
  }

  if (stats.totalTrips > 0) {
    lines.push(`Total trips: ${stats.totalTrips}`);
  }

  return lines.join("\n");
}
