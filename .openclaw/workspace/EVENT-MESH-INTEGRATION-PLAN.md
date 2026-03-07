# AgentEventMesh Integration Plan

**Date:** 2026-02-20 17:47
**Status:** Planning Phase
**Architecture:** Production-Grade Event Mesh

---

## 🎯 Integration Strategy

### Option A: Full Production Deployment
- **Timeline:** 12 weeks
- **Cost:** ~$1,300-2,100/month infrastructure
- **Complexity:** Very High
- **Use Case:** Large-scale, mission-critical systems

### Option B: Simplified Deployment
- **Timeline:** 4-6 weeks
- **Cost:** ~$200-400/month
- **Complexity:** Medium
- **Use Case:** Medium-scale applications

### Option C: Local Development Setup
- **Timeline:** 1-2 weeks
- **Cost:** Free (local)
- **Complexity:** Low
- **Use Case:** Development and testing

---

## 🚀 Recommended Approach: Start with Option C → B → A

### Phase 1: Local Development Setup (Week 1-2)

**Objective:** Get core functionality working locally

```yaml
# docker-compose.local.yml
version: '3.8'

services:
  # Redpanda (single node for dev)
  redpanda:
    image: vectorized/redpanda:latest
    command:
      - redpanda
      - start
      - --smp 1
      - --overprovisioned
      - --node-id 0
      - --kafka-addr PLAINTEXT://0.0.0.0:9092
      - --advertise-kafka-addr PLAINTEXT://localhost:9092
    ports:
      - "9092:9092"
      - "8081:8081"
    volumes:
      - redpanda-data:/var/lib/redpanda/data

  # FoundationDB (single node for dev)
  foundationdb:
    image: foundationdb/foundationdb:7.1.25
    environment:
      - FDB_CLUSTER_FILE=/etc/foundationdb/fdb.cluster
    ports:
      - "4500:4500"
    volumes:
      - fdb-data:/var/lib/foundationdb/data

  # TimescaleDB (single node for dev)
  timescaledb:
    image: timescale/timescaledb:latest-pg14
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=eventmesh
    ports:
      - "5432:5432"
    volumes:
      - timescale-data:/var/lib/postgresql/data

  # Prometheus
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  # Grafana
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  redpanda-data:
  fdb-data:
  timescale-data:
```

**Tasks:**
1. ✅ Save architecture documentation
2. ⏳ Create Docker Compose files
3. ⏳ Implement core TypeScript modules
4. ⏳ Test local event flow
5. ⏳ Verify observability stack

---

### Phase 2: Cloud Deployment (Week 3-6)

**Objective:** Deploy to cloud with managed services

**Option 2A: Managed Redpanda**
```bash
# Use Redpanda Cloud (free tier available)
redpanda cloud create cluster \
  --name openclaw-events \
  --plan developer \
  --region us-east-1
```

**Option 2B: Self-Hosted on Kubernetes**
```yaml
# k8s-redpanda.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redpanda
spec:
  serviceName: redpanda
  replicas: 3
  # ... full K8s config
```

**Tasks:**
1. Set up cloud infrastructure
2. Configure networking and security
3. Deploy application layer
4. Set up monitoring and alerting
5. Load testing

---

## 📋 Implementation Checklist

### Infrastructure
- [ ] Redpanda cluster (3 brokers)
- [ ] FoundationDB cluster (3 storage + 3 coord)
- [ ] TimescaleDB (1 primary + 2 replicas)
- [ ] Prometheus + Grafana
- [ ] Jaeger for tracing

### Application Layer
- [ ] RedpandaEventMesh class
- [ ] FoundationDBEventStore class
- [ ] TimescaleAnalytics class
- [ ] EventMeshObservability class
- [ ] UnifiedAgentEventMesh interface

### OpenClaw Integration
- [ ] Replace existing EventEmitter-based system
- [ ] Update agent communication to use event mesh
- [ ] Configure agent subscriptions
- [ ] Set up event routing
- [ ] Implement event replay

### Testing
- [ ] Unit tests for each component
- [ ] Integration tests for event flow
- [ ] Load testing (10K+ events/sec)
- [ ] Chaos testing (network partitions, node failures)
- [ ] End-to-end tests

### Documentation
- [ ] Architecture diagrams
- [ ] API documentation
- [ ] Deployment guides
- [ ] Runbooks
- [ ] Performance tuning guides

---

## 🔧 OpenClaw Integration Points

### 1. Replace src/agents/event-mesh.ts

**Current (Simple):**
```typescript
// Current simple implementation
export class AgentEventMesh {
  private handlers = new Map<string, Set<EventHandler>>();
  
  emit(event: AgentEvent) {
    const handlers = this.handlers.get(event.type);
    handlers?.forEach(h => h(event));
  }
}
```

**New (Production):**
```typescript
// New production implementation
import { UnifiedAgentEventMesh } from './unified-event-mesh';

export class AgentEventMesh {
  private unified: UnifiedAgentEventMesh;
  
  async emit(event: AgentEvent) {
    await this.unified.publish(event.type, event.data, event.metadata);
  }
  
  async subscribe(eventType: string, handler: EventHandler) {
    await this.unified.subscribe(eventType, 'agent-group', handler);
  }
}
```

### 2. Update Agent Communication

**Before:**
```typescript
// Direct method calls
await calendarAgent.checkCalendar();
await emailAgent.checkEmail();
```

**After:**
```typescript
// Event-driven
await eventMesh.publish('calendar.check', { userId: 'main' });
await eventMesh.publish('email.check', { userId: 'main' });
```

### 3. Configuration

```json
{
  "eventMesh": {
    "enabled": true,
    "backend": "production", // or "simple"
    "redpanda": {
      "brokers": ["localhost:9092"],
      "schemaRegistryUrl": "http://localhost:8081"
    },
    "foundationdb": {
      "clusterFile": "/etc/foundationdb/fdb.cluster"
    },
    "timescaledb": {
      "connectionString": "postgres://user:pass@localhost:5432/eventmesh"
    }
  }
}
```

---

## 💰 Cost Comparison

### Full Production (Recommended for Scale)
- Redpanda Cloud Pro: $800/month
- FoundationDB: $500/month
- TimescaleDB: $400/month
- Observability: $200/month
- **Total: ~$1,900/month**

### Simplified Production
- Redpanda Developer: $200/month
- SQLite + WAL: $0
- TimescaleDB: $150/month
- Prometheus + Grafana: $50/month
- **Total: ~$400/month**

### Development/Testing
- Local Docker: $0
- Cloud dev instance: ~$50/month
- **Total: ~$50/month**

---

## 🚨 Decision Points

### Before Proceeding, Answer:

1. **Scale Requirements:**
   - Events per second?
   - Number of agents?
   - Retention period?

2. **Budget:**
   - What's the monthly infrastructure budget?
   - Can you commit to $400-1,900/month?

3. **Complexity Tolerance:**
   - Do you have DevOps expertise?
   - Can you manage distributed systems?

4. **Timeline:**
   - How quickly do you need this?
   - Can you do phased rollout?

---

## 📞 Next Steps

1. **DECISION:** Choose Option A, B, or C
2. **BUDGET:** Confirm infrastructure budget
3. **TEAM:** Assign engineers to project
4. **TIMELINE:** Set target completion date
5. **START:** Begin with Phase 1

**This is a significant architectural decision that will impact OpenClaw's scalability and reliability for years to come.**

---

*Document created: 2026-02-20 17:47*
*Ready for team review and decision*
