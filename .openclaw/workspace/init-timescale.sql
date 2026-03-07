-- Initialize TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create main events table
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

-- Convert to hypertable (time-series optimized)
SELECT create_hypertable('agent_events', 'time', if_not_exists => TRUE);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_agent_events_type_time 
    ON agent_events(event_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_source_time 
    ON agent_events(source_agent, time DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_target_time 
    ON agent_events(target_agent, time DESC) WHERE target_agent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_events_sequence 
    ON agent_events(sequence DESC) WHERE sequence IS NOT NULL;

-- Create 1-minute rollup for real-time dashboards
CREATE MATERIALIZED VIEW IF NOT EXISTS event_stats_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    event_type,
    source_agent,
    COUNT(*) as event_count,
    COUNT(DISTINCT target_agent) as unique_targets,
    MAX(sequence) as max_sequence,
    AVG(EXTRACT(EPOCH FROM (NOW() - time)))::FLOAT as avg_lag_seconds
FROM agent_events
GROUP BY bucket, event_type, source_agent
WITH NO DATA;

-- Auto-refresh policy for 1-minute aggregates
SELECT add_continuous_aggregate_policy('event_stats_1min',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

-- Create 1-hour rollup for trends
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

-- Auto-refresh policy for 1-hour aggregates
SELECT add_continuous_aggregate_policy('event_stats_1hour',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create 1-day rollup for long-term trends
CREATE MATERIALIZED VIEW IF NOT EXISTS event_stats_1day
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', bucket) AS bucket,
    event_type,
    source_agent,
    SUM(total_events) as total_events,
    MAX(max_sequence) as max_sequence,
    AVG(avg_lag_seconds) as avg_lag_seconds
FROM event_stats_1hour
GROUP BY bucket, event_type, source_agent
WITH NO DATA;

-- Auto-refresh policy for 1-day aggregates
SELECT add_continuous_aggregate_policy('event_stats_1day',
    start_offset => INTERVAL '30 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Enable compression for older data
ALTER TABLE agent_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'event_type,source_agent'
);

-- Add compression policy (compress data older than 7 days)
SELECT add_compression_policy('agent_events', INTERVAL '7 days', if_not_exists => TRUE);

-- Create retention policy (keep data for 90 days)
SELECT add_retention_policy('agent_events', INTERVAL '90 days', if_not_exists => TRUE);

-- Create function to record events
CREATE OR REPLACE FUNCTION record_event(
    p_event_id TEXT,
    p_event_type TEXT,
    p_source_agent TEXT,
    p_target_agent TEXT DEFAULT NULL,
    p_data JSONB,
    p_metadata JSONB DEFAULT NULL,
    p_sequence BIGINT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO agent_events (
        time, event_id, event_type, source_agent, 
        target_agent, data, metadata, sequence
    ) VALUES (
        NOW(), p_event_id, p_event_type, p_source_agent,
        p_target_agent, p_data, p_metadata, p_sequence
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to get real-time stats
CREATE OR REPLACE FUNCTION get_real_time_stats(
    p_event_type TEXT DEFAULT NULL,
    p_time_range INTERVAL DEFAULT INTERVAL '1 hour'
) RETURNS TABLE (
    bucket TIMESTAMPTZ,
    event_type TEXT,
    source_agent TEXT,
    event_count BIGINT,
    unique_targets BIGINT,
    avg_lag_seconds FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        es.bucket,
        es.event_type,
        es.source_agent,
        es.event_count,
        es.unique_targets,
        es.avg_lag_seconds
    FROM event_stats_1min es
    WHERE es.bucket > NOW() - p_time_range
      AND (p_event_type IS NULL OR es.event_type = p_event_type)
    ORDER BY es.bucket DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO openclaw;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO openclaw;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO openclaw;
