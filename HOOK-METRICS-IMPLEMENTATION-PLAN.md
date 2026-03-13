# 📊 HOOK METRICS IMPLEMENTATION PLAN

**Goal:** Implement Claude Code-style hook metrics for OpenClaw  
**Date:** 2026-02-24  
**Status:** Ready for Implementation  

---

## 📋 EXECUTIVE SUMMARY

This plan implements **comprehensive hook metrics** for OpenClaw with:
- ✅ numSuccess - successful hook executions
- ✅ numBlocking - hooks that blocked execution
- ✅ numNonBlockingError - failed but didn't block
- ✅ numCancelled - cancelled hooks
- ✅ totalDurationMs - aggregate execution time
- ✅ Per-hook statistics
- ✅ /hooks-metrics command
- ✅ Real-time tracking

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    HOOK EXECUTOR                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Hook Metrics Tracker                                 │ │
│  │  - Records start/end time                             │ │
│  │  - Tracks success/failure                             │ │
│  │  - Counts blocking/non-blocking                       │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              METRICS STORE (NEW)                            │
│  - In-memory Map (last 24h)                                 │
│  - Persistent JSON file (optional)                          │
│  - Aggregated stats                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  CLI COMMANDS                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ /hooks-     │ │ /hooks-     │ │ /hooks-     │           │
│  │ metrics     │ │ reset-      │ │ details     │           │
│  │             │ │ metrics     │ │ <hook>      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### **PHASE 1: CORE TYPES**

#### **1.1 Hook Metrics Types**
**File:** `src/config/types.hook-metrics.ts` (NEW)

**Key Types:**
```typescript
export interface HookMetrics {
  hookName: string;
  numCommands: number;
  numSuccess: number;
  numBlocking: number;
  numNonBlockingError: number;
  numCancelled: number;
  totalDurationMs: number;
  lastExecuted?: number;
}

export interface HookExecutionStats {
  hookName: string;
  executions: number;
  successes: number;
  failures: number;
  blocking: number;
  avgDurationMs: number;
  lastRun?: number;
  errorRate: number;
}

export interface HookMetricsStore {
  metrics: Map<string, HookMetrics>;
  startTime: number;
  resettable: boolean;
}
```

---

### **PHASE 2: METRICS TRACKER**

#### **2.1 Hook Metrics Manager**
**File:** `src/hooks/hook-metrics-manager.ts` (NEW)

**Purpose:** Track and aggregate hook execution metrics

**Key Class:**
```typescript
export class HookMetricsManager {
  private metrics = new Map<string, HookMetrics>();
  private startTime = Date.now();
  
  // Record hook execution start
  startRecording(hookName: string): number;
  
  // Record hook execution end
  endRecording(
    hookName: string,
    startTime: number,
    success: boolean,
    blocked?: boolean,
    cancelled?: boolean
  ): void;
  
  // Get metrics for hook
  getMetrics(hookName?: string): HookMetrics | HookMetrics[] | null;
  
  // Get aggregated stats
  getStats(): HookExecutionStats[];
  
  // Reset all metrics
  reset(): void;
  
  // Export to JSON
  export(): string;
  
  // Import from JSON
  import(json: string): void;
}
```

**Implementation:**
```typescript
export class HookMetricsManager {
  private metrics = new Map<string, HookMetrics>();
  private startTime = Date.now();
  
  startRecording(hookName: string): number {
    // Initialize metrics if not exists
    if (!this.metrics.has(hookName)) {
      this.metrics.set(hookName, {
        hookName,
        numCommands: 0,
        numSuccess: 0,
        numBlocking: 0,
        numNonBlockingError: 0,
        numCancelled: 0,
        totalDurationMs: 0
      });
    }
    
    const hookMetrics = this.metrics.get(hookName)!;
    hookMetrics.numCommands++;
    
    return Date.now();
  }
  
  endRecording(
    hookName: string,
    startTime: number,
    success: boolean,
    blocked = false,
    cancelled = false
  ): void {
    const hookMetrics = this.metrics.get(hookName);
    if (!hookMetrics) return;
    
    const durationMs = Date.now() - startTime;
    
    // Update counters
    if (success) {
      hookMetrics.numSuccess++;
      if (blocked) {
        hookMetrics.numBlocking++;
      }
    } else {
      if (cancelled) {
        hookMetrics.numCancelled++;
      } else {
        hookMetrics.numNonBlockingError++;
      }
    }
    
    // Update duration
    hookMetrics.totalDurationMs += durationMs;
    hookMetrics.lastExecuted = Date.now();
  }
  
  getMetrics(hookName?: string): HookMetrics | HookMetrics[] | null {
    if (hookName) {
      return this.metrics.get(hookName) || null;
    }
    return Array.from(this.metrics.values());
  }
  
  getStats(): HookExecutionStats[] {
    return Array.from(this.metrics.values()).map(m => ({
      hookName: m.hookName,
      executions: m.numCommands,
      successes: m.numSuccess,
      failures: m.numNonBlockingError + m.numCancelled,
      blocking: m.numBlocking,
      avgDurationMs: m.numCommands > 0 
        ? Math.round(m.totalDurationMs / m.numCommands) 
        : 0,
      lastRun: m.lastExecuted,
      errorRate: m.numCommands > 0 
        ? ((m.numNonBlockingError + m.numCancelled) / m.numCommands * 100) 
        : 0
    }));
  }
  
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
  }
  
  export(): string {
    return JSON.stringify({
      startTime: this.startTime,
      metrics: Array.from(this.metrics.entries())
    }, null, 2);
  }
  
  import(json: string): void {
    try {
      const data = JSON.parse(json);
      this.startTime = data.startTime || Date.now();
      this.metrics = new Map(data.metrics);
    } catch (error) {
      throw new Error(`Failed to import metrics: ${error}`);
    }
  }
}
```

---

### **PHASE 3: HOOK EXECUTOR INTEGRATION**

#### **3.1 Modify Hook Executor**
**File:** `src/plugins/hooks.ts` (MODIFY)

**Changes:**
```typescript
import { getHookMetricsManager } from '../hooks/hook-metrics-manager.js';

async function runVoidHook(
  registry: HookRegistry,
  hookName: string,
  event: any,
  ctx: any
): Promise<void> {
  const hooks = getHooksForName(registry, hookName);
  const metricsManager = getHookMetricsManager();
  
  const promises = hooks.map(async (hook) => {
    const startTime = metricsManager.startRecording(hook.name);
    
    try {
      await hook.handler(event, ctx);
      
      // Record success
      metricsManager.endRecording(
        hook.name,
        startTime,
        true,  // success
        false, // blocked
        false  // cancelled
      );
      
      log.debug(`Hook ${hook.name} executed successfully`);
    } catch (err) {
      // Record failure
      const isCancelled = err instanceof Error && err.message.includes('cancelled');
      
      metricsManager.endRecording(
        hook.name,
        startTime,
        false,  // success
        false,  // blocked
        isCancelled // cancelled
      );
      
      if (!hook.catchErrors) {
        throw err;
      }
      log.error(`Hook ${hook.name} failed: ${err}`);
    }
  });
  
  await Promise.all(promises);
}

async function runBlockingHook(
  registry: HookRegistry,
  hookName: string,
  event: any,
  ctx: any
): Promise<boolean> {
  const hooks = getHooksForName(registry, hookName);
  const metricsManager = getHookMetricsManager();
  
  for (const hook of hooks) {
    const startTime = metricsManager.startRecording(hook.name);
    
    try {
      const result = await hook.handler(event, ctx);
      
      // Check if blocked
      const blocked = result?.decision === 'block';
      
      // Record success
      metricsManager.endRecording(
        hook.name,
        startTime,
        true,  // success
        blocked, // blocked
        false  // cancelled
      );
      
      if (blocked) {
        log.debug(`Hook ${hook.name} blocked execution`);
        return true; // Blocked
      }
    } catch (err) {
      // Record failure
      const isCancelled = err instanceof Error && err.message.includes('cancelled');
      
      metricsManager.endRecording(
        hook.name,
        startTime,
        false,  // success
        false,  // blocked
        isCancelled // cancelled
      );
      
      if (!hook.catchErrors) {
        throw err;
      }
      log.error(`Hook ${hook.name} failed: ${err}`);
    }
  }
  
  return false; // Not blocked
}
```

---

### **PHASE 4: CLI COMMANDS**

#### **4.1 Hooks Metrics Commands**
**File:** `src/cli/commands/hooks-metrics.ts` (NEW)

**Commands:**
```typescript
import { getHookMetricsManager } from '../../hooks/hook-metrics-manager.js';

export async function hooksMetricsCommand(): Promise<void> {
  const manager = getHookMetricsManager();
  const stats = manager.getStats();
  
  const totalExecutions = stats.reduce((sum, s) => sum + s.executions, 0);
  const totalSuccesses = stats.reduce((sum, s) => sum + s.successes, 0);
  const totalFailures = stats.reduce((sum, s) => sum + s.failures);
  const totalBlocking = stats.reduce((sum, s) => sum + s.blocking);
  const successRate = totalExecutions > 0 
    ? ((totalSuccesses / totalExecutions) * 100).toFixed(1) 
    : '0.0';
  
  console.log(`
Hook Metrics (Last 24h)
═══════════════════════════════════════
├─ Total Executions: ${totalExecutions}
├─ Success Rate: ${successRate}%
├─ Successful: ${totalSuccesses}
├─ Failed: ${totalFailures}
├─ Blocking: ${totalBlocking}
└─ Avg Duration: ${
    totalExecutions > 0 
      ? Math.round(stats.reduce((sum, s) => sum + s.avgDurationMs * s.executions, 0) / totalExecutions) 
      : 0
  }ms

Per-Hook Stats:
───────────────────────────────────────
${stats.map(h => `
${h.hookName}:
  ├─ Executions: ${h.executions}
  ├─ Successes: ${h.successes}
  ├─ Failures: ${h.failures}
  ├─ Blocking: ${h.blocking}
  ├─ Error Rate: ${h.errorRate.toFixed(1)}%
  └─ Avg Duration: ${h.avgDurationMs}ms
`).join('\n')}
`);
}

export async function hooksMetricsResetCommand(): Promise<void> {
  const manager = getHookMetricsManager();
  manager.reset();
  console.log('Hook metrics reset successfully');
}

export async function hooksMetricsDetailsCommand(hookName: string): Promise<void> {
  const manager = getHookMetricsManager();
  const metrics = manager.getMetrics(hookName);
  
  if (!metrics) {
    console.log(`No metrics found for hook: ${hookName}`);
    return;
  }
  
  const m = Array.isArray(metrics) ? metrics[0] : metrics;
  console.log(`
Hook: ${m.hookName}
═══════════════════════════════════════
├─ Commands: ${m.numCommands}
├─ Successes: ${m.numSuccess}
├─ Blocking: ${m.numBlocking}
├─ Non-Blocking Errors: ${m.numNonBlockingError}
├─ Cancelled: ${m.numCancelled}
├─ Total Duration: ${m.totalDurationMs}ms
├─ Avg Duration: ${
    m.numCommands > 0 
      ? Math.round(m.totalDurationMs / m.numCommands) 
      : 0
  }ms
└─ Last Executed: ${
    m.lastExecuted 
      ? new Date(m.lastExecuted).toLocaleString() 
      : 'Never'
  }
`);
}
```

---

### **PHASE 5: TUI INTEGRATION**

#### **5.1 TUI Commands**
**File:** `src/tui/commands.ts` (MODIFY)

**New Commands:**
```typescript
const hooksCommands: SlashCommand[] = [
  {
    name: 'hooks-metrics',
    description: 'Show hook execution metrics',
  },
  {
    name: 'hooks-metrics-reset',
    description: 'Reset hook metrics',
  },
  {
    name: 'hooks-metrics-details',
    description: 'Show detailed metrics for a hook',
    getArgumentCompletions: (prefix) => [
      { value: '<hook-name>', label: 'Hook name' }
    ],
  },
  {
    name: 'hooks-status',
    description: 'Show hook status (existing)',
  },
];
```

#### **5.2 Command Handlers**
**File:** `src/tui/tui-command-handlers.ts` (MODIFY)

**Handlers:**
```typescript
case 'hooks-metrics': {
  const { hooksMetricsCommand } = await import('../cli/commands/hooks-metrics.js');
  await hooksMetricsCommand();
  chatLog.addSystem('Hook metrics displayed in console');
  break;
}

case 'hooks-metrics-reset': {
  const { hooksMetricsResetCommand } = await import('../cli/commands/hooks-metrics.js');
  await hooksMetricsResetCommand();
  chatLog.addSystem('Hook metrics reset');
  break;
}

case 'hooks-metrics-details': {
  const { hooksMetricsDetailsCommand } = await import('../cli/commands/hooks-metrics.js');
  if (!args) {
    chatLog.addSystem('usage: /hooks-metrics-details <hook-name>');
    break;
  }
  await hooksMetricsDetailsCommand(args);
  chatLog.addSystem(`Hook metrics for ${args} displayed in console`);
  break;
}
```

---

## 🔧 IMPLEMENTATION STEPS

### **Step 1: Create Core Types**
```bash
touch src/config/types.hook-metrics.ts
```

**Time:** 1 hour  
**Files:** 1  
**Lines:** ~150

### **Step 2: Create Metrics Manager**
```bash
touch src/hooks/hook-metrics-manager.ts
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~300

### **Step 3: Integrate with Hook Executor**
```bash
# Modify existing files
edit src/plugins/hooks.ts
edit src/plugins/command-hook.ts
```

**Time:** 2 hours  
**Files:** 2 (modified)  
**Lines:** ~150 added

### **Step 4: Create CLI Commands**
```bash
touch src/cli/commands/hooks-metrics.ts
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~250

### **Step 5: Add TUI Commands**
```bash
# Modify existing files
edit src/tui/commands.ts
edit src/tui/tui-command-handlers.ts
```

**Time:** 2 hours  
**Files:** 2 (modified)  
**Lines:** ~150 added

### **Step 6: Integration & Testing**
```bash
# Wire everything together
# Test metrics tracking
# Test CLI commands
# Test TUI commands
```

**Time:** 3 hours  
**Files:** All  
**Lines:** N/A

### **Step 7: Documentation**
```bash
touch docs/hook-metrics.md
```

**Time:** 1 hour  
**Files:** 1  
**Lines:** ~400

---

## 📊 TOTAL EFFORT

| Phase | Time | Files | Lines |
|-------|------|-------|-------|
| Core Types | 1h | 1 | 150 |
| Metrics Manager | 2h | 1 | 300 |
| Hook Integration | 2h | 2 | 150 |
| CLI Commands | 2h | 1 | 250 |
| TUI Commands | 2h | 2 | 150 |
| Integration | 3h | All | N/A |
| Documentation | 1h | 1 | 400 |
| **TOTAL** | **13h** | **8** | **~1400** |

**Timeline:** 1.5 days (full-time) or 1 week (part-time)

---

## ✅ VERIFICATION CHECKLIST

- [ ] Types defined and exported
- [ ] Metrics manager implemented
- [ ] Hook executor integrated
- [ ] CLI commands working
- [ ] TUI commands working
- [ ] Metrics tracking accurate
- [ ] Reset functionality working
- [ ] Export/import working
- [ ] No breaking changes
- [ ] All tests passing
- [ ] Documentation complete

---

## 📈 EXPECTED RESULTS

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Hook Visibility** | ❌ None | ✅ Full | New feature |
| **Success Tracking** | ❌ No | ✅ Yes | New feature |
| **Blocking Count** | ❌ No | ✅ Yes | New feature |
| **Duration Tracking** | ❌ No | ✅ Yes | New feature |
| **Error Rate** | ❌ No | ✅ Yes | New feature |
| **Per-Hook Stats** | ❌ No | ✅ Yes | New feature |

---

## 🎯 SUCCESS CRITERIA

1. ✅ All metrics tracked accurately
2. ✅ CLI commands working
3. ✅ TUI commands working
4. ✅ No performance impact
5. ✅ No breaking changes
6. ✅ All tests passing
7. ✅ Documentation complete
8. ✅ Export/import working

---

**READY FOR IMPLEMENTATION** 🚀
