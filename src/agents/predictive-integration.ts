/**
 * Predictive Integration Module
 * Wires PredictiveEngine, EventMesh, and ToolAnalytics into OpenClaw runtime
 *
 * Now includes production-grade analytics:
 * - ToolAnalyticsOLAP: SQLite-based OLAP with materialized views, feedback loops, health scores
 * - UnifiedToolAnalytics: Hybrid backend supporting Pinot, ClickHouse, and RL-based tool selection
 */

import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BriefingConfig } from "./briefing-generator.js";
import { resolveStateDir, resolveConfigPath } from "../config/paths.js";
import { ToolAnalyticsOLAP, type FeedbackLoop } from "../infra/tool-analytics-olap.js";
import {
  UnifiedToolAnalytics,
  createToolAnalytics,
  getDefaultAnalyticsConfig,
  type AnalyticsConfig,
} from "../infra/tool-analytics-production.js";
import { ToolAnalyticsManager } from "../infra/tool-analytics.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { AgentEventMesh, globalEventMeshRegistry, type EventMeshConfig } from "./event-mesh.js";
import { PredictiveEngine, type PredictionEngineConfig } from "./predictive-engine.js";

const log = createSubsystemLogger("predictive-integration");

let predictiveEngine: PredictiveEngine | null = null;
let eventMesh: AgentEventMesh | null = null;
let toolAnalytics: ToolAnalyticsManager | null = null;
let olapAnalytics: ToolAnalyticsOLAP | null = null;
let unifiedAnalytics: UnifiedToolAnalytics | null = null;
let initialized = false;
let ownedDb: DatabaseSync | null = null;

/**
 * Create a SQLite database for predictive features
 */
function createPredictiveDb(agentId: string): DatabaseSync | null {
  try {
    const stateDir = resolveStateDir(process.env, os.homedir);
    const predictiveDir = path.join(stateDir, "predictive");

    // Ensure directory exists
    if (!fs.existsSync(predictiveDir)) {
      fs.mkdirSync(predictiveDir, { recursive: true });
    }

    const dbPath = path.join(predictiveDir, `${agentId}.sqlite`);
    const { DatabaseSync } = requireNodeSqlite();
    const db = new DatabaseSync(dbPath);
    // Enable WAL mode for better concurrent access
    db.exec(`PRAGMA journal_mode = WAL`);
    db.exec(`PRAGMA busy_timeout = 5000`);
    return db;
  } catch (err) {
    // If SQLite is not available, fall back to memory-only mode
    return null;
  }
}

export type PredictiveIntegrationConfig = {
  agentId: string;
  db: DatabaseSync | null;
  enabled?: boolean;
  /** @deprecated Use briefingConfig instead */
  openRouterApiKey?: string;
  /** Full briefing configuration from config file */
  briefingConfig?: BriefingConfig;
  userTimeZone?: string;
  /** Neuro-memory integration for episodic memory */
  neuroMemory?: {
    enabled: boolean;
    agentPath?: string;
  };
};

/**
 * Read neuroMemory config from openclaw.json
 */
function readNeuroMemoryConfig(): { enabled: boolean; agentPath?: string } | undefined {
  try {
    const stateDir = resolveStateDir(process.env, os.homedir);
    const configPath = resolveConfigPath(process.env, stateDir);
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(raw);
      if (config?.memory?.neuroMemory?.enabled) {
        return {
          enabled: true,
          agentPath: config.memory.neuroMemory.agentPath,
        };
      }
    }
  } catch {
    // Ignore config read errors
  }
  return undefined;
}

/**
 * Ensure predictive integration is initialized with defaults
 * Called automatically when any function is used
 */
function ensureInitialized(): void {
  if (initialized) return;

  // Create a SQLite database for persistence
  const agentId = "main";
  ownedDb = createPredictiveDb(agentId);

  // Read neuroMemory config from openclaw.json
  const neuroMemoryConfig = readNeuroMemoryConfig();

  // Initialize with database for full persistence
  initPredictiveIntegration({
    agentId,
    db: ownedDb,
    enabled: true,
    userTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    neuroMemory: neuroMemoryConfig,
  });
  initialized = true;
}

/**
 * Initialize the predictive integration system
 */
export function initPredictiveIntegration(config: PredictiveIntegrationConfig): {
  engine: PredictiveEngine | null;
  mesh: AgentEventMesh | null;
  analytics: ToolAnalyticsManager | null;
  olap: ToolAnalyticsOLAP | null;
  unified: UnifiedToolAnalytics | null;
} {
  if (config.enabled === false) {
    return { engine: null, mesh: null, analytics: null, olap: null, unified: null };
  }

  // Initialize Event Mesh with neuro-memory integration
  const meshConfig: EventMeshConfig = {
    agentId: config.agentId,
    db: config.db,
    enablePersistence: !!config.db,
    maxListeners: 50,
    // Wire neuro-memory for episodic memory
    neuroMemory: config.neuroMemory,
  };
  eventMesh = new AgentEventMesh(meshConfig);
  globalEventMeshRegistry.set(config.agentId, eventMesh);

  // Initialize Predictive Engine
  const engineConfig: PredictionEngineConfig = {
    agentId: config.agentId,
    db: config.db,
    mesh: eventMesh,
    enablePersistence: !!config.db,
    minConfidence: 0.7,
    maxPredictions: 5,
    userTimeZone: config.userTimeZone || "UTC",
  };

  // Add briefing config if provided (prefers new briefingConfig, falls back to deprecated openRouterApiKey)
  if (config.briefingConfig) {
    engineConfig.briefingConfig = config.briefingConfig;
  } else if (config.openRouterApiKey) {
    // Fallback for deprecated openRouterApiKey
    engineConfig.briefingConfig = {
      apiKey: config.openRouterApiKey,
      model: "google/gemini-2.5-flash",
      maxTokens: 500,
    };
  }

  predictiveEngine = new PredictiveEngine(engineConfig);

  // Initialize Tool Analytics (basic SQLite)
  if (config.db) {
    toolAnalytics = new ToolAnalyticsManager(config.db, true);
  }

  // Initialize OLAP Analytics with materialized views and feedback loops
  if (config.db) {
    try {
      olapAnalytics = new ToolAnalyticsOLAP(config.db, {
        enabled: true,
      });
      log.info("ToolAnalyticsOLAP initialized with feedback loops and health scores");
    } catch (err) {
      log.warn(`OLAP analytics initialization failed: ${err}`);
    }
  }

  // Initialize Unified Analytics (production-grade with Pinot/ClickHouse/RL support)
  try {
    const analyticsConfig = getDefaultAnalyticsConfig();
    // Enable RL-based tool selection in production
    analyticsConfig.rl = {
      enabled: true,
      learningRate: 0.001,
      explorationRate: 0.1,
      batchSize: 1000,
    };
    unifiedAnalytics = createToolAnalytics(analyticsConfig, config.db ?? undefined);
    log.info("UnifiedToolAnalytics initialized", {
      backend: analyticsConfig.backend,
      rlEnabled: analyticsConfig.rl?.enabled,
    });
  } catch (err) {
    log.warn(`Unified analytics initialization failed: ${err}`);
  }

  return {
    engine: predictiveEngine,
    mesh: eventMesh,
    analytics: toolAnalytics,
    olap: olapAnalytics,
    unified: unifiedAnalytics,
  };
}

/**
 * Get the global predictive engine instance
 */
export function getPredictiveEngine(): PredictiveEngine | null {
  ensureInitialized();
  return predictiveEngine;
}

/**
 * Get the global event mesh instance
 */
export function getEventMesh(): AgentEventMesh | null {
  ensureInitialized();
  return eventMesh;
}

/**
 * Get the tool analytics instance
 */
export function getToolAnalytics(): ToolAnalyticsManager | null {
  ensureInitialized();
  return toolAnalytics;
}

/**
 * Get the OLAP analytics instance (materialized views, feedback loops, health scores)
 */
export function getOlapAnalytics(): ToolAnalyticsOLAP | null {
  ensureInitialized();
  return olapAnalytics;
}

/**
 * Get the unified analytics instance (Pinot/ClickHouse/RL hybrid)
 */
export function getUnifiedAnalytics(): UnifiedToolAnalytics | null {
  ensureInitialized();
  return unifiedAnalytics;
}

/**
 * Track a tool execution (wrapper for convenience)
 */
export function trackTool(
  toolName: string,
  skillName: string | undefined,
  params: unknown,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  const analytics = toolAnalytics;
  if (!analytics) {
    return fn();
  }

  const start = Date.now();

  return fn()
    .then((result) => {
      analytics.track({
        tool: toolName,
        skill: skillName,
        success: true,
        durationMs: Date.now() - start,
        paramsHash: analytics.hashParams(params),
        timestamp: Date.now(),
      });
      return result;
    })
    .catch((error) => {
      analytics.track({
        tool: toolName,
        skill: skillName,
        success: false,
        durationMs: Date.now() - start,
        error: error?.message || String(error),
        paramsHash: analytics.hashParams(params),
        timestamp: Date.now(),
      });
      throw error;
    });
}

/**
 * Check for predictions (call periodically or on triggers)
 */
export async function checkPredictions(): Promise<
  Array<{
    action: string;
    message: string;
    priority: string;
    confidence: number;
  }>
> {
  ensureInitialized();
  if (!predictiveEngine) {
    return [];
  }

  const predictions = await predictiveEngine.checkPredictions();
  return predictions.map((p) => ({
    action: p.action,
    message: p.message,
    priority: p.priority,
    confidence: p.confidence,
  }));
}

/**
 * Update predictive context with new data
 */
export function updatePredictiveContext(data: {
  events?: Map<string, unknown>;
  recentActivity?: Array<{ type: string; timestamp: number; data: unknown }>;
  userState?: {
    timeZone?: string;
    workHours?: { start: number; end: number };
    preferences?: Record<string, unknown>;
  };
}): void {
  ensureInitialized();
  if (!predictiveEngine) {
    return;
  }

  predictiveEngine.updateContext(data as Parameters<typeof predictiveEngine.updateContext>[0]);
}

/**
 * Record feedback on a prediction (for learning)
 */
export function recordPredictionFeedback(
  predictionId: string,
  accepted: boolean,
  feedback?: string,
): void {
  if (!predictiveEngine) {
    return;
  }

  predictiveEngine.recordFeedback(predictionId, accepted, feedback);
}

/**
 * Publish an event to the mesh
 */
export async function publishEvent(type: string, data: unknown): Promise<string | null> {
  ensureInitialized();
  if (!eventMesh) {
    return null;
  }

  // AgentEventMesh uses emit() not publish()
  return eventMesh.emit({
    type,
    source: "predictive-integration",
    data,
  });
}

/**
 * Get prediction statistics
 */
export function getPredictionStats(): {
  totalRules: number;
  enabledRules: number;
  learnedPatterns: number;
  recentPredictions: number;
} | null {
  if (!predictiveEngine) {
    return null;
  }

  return predictiveEngine.getStats();
}

/**
 * Get tool analytics insights
 */
export function getToolInsights(range?: { start?: number; end?: number }) {
  if (!toolAnalytics) {
    return null;
  }

  return toolAnalytics.getInsights(range);
}

/**
 * Get tool health scores from OLAP analytics
 */
export function getToolHealthScores(): Array<{
  tool: string;
  healthScore: number;
  reliabilityScore: number;
  performanceScore: number;
  usageScore: number;
}> | null {
  if (!olapAnalytics) {
    return null;
  }

  return olapAnalytics.getHealthScores();
}

/**
 * Get recent feedback loops from OLAP analytics (unacknowledged)
 */
export function getRecentFeedbackLoops(): FeedbackLoop[] {
  if (!olapAnalytics) {
    return [];
  }

  // Return recent unacknowledged feedback
  return olapAnalytics.getFeedbackHistory(10, true);
}

/**
 * Get optimal tool recommendation using RL + historical data
 */
export async function getOptimalTool(
  query: string,
  availableTools: string[],
  context: {
    agentId: string;
    recentTools?: string[];
    memory?: string[];
  },
): Promise<{
  tool: string;
  confidence: number;
  reason: string;
  historicalRate: number;
} | null> {
  if (!unifiedAnalytics) {
    return null;
  }

  return unifiedAnalytics.getOptimalTool(query, availableTools, context);
}

/**
 * Get analytics backend status
 */
export function getAnalyticsStatus(): {
  basic: boolean;
  olap: boolean;
  unified: boolean;
  rlEnabled: boolean;
} {
  return {
    basic: toolAnalytics !== null,
    olap: olapAnalytics !== null,
    unified: unifiedAnalytics !== null,
    rlEnabled: unifiedAnalytics?.getStatus().rl ?? false,
  };
}

/**
 * Shutdown the predictive integration
 */
export async function shutdownPredictiveIntegration(): Promise<void> {
  if (predictiveEngine) {
    predictiveEngine.close();
    predictiveEngine = null;
  }

  // Shutdown unified analytics (Pinot/ClickHouse connections)
  if (unifiedAnalytics) {
    try {
      await unifiedAnalytics.shutdown();
    } catch (err) {
      log.warn(`Unified analytics shutdown error: ${err}`);
    }
    unifiedAnalytics = null;
  }

  // Clear OLAP analytics (shares DB, no explicit close needed)
  olapAnalytics = null;

  // Close the owned database connection
  if (ownedDb) {
    try {
      ownedDb.close();
    } catch {
      // Ignore close errors
    }
    ownedDb = null;
  }

  if (eventMesh) {
    globalEventMeshRegistry.delete(eventMesh["agentId"]);
    eventMesh = null;
  }

  toolAnalytics = null;
  initialized = false;
  log.info("Predictive integration shutdown complete");
}

// Auto-initialize on module load for eager startup
// This ensures predictive features are ready when the gateway starts
try {
  ensureInitialized();
} catch {
  // Silently ignore initialization failures - will retry on first getter call
}
