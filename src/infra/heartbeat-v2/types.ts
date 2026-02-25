// Production-grade Heartbeat System Types
// Based on distributed scheduler patterns from Meta, Uber, Netflix

export type HeartbeatStatus = "ok" | "alert" | "skipped" | "error" | "pending" | "ran" | "failed";

// Result from heartbeat execution
export interface HeartbeatRunResult {
  status: HeartbeatStatus;
  durationMs?: number;
  message?: string;
  channel?: string;
  accountId?: string;
  error?: string;
  reason?: string;
}

export interface HeartbeatSchedule {
  id: string;
  agentId: string;
  intervalMs: number;
  activeHours?: {
    start: string;
    end: string;
    timezone: string;
  };
  visibility: {
    showOk: boolean;
    showAlerts: boolean;
    useIndicator: boolean;
  };
  createdAt: number;
  updatedAt: number;
  state: "active" | "paused" | "disabled";
}

export interface HeartbeatRun {
  id: string;
  scheduleId: string;
  agentId: string;
  status: HeartbeatStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  result?: {
    message?: string;
    preview?: string;
    channel?: string;
    accountId?: string;
    to?: string;
  };
  error?: string;
  retryCount: number;
  nextRetryAt?: number;
}

export interface HeartbeatState {
  agentId: string;
  lastRunAt: number;
  nextRunAt: number;
  lastResult: HeartbeatStatus;
  lastMessage?: string;
  consecutiveFailures: number;
  totalRuns: number;
  totalAlerts: number;
  lastHeartbeatText?: string;
}

export interface HeartbeatAnalytics {
  agentId: string;
  timeRange: "1h" | "24h" | "7d" | "30d";
  totalRuns: number;
  alertCount: number;
  okCount: number;
  skippedCount: number;
  errorCount: number;
  avgIntervalMs: number;
  maxConsecutiveFailures: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

export interface SchedulerConfig {
  // Redis configuration for BullMQ
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
  };
  // PostgreSQL for persistent state
  postgres?: {
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
  // Temporal configuration (optional, for durable execution)
  temporal?: {
    address?: string;
    namespace?: string;
    taskQueue?: string;
  };
  // Scheduler settings
  scheduler: {
    // Number of shards for hyperscale (default: 1 for single-node)
    shardCount: number;
    // Imminent window in ms (jobs loaded into memory, default: 15 min)
    imminentWindowMs: number;
    // Max retries for failed heartbeats
    maxRetries: number;
    // Initial retry delay in ms
    initialRetryDelayMs: number;
    // Max retry delay in ms
    maxRetryDelayMs: number;
    // Coalesce window - skip if another heartbeat ran within this window
    coalesceWindowMs: number;
  };
  // Queue settings
  queue: {
    // Max concurrent heartbeat executions
    concurrency: number;
    // Rate limit: max heartbeats per duration
    rateLimit: {
      max: number;
      duration: number;
    };
    // Remove completed jobs after this many
    removeOnComplete: number;
    // Remove failed jobs after this many
    removeOnFail: number;
  };
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  scheduler: {
    shardCount: 1,
    imminentWindowMs: 15 * 60 * 1000, // 15 minutes
    maxRetries: 5,
    initialRetryDelayMs: 1000,
    maxRetryDelayMs: 60000,
    coalesceWindowMs: 30000,
  },
  queue: {
    concurrency: 10,
    rateLimit: {
      max: 5,
      duration: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
};

// Heartbeat signals for external control
export type HeartbeatSignal = "pause" | "resume" | "runNow" | "cancel";

export interface HeartbeatSignalPayload {
  scheduleId: string;
  signal: HeartbeatSignal;
  reason?: string;
  timestamp: number;
}
