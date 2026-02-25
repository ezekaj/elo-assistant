/**
 * Production-Grade Event Mesh - Unified Interface
 *
 * Combines:
 * - Redpanda for event streaming
 * - FoundationDB for state management
 * - TimescaleDB for analytics
 * - OpenTelemetry/Prometheus for observability
 */

import { FoundationDBEventStore, type FoundationDBConfig } from "./foundationdb-store";
import {
  RedpandaEventMesh,
  type AgentEvent,
  type MessageMetadata,
  type RedpandaConfig,
} from "./redpanda";
import { TimescaleAnalytics, type TimescaleConfig } from "./timescale-analytics";

export interface EventMeshConfig {
  redpanda?: RedpandaConfig;
  foundationdb?: FoundationDBConfig;
  timescale?: TimescaleConfig;
  agentId: string;
  enableAnalytics?: boolean;
  enablePersistence?: boolean;
}

export interface EventFilter {
  type?: string;
  types?: string[];
  source?: string;
  target?: string;
}

export interface EventStats {
  totalEvents: number;
  eventsPerMinute: number;
  avgLagMs: number;
  topEventTypes: { type: string; count: number }[];
}

export class UnifiedAgentEventMesh {
  private redpanda: RedpandaEventMesh | null = null;
  private foundationdb: FoundationDBEventStore | null = null;
  private timescale: TimescaleAnalytics | null = null;
  private config: EventMeshConfig;
  private initialized: boolean = false;

  // Fallback in-memory event bus when external systems not available
  private inMemoryHandlers: Map<string, Set<(event: AgentEvent) => Promise<void>>> = new Map();
  private eventHistory: AgentEvent[] = [];
  private maxHistorySize: number = 1000;

  constructor(config: EventMeshConfig) {
    this.config = config;

    // Initialize Redpanda if configured
    if (config.redpanda) {
      this.redpanda = new RedpandaEventMesh(config.redpanda);
    }

    // Initialize FoundationDB if configured
    if (config.foundationdb && config.enablePersistence !== false) {
      this.foundationdb = new FoundationDBEventStore(config.foundationdb);
    }

    // Initialize TimescaleDB if configured
    if (config.timescale && config.enableAnalytics !== false) {
      this.timescale = new TimescaleAnalytics(config.timescale);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const initPromises: Promise<void>[] = [];

    if (this.redpanda) {
      initPromises.push(this.redpanda.initialize());
    }

    if (this.timescale) {
      initPromises.push(this.timescale.initializeSchema());
    }

    await Promise.all(initPromises);
    this.initialized = true;
  }

  /**
   * Publish an event to the mesh
   */
  async publish<T>(type: string, data: T, metadata?: Record<string, unknown>): Promise<string> {
    const event: AgentEvent<T> = {
      id: this.generateULID(),
      type,
      source: this.config.agentId,
      timestamp: Date.now(),
      data,
      metadata: {
        ...metadata,
        publishedAt: Date.now(),
      },
    };

    // 1. Persist to FoundationDB for strict ordering
    if (this.foundationdb) {
      const sequence = await this.foundationdb.appendEvent(event);
      event.sequence = sequence;
    }

    // 2. Publish to Redpanda for streaming
    if (this.redpanda) {
      await this.redpanda.publish(`agent-events-${type}`, event);
    }

    // 3. Record in TimescaleDB for analytics
    if (this.timescale) {
      await this.timescale.recordEvent(event);
    }

    // 4. Deliver to local in-memory handlers
    await this.deliverToLocalHandlers(event);

    // 5. Store in history
    this.addToHistory(event);

    return event.id;
  }

  /**
   * Subscribe to events of a specific type
   */
  async subscribe<T>(
    eventType: string,
    handler: (event: AgentEvent<T>) => Promise<void>,
    options?: {
      filter?: EventFilter;
      groupId?: string;
      fromBeginning?: boolean;
    },
  ): Promise<void> {
    // Add to local handlers
    if (!this.inMemoryHandlers.has(eventType)) {
      this.inMemoryHandlers.set(eventType, new Set());
    }
    this.inMemoryHandlers.get(eventType)!.add(handler as (event: AgentEvent) => Promise<void>);

    // Subscribe via Redpanda if available
    if (this.redpanda) {
      await this.redpanda.subscribe(
        `agent-events-${eventType}`,
        options?.groupId || `${this.config.agentId}-group`,
        async (event, metadata) => {
          if (options?.filter && !this.matchesFilter(event, options.filter)) {
            return;
          }
          await handler(event);
        },
        {
          fromBeginning: options?.fromBeginning,
        },
      );
    }
  }

  /**
   * Query historical events
   */
  async queryHistory(
    filter: EventFilter,
    timeRange: { start: Date; end: Date },
    limit: number = 100,
  ): Promise<AgentEvent[]> {
    // Use TimescaleDB if available
    if (this.timescale) {
      return this.timescale.queryEvents(filter, timeRange, limit);
    }

    // Fallback to in-memory history
    return this.eventHistory
      .filter((event) => {
        if (
          event.timestamp < timeRange.start.getTime() ||
          event.timestamp > timeRange.end.getTime()
        ) {
          return false;
        }
        if (filter.type && event.type !== filter.type) return false;
        if (filter.types && !filter.types.includes(event.type)) return false;
        if (filter.source && event.source !== filter.source) return false;
        if (filter.target && event.target !== filter.target) return false;
        return true;
      })
      .slice(0, limit);
  }

  /**
   * Get real-time statistics
   */
  async getStats(): Promise<EventStats> {
    if (this.timescale) {
      const [totalEvents, topTypes] = await Promise.all([
        this.timescale.getEventCount(),
        this.timescale.getTopEventTypes(5),
      ]);

      return {
        totalEvents,
        eventsPerMinute: 0, // Would need real-time calculation
        avgLagMs: 0, // Would need real-time calculation
        topEventTypes: topTypes.map((t) => ({ type: t.eventType, count: t.count })),
      };
    }

    // Fallback to in-memory stats
    return {
      totalEvents: this.eventHistory.length,
      eventsPerMinute: 0,
      avgLagMs: 0,
      topEventTypes: this.getTopEventTypesLocal(),
    };
  }

  /**
   * Watch for new events in real-time
   */
  async watchNewEvents(callback: (event: AgentEvent) => void): Promise<void> {
    if (this.foundationdb) {
      const lastSeq = await this.foundationdb.getLastSequence();
      await this.foundationdb.watchForNewEvents(lastSeq, (record) => {
        const event: AgentEvent = {
          id: record.id,
          type: record.type,
          source: record.source,
          timestamp: record.timestamp,
          data: JSON.parse(Buffer.from(record.data, "base64").toString()),
          metadata: record.metadata,
          sequence: record.sequence,
        };
        callback(event);
      });
    }
  }

  private async deliverToLocalHandlers(event: AgentEvent): Promise<void> {
    const handlers = this.inMemoryHandlers.get(event.type);
    if (!handlers) return;

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error);
      }
    });

    await Promise.all(promises);
  }

  private addToHistory(event: AgentEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  private matchesFilter(event: AgentEvent, filter: EventFilter): boolean {
    if (filter.source && event.source !== filter.source) return false;
    if (filter.type && event.type !== filter.type) return false;
    if (filter.types && !filter.types.includes(event.type)) return false;
    if (filter.target && event.target !== filter.target) return false;
    return true;
  }

  private getTopEventTypesLocal(): { type: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const event of this.eventHistory) {
      counts.set(event.type, (counts.get(event.type) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private generateULID(): string {
    const timestamp = Date.now();
    const randomness = Math.random().toString(36).substring(2, 15);
    return `${timestamp.toString(36)}-${randomness}`;
  }

  async close(): Promise<void> {
    if (this.redpanda) {
      await this.redpanda.disconnect();
    }
    if (this.timescale) {
      await this.timescale.close();
    }
  }
}

// Singleton instance
let eventMeshInstance: UnifiedAgentEventMesh | null = null;

export function getEventMesh(config?: EventMeshConfig): UnifiedAgentEventMesh {
  if (!eventMeshInstance && config) {
    eventMeshInstance = new UnifiedAgentEventMesh(config);
  }
  if (!eventMeshInstance) {
    throw new Error("EventMesh not initialized. Call getEventMesh with config first.");
  }
  return eventMeshInstance;
}

export function initEventMesh(config: EventMeshConfig): UnifiedAgentEventMesh {
  eventMeshInstance = new UnifiedAgentEventMesh(config);
  return eventMeshInstance;
}
