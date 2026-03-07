/**
 * Production-Grade Agent Event Mesh
 *
 * A complete, production-grade event mesh system incorporating:
 * - Redpanda for high-performance event streaming
 * - FoundationDB for strict serializable state management
 * - TimescaleDB for time-series analytics
 * - Full observability support
 */

export { RedpandaEventMesh, getRedpandaEventMesh } from "./redpanda";
export type { AgentEvent, MessageMetadata, RedpandaConfig } from "./redpanda";

export { FoundationDBEventStore, getFoundationDBEventStore } from "./foundationdb-store";
export type { EventRecord, FoundationDBConfig } from "./foundationdb-store";

export { TimescaleAnalytics, getTimescaleAnalytics } from "./timescale-analytics";
export type { TimescaleConfig, EventStats, EventTrend } from "./timescale-analytics";

export { UnifiedAgentEventMesh, getEventMesh, initEventMesh } from "./unified-event-mesh";
export type {
  EventMeshConfig,
  EventFilter,
  EventStats as MeshEventStats,
} from "./unified-event-mesh";

/**
 * Quick Start Example:
 *
 * ```typescript
 * import { initEventMesh } from './agents/event-mesh-production';
 *
 * // Initialize with config
 * const eventMesh = initEventMesh({
 *   agentId: 'main',
 *   redpanda: {
 *     brokers: ['localhost:9092'],
 *     clientId: 'openclaw-main',
 *   },
 *   timescale: {
 *     connectionString: 'postgres://user:pass@localhost:5432/eventmesh',
 *   },
 *   enableAnalytics: true,
 * });
 *
 * await eventMesh.initialize();
 *
 * // Publish an event
 * const eventId = await eventMesh.publish('email.received', {
 *   from: 'user@example.com',
 *   subject: 'Hello',
 * });
 *
 * // Subscribe to events
 * await eventMesh.subscribe('email.received', async (event) => {
 *   console.log('New email:', event.data);
 * });
 *
 * // Query history
 * const history = await eventMesh.queryHistory(
 *   { type: 'email.received' },
 *   { start: new Date(Date.now() - 86400000), end: new Date() },
 *   100
 * );
 * ```
 */

/**
 * Architecture Notes:
 *
 * TIER 1 - EVENT INGESTION (Redpanda):
 * - 70x faster tail latency than Kafka
 * - Self-healing (no ZooKeeper)
 * - Built-in Schema Registry
 * - Exactly-once semantics
 *
 * TIER 2 - STATE MANAGEMENT (FoundationDB):
 * - Strict serializability (strongest consistency)
 * - Apple-proven reliability
 * - Transactional event storage
 * - Deterministic simulation testing
 *
 * TIER 3 - ANALYTICS (TimescaleDB):
 * - Continuous aggregates (real-time materialized views)
 * - Automatic compression (10-20x storage reduction)
 * - PostgreSQL compatible
 * - Time-series optimized
 *
 * TIER 4 - OBSERVABILITY (Prometheus/Grafana/Jaeger):
 * - OpenTelemetry instrumentation
 * - Prometheus metrics
 * - Distributed tracing
 * - Real-time dashboards
 */
