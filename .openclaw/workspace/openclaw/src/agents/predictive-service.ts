/**
 * Predictive Service - Auto-started with Gateway
 *
 * Integrates:
 * - Event Mesh (real-time events)
 * - Neuro-Memory (episodic memory)
 * - Cron System (scheduled checks)
 * - MCP (external triggers)
 */

import { PredictiveEngine, type PredictedAction, type UserPattern } from "./predictive-engine.js";
import {
  getEventMesh,
  AgentEventMesh,
  EventTypes,
  type AgentEvent,
} from "./event-mesh.js";
import { getNeuroMemoryBridge, type Episode } from "./neuro-memory-bridge.js";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { randomUUID } from "node:crypto";
import { createPredictiveDb } from "./predictive-integration.js";

const log = createSubsystemLogger("predictive-service");

export type PredictiveServiceConfig = {
  enabled: boolean;
  agentId: string;
  db: DatabaseSync | null;
  neuroMemory?: {
    enabled: boolean;
    agentPath?: string;
  };
  autoDeliver: {
    enabled: boolean;
    maxPerDay: number;
    channels: string[];
    quietHours: { start: number; end: number };
    minConfidence: number;
  };
  schedule: {
    checkIntervalMs: number;
    patternLearningEnabled: boolean;
    consolidationIntervalMs: number;
  };
  categories: {
    calendar: boolean;
    email: boolean;
    task: boolean;
    workflow: boolean;
    communication: boolean;
    context: boolean;
  };
};

export type DeliveryEvent = {
  prediction: PredictedAction;
  timestamp: number;
  channel: string;
  delivered: boolean;
};

/**
 * Predictive Service
 *
 * Auto-started with gateway, wires predictive engine to all systems
 */
export class PredictiveService {
  private engine: PredictiveEngine | null = null;
  private mesh: AgentEventMesh | null = null;
  private config: PredictiveServiceConfig;
  private checkInterval?: ReturnType<typeof setInterval>;
  private consolidationInterval?: ReturnType<typeof setInterval>;
  private todayDeliveries = 0;
  private lastDeliveryTime = 0;
  private lastDeliveryReset: number = Date.now();
  private deliveryHistory: DeliveryEvent[] = [];
  private isRunning = false;

  constructor(config: PredictiveServiceConfig) {
    this.config = config;
  }

  /**
   * Start predictive service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      log.info("Predictive service disabled by config");
      return;
    }

    if (this.isRunning) {
      log.warn("Predictive service already running");
      return;
    }

    log.info("Starting predictive service...");

    try {
      // Create predictive database if not provided
      const db = this.config.db || createPredictiveDb(this.config.agentId);

      // Get event mesh
      this.mesh = getEventMesh({
        agentId: this.config.agentId,
        db: db,
        enablePersistence: true,
        neuroMemory: this.config.neuroMemory,
      });

      // Initialize predictive engine
      this.engine = new PredictiveEngine({
        agentId: this.config.agentId,
        db: db,
        enabled: true,
        enablePersistence: true,
        patterns: {
          autoLearn: this.config.schedule.patternLearningEnabled,
          retentionDays: 90,
          minConfidence: this.config.autoDeliver.minConfidence,
        },
      });

      // Wire to event mesh
      this.wireToEventMesh();

      // Start periodic checks
      this.startPeriodicChecks();

      // Start consolidation
      this.startConsolidation();

      this.isRunning = true;

      log.info("✅ Predictive service started and wired to all systems");
    } catch (error) {
      log.error("Failed to start predictive service:", error);
      throw error;
    }
  }

  /**
   * Wire predictive engine to event mesh
   */
  private wireToEventMesh(): void {
    if (!this.mesh) return;

    // Listen for user actions
    const userEventTypes = [
      EventTypes.USER_MESSAGE,
      EventTypes.USER_COMMAND,
      "tool.execute",
      "tool.complete",
      "calendar.event",
      "calendar.reminder",
      "email.received",
      "email.sent",
      "task.created",
      "task.completed",
      "task.due",
      "github.issue",
      "github.pr",
      "github.review",
      "imsg.send",
      "signal.send",
      "telegram.send",
      "slack.message",
      "discord.message",
    ];

    for (const eventType of userEventTypes) {
      this.mesh.subscribe(eventType, async (event) => {
        await this.handleUserEvent(event);
      });
    }

    log.info(`Wired predictive engine to ${userEventTypes.length} event types`);
  }

  /**
   * Handle user event - learn patterns and check predictions
   */
  private async handleUserEvent(event: AgentEvent): Promise<void> {
    if (!this.engine || !this.config.schedule.patternLearningEnabled) return;

    try {
      // Learn pattern from event
      const pattern = this.extractPatternFromEvent(event);
      if (pattern) {
        await this.engine.learnPattern(pattern);
        log.debug(`Learned pattern: ${pattern.pattern}`);
      }

      // Store event in neuro-memory if available
      await this.storeEventToNeuroMemory(event);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.debug(`Failed to handle user event: ${errorMsg}`);
    }
  }

  /**
   * Extract pattern from event
   */
  private extractPatternFromEvent(event: AgentEvent): Omit<UserPattern, "id"> | null {
    const now = new Date(event.timestamp);
    const timeOfDay = this.getTimeOfDay(now);
    const dayOfWeek = now.toLocaleDateString("en", { weekday: "long" });
    const category = this.categorizeEvent(event.type);

    // Skip if category disabled
    if (!this.config.categories[category as keyof typeof this.config.categories]) {
      return null;
    }

    const pattern: Omit<UserPattern, "id"> = {
      pattern: `${event.type}_${timeOfDay}_${dayOfWeek}`,
      category,
      frequency: 1,
      lastOccurrence: event.timestamp,
      confidence: 0.5,
      metadata: {
        eventType: event.type,
        timeOfDay,
        dayOfWeek,
        hour: now.getHours(),
        source: event.source,
      },
    };

    return pattern;
  }

  /**
   * Store event to neuro-memory
   */
  private async storeEventToNeuroMemory(event: AgentEvent): Promise<void> {
    const neuroMemory = getNeuroMemoryBridge();
    if (!neuroMemory || !neuroMemory.isRunning()) return;

    try {
      const content = this.eventToText(event);
      await neuroMemory.storeMemory(content, {
        type: event.type,
        source: event.source,
        timestamp: event.timestamp,
        category: this.categorizeEvent(event.type),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.debug(`Failed to store to neuro-memory: ${errorMsg}`);
    }
  }

  /**
   * Start periodic prediction checks
   */
  private startPeriodicChecks(): void {
    const intervalMs = this.config.schedule.checkIntervalMs || 30 * 60 * 1000; // 30 min

    this.checkInterval = setInterval(async () => {
      try {
        await this.runPredictionCheck();
      } catch (error) {
        log.error("Prediction check failed:", error);
        // Continue running - don't let single failure stop the interval
      }
    }, intervalMs);

    log.info(`Periodic prediction checks scheduled every ${intervalMs / 60000} minutes`);
  }

  /**
   * Start memory consolidation
   */
  private startConsolidation(): void {
    const intervalMs = this.config.schedule.consolidationIntervalMs || 60 * 60 * 1000; // 1 hour

    this.consolidationInterval = setInterval(async () => {
      try {
        await this.runConsolidation();
      } catch (error) {
        log.error("Pattern consolidation failed:", error);
        // Continue running - don't let single failure stop the interval
      }
    }, intervalMs);

    log.info(`Pattern consolidation scheduled every ${intervalMs / 60000} minutes`);
  }

  /**
   * Run prediction check
   */
  async runPredictionCheck(): Promise<PredictedAction[]> {
    if (!this.engine) {
      log.warn("Engine not initialized");
      return [];
    }

    try {
      // Get predictions
      const predictions = await this.engine.checkPredictions();

      log.debug(`Prediction check: ${predictions.length} predictions`);

      // Check if we should deliver
      if (predictions.length > 0 && this.shouldDeliver()) {
        const topPrediction = predictions[0];

        // Only deliver if confidence high enough
        if (topPrediction.confidence >= this.config.autoDeliver.minConfidence) {
          await this.deliverPrediction(topPrediction);
        }
      }

      return predictions;
    } catch (error) {
      log.error("Prediction check failed:", error);
      return [];
    }
  }

  /**
   * Run pattern consolidation
   */
  private async runConsolidation(): Promise<void> {
    if (!this.engine) return;

    try {
      // Consolidate neuro-memory
      const neuroMemory = getNeuroMemoryBridge();
      if (neuroMemory && neuroMemory.isRunning()) {
        const result = await neuroMemory.consolidateMemories();
        log.info(
          `Neuro-memory consolidation: ${result.replay_count} replays, ${result.schemas_extracted} schemas`
        );
      }

      // Prune old patterns
      await this.engine.prunePatterns();

      log.debug("Pattern consolidation complete");
    } catch (error) {
      log.error("Consolidation failed:", error);
    }
  }

  /**
   * Check if we should deliver a prediction
   */
  private shouldDeliver(): boolean {
    if (!this.config.autoDeliver.enabled) return false;

    const now = new Date();
    const hour = now.getHours();

    // Reset daily counter at midnight
    const todayStart = new Date(now).setHours(0, 0, 0, 0);
    if (this.lastDeliveryReset < todayStart) {
      this.todayDeliveries = 0;
      this.lastDeliveryReset = todayStart;
    }

    // Check quiet hours
    const { start, end } = this.config.autoDeliver.quietHours;
    if (hour >= start || hour < end) {
      log.debug("Quiet hours - skipping delivery");
      return false;
    }

    // Check daily limit
    if (this.todayDeliveries >= this.config.autoDeliver.maxPerDay) {
      log.debug("Daily delivery limit reached");
      return false;
    }

    // Check cooldown (at least 30 min between deliveries)
    const cooldownMs = 30 * 60 * 1000;
    if (Date.now() - this.lastDeliveryTime < cooldownMs) {
      log.debug("Cooldown active - skipping delivery");
      return false;
    }

    return true;
  }

  /**
   * Deliver prediction via event mesh
   */
  private async deliverPrediction(prediction: PredictedAction): Promise<void> {
    if (!this.mesh) return;

    log.info(`📊 Delivering prediction: ${prediction.action}`);

    // Emit delivery event
    this.mesh.emit({
      type: "prediction.deliver",
      source: "predictive-service",
      data: {
        prediction,
        channels: this.config.autoDeliver.channels,
        timestamp: Date.now(),
      },
    });

    // Update counters
    this.todayDeliveries++;
    this.lastDeliveryTime = Date.now();

    // Track delivery
    this.deliveryHistory.push({
      prediction,
      timestamp: Date.now(),
      channel: this.config.autoDeliver.channels[0] || "unknown",
      delivered: true,
    });

    // Keep only last 100 deliveries
    if (this.deliveryHistory.length > 100) {
      this.deliveryHistory = this.deliveryHistory.slice(-100);
    }
  }

  /**
   * Get time of day category
   */
  private getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }

  /**
   * Categorize event type
   */
  private categorizeEvent(type: string): string {
    if (type.includes("calendar")) return "calendar";
    if (type.includes("email")) return "email";
    if (type.includes("task")) return "task";
    if (type.includes("github")) return "workflow";
    if (
      type.includes("imsg") ||
      type.includes("signal") ||
      type.includes("telegram") ||
      type.includes("slack") ||
      type.includes("discord")
    ) {
      return "communication";
    }
    return "context";
  }

  /**
   * Convert event to text for storage
   */
  private eventToText(event: AgentEvent): string {
    const dataStr = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    return `[${event.type}] ${dataStr}`;
  }

  /**
   * Record prediction feedback
   */
  recordFeedback(predictionId: string, accepted: boolean, feedback?: string): void {
    if (!this.engine) return;

    this.engine.recordFeedback(predictionId, accepted, feedback);
    log.info(`Feedback recorded: ${predictionId} - ${accepted ? "accepted" : "rejected"}`);
  }

  /**
   * Get predictions for query
   */
  async getPredictions(query?: string): Promise<PredictedAction[]> {
    if (!this.engine) return [];

    // Get context from neuro-memory if query provided
    if (query) {
      const neuroMemory = getNeuroMemoryBridge();
      if (neuroMemory && neuroMemory.isRunning()) {
        const memories = await neuroMemory.retrieveMemories(query, 5);
        log.debug(`Retrieved ${memories.length} memories for context`);
      }
    }

    return this.engine.checkPredictions();
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      running: this.isRunning,
      todayDeliveries: this.todayDeliveries,
      lastDeliveryTime: this.lastDeliveryTime,
      deliveryHistoryCount: this.deliveryHistory.length,
      meshWired: this.mesh !== null,
      engineReady: this.engine !== null,
      config: {
        autoDeliver: this.config.autoDeliver.enabled,
        maxPerDay: this.config.autoDeliver.maxPerDay,
        patternLearning: this.config.schedule.patternLearningEnabled,
        categories: this.config.categories,
      },
    };
  }

  /**
   * Get learned patterns
   */
  getPatterns(): UserPattern[] {
    if (!this.engine) return [];
    return this.engine.getPatterns();
  }

  /**
   * Get delivery history
   */
  getDeliveryHistory(limit: number = 20): DeliveryEvent[] {
    return this.deliveryHistory.slice(-limit);
  }

  /**
   * Get config
   */
  getConfig(): PredictiveServiceConfig {
    return this.config;
  }

  /**
   * Get predictive engine
   */
  getEngine(): PredictiveEngine | null {
    return this.engine;
  }

  /**
   * Enable auto delivery
   */
  enableAutoDelivery(): void {
    this.config.autoDeliver.enabled = true;
    log.info("Auto-delivery enabled");
  }

  /**
   * Disable auto delivery
   */
  disableAutoDelivery(): void {
    this.config.autoDeliver.enabled = false;
    log.info("Auto-delivery disabled");
  }

  /**
   * Stop predictive service
   */
  async stop(): Promise<void> {
    log.info("Stopping predictive service...");

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
      this.consolidationInterval = undefined;
    }

    if (this.engine) {
      this.engine.close();
      this.engine = null;
    }

    this.mesh = null;
    this.isRunning = false;

    log.info("Predictive service stopped");
  }
}

// Singleton
let service: PredictiveService | null = null;

/**
 * Initialize predictive service
 */
export function initPredictiveService(config: PredictiveServiceConfig): PredictiveService {
  if (service) {
    log.warn("Predictive service already initialized, returning existing instance");
    return service;
  }

  service = new PredictiveService(config);
  return service;
}

/**
 * Get predictive service instance
 */
export function getPredictiveService(): PredictiveService | null {
  return service;
}

/**
 * Check if predictive service is running
 */
export function isPredictiveServiceRunning(): boolean {
  return service !== null && service["isRunning"];
}
