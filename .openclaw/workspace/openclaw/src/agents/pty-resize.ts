/**
 * PTY Resize Handler
 *
 * Manages terminal resizing for PTY sessions. Programs query terminal size on
 * startup and expect SIGWINCH when size changes. This module provides:
 *
 * 1. Resize tracking with debouncing
 * 2. SIGWINCH triggering via node-pty resize()
 * 3. Size validation and bounds checking
 * 4. Resize event history for debugging
 */

import { scheduleTimeout, cancelTimeout } from "./timer-wheel.js";

export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface ResizeEvent {
  timestamp: number;
  from: TerminalSize;
  to: TerminalSize;
  reason: "initial" | "user" | "auto" | "api";
}

export interface PtyResizable {
  resize: (cols: number, rows: number) => void;
}

// Default terminal size (matches bash-tools.exec.ts)
const DEFAULT_SIZE: TerminalSize = { cols: 120, rows: 30 };

// Bounds for terminal size
const MIN_SIZE: TerminalSize = { cols: 10, rows: 3 };
const MAX_SIZE: TerminalSize = { cols: 500, rows: 200 };

/**
 * PTY Resize Manager
 *
 * Handles terminal resizing for a PTY session with debouncing,
 * validation, and event tracking.
 */
export class PtyResizeManager {
  private static instanceCounter = 0;
  private readonly instanceId = ++PtyResizeManager.instanceCounter;
  private currentSize: TerminalSize;
  private pty: PtyResizable | null = null;
  private resizeHistory: ResizeEvent[] = [];
  private maxHistorySize = 50;
  private debounceTimerId: string | null = null;
  private debounceMs = 100; // 100ms debounce for rapid resize events

  constructor(initialSize: TerminalSize = DEFAULT_SIZE) {
    this.currentSize = { ...this.validateSize(initialSize) };
  }

  /**
   * Attach a PTY handle for resize operations
   */
  attach(pty: PtyResizable): void {
    this.pty = pty;
  }

  /**
   * Detach the PTY handle
   */
  detach(): void {
    this.pty = null;
    if (this.debounceTimerId) {
      cancelTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  /**
   * Get current terminal size
   */
  getSize(): TerminalSize {
    return { ...this.currentSize };
  }

  /**
   * Resize the terminal
   *
   * @param cols - Number of columns (width)
   * @param rows - Number of rows (height)
   * @param reason - Reason for resize (for debugging)
   * @param immediate - Skip debouncing (default: false)
   */
  resize(
    cols: number,
    rows: number,
    reason: ResizeEvent["reason"] = "api",
    immediate = false,
  ): void {
    const validated = this.validateSize({ cols, rows });

    // No-op if size unchanged
    if (validated.cols === this.currentSize.cols && validated.rows === this.currentSize.rows) {
      return;
    }

    if (immediate) {
      this.applyResize(validated, reason);
    } else {
      // Debounce rapid resize events
      const timerId = `pty-resize-${this.instanceId}`;
      if (this.debounceTimerId) {
        cancelTimeout(this.debounceTimerId);
      }
      this.debounceTimerId = timerId;
      scheduleTimeout(timerId, this.debounceMs, () => {
        this.debounceTimerId = null;
        this.applyResize(validated, reason);
      });
    }
  }

  /**
   * Apply resize immediately
   */
  private applyResize(newSize: TerminalSize, reason: ResizeEvent["reason"]): void {
    const event: ResizeEvent = {
      timestamp: Date.now(),
      from: { ...this.currentSize },
      to: { ...newSize },
      reason,
    };

    // Record history
    this.resizeHistory.push(event);
    if (this.resizeHistory.length > this.maxHistorySize) {
      this.resizeHistory.shift();
    }

    // Update current size
    this.currentSize = newSize;

    // Apply to PTY (triggers SIGWINCH in child process)
    if (this.pty) {
      try {
        this.pty.resize(newSize.cols, newSize.rows);
      } catch {
        // Ignore resize errors (PTY may have exited)
      }
    }
  }

  /**
   * Validate and clamp terminal size within bounds
   */
  private validateSize(size: TerminalSize): TerminalSize {
    return {
      cols: Math.max(MIN_SIZE.cols, Math.min(MAX_SIZE.cols, Math.floor(size.cols))),
      rows: Math.max(MIN_SIZE.rows, Math.min(MAX_SIZE.rows, Math.floor(size.rows))),
    };
  }

  /**
   * Get resize event history
   */
  getHistory(): ResizeEvent[] {
    return [...this.resizeHistory];
  }

  /**
   * Get metrics for audit/debugging
   */
  getMetrics(): {
    currentSize: TerminalSize;
    resizeCount: number;
    lastResize: ResizeEvent | null;
  } {
    return {
      currentSize: this.getSize(),
      resizeCount: this.resizeHistory.length,
      lastResize: this.resizeHistory.length > 0 ? this.resizeHistory.at(-1)! : null,
    };
  }
}

/**
 * Auto-detect terminal size from process.stdout
 * Returns null if not attached to a TTY
 */
export function detectTerminalSize(): TerminalSize | null {
  if (!process.stdout.isTTY) {
    return null;
  }

  const { columns, rows } = process.stdout;
  if (typeof columns === "number" && typeof rows === "number") {
    return { cols: columns, rows };
  }

  return null;
}

/**
 * Get default terminal size
 */
export function getDefaultSize(): TerminalSize {
  return { ...DEFAULT_SIZE };
}

/**
 * Parse terminal size from TIOCGWINSZ response or environment
 */
export function parseTerminalSize(env?: Record<string, string>): TerminalSize {
  const cols = parseInt(env?.COLUMNS ?? "", 10);
  const rows = parseInt(env?.LINES ?? "", 10);

  return {
    cols: Number.isFinite(cols) && cols > 0 ? cols : DEFAULT_SIZE.cols,
    rows: Number.isFinite(rows) && rows > 0 ? rows : DEFAULT_SIZE.rows,
  };
}
