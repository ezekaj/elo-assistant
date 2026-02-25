// Persistent State Manager for Heartbeat System
// Uses SQLite for single-node, PostgreSQL for distributed deployments

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { HeartbeatState, HeartbeatAnalytics, SchedulerConfig } from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("heartbeat-v2/state");

// SQLite schema for heartbeat state
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS heartbeat_schedules (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  interval_ms INTEGER NOT NULL,
  active_hours_json TEXT,
  visibility_json TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  next_run_at INTEGER,
  UNIQUE(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_schedules_agent ON heartbeat_schedules(agent_id);

CREATE TABLE IF NOT EXISTS heartbeat_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  result_json TEXT,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_runs_schedule ON heartbeat_runs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_runs_agent_time ON heartbeat_runs(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status ON heartbeat_runs(status);

CREATE TABLE IF NOT EXISTS heartbeat_state (
  agent_id TEXT PRIMARY KEY,
  last_run_at INTEGER,
  next_run_at INTEGER,
  last_result TEXT,
  last_message TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  total_runs INTEGER DEFAULT 0,
  total_alerts INTEGER DEFAULT 0,
  last_heartbeat_text TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id TEXT NOT NULL,
  signal TEXT NOT NULL,
  reason TEXT,
  timestamp INTEGER NOT NULL,
  processed INTEGER DEFAULT 0
);
`;

export class HeartbeatStateManager {
  private db: DatabaseSync | null = null;
  private dbPath: string;
  private config: SchedulerConfig;
  private initialized = false;

  // Prepared statements
  private stmtGetState!: StatementSync;
  private stmtUpdateState!: StatementSync;
  private stmtCreateSchedule!: StatementSync;
  private stmtGetSchedule!: StatementSync;
  private stmtUpdateScheduleNextRun!: StatementSync;
  private stmtSetScheduleState!: StatementSync;
  private stmtGetDueSchedules!: StatementSync;
  private stmtRecordRun!: StatementSync;
  private stmtAddSignal!: StatementSync;
  private stmtGetPendingSignals!: StatementSync;
  private stmtMarkSignalsProcessed!: StatementSync;

  // In-memory cache for fast access
  private stateCache = new Map<string, HeartbeatState>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(dbPath: string, config: SchedulerConfig) {
    this.dbPath = dbPath;
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    // Open database
    this.db = new DatabaseSync(this.dbPath);

    // Enable WAL mode for better concurrent access (prevents "database is locked" errors)
    this.db.exec(`PRAGMA journal_mode = WAL`);
    this.db.exec(`PRAGMA busy_timeout = 5000`);

    // Run migrations
    this.db.exec(SCHEMA_SQL);

    // Prepare statements
    this.prepareStatements();

    this.initialized = true;
    log.info("Heartbeat state manager initialized", { path: this.dbPath });
  }

  private prepareStatements(): void {
    if (!this.db) throw new Error("Database not initialized");

    this.stmtGetState = this.db.prepare("SELECT * FROM heartbeat_state WHERE agent_id = ?");

    this.stmtUpdateState = this.db.prepare(
      `INSERT OR REPLACE INTO heartbeat_state (
        agent_id, last_run_at, next_run_at, last_result, last_message,
        consecutive_failures, total_runs, total_alerts, last_heartbeat_text, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.stmtCreateSchedule = this.db.prepare(
      `INSERT OR REPLACE INTO heartbeat_schedules (
        id, agent_id, interval_ms, active_hours_json, visibility_json,
        state, created_at, updated_at, next_run_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    );

    this.stmtGetSchedule = this.db.prepare("SELECT * FROM heartbeat_schedules WHERE agent_id = ?");

    this.stmtUpdateScheduleNextRun = this.db.prepare(
      "UPDATE heartbeat_schedules SET next_run_at = ?, updated_at = ? WHERE id = ?",
    );

    this.stmtSetScheduleState = this.db.prepare(
      "UPDATE heartbeat_schedules SET state = ?, updated_at = ? WHERE id = ?",
    );

    this.stmtGetDueSchedules = this.db.prepare(
      `SELECT id, agent_id, interval_ms FROM heartbeat_schedules 
       WHERE state = 'active' AND next_run_at <= ? 
       ORDER BY next_run_at ASC`,
    );

    this.stmtRecordRun = this.db.prepare(
      `INSERT INTO heartbeat_runs (
        id, schedule_id, agent_id, status, started_at, completed_at,
        duration_ms, result_json, error, retry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.stmtAddSignal = this.db.prepare(
      "INSERT INTO heartbeat_signals (schedule_id, signal, reason, timestamp) VALUES (?, ?, ?, ?)",
    );

    this.stmtGetPendingSignals = this.db.prepare(
      "SELECT signal, reason, timestamp FROM heartbeat_signals WHERE schedule_id = ? AND processed = 0 ORDER BY timestamp ASC",
    );

    this.stmtMarkSignalsProcessed = this.db.prepare(
      "UPDATE heartbeat_signals SET processed = 1 WHERE schedule_id = ? AND processed = 0",
    );
  }

  // State operations
  getState(agentId: string): HeartbeatState | null {
    // Check cache first
    const cached = this.stateCache.get(agentId);
    const expiry = this.cacheExpiry.get(agentId);
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    if (!this.db) throw new Error("Database not initialized");

    const row = this.stmtGetState.get(agentId) as
      | {
          agent_id: string;
          last_run_at: number | null;
          next_run_at: number | null;
          last_result: string | null;
          last_message: string | null;
          consecutive_failures: number;
          total_runs: number;
          total_alerts: number;
          last_heartbeat_text: string | null;
        }
      | undefined;

    if (!row) return null;

    const state: HeartbeatState = {
      agentId: row.agent_id,
      lastRunAt: row.last_run_at ?? 0,
      nextRunAt: row.next_run_at ?? 0,
      lastResult: (row.last_result as HeartbeatState["lastResult"]) || "pending",
      lastMessage: row.last_message ?? undefined,
      consecutiveFailures: row.consecutive_failures,
      totalRuns: row.total_runs,
      totalAlerts: row.total_alerts,
      lastHeartbeatText: row.last_heartbeat_text ?? undefined,
    };

    // Update cache
    this.stateCache.set(agentId, state);
    this.cacheExpiry.set(agentId, Date.now() + this.CACHE_TTL_MS);

    return state;
  }

  updateState(state: HeartbeatState): void {
    if (!this.db) throw new Error("Database not initialized");

    this.stmtUpdateState.run(
      state.agentId,
      state.lastRunAt,
      state.nextRunAt,
      state.lastResult,
      state.lastMessage ?? null,
      state.consecutiveFailures,
      state.totalRuns,
      state.totalAlerts,
      state.lastHeartbeatText ?? null,
      Date.now(),
    );

    // Update cache
    this.stateCache.set(state.agentId, state);
    this.cacheExpiry.set(state.agentId, Date.now() + this.CACHE_TTL_MS);
  }

  recordRun(params: {
    scheduleId: string;
    agentId: string;
    status: HeartbeatState["lastResult"];
    startedAt: number;
    completedAt: number;
    durationMs: number;
    message?: string;
    channel?: string;
    accountId?: string;
    to?: string;
    error?: string;
    retryCount?: number;
  }): string {
    if (!this.db) throw new Error("Database not initialized");

    const id = `${params.scheduleId}-${params.startedAt}-${Math.random().toString(36).slice(2, 8)}`;

    this.stmtRecordRun.run(
      id,
      params.scheduleId,
      params.agentId,
      params.status,
      params.startedAt,
      params.completedAt,
      params.durationMs,
      JSON.stringify({
        message: params.message,
        channel: params.channel,
        accountId: params.accountId,
        to: params.to,
      }),
      params.error ?? null,
      params.retryCount ?? 0,
    );

    // Update state
    const currentState = this.getState(params.agentId);
    const newState: HeartbeatState = {
      agentId: params.agentId,
      lastRunAt: params.startedAt,
      nextRunAt: params.completedAt,
      lastResult: params.status,
      lastMessage: params.message,
      consecutiveFailures:
        params.status === "error" ? (currentState?.consecutiveFailures ?? 0) + 1 : 0,
      totalRuns: (currentState?.totalRuns ?? 0) + 1,
      totalAlerts: (currentState?.totalAlerts ?? 0) + (params.status === "alert" ? 1 : 0),
      lastHeartbeatText: currentState?.lastHeartbeatText,
    };

    this.updateState(newState);

    return id;
  }

  // Schedule operations
  createSchedule(params: {
    id: string;
    agentId: string;
    intervalMs: number;
    activeHours?: { start: string; end: string; timezone: string };
    visibility: { showOk: boolean; showAlerts: boolean; useIndicator: boolean };
  }): void {
    if (!this.db) throw new Error("Database not initialized");

    const now = Date.now();

    this.stmtCreateSchedule.run(
      params.id,
      params.agentId,
      params.intervalMs,
      params.activeHours ? JSON.stringify(params.activeHours) : null,
      JSON.stringify(params.visibility),
      now,
      now,
      now,
    );
  }

  getSchedule(agentId: string): {
    id: string;
    agentId: string;
    intervalMs: number;
    activeHours?: { start: string; end: string; timezone: string };
    visibility: { showOk: boolean; showAlerts: boolean; useIndicator: boolean };
    state: "active" | "paused" | "disabled";
    nextRunAt: number;
  } | null {
    if (!this.db) throw new Error("Database not initialized");

    const row = this.stmtGetSchedule.get(agentId) as
      | {
          id: string;
          agent_id: string;
          interval_ms: number;
          active_hours_json: string | null;
          visibility_json: string;
          state: string;
          next_run_at: number | null;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      intervalMs: row.interval_ms,
      activeHours: row.active_hours_json ? JSON.parse(row.active_hours_json) : undefined,
      visibility: JSON.parse(row.visibility_json),
      state: row.state as "active" | "paused" | "disabled",
      nextRunAt: row.next_run_at ?? 0,
    };
  }

  updateScheduleNextRun(scheduleId: string, nextRunAt: number): void {
    if (!this.db) throw new Error("Database not initialized");

    this.stmtUpdateScheduleNextRun.run(nextRunAt, Date.now(), scheduleId);
  }

  setScheduleState(scheduleId: string, state: "active" | "paused" | "disabled"): void {
    if (!this.db) throw new Error("Database not initialized");

    this.stmtSetScheduleState.run(state, Date.now(), scheduleId);
  }

  // Get schedules due for execution within the imminent window
  getDueSchedules(withinMs: number): Array<{
    id: string;
    agentId: string;
    intervalMs: number;
  }> {
    if (!this.db) throw new Error("Database not initialized");

    const cutoff = Date.now() + withinMs;

    const rows = this.stmtGetDueSchedules.all(cutoff) as Array<{
      id: string;
      agent_id: string;
      interval_ms: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      intervalMs: row.interval_ms,
    }));
  }

  // Analytics
  getAnalytics(agentId: string, timeRange: "1h" | "24h" | "7d" | "30d"): HeartbeatAnalytics {
    if (!this.db) throw new Error("Database not initialized");

    const ranges: Record<string, number> = {
      "1h": 3600000,
      "24h": 86400000,
      "7d": 604800000,
      "30d": 2592000000,
    };

    const cutoff = Date.now() - ranges[timeRange];

    const stmt = this.db.prepare(
      `SELECT 
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'alert' THEN 1 ELSE 0 END) as alert_count,
        SUM(CASE WHEN status IN ('ok', 'ok-empty', 'ok-token') THEN 1 ELSE 0 END) as ok_count,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        AVG(duration_ms) as avg_duration,
        MAX(duration_ms) as p95_duration
       FROM heartbeat_runs 
       WHERE agent_id = ? AND started_at > ?`,
    );

    const row = stmt.get(agentId, cutoff) as
      | {
          total_runs: number;
          alert_count: number;
          ok_count: number;
          skipped_count: number;
          error_count: number;
          avg_duration: number;
          p95_duration: number;
        }
      | undefined;

    const state = this.getState(agentId);

    return {
      agentId,
      timeRange,
      totalRuns: row?.total_runs ?? 0,
      alertCount: row?.alert_count ?? 0,
      okCount: row?.ok_count ?? 0,
      skippedCount: row?.skipped_count ?? 0,
      errorCount: row?.error_count ?? 0,
      avgIntervalMs: 0,
      maxConsecutiveFailures: state?.consecutiveFailures ?? 0,
      avgDurationMs: row?.avg_duration ?? 0,
      p95DurationMs: row?.p95_duration ?? 0,
    };
  }

  // Signal operations
  addSignal(signal: { scheduleId: string; signal: string; reason?: string }): void {
    if (!this.db) throw new Error("Database not initialized");

    this.stmtAddSignal.run(signal.scheduleId, signal.signal, signal.reason ?? null, Date.now());
  }

  getPendingSignals(scheduleId: string): Array<{
    signal: string;
    reason?: string;
    timestamp: number;
  }> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = this.stmtGetPendingSignals.all(scheduleId) as Array<{
      signal: string;
      reason: string | null;
      timestamp: number;
    }>;

    return rows.map((row) => ({
      signal: row.signal,
      reason: row.reason ?? undefined,
      timestamp: row.timestamp,
    }));
  }

  markSignalsProcessed(scheduleId: string): void {
    if (!this.db) throw new Error("Database not initialized");

    this.stmtMarkSignalsProcessed.run(scheduleId);
  }

  // Cleanup
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }

  // Clear cache
  clearCache(agentId?: string): void {
    if (agentId) {
      this.stateCache.delete(agentId);
      this.cacheExpiry.delete(agentId);
    } else {
      this.stateCache.clear();
      this.cacheExpiry.clear();
    }
  }
}
