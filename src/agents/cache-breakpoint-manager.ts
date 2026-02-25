/**
 * Cache Breakpoint Manager
 *
 * Manages cache breakpoints for optimal prompt caching.
 * Supports up to 4 breakpoints per request with TTL options.
 */

import type { CacheTTL, CacheBreakpoint } from "../config/types.cache.js";
import { validateTTLOrdering } from "../config/types.cache.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("cache-breakpoint-manager");

// ============================================================================
// CACHE BREAKPOINT MANAGER CLASS
// ============================================================================

/**
 * Manages cache breakpoints for optimal caching
 */
export class CacheBreakpointManager {
  private breakpoints: CacheBreakpoint[] = [];
  private maxBreakpoints = 4;
  private enabled = true;

  constructor(enabled = true) {
    this.enabled = enabled;
    log.debug(`Cache breakpoint manager initialized (enabled: ${enabled})`);
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug(`Cache breakpoint manager ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Add breakpoint at specific position
   *
   * @param position - Block index (0 = tools, 1 = system, -1 = messages end)
   * @param ttl - Cache TTL (default: '5m')
   * @param description - Optional description for debugging
   */
  addBreakpoint(position: number, ttl: CacheTTL = "5m", description?: string): void {
    if (!this.enabled) {
      log.debug("Caching disabled, skipping breakpoint");
      return;
    }

    if (this.breakpoints.length >= this.maxBreakpoints) {
      throw new Error(`Maximum ${this.maxBreakpoints} breakpoints per request`);
    }

    // Validate TTL ordering (longer TTLs must come first)
    if (ttl === "5m" && this.breakpoints.some((bp) => bp.ttl === "1h")) {
      throw new Error("5m TTL cannot come after 1h TTL (longer TTLs must come first)");
    }

    const breakpoint: CacheBreakpoint = { position, ttl, description };
    this.breakpoints.push(breakpoint);

    log.debug(
      `Added breakpoint at position ${position} with TTL ${ttl}${description ? ` (${description})` : ""}`,
    );
  }

  /**
   * Add breakpoint at end of tools section
   *
   * Tools rarely change, so use long TTL
   *
   * @param ttl - Cache TTL (default: '1h')
   */
  addToolsBreakpoint(ttl: CacheTTL = "1h"): void {
    this.addBreakpoint(0, ttl, "Tool definitions");
  }

  /**
   * Add breakpoint at end of system section
   *
   * System instructions are stable, use long TTL
   *
   * @param ttl - Cache TTL (default: '1h')
   */
  addSystemBreakpoint(ttl: CacheTTL = "1h"): void {
    this.addBreakpoint(1, ttl, "System instructions");
  }

  /**
   * Add breakpoint at end of messages section
   *
   * Messages change frequently, use short TTL
   *
   * @param ttl - Cache TTL (default: '5m')
   */
  addMessagesBreakpoint(ttl: CacheTTL = "5m"): void {
    this.addBreakpoint(-1, ttl, "Conversation messages");
  }

  /**
   * Add breakpoint at end of conversation (optimal for multi-turn)
   *
   * This maximizes cache hits for growing conversations
   *
   * @param ttl - Cache TTL (default: '5m')
   */
  addConversationEndBreakpoint(ttl: CacheTTL = "5m"): void {
    this.addBreakpoint(-1, ttl, "End of conversation");
  }

  /**
   * Validate all breakpoints
   *
   * @returns Validation result with errors if any
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.enabled) {
      return { valid: true, errors: [] };
    }

    // Check max breakpoints
    if (this.breakpoints.length > this.maxBreakpoints) {
      errors.push(`Too many breakpoints: ${this.breakpoints.length} > ${this.maxBreakpoints}`);
    }

    // Check TTL ordering
    const ttls = this.breakpoints.map((bp) => bp.ttl);
    if (!validateTTLOrdering(ttls)) {
      errors.push("Invalid TTL ordering: 1h TTL cannot come after 5m TTL");
    }

    // Check for duplicate positions
    const positions = this.breakpoints.map((bp) => bp.position);
    const duplicates = positions.filter((pos, idx) => positions.indexOf(pos) !== idx);
    if (duplicates.length > 0) {
      errors.push(`Duplicate breakpoint positions: ${[...new Set(duplicates)].join(", ")}`);
    }

    const valid = errors.length === 0;

    if (valid) {
      log.debug(`Validated ${this.breakpoints.length} breakpoints: OK`);
    } else {
      log.warn(`Validation failed: ${errors.join("; ")}`);
    }

    return { valid, errors };
  }

  /**
   * Get all breakpoints
   *
   * @returns Array of breakpoints
   */
  getBreakpoints(): CacheBreakpoint[] {
    return [...this.breakpoints];
  }

  /**
   * Get breakpoint count
   *
   * @returns Number of breakpoints
   */
  getBreakpointCount(): number {
    return this.breakpoints.length;
  }

  /**
   * Clear all breakpoints
   */
  clear(): void {
    this.breakpoints = [];
    log.debug("Cleared all breakpoints");
  }

  /**
   * Reset manager to initial state
   */
  reset(): void {
    this.clear();
    this.enabled = true;
    log.debug("Reset breakpoint manager");
  }

  /**
   * Get manager stats
   */
  getStats(): {
    breakpointCount: number;
    maxBreakpoints: number;
    enabled: boolean;
    ttls: CacheTTL[];
  } {
    return {
      breakpointCount: this.breakpoints.length,
      maxBreakpoints: this.maxBreakpoints,
      enabled: this.enabled,
      ttls: this.breakpoints.map((bp) => bp.ttl),
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: CacheBreakpointManager | null = null;

/**
 * Get or create cache breakpoint manager singleton
 */
export function getCacheBreakpointManager(): CacheBreakpointManager {
  if (!instance) {
    instance = new CacheBreakpointManager();
  }
  return instance;
}

/**
 * Reset cache breakpoint manager singleton (for testing)
 */
export function resetCacheBreakpointManager(): void {
  instance = null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create breakpoint manager with optimal defaults
 *
 * Sets up breakpoints for:
 * 1. Tools (1h TTL)
 * 2. System (1h TTL)
 * 3. Messages end (5m TTL)
 */
export function createOptimalBreakpointManager(): CacheBreakpointManager {
  const manager = new CacheBreakpointManager();

  // Add optimal breakpoints
  manager.addToolsBreakpoint("1h");
  manager.addSystemBreakpoint("1h");
  manager.addMessagesBreakpoint("5m");

  // Validate
  const validation = manager.validate();
  if (!validation.valid) {
    log.warn(`Optimal breakpoint validation failed: ${validation.errors.join("; ")}`);
  }

  return manager;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CacheBreakpointManager,
  getCacheBreakpointManager,
  resetCacheBreakpointManager,
  createOptimalBreakpointManager,
};
