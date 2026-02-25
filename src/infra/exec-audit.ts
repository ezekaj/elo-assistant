/**
 * Exec Audit Logging System
 *
 * Provides structured audit logging for all exec operations,
 * including decision chains, outcomes, and queryable history.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExecAsk, ExecHost, ExecSecurity } from "./exec-approvals.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityDecision =
  | { type: "config-default"; host: ExecHost; security: ExecSecurity; ask: ExecAsk }
  | {
      type: "request-override";
      field: string;
      requested: string;
      effective: string;
      allowed: boolean;
    }
  | { type: "elevated-mode"; enabled: boolean; mode: "off" | "ask" | "full" }
  | {
      type: "security-resolution";
      configured: ExecSecurity;
      requested?: ExecSecurity;
      effective: ExecSecurity;
    }
  | { type: "allowlist-eval"; analysisOk: boolean; satisfied: boolean; matchCount: number }
  | { type: "safe-bin-match"; binary: string; matched: boolean }
  | { type: "approval-required"; reason: string }
  | { type: "approval-bypassed"; reason: string }
  | { type: "immediate-deny"; pattern: string; reason: string };

export interface ExecAuditEntry {
  // Identity
  id: string;
  timestamp: number;

  // Hash chain (tamper-evident)
  entryHash: string;
  previousHash: string;

  // Command details
  command: string;
  commandHash: string;
  cwd: string;

  // Security context
  host: ExecHost;
  security: ExecSecurity;
  ask: ExecAsk;
  agentId?: string;
  sessionKey?: string;

  // Decision chain
  decisionChain: SecurityDecision[];

  // Result
  decision: "allowed" | "denied" | "pending" | "dry-run";
  denialReason?: string;

  // Approval info
  approval?: {
    method: "auto" | "allowlist" | "safe-bin" | "user-approved" | "full-mode";
    approvalId?: string;
    userDecision?: "allow-once" | "allow-always" | "deny";
    respondedAt?: number;
  };

  // Execution outcome
  execution?: {
    pid?: number;
    sessionId: string;
    startedAt: number;
    completedAt?: number;
    exitCode?: number | null;
    exitSignal?: string | number | null;
    durationMs?: number;
    timedOut: boolean;
  };

  // Sanitized environment snapshot
  env: Record<string, string>;
}

export interface AuditQueryOptions {
  last?: number;
  command?: string;
  denied?: boolean;
  allowed?: boolean;
  since?: number;
  agentId?: string;
  host?: ExecHost;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const AUDIT_DIR = path.join(os.homedir(), ".openclaw", "audit");
const AUDIT_FILE = "exec-audit.jsonl";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB rotation threshold
const MAX_ENTRIES_IN_MEMORY = 1000;

// Genesis hash for the first entry in the chain
const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

// Safe environment keys to include in audit log
const SAFE_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "PWD",
  "OLDPWD",
  "HOSTNAME",
  "LOGNAME",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

function ensureAuditDir(): void {
  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // Directory may already exist
  }
}

function getAuditFilePath(): string {
  return path.join(AUDIT_DIR, AUDIT_FILE);
}

function rotateIfNeeded(): void {
  const filePath = getAuditFilePath();
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archivePath = path.join(AUDIT_DIR, `exec-audit-${timestamp}.jsonl`);
      fs.renameSync(filePath, archivePath);
    }
  } catch {
    // File doesn't exist yet, no rotation needed
  }
}

/**
 * Hash a command for deduplication and quick search
 */
export function hashCommand(command: string): string {
  return crypto.createHash("sha256").update(command).digest("hex").slice(0, 16);
}

/**
 * Compute SHA-256 hash of an audit entry (excluding the entryHash field itself)
 * This creates a deterministic hash of the entry's content for chain verification.
 */
export function computeEntryHash(entry: Omit<ExecAuditEntry, "entryHash">): string {
  // Create a canonical representation excluding entryHash
  const canonical = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    previousHash: entry.previousHash,
    command: entry.command,
    commandHash: entry.commandHash,
    cwd: entry.cwd,
    host: entry.host,
    security: entry.security,
    ask: entry.ask,
    agentId: entry.agentId,
    sessionKey: entry.sessionKey,
    decisionChain: entry.decisionChain,
    decision: entry.decision,
    denialReason: entry.denialReason,
    approval: entry.approval,
    execution: entry.execution,
    env: entry.env,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Get the hash of the last entry in the audit log
 * Returns GENESIS_HASH if the log is empty or doesn't exist.
 */
export function getLastEntryHash(): string {
  const filePath = getAuditFilePath();

  if (!fs.existsSync(filePath)) {
    return GENESIS_HASH;
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      return GENESIS_HASH;
    }

    // Get the last valid entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]) as ExecAuditEntry;
        if (entry.entryHash) {
          return entry.entryHash;
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error, start fresh
  }

  return GENESIS_HASH;
}

/**
 * Sanitize environment variables for audit logging
 * Only includes safe, non-sensitive keys
 */
export function sanitizeEnvForAudit(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const key of SAFE_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string") {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Write an audit entry to the log file with hash-chain linking.
 * If the entry doesn't have hash fields, they will be computed.
 */
export function writeAuditEntry(entry: ExecAuditEntry): void {
  ensureAuditDir();
  rotateIfNeeded();

  // Ensure hash chain is set
  let finalEntry = entry;
  if (!entry.previousHash || !entry.entryHash) {
    const previousHash = getLastEntryHash();
    const entryWithPrevHash = { ...entry, previousHash };
    const entryHash = computeEntryHash(entryWithPrevHash);
    finalEntry = { ...entryWithPrevHash, entryHash };
  }

  const line = JSON.stringify(finalEntry) + "\n";
  try {
    fs.appendFileSync(getAuditFilePath(), line, { mode: 0o600 });
  } catch (err) {
    // Log write failures shouldn't break execution
    console.error(`[exec-audit] Failed to write audit entry: ${err}`);
  }
}

/**
 * Create a new audit entry with defaults.
 * Hash fields are placeholders; writeAuditEntry computes the actual chain.
 */
export function createAuditEntry(params: {
  command: string;
  cwd: string;
  host: ExecHost;
  security: ExecSecurity;
  ask: ExecAsk;
  agentId?: string;
  sessionKey?: string;
  env?: Record<string, string | undefined>;
}): ExecAuditEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    entryHash: "", // Computed by writeAuditEntry
    previousHash: "", // Computed by writeAuditEntry
    command: params.command,
    commandHash: hashCommand(params.command),
    cwd: params.cwd,
    host: params.host,
    security: params.security,
    ask: params.ask,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    decisionChain: [],
    decision: "pending",
    env: sanitizeEnvForAudit(params.env ?? process.env),
  };
}

/**
 * Read and parse audit log entries
 */
export function readAuditLog(options: AuditQueryOptions = {}): ExecAuditEntry[] {
  const filePath = getAuditFilePath();

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);

  let entries: ExecAuditEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ExecAuditEntry;
      entries.push(entry);
    } catch {
      // Skip malformed lines
    }
  }

  // Apply filters
  if (options.since) {
    entries = entries.filter((e) => e.timestamp >= options.since!);
  }

  if (options.command) {
    const pattern = new RegExp(options.command, "i");
    entries = entries.filter((e) => pattern.test(e.command));
  }

  if (options.denied) {
    entries = entries.filter((e) => e.decision === "denied");
  }

  if (options.allowed) {
    entries = entries.filter((e) => e.decision === "allowed");
  }

  if (options.agentId) {
    entries = entries.filter((e) => e.agentId === options.agentId);
  }

  if (options.host) {
    entries = entries.filter((e) => e.host === options.host);
  }

  // Apply limit (most recent first)
  if (options.last && options.last > 0) {
    entries = entries.slice(-options.last);
  }

  // Cap memory usage
  if (entries.length > MAX_ENTRIES_IN_MEMORY) {
    entries = entries.slice(-MAX_ENTRIES_IN_MEMORY);
  }

  return entries;
}

/**
 * Format audit entries for CLI display
 */
export function formatAuditEntries(entries: ExecAuditEntry[]): string {
  if (entries.length === 0) {
    return "No audit entries found.";
  }

  const lines: string[] = [];

  for (const entry of entries) {
    const status =
      entry.decision === "allowed" ? "\u2713" : entry.decision === "denied" ? "\u2717" : "?";
    const time = new Date(entry.timestamp).toISOString();
    const cmd = entry.command.length > 60 ? entry.command.slice(0, 57) + "..." : entry.command;
    const exit = entry.execution?.exitCode ?? "-";

    lines.push(`${status} [${time}] ${cmd}`);
    lines.push(`  Host: ${entry.host} | Security: ${entry.security} | Exit: ${exit}`);

    if (entry.denialReason) {
      lines.push(`  Denied: ${entry.denialReason}`);
    }

    if (entry.decisionChain.length > 0) {
      lines.push(`  Decisions: ${entry.decisionChain.length} steps`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get audit statistics
 */
export function getAuditStats(since?: number): {
  total: number;
  allowed: number;
  denied: number;
  pending: number;
  byHost: Record<string, number>;
  bySecurity: Record<string, number>;
} {
  const entries = readAuditLog({ since });

  const stats = {
    total: entries.length,
    allowed: 0,
    denied: 0,
    pending: 0,
    byHost: {} as Record<string, number>,
    bySecurity: {} as Record<string, number>,
  };

  for (const entry of entries) {
    if (entry.decision === "allowed") stats.allowed++;
    else if (entry.decision === "denied") stats.denied++;
    else stats.pending++;

    stats.byHost[entry.host] = (stats.byHost[entry.host] ?? 0) + 1;
    stats.bySecurity[entry.security] = (stats.bySecurity[entry.security] ?? 0) + 1;
  }

  return stats;
}

/**
 * Verification result for a single entry in the chain
 */
export interface ChainVerificationEntry {
  index: number;
  id: string;
  timestamp: number;
  valid: boolean;
  error?: string;
}

/**
 * Result of verifying the audit log hash chain
 */
export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  validEntries: number;
  invalidEntries: number;
  firstInvalidIndex?: number;
  entries: ChainVerificationEntry[];
}

/**
 * Verify the integrity of the audit log hash chain.
 * Checks that:
 * 1. Each entry's entryHash matches its computed hash
 * 2. Each entry's previousHash matches the prior entry's entryHash
 * 3. The first entry's previousHash is the GENESIS_HASH
 */
export function verifyAuditChain(): ChainVerificationResult {
  const filePath = getAuditFilePath();
  const result: ChainVerificationResult = {
    valid: true,
    totalEntries: 0,
    validEntries: 0,
    invalidEntries: 0,
    entries: [],
  };

  if (!fs.existsSync(filePath)) {
    return result; // Empty log is valid
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);

  let expectedPreviousHash = GENESIS_HASH;

  for (let i = 0; i < lines.length; i++) {
    result.totalEntries++;

    let entry: ExecAuditEntry;
    try {
      entry = JSON.parse(lines[i]) as ExecAuditEntry;
    } catch {
      const verifyEntry: ChainVerificationEntry = {
        index: i,
        id: "unknown",
        timestamp: 0,
        valid: false,
        error: "Failed to parse JSON",
      };
      result.entries.push(verifyEntry);
      result.invalidEntries++;
      result.valid = false;
      if (result.firstInvalidIndex === undefined) {
        result.firstInvalidIndex = i;
      }
      continue;
    }

    const verifyEntry: ChainVerificationEntry = {
      index: i,
      id: entry.id,
      timestamp: entry.timestamp,
      valid: true,
    };

    // Skip validation for entries without hash fields (legacy entries)
    if (!entry.entryHash || !entry.previousHash) {
      verifyEntry.valid = true;
      result.entries.push(verifyEntry);
      result.validEntries++;
      // Don't update expectedPreviousHash for legacy entries
      continue;
    }

    // Check previousHash links correctly
    if (entry.previousHash !== expectedPreviousHash) {
      verifyEntry.valid = false;
      verifyEntry.error = `Previous hash mismatch: expected ${expectedPreviousHash.slice(0, 16)}..., got ${entry.previousHash.slice(0, 16)}...`;
      result.valid = false;
      result.invalidEntries++;
      if (result.firstInvalidIndex === undefined) {
        result.firstInvalidIndex = i;
      }
    } else {
      // Verify entryHash is correct
      const computedHash = computeEntryHash(entry);
      if (entry.entryHash !== computedHash) {
        verifyEntry.valid = false;
        verifyEntry.error = `Entry hash mismatch: expected ${computedHash.slice(0, 16)}..., got ${entry.entryHash.slice(0, 16)}...`;
        result.valid = false;
        result.invalidEntries++;
        if (result.firstInvalidIndex === undefined) {
          result.firstInvalidIndex = i;
        }
      } else {
        result.validEntries++;
      }
    }

    result.entries.push(verifyEntry);
    expectedPreviousHash = entry.entryHash;
  }

  return result;
}

/**
 * Clear old audit entries
 */
export function pruneAuditLog(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs;
  const entries = readAuditLog();
  const kept = entries.filter((e) => e.timestamp >= cutoff);

  if (kept.length === entries.length) {
    return 0;
  }

  const filePath = getAuditFilePath();
  const content = kept.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, { mode: 0o600 });

  return entries.length - kept.length;
}
