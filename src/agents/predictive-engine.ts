/**
 * Predictive Engine - Proactive AI Intelligence System
 * Based on 2026 Research: GOD Model, Alpha-Service, Adaptive Data Flywheel
 *
 * Key Insights from Latest Research:
 * 1. "Know When" to intervene (Alpha-Service, 2026)
 * 2. "Know How" to provide assistance (Alpha-Service, 2026)
 * 3. Anticipate user needs proactively (GOD Model, 2026)
 * 4. Privacy-preserving on-device learning (GOD Model, 2026)
 * 5. MAPE-K control loops for continuous improvement (NVIDIA, 2025)
 */

import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  generateDailyBriefing,
  generateMeetingPrep,
  type BriefingConfig,
  type BriefingContext,
} from "./briefing-generator.js";
import { AgentEventMesh, EventTypes } from "./event-mesh.js";

const log = createSubsystemLogger("predictive-engine");

export type PredictedAction = {
  id: string;
  action: string;
  message: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  category: PredictionCategory;
  trigger: PredictionTrigger;
  data?: Record<string, unknown>;
  timestamp: number;
  expiresAt?: number;
};

export type PredictionCategory =
  | "calendar"
  | "email"
  | "task"
  | "communication"
  | "workflow"
  | "context"
  | "proactive";

export type PredictionTrigger =
  | "time_based"
  | "event_based"
  | "pattern_based"
  | "context_based"
  | "behavior_based";

export type UserPattern = {
  id: string;
  pattern: string;
  category: PredictionCategory;
  frequency: number;
  lastOccurrence: number;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export type PredictionRule = {
  id: string;
  name: string;
  category: PredictionCategory;
  condition: (context: PredictionContext) => Promise<boolean>;
  action: (context: PredictionContext) => Promise<PredictedAction>;
  priority: "high" | "medium" | "low";
  enabled: boolean;
};

export type PredictionContext = {
  now: Date;
  events: Map<string, unknown>;
  patterns: UserPattern[];
  recentActivity: Array<{ type: string; timestamp: number; data: unknown }>;
  userState: {
    timeZone: string;
    workHours: { start: number; end: number };
    preferences: Record<string, unknown>;
  };
  mesh?: AgentEventMesh;
};

export type PredictionEngineConfig = {
  agentId: string;
  db: DatabaseSync | null;
  mesh?: AgentEventMesh;
  enablePersistence?: boolean;
  minConfidence?: number;
  maxPredictions?: number;
  userTimeZone?: string;
  /** OpenRouter API configuration for LLM-powered briefings */
  briefingConfig?: BriefingConfig;
};

/**
 * Predictive Engine
 * Anticipates user needs and provides proactive suggestions
 *
 * Architecture based on 2026 research:
 * - Alpha-Service: "Know When" (intervention timing) + "Know How" (action selection)
 * - GOD Model: Privacy-preserving on-device pattern learning
 * - NVIDIA Data Flywheel: MAPE-K continuous improvement loop
 */
export class PredictiveEngine {
  private agentId: string;
  private db: DatabaseSync | null;
  private mesh?: AgentEventMesh;
  private enablePersistence: boolean;
  private minConfidence: number;
  private maxPredictions: number;
  private rules: Map<string, PredictionRule>;
  private patterns: Map<string, UserPattern>;
  private recentPredictions: PredictedAction[];
  private context: PredictionContext;
  private briefingConfig?: BriefingConfig;

  constructor(config: PredictionEngineConfig) {
    this.agentId = config.agentId;
    this.db = config.db;
    this.mesh = config.mesh;
    this.enablePersistence = config.enablePersistence ?? false;
    this.minConfidence = config.minConfidence ?? 0.7;
    this.maxPredictions = config.maxPredictions ?? 5;
    this.briefingConfig = config.briefingConfig;
    this.rules = new Map();
    this.patterns = new Map();
    this.recentPredictions = [];

    this.context = {
      now: new Date(),
      events: new Map(),
      patterns: [],
      recentActivity: [],
      userState: {
        timeZone: config.userTimeZone ?? "UTC",
        workHours: { start: 9, end: 18 },
        preferences: {},
      },
    };

    if (this.enablePersistence && this.db) {
      this.ensureSchema();
      this.loadPatterns();
    }

    this.initializeRules();

    log.info(`Predictive engine initialized for agent: ${this.agentId}`);
  }

  /**
   * Create persistence schema
   */
  private ensureSchema(): void {
    if (!this.db) return;

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS prediction_patterns (
          id TEXT PRIMARY KEY,
          pattern TEXT NOT NULL,
          category TEXT NOT NULL,
          frequency INTEGER NOT NULL,
          last_occurrence INTEGER NOT NULL,
          confidence REAL NOT NULL,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS prediction_history (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          category TEXT NOT NULL,
          priority TEXT NOT NULL,
          confidence REAL NOT NULL,
          trigger TEXT NOT NULL,
          message TEXT NOT NULL,
          data TEXT,
          timestamp INTEGER NOT NULL,
          accepted INTEGER,
          feedback TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_patterns_category ON prediction_patterns(category);
        CREATE INDEX IF NOT EXISTS idx_patterns_frequency ON prediction_patterns(frequency);
        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON prediction_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_history_category ON prediction_history(category);
      `);

      log.info("Prediction schema initialized");
    } catch (error) {
      log.error(`Failed to create prediction schema: ${error}`);
      this.enablePersistence = false;
    }
  }

  /**
   * Load learned patterns from database
   */
  private loadPatterns(): void {
    if (!this.db) return;

    try {
      const rows = this.db
        .prepare(
          `
        SELECT * FROM prediction_patterns
        WHERE confidence >= ?
        ORDER BY frequency DESC
      `,
        )
        .all(this.minConfidence) as Array<{
        id: string;
        pattern: string;
        category: string;
        frequency: number;
        last_occurrence: number;
        confidence: number;
        metadata: string | null;
      }>;

      for (const row of rows) {
        this.patterns.set(row.id, {
          id: row.id,
          pattern: row.pattern,
          category: row.category as PredictionCategory,
          frequency: row.frequency,
          lastOccurrence: row.last_occurrence,
          confidence: row.confidence,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        });
      }

      this.context.patterns = Array.from(this.patterns.values());

      log.info(`Loaded ${this.patterns.size} patterns from database`);
    } catch (error) {
      log.error(`Failed to load patterns: ${error}`);
    }
  }

  /**
   * Initialize built-in prediction rules
   * Based on common patterns from research
   */
  private initializeRules(): void {
    // Calendar-based rules
    this.addRule({
      id: "meeting-prep",
      name: "Meeting Preparation",
      category: "calendar",
      priority: "high",
      enabled: true,
      condition: async (ctx) => {
        const meeting = ctx.events.get("nextMeeting") as any;
        if (!meeting) return false;

        const hoursUntil = this.hoursUntil(ctx.now, new Date(meeting.time));
        return hoursUntil === 1;
      },
      action: async (ctx) => {
        const meeting = ctx.events.get("nextMeeting") as any;
        return {
          id: crypto.randomUUID(),
          action: "prepare_meeting",
          message: `Meeting "${meeting.title}" in 1 hour. Would you like me to prepare?`,
          priority: "high" as const,
          confidence: 0.9,
          category: "calendar" as const,
          trigger: "time_based" as const,
          data: { meetingId: meeting.id },
          timestamp: Date.now(),
          expiresAt: Date.now() + 60 * 60 * 1000, // Expires in 1 hour
        };
      },
    });

    // Email-based rules
    this.addRule({
      id: "important-email",
      name: "Important Email Detection",
      category: "email",
      priority: "high",
      enabled: true,
      condition: async (ctx) => {
        const email = ctx.events.get("recentEmail") as any;
        if (!email) return false;

        // Check if from important sender
        const isImportant =
          email.priority === "high" ||
          email.from?.includes("boss@") ||
          email.from?.includes("ceo@");

        // Check if not yet notified
        const notNotified = !email.notified;

        return isImportant && notNotified;
      },
      action: async (ctx) => {
        const email = ctx.events.get("recentEmail") as any;
        return {
          id: crypto.randomUUID(),
          action: "prioritize_email",
          message: `High-priority email from ${email.fromName || email.from}. Should I draft a response?`,
          priority: "high" as const,
          confidence: 0.85,
          category: "email" as const,
          trigger: "event_based" as const,
          data: { emailId: email.id },
          timestamp: Date.now(),
          expiresAt: Date.now() + 4 * 60 * 60 * 1000, // Expires in 4 hours
        };
      },
    });

    // Pattern-based rules (learned from user behavior)
    this.addRule({
      id: "weekly-report",
      name: "Weekly Report Suggestion",
      category: "workflow",
      priority: "medium",
      enabled: true,
      condition: async (ctx) => {
        // Check if it's Monday morning
        const isMonday = ctx.now.getDay() === 1;
        const isMorning = ctx.now.getHours() >= 9 && ctx.now.getHours() <= 10;

        // Check if user has pattern of generating weekly reports on Mondays
        const pattern = ctx.patterns.find(
          (p) => p.pattern === "generate_weekly_report" && p.category === "workflow",
        );

        return isMonday && isMorning && !!pattern && pattern.confidence > 0.7;
      },
      action: async (ctx) => {
        return {
          id: crypto.randomUUID(),
          action: "generate_weekly_report",
          message: "Would you like me to generate your weekly report?",
          priority: "medium" as const,
          confidence: 0.8,
          category: "workflow" as const,
          trigger: "pattern_based" as const,
          timestamp: Date.now(),
          expiresAt: Date.now() + 3 * 60 * 60 * 1000, // Expires in 3 hours
        };
      },
    });

    // Task-based rules
    this.addRule({
      id: "task-due-reminder",
      name: "Task Due Soon",
      category: "task",
      priority: "medium",
      enabled: true,
      condition: async (ctx) => {
        const tasks = ctx.events.get("upcomingTasks") as any[];
        if (!tasks || tasks.length === 0) return false;

        // Check if any tasks are due within 24 hours
        return tasks.some((task) => {
          const hoursUntil = this.hoursUntil(ctx.now, new Date(task.dueDate));
          return hoursUntil > 0 && hoursUntil <= 24;
        });
      },
      action: async (ctx) => {
        const tasks = ctx.events.get("upcomingTasks") as any[];
        const dueSoon = tasks.filter((task) => {
          const hoursUntil = this.hoursUntil(ctx.now, new Date(task.dueDate));
          return hoursUntil > 0 && hoursUntil <= 24;
        });

        return {
          id: crypto.randomUUID(),
          action: "task_reminder",
          message: `You have ${dueSoon.length} task(s) due within 24 hours. Review them?`,
          priority: "medium" as const,
          confidence: 0.85,
          category: "task" as const,
          trigger: "time_based" as const,
          data: { taskIds: dueSoon.map((t) => t.id) },
          timestamp: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        };
      },
    });

    // Context-based rules
    this.addRule({
      id: "work-hours-start",
      name: "Work Hours Start",
      category: "context",
      priority: "low",
      enabled: true,
      condition: async (ctx) => {
        const hour = ctx.now.getHours();
        const isStartOfWorkDay =
          hour === ctx.userState.workHours.start && ctx.now.getMinutes() < 30;

        const isWeekday = ctx.now.getDay() >= 1 && ctx.now.getDay() <= 5;

        return isStartOfWorkDay && isWeekday;
      },
      action: async (ctx) => {
        // Generate LLM-powered briefing if config is available
        let message = "Good morning! Would you like a daily briefing?";

        if (this.briefingConfig) {
          try {
            const briefingContext: BriefingContext = {
              recentActivity: ctx.recentActivity.map((a) => a.type),
              userPreferences: {
                workHours: ctx.userState.workHours,
              },
            };

            const result = await generateDailyBriefing(briefingContext, this.briefingConfig);
            message = result.content;
            log.info(`Generated briefing using ${result.model}`);
          } catch (error) {
            log.error("Failed to generate LLM briefing:", error as Record<string, unknown>);
            // Fall back to simple message
          }
        }

        return {
          id: crypto.randomUUID(),
          action: "daily_briefing",
          message,
          priority: "low" as const,
          confidence: 0.75,
          category: "context" as const,
          trigger: "context_based" as const,
          timestamp: Date.now(),
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        };
      },
    });

    log.info(`Initialized ${this.rules.size} prediction rules`);
  }

  /**
   * Add a custom prediction rule
   */
  addRule(rule: PredictionRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a prediction rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Update prediction context with new data
   */
  updateContext(updates: Partial<PredictionContext>): void {
    if (updates.events) {
      for (const [key, value] of updates.events) {
        this.context.events.set(key, value);
      }
    }

    if (updates.recentActivity) {
      this.context.recentActivity = updates.recentActivity;
    }

    if (updates.userState) {
      this.context.userState = { ...this.context.userState, ...updates.userState };
    }
  }

  /**
   * Learn a new pattern from user behavior
   */
  learnPattern(pattern: Omit<UserPattern, "id">): void {
    const id = crypto.randomUUID();
    const userPattern: UserPattern = {
      id,
      ...pattern,
    };

    this.patterns.set(id, userPattern);
    this.context.patterns = Array.from(this.patterns.values());

    if (this.enablePersistence && this.db) {
      this.savePattern(userPattern);
    }

    log.info(`Learned new pattern: ${pattern.pattern} (${pattern.category})`);
  }

  /**
   * Save pattern to database
   */
  private savePattern(pattern: UserPattern): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO prediction_patterns
        (id, pattern, category, frequency, last_occurrence, confidence, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        pattern.id,
        pattern.pattern,
        pattern.category,
        pattern.frequency,
        pattern.lastOccurrence,
        pattern.confidence,
        pattern.metadata ? JSON.stringify(pattern.metadata) : null,
      );
    } catch (error) {
      log.error(`Failed to save pattern: ${error}`);
    }
  }

  /**
   * Main prediction method
   * Returns proactive suggestions based on context and rules
   */
  async checkPredictions(): Promise<PredictedAction[]> {
    this.context.now = new Date();
    const predictions: PredictedAction[] = [];

    // Check all enabled rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const shouldPredict = await rule.condition(this.context);

        if (shouldPredict) {
          const action = await rule.action(this.context);

          // Filter by confidence
          if (action.confidence >= this.minConfidence) {
            predictions.push(action);
          }
        }
      } catch (error) {
        log.error(`Rule ${rule.id} failed: ${error}`);
      }
    }

    // Sort by priority and confidence
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    predictions.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // Limit predictions
    const limited = predictions.slice(0, this.maxPredictions);

    // Store for feedback
    this.recentPredictions = limited;

    // Publish prediction event if mesh available
    if (this.mesh && limited.length > 0) {
      this.mesh.emit({
        type: EventTypes.USER_MESSAGE_RECEIVED,
        source: "predictive-engine",
        data: {
          type: "predictions_generated",
          count: limited.length,
          topPrediction: limited[0].action,
        },
      });
    }

    // Persist to history
    if (this.enablePersistence && this.db) {
      for (const prediction of limited) {
        this.savePrediction(prediction);
      }
    }

    if (limited.length > 0) {
      log.info(`Generated ${limited.length} predictions`);
    }

    return limited;
  }

  /**
   * Save prediction to history
   */
  private savePrediction(prediction: PredictedAction): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO prediction_history
        (id, action, category, priority, confidence, trigger, message, data, timestamp, accepted, feedback)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        prediction.id,
        prediction.action,
        prediction.category,
        prediction.priority,
        prediction.confidence,
        prediction.trigger,
        prediction.message,
        prediction.data ? JSON.stringify(prediction.data) : null,
        prediction.timestamp,
        null,
        null,
      );
    } catch (error) {
      log.error(`Failed to save prediction: ${error}`);
    }
  }

  /**
   * Record feedback on prediction (for learning)
   */
  recordFeedback(predictionId: string, accepted: boolean, feedback?: string): void {
    // Update history
    if (this.db && this.enablePersistence) {
      try {
        this.db
          .prepare(
            `
          UPDATE prediction_history
          SET accepted = ?, feedback = ?
          WHERE id = ?
        `,
          )
          .run(accepted ? 1 : 0, feedback || null, predictionId);
      } catch (error) {
        log.error(`Failed to record feedback: ${error}`);
      }
    }

    // Adjust confidence based on feedback (MAPE-K learning loop)
    // This is simplified - in production, use more sophisticated ML
    if (accepted) {
      log.info(`Prediction ${predictionId} was accepted`);
    } else {
      log.info(`Prediction ${predictionId} was rejected: ${feedback || "no reason"}`);
    }
  }

  /**
   * Get recent predictions
   */
  getRecentPredictions(): PredictedAction[] {
    return this.recentPredictions;
  }

  /**
   * Get prediction statistics
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    learnedPatterns: number;
    recentPredictions: number;
  } {
    return {
      totalRules: this.rules.size,
      enabledRules: Array.from(this.rules.values()).filter((r) => r.enabled).length,
      learnedPatterns: this.patterns.size,
      recentPredictions: this.recentPredictions.length,
    };
  }

  /**
   * Helper: Calculate hours until a future time
   */
  private hoursUntil(now: Date, future: Date): number {
    const diffMs = future.getTime() - now.getTime();
    return Math.round(diffMs / (1000 * 60 * 60));
  }

  /**
   * Clear old predictions from history
   */
  clearOldHistory(daysToKeep: number = 30): number {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    if (this.db && this.enablePersistence) {
      try {
        const result = this.db
          .prepare("DELETE FROM prediction_history WHERE timestamp < ?")
          .run(cutoff);

        log.info(`Cleared ${result.changes} old predictions from history`);
        return Number(result.changes);
      } catch (error) {
        log.error(`Failed to clear old history: ${error}`);
      }
    }

    return 0;
  }

  /**
   * Close the engine
   */
  close(): void {
    this.rules.clear();
    this.patterns.clear();
    this.recentPredictions = [];
    log.info(`Predictive engine closed for agent: ${this.agentId}`);
  }
}
