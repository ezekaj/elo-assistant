# Predictive Engine Documentation

## Overview

The Predictive Engine is an intelligent system that learns from your behavior patterns and proactively suggests actions before you need them. It integrates with OpenClaw's event mesh, neuro-memory system, and messaging channels.

## Features

- **Automatic Pattern Learning**: Learns from tool usage, messages, calendar events, and workflows
- **Proactive Suggestions**: Delivers predictions before you need to take action
- **Neuro-Memory Integration**: Stores patterns semantically for context-aware retrieval
- **Ambient Delivery**: Unobtrusive notifications with rate limiting and quiet hours
- **External Triggers**: MCP tool for iOS Shortcuts, IFTTT, Zapier integration
- **User Control**: Fine-grained config for categories, timing, and delivery preferences

## Configuration

Add to your `~/.openclaw/config.json5`:

```json5
{
  predictive: {
    enabled: true,
    autoDeliver: {
      enabled: true,
      maxPerDay: 3,              // Max ambient notifications per day
      channels: ["signal", "webchat"],  // Where to deliver
      quietHours: {
        start: 22,               // No notifications 10pm-8am
        end: 8,
      },
      minConfidence: 0.8,        // Only deliver high-confidence predictions
    },
    schedule: {
      checkIntervalMs: 1800000,  // Check every 30 minutes
      patternLearningEnabled: true,
      consolidationIntervalMs: 3600000,  // Consolidate patterns every hour
    },
    categories: {
      calendar: true,            // Calendar event predictions
      email: true,               // Email workflow predictions
      task: true,                // Task and reminder predictions
      workflow: true,            // Multi-step workflow predictions
      communication: false,      // Messaging patterns (privacy)
      context: true,             // Location and context predictions
    },
    neuroMemory: {
      enabled: true,             // Store patterns semantically
    },
  },
}
```

## CLI Commands

```bash
# Check service status
openclaw predictive status

# Manually trigger prediction check
openclaw predictive check

# View learned patterns
openclaw predictive patterns --limit 20

# View prediction history
openclaw predictive history --limit 50

# View statistics
openclaw predictive stats

# Enable/disable auto-delivery
openclaw predictive enable
openclaw predictive disable
```

## Chat Commands

Use these commands in any chat with OpenClaw:

- `/predictions status` - Show service status and config
- `/predictions check` - Check current predictions
- `/predictions patterns [limit]` - Show learned patterns
- `/predictions history [limit]` - Show recent deliveries
- `/predictions stats` - Detailed statistics
- `/predictions enable` - Enable auto-delivery
- `/predictions disable` - Disable auto-delivery
- `/predictions help` - Show help

Aliases: `/predictions` and `/predictive` are interchangeable.

## MCP Tool (External Triggers)

Use the `mcp_predictive` tool for external integrations:

### Actions

#### `check`
Check for predictions based on current context.

```typescript
mcp_predictive({ action: "check" })
```

#### `trigger`
Manually trigger a prediction check for a specific category.

```typescript
mcp_predictive({
  action: "trigger",
  category: "location",
  context: "arrived_home"
})
```

#### `feedback`
Record user feedback on a prediction (for learning).

```typescript
mcp_predictive({
  action: "feedback",
  predictionId: "pred_123",
  accepted: true,
  feedback: "Helpful reminder"
})
```

#### `patterns`
Get learned patterns.

```typescript
mcp_predictive({
  action: "patterns",
  limit: 20,
  type: "time_based"  // Optional filter
})
```

#### `stats`
Get prediction statistics.

```typescript
mcp_predictive({ action: "stats" })
```

#### `history`
Get prediction delivery history.

```typescript
mcp_predictive({
  action: "history",
  limit: 50,
  days: 7
})
```

### iOS Shortcuts Integration

Create iOS Shortcuts that trigger predictions:

1. **Morning Check**: Trigger when unlocking phone in morning
   ```
   URL: your-gateway/api/mcp/predictive
   Method: POST
   Body: {"action": "check"}
   ```

2. **Location Trigger**: When arriving at home/work
   ```
   Body: {
     "action": "trigger",
     "category": "location",
     "context": "arrived_work"
   }
   ```

3. **Feedback from Notification**: Custom notification action
   ```
   Body: {
     "action": "feedback",
     "predictionId": "[from notification]",
     "accepted": true
   }
   ```

## Agent Tool

The `predictive` tool is available to the agent:

```typescript
// Check predictions
await predictive({ action: "check" });

// Get status
await predictive({ action: "status" });

// Get patterns
await predictive({ 
  action: "patterns", 
  limit: 20 
});

// Get delivery history
await predictive({ 
  action: "deliveries", 
  limit: 10 
});

// Record feedback
await predictive({
  action: "feedback",
  predictionId: "pred_123",
  accepted: true,
  feedback: "Good suggestion"
});
```

## Dashboard API

### GET /api/predictive/dashboard
Returns dashboard data for Web UI.

**Response:**
```json
{
  "status": "running",
  "config": {
    "autoDeliver": true,
    "maxPerDay": 3,
    "quietHours": { "start": 22, "end": 8 },
    "minConfidence": 0.8
  },
  "stats": {
    "totalEvents": 250,
    "patternCount": 5,
    "todayPredictions": 3,
    "todayDeliveries": 2,
    "accuracy": 0.85
  },
  "predictions": [...],
  "recentDeliveries": [...],
  "topPatterns": [...]
}
```

### POST /api/predictive/feedback
Record user feedback on a prediction.

**Body:**
```json
{
  "predictionId": "pred_123",
  "accepted": true,
  "feedback": "Helpful reminder"
}
```

### GET /api/predictive/patterns
Get learned patterns.

**Query params:**
- `limit` (default: 50)
- `type` (optional filter)

## How It Works

### 1. Event Collection
The service listens to events from:
- Tool executions (weather, calendar, email, etc.)
- Message patterns
- Calendar events
- Workflow sequences
- Location changes (via MCP triggers)

### 2. Pattern Learning
Events are analyzed to detect:
- **Time-based patterns**: "User checks weather at 8am"
- **Sequence patterns**: "Email → Calendar → Task workflow"
- **Frequency patterns**: "User uses Telegram 5x per day"
- **Context patterns**: "When at location X, user does Y"

### 3. Neuro-Memory Storage
Patterns are stored semantically in neuro-memory:
- Enables context-aware retrieval
- Supports fuzzy matching
- Long-term pattern persistence

### 4. Prediction Generation
On scheduled checks:
1. Evaluate all learned patterns
2. Match current context (time, location, recent events)
3. Generate predictions with confidence scores
4. Filter by confidence threshold (0.8 default)

### 5. Ambient Delivery
High-confidence predictions are delivered:
- Max 3 per day (configurable)
- Respects quiet hours (22:00-08:00)
- Tracks deliveries to avoid duplicates
- Records acceptance/rejection feedback

### 6. MAPE-K Learning Loop
Feedback adjusts future predictions:
- Accepted predictions increase confidence
- Rejected predictions decrease confidence
- Low-confidence patterns are pruned

## Privacy & Security

### Data Storage
- All patterns stored locally in SQLite
- No external transmission of behavior data
- Neuro-memory integration is optional

### User Control
- Disable categories individually
- Disable auto-delivery completely
- Clear pattern history anytime
- Quiet hours enforced

### What's NOT Tracked
- Message content (only metadata)
- Private communication patterns (configurable)
- Sensitive tool data (passwords, tokens)
- Exact locations (only context tags)

## Troubleshooting

### Service Not Running
```bash
# Check status
openclaw predictive status

# Check gateway logs
tail -f ~/.openclaw/logs/gateway.log | grep predictive

# Restart gateway
openclaw gateway restart
```

### No Predictions
- Verify events are being recorded: `openclaw predictive stats`
- Check pattern count: `openclaw predictive patterns`
- Increase logging: Set `logging.level: "debug"` in config
- Lower confidence threshold for testing

### Too Many Notifications
- Decrease `maxPerDay`
- Increase `minConfidence`
- Adjust `quietHours`
- Disable specific categories

### MCP Not Working
- Verify MCP server is registered
- Check MCP logs: `openclaw mcp logs`
- Test with: `openclaw mcp call predictive check`

## Advanced

### Custom Patterns

Add custom prediction rules:

```typescript
// In agent code
const engine = getPredictiveService()?.getEngine();
engine?.addRule({
  id: "custom-standup",
  name: "Daily Standup Reminder",
  condition: (ctx) => {
    const hour = new Date().getHours();
    return hour === 9 && ctx.recentEvents.some(e => 
      e.type === "calendar" && e.data?.event?.includes("standup")
    );
  },
  action: () => ({
    action: "remind_standup",
    category: "calendar",
    priority: "high",
    confidence: 0.9,
    message: "Standup meeting in 15 minutes",
    data: {},
  }),
  enabled: true,
  priority: 1,
});
```

### Event Mesh Integration

Subscribe to custom events:

```typescript
import { eventMesh } from "./agents/event-mesh.js";

eventMesh.subscribe("custom_event", (event) => {
  const service = getPredictiveService();
  service?.recordEvent({
    type: "custom",
    subtype: event.subtype,
    timestamp: Date.now(),
    data: event.data,
  });
});
```

### Neuro-Memory Queries

Query patterns semantically:

```typescript
const bridge = getNeuroMemoryBridge();
const results = await bridge?.query({
  text: "morning weather patterns",
  limit: 10,
  threshold: 0.7,
});
```

## API Reference

### PredictiveService

```typescript
class PredictiveService {
  start(): Promise<void>;
  stop(): void;
  checkAndDeliver(): Promise<void>;
  recordFeedback(predictionId: string, accepted: boolean, feedback?: string): void;
  enableAutoDelivery(): void;
  disableAutoDelivery(): void;
  getConfig(): PredictiveServiceConfig;
  getEngine(): PredictiveEngine;
}
```

### PredictiveEngine

```typescript
class PredictiveEngine {
  recordEvent(event: Event): void;
  addRule(rule: PredictionRule): void;
  getPatterns(): UserPattern[];
  getStats(): PredictionStats;
  recordFeedback(predictionId: string, accepted: boolean, feedback?: string): void;
  prunePatterns(): void;
}
```

## Support

- GitHub Issues: https://github.com/openclaw/openclaw/issues
- Discord: https://discord.gg/clawd
- Docs: https://docs.openclaw.ai/predictive

---

*Predictive Engine v1.0 - Making OpenClaw proactive, not just reactive.*
