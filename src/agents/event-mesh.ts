/**
 * Agent Event Mesh - Wired to Neuro-Memory-Agent
 *
 * Event mesh with episodic memory powered by neuro-memory-agent:
 * - Bayesian surprise detection for novelty
 * - Two-stage retrieval (similarity + temporal)
 * - Memory consolidation (sleep-like replay)
 * - Forgetting & decay
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  NeuroMemoryBridge,
  initNeuroMemoryBridge,
  getNeuroMemoryBridge,
  type Episode,
} from "./neuro-memory-bridge.js";

const log = createSubsystemLogger("event-mesh");

export type AgentEvent = {
  id: string;
  type: string;
  source: string;
  timestamp: number;
  data: unknown;
  metadata?: Record<string, unknown>;
};

export type EventHandler = (event: AgentEvent) => Promise<void> | void;

export type EventFilter = {
  source?: string;
  type?: string;
  types?: string[];
};

export type EventMeshConfig = {
  agentId: string;
  db: DatabaseSync | null;
  enablePersistence?: boolean;
  maxListeners?: number;
  // Neuro-memory integration
  neuroMemory?: {
    enabled: boolean;
    agentPath?: string;
    // Event types to store in long-term memory (default: all)
    memorableTypes?: string[];
    // Minimum surprise threshold to store (0-1)
    surpriseThreshold?: number;
  };
};

export type EventSubscription = {
  id: string;
  eventType: string;
  handler: EventHandler;
  filter?: EventFilter;
};

// Track neuro-memory bridge
let neuroMemory: NeuroMemoryBridge | null = null;
let neuroMemoryEnabled = false;

// Initialize neuro-memory bridge in background
async function initNeuroMemory(agentPath: string): Promise<void> {
  if (neuroMemory || neuroMemoryEnabled) return;

  try {
    neuroMemory = await initNeuroMemoryBridge(agentPath);
    neuroMemoryEnabled = true;
    log.info("✅ Neuro-memory-agent connected");
  } catch (error) {
    log.warn("Neuro-memory-agent not available:", error);
    neuroMemoryEnabled = false;
  }
}

// Track if production mesh is available
let productionMesh: any = null;
let productionAvailable = false;

// Try to load production mesh
async function loadProductionMesh() {
  if (productionAvailable || productionMesh) return;

  try {
    const { initEventMesh } = await import("./event-mesh-production/unified-event-mesh.js");
    productionMesh = initEventMesh({
      agentId: "openclaw-main",
      enableAnalytics: false,
      enablePersistence: false,
    });
    await productionMesh.initialize();
    productionAvailable = true;
    log.info("✅ Production event mesh initialized");
  } catch (error) {
    log.debug("Production event mesh not available");
    productionAvailable = false;
  }
}

// Start loading in background
loadProductionMesh();

/**
 * Agent Event Mesh
 * Enables event-driven communication between agents and skills
 *
 * Wired to neuro-memory-agent for episodic memory!
 */
export class AgentEventMesh {
  private bus: EventEmitter;
  private agentId: string;
  private db: DatabaseSync | null;
  private subscriptions: Map<string, EventSubscription>;
  private history: AgentEvent[];
  private maxHistorySize: number;
  private enablePersistence: boolean;
  private neuroMemoryConfig: EventMeshConfig["neuroMemory"];

  constructor(config: EventMeshConfig) {
    this.bus = new EventEmitter();
    this.agentId = config.agentId;
    this.db = config.db;
    this.subscriptions = new Map();
    this.history = [];
    this.maxHistorySize = 1000;
    this.enablePersistence = config.enablePersistence ?? false;
    this.neuroMemoryConfig = config.neuroMemory;

    if (config.maxListeners) {
      this.bus.setMaxListeners(config.maxListeners);
    }

    // Initialize database schema if db is provided
    if (this.db && this.enablePersistence) {
      this.initializeDatabase();
    }

    // Initialize neuro-memory if enabled
    if (this.neuroMemoryConfig?.enabled) {
      const agentPath =
        this.neuroMemoryConfig.agentPath || "/Users/tolga/Desktop/neuro-memory-agent";
      initNeuroMemory(agentPath).catch((err) => {
        log.warn("Failed to initialize neuro-memory:", err);
      });
    }
  }

  /**
   * Initialize database schema for event persistence
   */
  private initializeDatabase(): void {
    try {
      this.db
        .prepare(`
        CREATE TABLE IF NOT EXISTS agent_events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          source TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          data TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER DEFAULT (unixepoch())
        )
      `)
        .run();

      // Create index for faster queries
      this.db
        .prepare(`
        CREATE INDEX IF NOT EXISTS idx_agent_events_type 
        ON agent_events(type, timestamp)
      `)
        .run();

      this.db
        .prepare(`
        CREATE INDEX IF NOT EXISTS idx_agent_events_source 
        ON agent_events(source, timestamp)
      `)
        .run();

      log.debug("Event mesh database schema initialized");
    } catch (error) {
      log.error("Failed to initialize event mesh database:", error);
    }
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: Omit<AgentEvent, "id" | "timestamp">): string {
    const fullEvent: AgentEvent = {
      ...event,
      id: event.id || randomUUID(),
      timestamp: event.timestamp || Date.now(),
    };

    // Add to history
    this.history.push(fullEvent);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Persist if enabled
    if (this.enablePersistence && this.db) {
      this.persistEvent(fullEvent);
    }

    // Emit to local subscribers
    this.bus.emit(event.type, fullEvent);

    // Store in neuro-memory if memorable
    if (neuroMemoryEnabled && this.isMemorable(fullEvent)) {
      this.storeToNeuroMemory(fullEvent).catch((err) => {
        log.debug("Failed to store to neuro-memory:", err);
      });
    }

    // Forward to production mesh
    if (productionAvailable && productionMesh) {
      productionMesh
        .publish(event.type, event.data, {
          ...event.metadata,
          source: event.source,
        })
        .catch(() => {}); // Ignore errors
    }

    return fullEvent.id;
  }

  /**
   * Check if event should be stored in long-term memory
   */
  private isMemorable(event: AgentEvent): boolean {
    if (!this.neuroMemoryConfig) return false;

    const memorableTypes = this.neuroMemoryConfig.memorableTypes;
    if (memorableTypes && memorableTypes.length > 0) {
      return memorableTypes.includes(event.type);
    }

    // Default: store most event types except noisy ones
    const noisyTypes = ["heartbeat", "ping", "status.check", "metrics.tick"];
    return !noisyTypes.includes(event.type);
  }

  /**
   * Store event to neuro-memory-agent
   */
  private async storeToNeuroMemory(event: AgentEvent): Promise<void> {
    if (!neuroMemory) return;

    const content = this.eventToText(event);

    try {
      const result = await neuroMemory.storeMemory(content, {
        type: event.type,
        source: event.source,
        timestamp: event.timestamp,
      });

      if (result.stored) {
        log.debug(`Memory stored: ${event.type} (surprise: ${result.surprise.toFixed(3)})`);
      }
    } catch (error) {
      log.debug("Neuro-memory store error:", error);
    }
  }

  /**
   * Retrieve relevant memories from neuro-memory
   */
  async retrieveMemories(query: string, k: number = 5): Promise<Episode[]> {
    if (!neuroMemory || !neuroMemoryEnabled) {
      return [];
    }

    return neuroMemory.retrieveMemories(query, k);
  }

  /**
   * Get context for a query (recent history + long-term memories)
   */
  async getContext(
    query: string,
    options?: {
      recentLimit?: number;
      longTermLimit?: number;
    },
  ): Promise<{
    recent: AgentEvent[];
    longTerm: Episode[];
  }> {
    const recentLimit = options?.recentLimit || 10;
    const longTermLimit = options?.longTermLimit || 5;

    // Get recent events from history
    const recent = this.history.slice(-recentLimit);

    // Get long-term memories
    let longTerm: Episode[] = [];
    if (neuroMemoryEnabled && neuroMemory) {
      try {
        longTerm = await this.retrieveMemories(query, longTermLimit);
      } catch (error) {
        log.debug("Failed to retrieve long-term memories:", error);
      }
    }

    return { recent, longTerm };
  }

  /**
   * Trigger memory consolidation manually
   */
  async consolidateMemories(): Promise<{ replayCount: number; schemas: string[] } | null> {
    if (!neuroMemory || !neuroMemoryEnabled) {
      return null;
    }

    try {
      const result = await neuroMemory.consolidateMemories();
      log.info(
        `Consolidation: ${result.replay_count} replays, ${result.schemas_extracted} schemas`,
      );
      return {
        replayCount: result.replay_count,
        schemas: result.schemas,
      };
    } catch (error) {
      log.error("Consolidation failed:", error);
      return null;
    }
  }

  /**
   * Get neuro-memory stats
   */
  async getNeuroMemoryStats(): Promise<{
    totalEpisodes: number;
    meanSurprise: number;
    isRunning: boolean;
  } | null> {
    if (!neuroMemory || !neuroMemoryEnabled) {
      return { totalEpisodes: 0, meanSurprise: 0, isRunning: false };
    }

    try {
      const stats = await neuroMemory.getStats();
      return {
        totalEpisodes: stats.total_episodes,
        meanSurprise: stats.mean_surprise,
        isRunning: true,
      };
    } catch (error) {
      return { totalEpisodes: 0, meanSurprise: 0, isRunning: false };
    }
  }

  /**
   * Convert event to text for storage
   */
  private eventToText(event: AgentEvent): string {
    const dataStr = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
    return `[${event.type}] ${dataStr}`;
  }

  /**
   * Subscribe to events of a specific type
   */
  subscribe(eventType: string, handler: EventHandler, filter?: EventFilter): string {
    const id = randomUUID();
    const subscription: EventSubscription = {
      id,
      eventType,
      handler,
      filter,
    };

    this.subscriptions.set(id, subscription);

    const wrappedHandler = async (event: AgentEvent) => {
      if (this.matchesFilter(event, filter)) {
        await handler(event);
      }
    };

    this.bus.on(eventType, wrappedHandler);
    return id;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.bus.off(subscription.eventType, subscription.handler);
    this.subscriptions.delete(subscriptionId);
    return true;
  }

  /**
   * Get event history
   */
  getHistory(filter?: EventFilter, limit?: number): AgentEvent[] {
    let events = this.history;

    if (filter) {
      events = events.filter((e) => this.matchesFilter(e, filter));
    }

    if (limit) {
      events = events.slice(-limit);
    }

    return events;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Check if filter matches event
   */
  private matchesFilter(event: AgentEvent, filter?: EventFilter): boolean {
    if (!filter) return true;
    if (filter.source && event.source !== filter.source) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.types && !filter.types.includes(event.type)) return false;
    return true;
  }

  /**
   * Persist event to database
   */
  private persistEvent(event: AgentEvent): void {
    if (!this.db) return;

    try {
      this.db
        .prepare(
          `INSERT INTO agent_events (id, type, source, timestamp, data, metadata)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.type,
          event.source,
          event.timestamp,
          JSON.stringify(event.data),
          JSON.stringify(event.metadata || {}),
        );
    } catch (error) {
      log.error("Failed to persist event:", error);
    }
  }

  /**
   * Get production mesh status
   */
  isProductionWired(): boolean {
    return productionAvailable;
  }

  /**
   * Check if neuro-memory is connected
   */
  isNeuroMemoryEnabled(): boolean {
    return neuroMemoryEnabled;
  }

  /**
   * Get stats about the event mesh
   */
  getStats() {
    return {
      subscriptionCount: this.subscriptions.size,
      historySize: this.history.length,
      productionWired: productionAvailable,
      neuroMemoryEnabled,
      eventTypes: [...new Set(this.history.map((e) => e.type))],
    };
  }
}

// Singleton instance
let instance: AgentEventMesh | null = null;

export function getEventMesh(config?: EventMeshConfig): AgentEventMesh {
  if (!instance && config) {
    instance = new AgentEventMesh(config);
  }
  if (!instance) {
    throw new Error("EventMesh not initialized. Call getEventMesh with config first.");
  }
  return instance;
}

/**
 * Try to get the EventMesh instance without throwing.
 * Returns null if not initialized - use this for optional event emission.
 */
export function tryGetEventMesh(): AgentEventMesh | null {
  return instance;
}

export function initEventMesh(config: EventMeshConfig): AgentEventMesh {
  instance = new AgentEventMesh(config);
  return instance;
}

// EventTypes - common event type constants
export const EventTypes = {
  // Agent lifecycle
  AGENT_START: "agent.start",
  AGENT_STOP: "agent.stop",
  AGENT_ERROR: "agent.error",

  // Memory events
  MEMORY_STORE: "memory.store",
  MEMORY_RETRIEVE: "memory.retrieve",
  MEMORY_CONSOLIDATE: "memory.consolidate",

  // User interaction
  USER_MESSAGE: "user.message",
  USER_COMMAND: "user.command",

  // System events
  HEARTBEAT: "heartbeat",
  STATUS_CHECK: "status.check",

  // Generic
  CUSTOM: "custom",
} as const;

// Global registry for event mesh instances (for multi-agent scenarios)
export const globalEventMeshRegistry = new Map<string, AgentEventMesh>();
