/**
 * Production-Grade Event Mesh - TimescaleDB Analytics Layer
 *
 * Uses TimescaleDB for:
 * - Time-series analytics
 * - Continuous aggregates (real-time materialized views)
 * - Automatic compression (10-20x storage reduction)
 * - PostgreSQL compatibility
 */

import { Pool, PoolClient, QueryResult } from "pg";
import type { AgentEvent } from "./redpanda";

export interface TimescaleConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

export interface EventStats {
  bucket: Date;
  eventType: string;
  sourceAgent: string;
  eventCount: number;
  uniqueTargets: number;
  maxSequence: number;
  avgLagSeconds: number;
}

export interface EventTrend {
  bucket: Date;
  eventType: string;
  totalEvents: number;
}

export class TimescaleAnalytics {
  private pool: Pool;
  private initialized: boolean = false;

  constructor(config: TimescaleConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.maxConnections || 10,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
    });
  }

  async initializeSchema(): Promise<void> {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Enable TimescaleDB extension
      await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);

      // Create main events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_events (
          time TIMESTAMPTZ NOT NULL,
          event_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          source_agent TEXT NOT NULL,
          target_agent TEXT,
          data JSONB NOT NULL,
          metadata JSONB,
          sequence BIGINT,
          processed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Convert to hypertable
      await client.query(`
        SELECT create_hypertable('agent_events', 'time', if_not_exists => TRUE);
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_agent_events_type_time 
          ON agent_events(event_type, time DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_events_source_time 
          ON agent_events(source_agent, time DESC);
        CREATE INDEX IF NOT EXISTS idx_agent_events_target_time 
          ON agent_events(target_agent, time DESC) WHERE target_agent IS NOT NULL;
      `);

      // Create 1-minute continuous aggregate
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS event_stats_1min
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 minute', time) AS bucket,
          event_type,
          source_agent,
          COUNT(*) as event_count,
          COUNT(DISTINCT target_agent) as unique_targets,
          MAX(sequence) as max_sequence,
          COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - time)))::FLOAT, 0) as avg_lag_seconds
        FROM agent_events
        GROUP BY bucket, event_type, source_agent
        WITH NO DATA;
      `);

      // Add refresh policy for 1-minute aggregates
      await client.query(`
        SELECT add_continuous_aggregate_policy('event_stats_1min',
          start_offset => INTERVAL '3 hours',
          end_offset => INTERVAL '1 minute',
          schedule_interval => INTERVAL '1 minute',
          if_not_exists => TRUE
        );
      `);

      // Create 1-hour continuous aggregate
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS event_stats_1hour
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 hour', bucket) AS bucket,
          event_type,
          source_agent,
          SUM(event_count) as total_events,
          MAX(max_sequence) as max_sequence,
          AVG(avg_lag_seconds) as avg_lag_seconds
        FROM event_stats_1min
        GROUP BY bucket, event_type, source_agent
        WITH NO DATA;
      `);

      // Add refresh policy for 1-hour aggregates
      await client.query(`
        SELECT add_continuous_aggregate_policy('event_stats_1hour',
          start_offset => INTERVAL '7 days',
          end_offset => INTERVAL '1 hour',
          schedule_interval => INTERVAL '1 hour',
          if_not_exists => TRUE
        );
      `);

      // Enable compression
      await client.query(`
        ALTER TABLE agent_events SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = 'event_type,source_agent'
        );
        SELECT add_compression_policy('agent_events', INTERVAL '7 days', if_not_exists => TRUE);
      `);

      // Add retention policy (90 days)
      await client.query(`
        SELECT add_retention_policy('agent_events', INTERVAL '90 days', if_not_exists => TRUE);
      `);

      await client.query("COMMIT");
      this.initialized = true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordEvent<T>(event: AgentEvent<T>): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO agent_events (
        time, event_id, event_type, source_agent, target_agent,
        data, metadata, sequence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        new Date(event.timestamp),
        event.id,
        event.type,
        event.source,
        event.target || null,
        JSON.stringify(event.data),
        JSON.stringify(event.metadata || {}),
        event.sequence || null,
      ],
    );
  }

  async getRealTimeStats(eventType?: string, timeRange: string = "1 hour"): Promise<EventStats[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM event_stats_1min
      WHERE bucket > NOW() - INTERVAL '${timeRange.replace(/'/g, "''")}'
      ${eventType ? `AND event_type = $1` : ""}
      ORDER BY bucket DESC
      LIMIT 100
    `,
      eventType ? [eventType] : [],
    );

    return result.rows.map((row) => ({
      bucket: row.bucket,
      eventType: row.event_type,
      sourceAgent: row.source_agent,
      eventCount: parseInt(row.event_count),
      uniqueTargets: parseInt(row.unique_targets),
      maxSequence: parseInt(row.max_sequence) || 0,
      avgLagSeconds: parseFloat(row.avg_lag_seconds) || 0,
    }));
  }

  async getEventTrends(
    granularity: "1min" | "1hour" | "1day" = "1hour",
    days: number = 7,
  ): Promise<EventTrend[]> {
    const view = `event_stats_${granularity.replace("min", "min").replace("hour", "hour").replace("day", "day")}`;

    const result = await this.pool.query(`
      SELECT
        bucket,
        event_type,
        SUM(total_events) as total_events
      FROM event_stats_1hour
      WHERE bucket > NOW() - INTERVAL '${days} days'
      GROUP BY bucket, event_type
      ORDER BY bucket DESC
    `);

    return result.rows.map((row) => ({
      bucket: row.bucket,
      eventType: row.event_type,
      totalEvents: parseInt(row.total_events),
    }));
  }

  async queryEvents(
    filter: {
      type?: string;
      source?: string;
      target?: string;
    },
    timeRange: { start: Date; end: Date },
    limit: number = 100,
  ): Promise<AgentEvent[]> {
    const conditions: string[] = ["time >= $1", "time <= $2"];
    const params: any[] = [timeRange.start, timeRange.end];
    let paramIndex = 3;

    if (filter.type) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filter.type);
    }
    if (filter.source) {
      conditions.push(`source_agent = $${paramIndex++}`);
      params.push(filter.source);
    }
    if (filter.target) {
      conditions.push(`target_agent = $${paramIndex++}`);
      params.push(filter.target);
    }

    params.push(limit);

    const result = await this.pool.query(
      `
      SELECT * FROM agent_events
      WHERE ${conditions.join(" AND ")}
      ORDER BY time DESC
      LIMIT $${paramIndex}
    `,
      params,
    );

    return result.rows.map((row) => ({
      id: row.event_id,
      type: row.event_type,
      source: row.source_agent,
      target: row.target_agent || undefined,
      timestamp: row.time.getTime(),
      data: row.data,
      metadata: row.metadata || undefined,
      sequence: row.sequence ? BigInt(row.sequence) : undefined,
    }));
  }

  async getEventCount(eventType?: string, timeRange: string = "24 hours"): Promise<number> {
    const result = await this.pool.query(
      `
      SELECT COUNT(*) as count
      FROM agent_events
      WHERE time > NOW() - INTERVAL '${timeRange.replace(/'/g, "''")}'
      ${eventType ? `AND event_type = $1` : ""}
    `,
      eventType ? [eventType] : [],
    );

    return parseInt(result.rows[0].count);
  }

  async getTopEventTypes(
    limit: number = 10,
    timeRange: string = "24 hours",
  ): Promise<{ eventType: string; count: number }[]> {
    const result = await this.pool.query(
      `
      SELECT event_type, COUNT(*) as count
      FROM agent_events
      WHERE time > NOW() - INTERVAL '${timeRange.replace(/'/g, "''")}'
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT $1
    `,
      [limit],
    );

    return result.rows.map((row) => ({
      eventType: row.event_type,
      count: parseInt(row.count),
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Singleton instance
let timescaleInstance: TimescaleAnalytics | null = null;

export function getTimescaleAnalytics(config?: TimescaleConfig): TimescaleAnalytics {
  if (!timescaleInstance && config) {
    timescaleInstance = new TimescaleAnalytics(config);
  }
  if (!timescaleInstance) {
    throw new Error(
      "TimescaleAnalytics not initialized. Call getTimescaleAnalytics with config first.",
    );
  }
  return timescaleInstance;
}
