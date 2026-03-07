/**
 * LSP Diagnostics Handler
 * 
 * Handles diagnostic messages from LSP servers with deduplication and volume limiting.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Diagnostic, PublishDiagnosticsParams } from "./types.js";

const log = createSubsystemLogger("lsp-diagnostics");

// ============================================================================
// DIAGNOSTIC ATTACHMENT (FOR AGENT MESSAGES)
// ============================================================================

export interface DiagnosticAttachment {
  uri: string;
  diagnostics: Diagnostic[];
  serverName: string;
}

// ============================================================================
// DIAGNOSTICS MANAGER
// ============================================================================

/**
 * Manages LSP diagnostics with deduplication and volume limiting
 */
export class DiagnosticsManager {
  /** Pending diagnostics waiting to be delivered */
  private pending = new Map<string, Map<string, PublishDiagnosticsParams>>(); // uri -> serverName -> params

  /** Already delivered diagnostics */
  private delivered = new Map<string, PublishDiagnosticsParams>(); // uri -> params

  /** Configuration */
  private maxPerFile: number;
  private maxTotal: number;
  private debounceMs: number;

  /** Debounce timer */
  private debounceTimer: NodeJS.Timeout | null = null;

  /** Callback for when diagnostics are ready */
  private onReady?: (attachments: DiagnosticAttachment[]) => void;

  constructor(options?: {
    maxPerFile?: number;
    maxTotal?: number;
    debounceMs?: number;
  }) {
    this.maxPerFile = options?.maxPerFile ?? 100;
    this.maxTotal = options?.maxTotal ?? 500;
    this.debounceMs = options?.debounceMs ?? 300;
  }

  /**
   * Set callback for when diagnostics are ready
   */
  setOnReady(callback: (attachments: DiagnosticAttachment[]) => void): void {
    this.onReady = callback;
  }

  /**
   * Handle incoming diagnostics from an LSP server
   */
  handleDiagnostics(params: PublishDiagnosticsParams, serverName: string): void {
    const { uri, diagnostics, version } = params;

    log.debug(`Received ${diagnostics.length} diagnostics for ${uri} from ${serverName}`);

    // Get or create URI map
    let uriMap = this.pending.get(uri);
    if (!uriMap) {
      uriMap = new Map();
      this.pending.set(uri, uriMap);
    }

    // Store diagnostics for this server
    uriMap.set(serverName, { uri, diagnostics, version });

    // Trigger debounced delivery
    this.scheduleDelivery();
  }

  /**
   * Schedule debounced delivery
   */
  private scheduleDelivery(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.deliverDiagnostics();
    }, this.debounceMs);
  }

  /**
   * Deliver accumulated diagnostics
   */
  private deliverDiagnostics(): void {
    if (this.pending.size === 0) {
      return;
    }

    log.debug(`Processing ${this.pending.size} pending diagnostic file(s)`);

    // Collect all pending
    const allPending: Array<{ uri: string; serverName: string; params: PublishDiagnosticsParams }> = [];
    
    for (const [uri, serverMap] of this.pending) {
      for (const [serverName, params] of serverMap) {
        if (params.diagnostics.length > 0) {
          allPending.push({ uri, serverName, params });
        }
      }
    }

    // Clear pending
    this.pending.clear();

    // Deduplicate and limit
    const deduped = this.deduplicate(allPending);
    const limited = this.limitVolume(deduped);

    // Update delivered registry
    for (const attachment of limited) {
      this.delivered.set(attachment.uri, {
        uri: attachment.uri,
        diagnostics: attachment.diagnostics,
      });
    }

    // Notify callback
    if (limited.length > 0 && this.onReady) {
      log.debug(`Delivering ${limited.length} diagnostic file(s) from ${new Set(limited.map(a => a.serverName)).size} server(s)`);
      this.onReady(limited);
    }
  }

  /**
   * Deduplicate diagnostics
   */
  private deduplicate(
    pending: Array<{ uri: string; serverName: string; params: PublishDiagnosticsParams }>
  ): DiagnosticAttachment[] {
    const result: DiagnosticAttachment[] = [];

    // Group by URI
    const byUri = new Map<string, Array<{ serverName: string; diagnostics: Diagnostic[] }>>();
    
    for (const { uri, serverName, params } of pending) {
      let arr = byUri.get(uri);
      if (!arr) {
        arr = [];
        byUri.set(uri, arr);
      }
      arr.push({ serverName, diagnostics: params.diagnostics });
    }

    // Merge and deduplicate per URI
    for (const [uri, serverData] of byUri) {
      const seen = new Set<string>();
      const merged: Diagnostic[] = [];
      const servers: string[] = [];

      for (const { serverName, diagnostics } of serverData) {
        servers.push(serverName);
        
        for (const diag of diagnostics) {
          // Create key for deduplication
          const key = this.diagnosticKey(diag);
          
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(diag);
          }
        }
      }

      const before = merged.length + serverData.reduce((sum, d) => sum + d.diagnostics.length, 0);
      if (seen.size < before) {
        log.debug(`Deduplication removed ${before - seen.size} duplicate diagnostic(s)`);
      }

      if (merged.length > 0) {
        result.push({
          uri,
          diagnostics: merged,
          serverName: servers.join(", "),
        });
      }
    }

    return result;
  }

  /**
   * Limit diagnostic volume
   */
  private limitVolume(attachments: DiagnosticAttachment[]): DiagnosticAttachment[] {
    let total = attachments.reduce((sum, a) => sum + a.diagnostics.length, 0);
    
    if (total <= this.maxTotal && attachments.every(a => a.diagnostics.length <= this.maxPerFile)) {
      return attachments;
    }

    const limited: DiagnosticAttachment[] = [];
    let remaining = this.maxTotal;

    for (const attachment of attachments) {
      if (remaining <= 0) break;

      const trimmed = attachment.diagnostics.slice(0, Math.min(this.maxPerFile, remaining));
      remaining -= trimmed.length;

      if (trimmed.length > 0) {
        limited.push({
          ...attachment,
          diagnostics: trimmed,
        });
      }
    }

    const removed = total - (this.maxTotal - remaining);
    if (removed > 0) {
      log.debug(`Volume limiting removed ${removed} diagnostic(s) (max ${this.maxPerFile}/file, ${this.maxTotal} total)`);
    }

    return limited;
  }

  /**
   * Create a deduplication key for a diagnostic
   */
  private diagnosticKey(diag: Diagnostic): string {
    return `${diag.range.start.line}:${diag.range.start.character}:${diag.message}:${diag.code ?? ""}`;
  }

  /**
   * Get pending diagnostics (for agent attachments)
   */
  getPendingDiagnostics(): DiagnosticAttachment[] {
    // Force immediate delivery
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Collect all pending
    const result: DiagnosticAttachment[] = [];
    
    for (const [uri, serverMap] of this.pending) {
      for (const [serverName, params] of serverMap) {
        if (params.diagnostics.length > 0) {
          result.push({ uri, diagnostics: params.diagnostics, serverName });
        }
      }
    }

    // Clear pending
    this.pending.clear();

    // Update delivered count
    if (result.length > 0) {
      log.debug(`Cleared ${this.delivered.size} delivered diagnostic(s) from registry`);
      this.delivered.clear();
    }

    return result;
  }

  /**
   * Clear delivered diagnostics for a URI
   */
  clearDelivered(uri: string): void {
    if (this.delivered.has(uri)) {
      log.debug(`Clearing delivered diagnostics for ${uri}`);
      this.delivered.delete(uri);
    }
  }

  /**
   * Clear all diagnostics
   */
  clearAll(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    const count = this.pending.size;
    this.pending.clear();
    this.delivered.clear();
    
    log.debug(`Cleared ${count} pending diagnostic(s)`);
  }
}

// ============================================================================
// DIAGNOSTIC FORMATTING
// ============================================================================

/**
 * Severity to string
 */
export function severityToString(severity?: number): string {
  switch (severity) {
    case 1: return "Error";
    case 2: return "Warning";
    case 3: return "Information";
    case 4: return "Hint";
    default: return "Diagnostic";
  }
}

/**
 * Format diagnostics for display
 */
export function formatDiagnostics(attachment: DiagnosticAttachment, maxLines = 20): string {
  const { uri, diagnostics, serverName } = attachment;
  
  // Extract filename from URI
  const filename = uri.replace(/^file:\/\//, "").split("/").pop() || uri;
  
  const lines: string[] = [
    `### LSP Diagnostics: ${filename}`,
    `(from ${serverName})`,
    "",
  ];

  // Sort by severity (errors first)
  const sorted = [...diagnostics].sort((a, b) => (a.severity ?? 1) - (b.severity ?? 1));

  // Format each diagnostic
  let count = 0;
  for (const diag of sorted) {
    if (count >= maxLines) {
      lines.push(`... and ${sorted.length - count} more`);
      break;
    }

    const severity = severityToString(diag.severity);
    const line = diag.range.start.line + 1;
    const col = diag.range.start.character + 1;
    const message = diag.message.split("\n")[0]; // First line only

    lines.push(`[${severity}] line ${line}:${col}: ${message}`);
    
    if (diag.source) {
      lines.push(`  Source: ${diag.source}`);
    }
    
    if (diag.relatedInformation && diag.relatedInformation.length > 0) {
      lines.push(`  Related: ${diag.relatedInformation.length} location(s)`);
    }

    count++;
  }

  lines.push("");
  lines.push(`Total: ${diagnostics.length} diagnostic(s)`);

  return lines.join("\n");
}

/**
 * Format multiple diagnostic attachments
 */
export function formatAllDiagnostics(attachments: DiagnosticAttachment[]): string {
  if (attachments.length === 0) {
    return "";
  }

  const total = attachments.reduce((sum, a) => sum + a.diagnostics.length, 0);
  const files = new Set(attachments.map(a => a.uri)).size;
  const servers = new Set(attachments.map(a => a.serverName)).size;

  const lines: string[] = [
    `## LSP Diagnostics Summary`,
    `${total} diagnostic(s) from ${servers} server(s) in ${files} file(s)`,
    "",
  ];

  for (const attachment of attachments) {
    lines.push(formatDiagnostics(attachment, 10));
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultManager: DiagnosticsManager | null = null;

/**
 * Get or create the default diagnostics manager
 */
export function getDiagnosticsManager(): DiagnosticsManager {
  if (!defaultManager) {
    defaultManager = new DiagnosticsManager();
  }
  return defaultManager;
}

/**
 * Reset the default manager (for testing)
 */
export function resetDiagnosticsManager(): void {
  defaultManager?.clearAll();
  defaultManager = null;
}
