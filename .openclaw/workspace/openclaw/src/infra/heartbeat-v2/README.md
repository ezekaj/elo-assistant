# Heartbeat V2 - Production-Grade Scheduling System

A production-grade heartbeat system based on distributed scheduler patterns from Meta, Netflix, and Uber.

## Features

- **Hierarchical Timing Wheel** - O(1) timer operations, handles millions of timers
- **SQLite State Persistence** - Durable schedule and run history storage
- **Automatic Retry with Backoff** - Exponential backoff for failed heartbeats
- **Analytics & Monitoring** - Track heartbeat health over time
- **Pause/Resume/Retrigger** - Full control over heartbeat lifecycle
- **Coalesce Window** - Prevents duplicate heartbeats
- **Backward Compatible** - Works with existing heartbeat-runner

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Unified Heartbeat System                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │   CLI Commands   │    │  Integration     │              │
│  │   (cli.ts)       │    │  (integration.ts)│              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                         │
│           └───────────┬───────────┘                         │
│                       │                                     │
│           ┌───────────▼───────────┐                         │
│           │      Scheduler        │                         │
│           │    (scheduler.ts)     │                         │
│           └───────────┬───────────┘                         │
│                       │                                     │
│       ┌───────────────┼───────────────┐                     │
│       │               │               │                     │
│  ┌────▼────┐   ┌─────▼──────┐  ┌─────▼──────┐              │
│  │ Timing  │   │   State    │  │   Types    │              │
│  │ Wheel   │   │  Manager   │  │            │              │
│  └─────────┘   └────────────┘  └────────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Hierarchical Timing Wheel (`timing-wheel.ts`)

Efficient O(1) timer management using multi-level wheel:

- Level 0: Milliseconds (20 slots, 50ms each)
- Level 1: Seconds (60 slots, 1s each)
- Level 2: Minutes (60 slots, 1min each)
- Level 3: Hours (24 slots, 1h each)

### 2. State Manager (`state-manager.ts`)

SQLite-backed persistence for:

- Schedule definitions
- Run history
- Agent state
- Pending signals
- Analytics queries

### 3. Scheduler (`scheduler.ts`)

Main scheduler that:

- Hydrates imminent jobs from database
- Delegates execution to timing wheel
- Handles retry with exponential backoff
- Processes pause/resume signals

### 4. Unified System (`unified.ts`)

High-level API that:

- Manages scheduler lifecycle
- Delegates to existing heartbeat logic
- Provides analytics and monitoring
- Handles configuration updates

### 5. Integration (`integration.ts`)

Backward compatibility layer:

- Falls back to legacy runner on errors
- Provides hybrid mode for migration
- Maintains existing API surface

## Usage

### Quick Start

```typescript
import { startProductionHeartbeats } from "./infra/heartbeat-v2";
import type { OpenClawConfig } from "./config";

const config: OpenClawConfig = {
  // ... your config
};

// Start the system
const system = await startProductionHeartbeats(config, {
  dbPath: "./data/heartbeat-v2.db",
});

// Trigger immediate heartbeat
await system.triggerNow("default-agent", "user-request");

// Pause/resume
await system.pause("default-agent", "maintenance");
await system.resume("default-agent");

// Get analytics
const analytics = await system.getAnalytics("default-agent", "24h");
console.log(analytics);

// Shutdown
await stopProductionHeartbeats();
```

### Hybrid Mode (Backward Compatible)

```typescript
import { startHybridHeartbeat } from "./infra/heartbeat-v2";

// Uses V2 by default, falls back to legacy on errors
const runner = await startHybridHeartbeat(config, {
  useV2: true,
  fallbackToLegacy: true,
});

// Stop
await runner.stop();
```

### CLI Commands

```bash
# Check status
openclaw heartbeat-v2 status
openclaw heartbeat-v2 status --agent default

# Trigger heartbeat
openclaw heartbeat-v2 trigger default-agent --reason "manual check"

# Pause/resume
openclaw heartbeat-v2 pause default-agent --reason "maintenance"
openclaw heartbeat-v2 resume default-agent

# Analytics
openclaw heartbeat-v2 analytics default-agent --time-range 7d
```

## Configuration

```typescript
const config: SchedulerConfig = {
  scheduler: {
    shardCount: 1, // Number of shards (1 for single-node)
    imminentWindowMs: 900000, // 15 minutes - jobs loaded into memory
    maxRetries: 5, // Max retry attempts
    initialRetryDelayMs: 1000, // Initial retry delay
    maxRetryDelayMs: 60000, // Max retry delay (1 minute)
    coalesceWindowMs: 30000, // Skip if another heartbeat ran within 30s
  },
  queue: {
    concurrency: 10, // Max concurrent executions
    rateLimit: {
      max: 5, // 5 heartbeats
      duration: 1000, // per second
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  },
};
```

## Database Schema

### heartbeat_schedules

- Schedule definitions and state
- Next run times
- Active hours configuration

### heartbeat_runs

- Run history with timestamps
- Status and duration
- Error messages

### heartbeat_state

- Current agent state
- Consecutive failure counts
- Total runs/alerts

### heartbeat_signals

- Pending pause/resume/runNow signals
- Signal queue for async control

## Comparison: Legacy vs V2

| Feature          | Legacy     | V2                        |
| ---------------- | ---------- | ------------------------- |
| Timer Management | setTimeout | Hierarchical Timing Wheel |
| Persistence      | None       | SQLite                    |
| Retry Logic      | None       | Exponential Backoff       |
| Analytics        | Basic      | Full (1h/24h/7d/30d)      |
| Signals          | None       | Pause/Resume/RunNow       |
| Coalesce         | None       | Configurable window       |
| Monitoring       | Basic      | Full metrics              |

## Testing

```bash
# Run all tests
npm test src/infra/heartbeat-v2

# Run specific test file
npm test timing-wheel.test.ts
npm test state-manager.test.ts
npm test scheduler.test.ts
```

## Future Enhancements

For hyperscale deployments (100K+ agents):

1. **Redis/BullMQ Integration**
   - Distributed queue management
   - Cross-node coordination
   - Rate limiting

2. **PostgreSQL Backend**
   - Replace SQLite for scale
   - Better query performance
   - PgBoss integration

3. **Temporal.io Integration**
   - Durable execution
   - Exactly-once semantics
   - Workflow management

4. **Sharding**
   - Distribute agents across shards
   - Blast radius containment
   - Circuit breakers

## References

- [Meta's FOQS Architecture](https://engineering.fb.com/2021/02/22/production-engineering/foqs-facebook-ordered-queueing-system/)
- [Temporal.io Durable Execution](https://temporal.io/)
- [BullMQ Queue System](https://docs.bullmq.io/)
- [Hierarchical Timing Wheels](https://blog.acolyer.org/2015/11/23/hashed-and-hierarchical-timing-wheels/)
