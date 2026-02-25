/**
 * PTY Security Filter
 *
 * Filters potentially dangerous terminal escape sequences from PTY output.
 * Protects against:
 *
 * 1. Terminal hijacking via crafted escape sequences
 * 2. Clipboard injection attacks (OSC 52)
 * 3. Window title manipulation for phishing
 * 4. Hyperlink injection with malicious URLs
 * 5. Excessive output DoS attacks
 */

const ESC = "\x1b";
const BEL = "\x07";
const ST = `${ESC}\\`; // String Terminator

export interface FilterResult {
  /** Filtered output safe for display */
  safe: string;
  /** List of blocked sequences (hex-encoded for logging) */
  blocked: string[];
  /** Security warnings generated */
  warnings: string[];
  /** Statistics */
  stats: FilterStats;
}

export interface FilterStats {
  inputLength: number;
  outputLength: number;
  totalSequencesProcessed: number;
  sequencesBlocked: number;
  sequencesByType: Record<string, number>;
}

export interface SecurityConfig {
  /** Max output length before truncation (default: 1MB) */
  maxOutputLength: number;
  /** Allow OSC 52 clipboard operations (default: false) */
  allowClipboard: boolean;
  /** Allow OSC 0/1/2 window title changes (default: false) */
  allowWindowTitle: boolean;
  /** Allow OSC 8 hyperlinks (default: false) */
  allowHyperlinks: boolean;
  /** Allow alternate screen buffer (default: true - needed for vim) */
  allowAlternateScreen: boolean;
  /** Allow bracketed paste mode (default: true - needed for editors) */
  allowBracketedPaste: boolean;
  /** Log blocked sequences for audit (default: true) */
  logBlocked: boolean;
}

const DEFAULT_CONFIG: SecurityConfig = {
  maxOutputLength: 1024 * 1024, // 1MB
  allowClipboard: false,
  allowWindowTitle: false,
  allowHyperlinks: false,
  allowAlternateScreen: true,
  allowBracketedPaste: true,
  logBlocked: true,
};

/**
 * Dangerous sequence patterns that are always blocked
 */
const ALWAYS_BLOCKED_PATTERNS = [
  // Soft reset - can change terminal state unexpectedly
  /\x1b\[!p/g,
  // Hard reset - completely resets terminal
  /\x1bc/g,
  // Set/reset conformance level - can disable safety features
  /\x1b\[\d*"p/g,
  // Set terminal ID - spoofing
  /\x1b\[\d*;\d*"q/g,
  // Custom terminal sequences that could be malicious
  /\x1b\]777;[^\x07\x1b]*(?:\x07|\x1b\\)/g, // rxvt-unicode private sequences
  /\x1b\]50;[^\x07\x1b]*(?:\x07|\x1b\\)/g, // XTerm font manipulation
  /\x1b\]10[0-9];[^\x07\x1b]*(?:\x07|\x1b\\)/g, // Special color manipulation
];

/**
 * OSC (Operating System Command) sequences
 */
const OSC_PATTERNS = {
  // OSC 52 - Clipboard manipulation
  clipboard: /\x1b\]52;[^\x07\x1b]*(?:\x07|\x1b\\)/g,
  // OSC 0/1/2 - Window title
  windowTitle: /\x1b\][012];[^\x07\x1b]*(?:\x07|\x1b\\)/g,
  // OSC 8 - Hyperlinks
  hyperlinks: /\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g,
};

/**
 * CSI (Control Sequence Introducer) sequences
 */
const CSI_PATTERNS = {
  // Alternate screen buffer (?1049h/l, ?47h/l)
  alternateScreen: /\x1b\[\?(?:1049|47)[hl]/g,
  // Bracketed paste mode (?2004h/l)
  bracketedPaste: /\x1b\[\?2004[hl]/g,
};

/**
 * PTY Security Filter
 *
 * Filters PTY output to remove potentially dangerous escape sequences
 * while preserving safe terminal functionality.
 */
export class PtySecurityFilter {
  private config: SecurityConfig;
  private sessionStats: FilterStats = {
    inputLength: 0,
    outputLength: 0,
    totalSequencesProcessed: 0,
    sequencesBlocked: 0,
    sequencesByType: {},
  };

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Filter PTY output for dangerous sequences
   */
  filter(input: string): FilterResult {
    const blocked: string[] = [];
    const warnings: string[] = [];
    let safe = input;

    this.sessionStats.inputLength += input.length;

    // Check for excessive output (DoS protection)
    if (safe.length > this.config.maxOutputLength) {
      safe = safe.slice(0, this.config.maxOutputLength);
      warnings.push(
        `Output truncated from ${input.length} to ${this.config.maxOutputLength} bytes`,
      );
    }

    // Always blocked - dangerous sequences
    for (const pattern of ALWAYS_BLOCKED_PATTERNS) {
      safe = safe.replace(pattern, (match) => {
        blocked.push(this.hexEncode(match));
        this.recordBlocked("dangerous", match);
        return "";
      });
    }

    // Clipboard (OSC 52)
    if (!this.config.allowClipboard) {
      safe = safe.replace(OSC_PATTERNS.clipboard, (match) => {
        blocked.push(this.hexEncode(match));
        this.recordBlocked("clipboard", match);
        return "";
      });
    }

    // Window title (OSC 0/1/2)
    if (!this.config.allowWindowTitle) {
      safe = safe.replace(OSC_PATTERNS.windowTitle, (match) => {
        blocked.push(this.hexEncode(match));
        this.recordBlocked("windowTitle", match);
        return "";
      });
    }

    // Hyperlinks (OSC 8)
    if (!this.config.allowHyperlinks) {
      safe = safe.replace(OSC_PATTERNS.hyperlinks, (match) => {
        blocked.push(this.hexEncode(match));
        this.recordBlocked("hyperlink", match);
        return "";
      });
    }

    // Alternate screen (needed for vim, less, etc.)
    if (!this.config.allowAlternateScreen) {
      safe = safe.replace(CSI_PATTERNS.alternateScreen, (match) => {
        blocked.push(this.hexEncode(match));
        this.recordBlocked("alternateScreen", match);
        return "";
      });
    }

    // Bracketed paste (needed for modern editors)
    if (!this.config.allowBracketedPaste) {
      safe = safe.replace(CSI_PATTERNS.bracketedPaste, (match) => {
        blocked.push(this.hexEncode(match));
        this.recordBlocked("bracketedPaste", match);
        return "";
      });
    }

    this.sessionStats.outputLength += safe.length;

    return {
      safe,
      blocked,
      warnings,
      stats: { ...this.sessionStats },
    };
  }

  /**
   * Get current statistics
   */
  getStats(): FilterStats {
    return { ...this.sessionStats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.sessionStats = {
      inputLength: 0,
      outputLength: 0,
      totalSequencesProcessed: 0,
      sequencesBlocked: 0,
      sequencesByType: {},
    };
  }

  /**
   * Record a blocked sequence for statistics
   */
  private recordBlocked(type: string, _match: string): void {
    this.sessionStats.sequencesBlocked++;
    this.sessionStats.totalSequencesProcessed++;
    this.sessionStats.sequencesByType[type] = (this.sessionStats.sequencesByType[type] || 0) + 1;
  }

  /**
   * Hex-encode a string for safe logging
   */
  private hexEncode(str: string): string {
    return Buffer.from(str, "utf8").toString("hex");
  }
}

/**
 * Check if a string contains potentially dangerous sequences
 * (Quick check without full filtering)
 */
export function containsDangerousSequences(input: string): boolean {
  for (const pattern of ALWAYS_BLOCKED_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitize a string for safe logging (escape control characters)
 */
export function sanitizeForLog(input: string): string {
  return input
    .replace(/\x1b/g, "\\x1b")
    .replace(/\x07/g, "\\x07")
    .replace(/[\x00-\x1f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/**
 * Create a security filter with default safe configuration
 */
export function createSecureFilter(): PtySecurityFilter {
  return new PtySecurityFilter({
    allowClipboard: false,
    allowWindowTitle: false,
    allowHyperlinks: false,
    allowAlternateScreen: true,
    allowBracketedPaste: true,
  });
}

/**
 * Create a permissive filter (less secure, more compatible)
 */
export function createPermissiveFilter(): PtySecurityFilter {
  return new PtySecurityFilter({
    allowClipboard: false, // Still block clipboard for safety
    allowWindowTitle: true,
    allowHyperlinks: true,
    allowAlternateScreen: true,
    allowBracketedPaste: true,
  });
}
