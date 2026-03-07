// Production-grade Heartbeat Scheduler
// Integrates hierarchical timing wheel, persistent state, and execution

import type { OpenClawConfig } from "../../config/config.js";
import type {
  HeartbeatSchedule,
  HeartbeatState,
  SchedulerConfig,
  HeartbeatRunResult,
} from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { HeartbeatStateManager } from "./state-manager.js";
import { HierarchicalTimingWheel, getGlobalTimingWheel } from "./timing-wheel.js";
import { DEFAULT_SCHEDULER_CONFIG } from "./types.js";

// Helper function to normalize agent IDs
function normalizeAgentId(agentId?: string): string {
  return agentId?.trim().toLowerCase() || "default";
}

const log = createSubsystemLogger("heartbeat-v2/scheduler");

export type HeartbeatExecutionHandler = (params: {
  agentId: string;
  scheduleId: string;
  reason: string;
}) => Promise<HeartbeatRunResult>;

export interface HeartbeatSchedulerOptions {
  config: OpenClawConfig;
  schedulerConfig?: Partial<SchedulerConfig>;
  dbPath?: string;
  onExecute?: HeartbeatExecutionHandler;
}

export class HeartbeatScheduler {
  private config: OpenClawConfig;
  private schedulerConfig: SchedulerConfig;
  private stateManager: HeartbeatStateManager;
  private timingWheel: HierarchicalTimingWheel;
  private onExecute?: HeartbeatExecutionHandler;

  private isRunning = false;
  private hydrationInterval: ReturnType<typeof setInterval> | null = null;
  private activeExecutions = new Map<string, Promise<void>>();

  constructor(options: HeartbeatSchedulerOptions) {
    this.config = options.config;
    this.schedulerConfig = {
      ...DEFAULT_SCHEDULER_CONFIG,
      ...options.schedulerConfig,
    };
    this.stateManager = new HeartbeatStateManager(
      options.dbPath ?? "./data/heartbeat-v2.db",
      this.schedulerConfig,
    );
    this.timingWheel = getGlobalTimingWheel();
    this.onExecute = options.onExecute;
  }

  /**
   * Initialize the scheduler
   */
  async initialize(): Promise<void> {
    await this.stateManager.initialize();
    log.info("Heartbeat scheduler initialized");
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start timing wheel
    this.timingWheel.start();

    // Initial hydration: load all due schedules into timing wheel
    await this.hydrateSchedules();

    // Periodic hydration: refresh imminent jobs from database
    const hydrationIntervalMs = Math.min(
      this.schedulerConfig.scheduler.imminentWindowMs / 2,
      60000, // At most every minute
    );

    this.hydrationInterval = setInterval(() => {
      this.hydrateSchedules().catch((err) => {
        log.error("Failed to hydrate schedules", { error: String(err) });
      });
    }, hydrationIntervalMs);

    // Don't keep process alive
    if (this.hydrationInterval.unref) {
      this.hydrationInterval.unref();
    }

    log.info("Heartbeat scheduler started");
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.hydrationInterval) {
      clearInterval(this.hydrationInterval);
      this.hydrationInterval = null;
    }

    // Wait for active executions to complete
    const executions = Array.from(this.activeExecutions.values());
    if (executions.length > 0) {
      await Promise.race([
        Promise.all(executions),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }

    await this.stateManager.close();
    log.info("Heartbeat scheduler stopped");
  }

  /**
   * Load imminent schedules from database into timing wheel
   */
  private async hydrateSchedules(): Promise<void> {
    const imminentWindowMs = this.schedulerConfig.scheduler.imminentWindowMs;
    const dueSchedules = this.stateManager.getDueSchedules(imminentWindowMs);

    for (const schedule of dueSchedules) {
      const scheduleId = schedule.id;

      // Skip if already in timing wheel or currently executing
      if (this.timingWheel.hasTimer(scheduleId)) {
        continue;
      }

      // Get full schedule details
      const fullSchedule = this.stateManager.getSchedule(schedule.agentId);
      if (!fullSchedule || fullSchedule.state !== "active") {
        continue;
      }

      // Calculate delay
      const now = Date.now();
      const delayMs = Math.max(0, fullSchedule.nextRunAt - now);

      // Add to timing wheel
      this.timingWheel.addTimer(scheduleId, delayMs, () => {
        this.executeHeartbeat(scheduleId, schedule.agentId, "interval");
      });
    }
  }

  /**
   * Execute a heartbeat
   */
  private async executeHeartbeat(
    scheduleId: string,
    agentId: string,
    reason: string,
  ): Promise<void> {
    // Prevent concurrent execution of same schedule
    const existingExecution = this.activeExecutions.get(scheduleId);
    if (existingExecution) {
      log.debug("Skipping concurrent heartbeat execution", { scheduleId, agentId });
      return;
    }

    const executionPromise = this.doExecuteHeartbeat(scheduleId, agentId, reason);
    this.activeExecutions.set(scheduleId, executionPromise);

    try {
      await executionPromise;
    } finally {
      this.activeExecutions.delete(scheduleId);
    }
  }

  private async doExecuteHeartbeat(
    scheduleId: string,
    agentId: string,
    reason: string,
  ): Promise<void> {
    const schedule = this.stateManager.getSchedule(agentId);
    if (!schedule || schedule.state !== "active") {
      log.debug("Skipping heartbeat for inactive schedule", { scheduleId, agentId });
      return;
    }

    // Check for pending signals
    const signals = this.stateManager.getPendingSignals(scheduleId);
    for (const signal of signals) {
      if (signal.signal === "pause") {
        this.stateManager.setScheduleState(scheduleId, "paused");
        this.stateManager.markSignalsProcessed(scheduleId);
        log.info("Heartbeat paused via signal", { scheduleId, reason: signal.reason });
        return;
      } else if (signal.signal === "runNow") {
        reason = `signal:${signal.reason ?? "manual"}`;
      }
    }
    this.stateManager.markSignalsProcessed(scheduleId);

    const startedAt = Date.now();
    let result: HeartbeatRunResult;

    try {
      if (this.onExecute) {
        result = await this.onExecute({ agentId, scheduleId, reason });
      } else {
        // Default: mark as ran
        result = { status: "ran", durationMs: 0 };
      }

      // Record run
      this.stateManager.recordRun({
        scheduleId,
        agentId,
        status: result.status,
        startedAt,
        completedAt: Date.now(),
        durationMs: result.durationMs ?? Date.now() - startedAt,
        message: result.message,
        channel: result.channel,
        accountId: result.accountId,
        error: result.error,
      });

      // Schedule next run
      const nextRunAt = Date.now() + schedule.intervalMs;
      this.stateManager.updateScheduleNextRun(scheduleId, nextRunAt);

      // Add to timing wheel if within imminent window
      const imminentWindowMs = this.schedulerConfig.scheduler.imminentWindowMs;
      if (nextRunAt - Date.now() <= imminentWindowMs) {
        this.timingWheel.addTimer(scheduleId, nextRunAt - Date.now(), () => {
          this.executeHeartbeat(scheduleId, agentId, "interval");
        });
      }

      log.debug("Heartbeat executed", {
        scheduleId,
        agentId,
        status: result.status,
        durationMs: result.durationMs,
        nextRunAt,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.stateManager.recordRun({
        scheduleId,
        agentId,
        status: "error",
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
        error: errorMessage,
      });

      // Schedule retry with exponential backoff
      const state = this.stateManager.getState(agentId);
      const retryCount = state?.consecutiveFailures ?? 1;
      const maxRetries = this.schedulerConfig.scheduler.maxRetries;

      if (retryCount <= maxRetries) {
        const baseDelay = this.schedulerConfig.scheduler.initialRetryDelayMs;
        const maxDelay = this.schedulerConfig.scheduler.maxRetryDelayMs;
        const delayMs = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
        const nextRetryAt = Date.now() + delayMs;

        this.stateManager.updateScheduleNextRun(scheduleId, nextRetryAt);

        this.timingWheel.addTimer(`${scheduleId}-retry-${retryCount}`, delayMs, () => {
          this.executeHeartbeat(scheduleId, agentId, `retry:${retryCount}`);
        });

        log.warn("Heartbeat failed, scheduled retry", {
          scheduleId,
          agentId,
          error: errorMessage,
          retryCount,
          nextRetryAt,
        });
      } else {
        log.error("Heartbeat failed, max retries exceeded", {
          scheduleId,
          agentId,
          error: errorMessage,
          retryCount,
        });
      }
    }
  }

  /**
   * Register an agent for heartbeats
   */
  registerAgent(params: {
    agentId: string;
    intervalMs: number;
    activeHours?: { start: string; end: string; timezone: string };
    visibility: { showOk: boolean; showAlerts: boolean; useIndicator: boolean };
  }): string {
    const scheduleId = `heartbeat-${params.agentId}`;

    this.stateManager.createSchedule({
      id: scheduleId,
      agentId: params.agentId,
      intervalMs: params.intervalMs,
      activeHours: params.activeHours,
      visibility: params.visibility,
    });

    // Schedule first heartbeat
    const nextRunAt = Date.now() + params.intervalMs;
    this.stateManager.updateScheduleNextRun(scheduleId, nextRunAt);

    // Add to timing wheel if within imminent window
    const imminentWindowMs = this.schedulerConfig.scheduler.imminentWindowMs;
    if (params.intervalMs <= imminentWindowMs) {
      this.timingWheel.addTimer(scheduleId, params.intervalMs, () => {
        this.executeHeartbeat(scheduleId, params.agentId, "initial");
      });
    }

    log.info("Agent registered for heartbeats", {
      scheduleId,
      agentId: params.agentId,
      intervalMs: params.intervalMs,
    });

    return scheduleId;
  }

  /**
   * Trigger immediate heartbeat
   */
  triggerNow(agentId: string, reason: string = "manual"): void {
    const scheduleId = `heartbeat-${agentId}`;
    const schedule = this.stateManager.getSchedule(agentId);

    if (!schedule) {
      log.warn("Cannot trigger heartbeat: schedule not found", { agentId });
      return;
    }

    // Add signal to run immediately
    this.stateManager.addSignal({
      scheduleId,
      signal: "runNow",
      reason,
    });

    // Execute immediately
    this.timingWheel.addTimer(`${scheduleId}-immediate`, 0, () => {
      this.executeHeartbeat(scheduleId, agentId, reason);
    });
  }

  /**
   * Pause heartbeats for an agent
   */
  pause(agentId: string, reason?: string): void {
    const scheduleId = `heartbeat-${agentId}`;

    this.stateManager.addSignal({
      scheduleId,
      signal: "pause",
      reason,
    });

    // Cancel any pending timers
    this.timingWheel.cancelTimer(scheduleId);

    log.info("Heartbeat paused", { agentId, reason });
  }

  /**
   * Resume heartbeats for an agent
   */
  resume(agentId: string): void {
    const scheduleId = `heartbeat-${agentId}`;

    this.stateManager.setScheduleState(scheduleId, "active");

    // Schedule next heartbeat
    const schedule = this.stateManager.getSchedule(agentId);
    if (schedule) {
      const nextRunAt = Date.now() + schedule.intervalMs;
      this.stateManager.updateScheduleNextRun(scheduleId, nextRunAt);

      const imminentWindowMs = this.schedulerConfig.scheduler.imminentWindowMs;
      if (schedule.intervalMs <= imminentWindowMs) {
        this.timingWheel.addTimer(scheduleId, schedule.intervalMs, () => {
          this.executeHeartbeat(scheduleId, agentId, "resumed");
        });
      }
    }

    log.info("Heartbeat resumed", { agentId });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const scheduleId = `heartbeat-${agentId}`;

    this.stateManager.setScheduleState(scheduleId, "disabled");
    this.timingWheel.cancelTimer(scheduleId);

    log.info("Agent unregistered from heartbeats", { agentId });
  }

  /**
   * Update configuration
   */
  updateConfig(config: OpenClawConfig): void {
    this.config = config;
  }

  /**
   * Get scheduler status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    activeTimers: number;
    activeExecutions: number;
  }> {
    return {
      isRunning: this.isRunning,
      activeTimers: this.timingWheel.getTimerCount(),
      activeExecutions: this.activeExecutions.size,
    };
  }

  /**
   * Get analytics for an agent
   */
  getAnalytics(agentId: string, timeRange: "1h" | "24h" | "7d" | "30d" = "24h") {
    return this.stateManager.getAnalytics(agentId, timeRange);
  }
}

// Singleton instance
let globalScheduler: HeartbeatScheduler | null = null;

export function getHeartbeatScheduler(): HeartbeatScheduler | null {
  return globalScheduler;
}

export function setHeartbeatScheduler(scheduler: HeartbeatScheduler | null): void {
  globalScheduler = scheduler;
}

export async function initializeHeartbeatScheduler(
  options: HeartbeatSchedulerOptions,
): Promise<HeartbeatScheduler> {
  if (globalScheduler) {
    await globalScheduler.stop();
  }

  globalScheduler = new HeartbeatScheduler(options);
  await globalScheduler.initialize();
  await globalScheduler.start();

  return globalScheduler;
}
