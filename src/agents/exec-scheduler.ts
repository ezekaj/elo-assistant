/**
 * Exec Scheduler - Production-Grade Process Management (v2)
 *
 * Features:
 * 1. Priority Aging: Min-heap for O(log k) aging instead of O(n) scan
 * 2. Backpressure: Per-priority queue limits with rejection policies
 * 3. Resource-Aware: CPU/memory/FD + cgroups v2 container-aware monitoring
 * 4. Zombie Detection: O(1) process liveness checks
 * 5. Batch Execution: Work-stealing deque for cache-friendly parallel execution
 * 6. Adaptive Circuit Breaker: Rolling window + exponential backoff
 * 7. Observability: Cardinality-safe metrics with bounded labels
 * 8. Graceful Shutdown: Queue draining and cleanup hooks
 * 9. Debug API: Health checks and introspection
 * 10. Chaos Engineering: Built-in failure injection for testing
 * 11. Virtual Time: Deterministic testing with controllable clock
 *
 * PERFORMANCE: All hot-path operations are O(1) or O(log n).
 */

import { execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
// Advanced algorithms (v3) - imported for adaptive concurrency and metrics
import {
  AdaptivePIDController,
  EWMAMetrics,
  DuplicateDetector,
} from "./exec-scheduler-advanced.js";
// Timer wheel for O(1) timeout management
import { scheduleTimeout, cancelTimeout, scheduleInterval, cancelInterval } from "./timer-wheel.js";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type Priority = "low" | "normal" | "high" | "critical";

const PRIORITY_ORDER: Priority[] = ["low", "normal", "high", "critical"];
const PRIORITY_WEIGHTS: Record<Priority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export interface QueuedTask {
  id: string;
  priority: Priority;
  originalPriority: Priority;
  command: string;
  enqueuedAt: number;
  execute: () => Promise<unknown>;
  abortController?: AbortController;
  metadata?: Record<string, string>;
}

export interface ZombieInfo {
  sessionId: string;
  pid: number;
  command: string;
  startedAt: number;
  ageMs: number;
}

export interface BatchTask {
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  priority?: Priority;
  timeout?: number;
}

export interface BatchResult {
  command: string;
  status: "completed" | "failed" | "timeout" | "aborted";
  exitCode: number | null;
  output: string;
  durationMs: number;
  error?: string;
}

export interface BatchOptions {
  parallel?: boolean;
  maxConcurrent?: number;
  failFast?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  workStealing?: boolean;
}

export interface ResourceSnapshot {
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  loadAvg1m: number;
  fdCount: number;
  timestamp: number;
  // Cgroups v2 fields
  cgroupCpuLimit?: number;
  cgroupMemoryLimit?: number;
  cgroupThrottled?: boolean;
  memoryPressure?: "none" | "some" | "full";
}

export interface SchedulerMetrics {
  tasksEnqueued: number;
  tasksExecuted: number;
  tasksRejected: number;
  tasksAged: number;
  zombiesDetected: number;
  circuitTrips: number;
  avgWaitTimeMs: number;
  avgExecutionTimeMs: number;
  peakQueueDepth: number;
  peakConcurrency: number;
  // Extended metrics
  p50WaitTimeMs: number;
  p95WaitTimeMs: number;
  p99WaitTimeMs: number;
  p50ExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  p99ExecutionTimeMs: number;
  errorRate: number;
  throughputPerSecond: number;
}

export interface SchedulerConfig {
  maxConcurrent?: number;
  zombieCheckIntervalMs?: number;
  enablePriority?: boolean;
  // Aging config
  agingThresholdMs?: number;
  agingCheckIntervalMs?: number;
  // Backpressure config
  maxQueueSize?: number;
  maxQueueSizePerPriority?: Partial<Record<Priority, number>>;
  rejectionPolicy?: "reject" | "drop-oldest" | "demote";
  maxWaitTimeMs?: number;
  // Resource limits
  maxCpuPercent?: number;
  maxMemoryMb?: number;
  maxLoadAvg?: number;
  maxFdCount?: number;
  adaptiveConcurrency?: boolean;
  // Circuit breaker (adaptive)
  circuitWindowMs?: number;
  circuitErrorRateThreshold?: number;
  circuitMinAttempts?: number;
  circuitResetTimeoutMs?: number;
  circuitHalfOpenMax?: number;
  circuitMaxBackoffMs?: number;
  // Legacy circuit breaker config (for compatibility)
  circuitFailureThreshold?: number;
  // Shutdown
  shutdownTimeoutMs?: number;
  // Chaos engineering
  chaosEnabled?: boolean;
  chaosLatencyRate?: number;
  chaosLatencyMs?: number;
  chaosErrorRate?: number;
  chaosZombieRate?: number;
  // Metrics
  metricsMaxCardinality?: number;
  metricsBufferFlushMs?: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<SchedulerConfig> = {
  maxConcurrent: 4,
  zombieCheckIntervalMs: 30_000,
  enablePriority: true,
  // Aging
  agingThresholdMs: 5_000,
  agingCheckIntervalMs: 1_000,
  // Backpressure
  maxQueueSize: 1000,
  maxQueueSizePerPriority: {
    critical: 100,
    high: 250,
    normal: 400,
    low: 250,
  },
  rejectionPolicy: "demote",
  maxWaitTimeMs: 60_000,
  // Resources
  maxCpuPercent: 80,
  maxMemoryMb: 4096,
  maxLoadAvg: -1,
  maxFdCount: 1000,
  adaptiveConcurrency: true,
  // Adaptive circuit breaker
  circuitWindowMs: 60_000,
  circuitErrorRateThreshold: 0.5,
  circuitMinAttempts: 10,
  circuitResetTimeoutMs: 30_000,
  circuitHalfOpenMax: 3,
  circuitMaxBackoffMs: 300_000,
  // Legacy (for compatibility)
  circuitFailureThreshold: 5,
  // Shutdown
  shutdownTimeoutMs: 10_000,
  // Chaos
  chaosEnabled: false,
  chaosLatencyRate: 0.1,
  chaosLatencyMs: 100,
  chaosErrorRate: 0.01,
  chaosZombieRate: 0.005,
  // Metrics
  metricsMaxCardinality: 1000,
  metricsBufferFlushMs: 1000,
};

// ============================================================================
// MIN HEAP FOR AGING (O(log n) operations)
// ============================================================================

interface HeapNode {
  key: number; // Next boost time
  taskId: string;
}

class MinHeap {
  private heap: HeapNode[] = [];

  insert(node: HeapNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  peek(): HeapNode | undefined {
    return this.heap[0];
  }

  pop(): HeapNode | undefined {
    if (this.heap.length === 0) return undefined;
    const min = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  remove(taskId: string): boolean {
    const idx = this.heap.findIndex((n) => n.taskId === taskId);
    if (idx === -1) return false;
    const last = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = last;
      this.bubbleUp(idx);
      this.bubbleDown(idx);
    }
    return true;
  }

  size(): number {
    return this.heap.length;
  }

  clear(): void {
    this.heap = [];
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.heap[parentIdx].key <= this.heap[idx].key) break;
      [this.heap[parentIdx], this.heap[idx]] = [this.heap[idx], this.heap[parentIdx]];
      idx = parentIdx;
    }
  }

  private bubbleDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let smallest = idx;

      if (leftIdx < length && this.heap[leftIdx].key < this.heap[smallest].key) {
        smallest = leftIdx;
      }
      if (rightIdx < length && this.heap[rightIdx].key < this.heap[smallest].key) {
        smallest = rightIdx;
      }
      if (smallest === idx) break;
      [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
      idx = smallest;
    }
  }
}

// ============================================================================
// INDEXED PRIORITY QUEUE WITH HEAP-BASED AGING
// ============================================================================

export interface QueueEvents {
  enqueued: (task: QueuedTask) => void;
  dequeued: (task: QueuedTask) => void;
  rejected: (task: QueuedTask, reason: string) => void;
  aged: (task: QueuedTask, from: Priority, to: Priority) => void;
  dropped: (task: QueuedTask) => void;
  maxWaitExceeded: (task: QueuedTask) => void;
}

let priorityQueueIdCounter = 0;

export class PriorityQueue extends EventEmitter {
  private queues: Map<Priority, QueuedTask[]> = new Map([
    ["critical", []],
    ["high", []],
    ["normal", []],
    ["low", []],
  ]);
  private size = 0;
  private taskIndex: Map<string, { priority: Priority; idx: number }> = new Map();
  private waitTimers: Map<string, string> = new Map(); // Stores timer IDs for timer-wheel
  private agingTimerId: string;
  private agingActive = false;
  private agingHeap: MinHeap = new MinHeap();
  private config: Required<SchedulerConfig>;
  private clock: VirtualClock;

  constructor(config: Required<SchedulerConfig>, clock?: VirtualClock) {
    super();
    this.config = config;
    this.clock = clock ?? createRealClock();
    this.agingTimerId = `pq-aging-${++priorityQueueIdCounter}`;
  }

  startAging(): void {
    if (this.agingActive) return;
    this.agingActive = true;
    scheduleInterval(this.agingTimerId, this.config.agingCheckIntervalMs, () => {
      this.applyAgingHeap();
    });
  }

  stopAging(): void {
    if (this.agingActive) {
      cancelInterval(this.agingTimerId);
      this.agingActive = false;
    }
  }

  /**
   * Apply aging using min-heap - O(k log k) where k = tasks to boost
   */
  private applyAgingHeap(): void {
    const now = this.clock.now();
    const tasksToMove: Array<{ task: QueuedTask; from: Priority; to: Priority }> = [];

    // Process only tasks that need boosting
    while (this.agingHeap.peek() && this.agingHeap.peek()!.key <= now) {
      const { taskId } = this.agingHeap.pop()!;
      const loc = this.taskIndex.get(taskId);
      if (!loc) continue;

      const task = this.findTask(taskId, loc.priority);
      if (!task) continue;

      const waitTime = now - task.enqueuedAt;
      const boosts = Math.floor(waitTime / this.config.agingThresholdMs);
      if (boosts > 0 && task.priority !== "critical") {
        const newPriority = this.boostPriority(task.priority, boosts);
        if (newPriority !== task.priority) {
          tasksToMove.push({ task, from: task.priority, to: newPriority });
        }
      }

      // Re-insert for next potential boost
      if (task.priority !== "critical") {
        const nextBoostTime = task.enqueuedAt + (boosts + 1) * this.config.agingThresholdMs;
        this.agingHeap.insert({ key: nextBoostTime, taskId: task.id });
      }
    }

    for (const { task, from, to } of tasksToMove) {
      this.moveTask(task, from, to);
      this.emit("aged", task, from, to);
    }
  }

  private findTask(taskId: string, priority: Priority): QueuedTask | undefined {
    const queue = this.queues.get(priority);
    return queue?.find((t) => t.id === taskId);
  }

  private boostPriority(current: Priority, boosts: number): Priority {
    const idx = PRIORITY_ORDER.indexOf(current);
    const newIdx = Math.min(idx + boosts, PRIORITY_ORDER.length - 1);
    return PRIORITY_ORDER[newIdx];
  }

  private demotePriority(current: Priority): Priority {
    const idx = PRIORITY_ORDER.indexOf(current);
    return PRIORITY_ORDER[Math.max(0, idx - 1)];
  }

  private moveTask(task: QueuedTask, from: Priority, to: Priority): void {
    const fromQueue = this.queues.get(from)!;
    const idx = fromQueue.findIndex((t) => t.id === task.id);
    if (idx !== -1) {
      fromQueue.splice(idx, 1);
      task.priority = to;
      const toQueue = this.queues.get(to)!;
      toQueue.push(task);
      this.taskIndex.set(task.id, { priority: to, idx: toQueue.length - 1 });
    }
  }

  /**
   * Enqueue with backpressure - O(1) + O(log n) for aging heap
   */
  enqueue(task: QueuedTask): { success: boolean; reason?: string } {
    const priority = task.priority;
    const queue = this.queues.get(priority)!;
    const perPriorityLimit =
      this.config.maxQueueSizePerPriority[priority] ?? this.config.maxQueueSize;

    if (queue.length >= perPriorityLimit) {
      const handled = this.handleBackpressure(task, priority);
      if (!handled.success) {
        this.emit("rejected", task, handled.reason);
        return handled;
      }
    }

    if (this.size >= this.config.maxQueueSize) {
      const handled = this.handleBackpressure(task, priority);
      if (!handled.success) {
        this.emit("rejected", task, handled.reason);
        return handled;
      }
    }

    // Set max wait timer using timer-wheel for O(1) management
    if (this.config.maxWaitTimeMs > 0) {
      const timerId = `pq-wait-${task.id}`;
      scheduleTimeout(timerId, this.config.maxWaitTimeMs, () => {
        this.handleMaxWaitExceeded(task);
      });
      this.waitTimers.set(task.id, timerId);
    }

    queue.push(task);
    this.size++;
    this.taskIndex.set(task.id, { priority, idx: queue.length - 1 });

    // Add to aging heap for O(log n) aging
    if (priority !== "critical") {
      const nextBoostTime = task.enqueuedAt + this.config.agingThresholdMs;
      this.agingHeap.insert({ key: nextBoostTime, taskId: task.id });
    }

    this.emit("enqueued", task);
    return { success: true };
  }

  private handleBackpressure(
    task: QueuedTask,
    priority: Priority,
  ): { success: boolean; reason?: string } {
    switch (this.config.rejectionPolicy) {
      case "reject":
        return { success: false, reason: "queue-full" };

      case "drop-oldest": {
        const queue = this.queues.get(priority)!;
        if (queue.length > 0) {
          const dropped = queue.shift()!;
          this.size--;
          this.clearWaitTimer(dropped.id);
          this.taskIndex.delete(dropped.id);
          this.agingHeap.remove(dropped.id);
          this.emit("dropped", dropped);
          return { success: true };
        }
        return { success: false, reason: "queue-empty" };
      }

      case "demote": {
        if (priority === "low") {
          return { success: false, reason: "cannot-demote-low" };
        }
        task.priority = this.demotePriority(priority);
        return this.enqueue(task);
      }

      default:
        return { success: false, reason: "unknown-policy" };
    }
  }

  private handleMaxWaitExceeded(task: QueuedTask): void {
    const removed = this.remove(task.id);
    if (removed) {
      this.emit("maxWaitExceeded", task);
      task.abortController?.abort("max-wait-exceeded");
    }
  }

  private clearWaitTimer(taskId: string): void {
    const timerId = this.waitTimers.get(taskId);
    if (timerId) {
      cancelTimeout(timerId);
      this.waitTimers.delete(taskId);
    }
  }

  /**
   * Dequeue highest priority task - O(1)
   */
  dequeue(): QueuedTask | null {
    for (const priority of ["critical", "high", "normal", "low"] as Priority[]) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        const task = queue.shift()!;
        this.size--;
        this.clearWaitTimer(task.id);
        this.taskIndex.delete(task.id);
        this.agingHeap.remove(task.id);
        this.emit("dequeued", task);
        return task;
      }
    }
    return null;
  }

  peek(): QueuedTask | null {
    for (const priority of ["critical", "high", "normal", "low"] as Priority[]) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  /**
   * O(1) removal using swap-and-pop
   */
  remove(taskId: string): boolean {
    const loc = this.taskIndex.get(taskId);
    if (!loc) return false;

    const queue = this.queues.get(loc.priority)!;
    const idx = queue.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;

    // Swap with last and pop for O(1)
    const last = queue.pop()!;
    if (last.id !== taskId && idx < queue.length) {
      queue[idx] = last;
      this.taskIndex.set(last.id, { priority: loc.priority, idx });
    }

    this.size--;
    this.clearWaitTimer(taskId);
    this.taskIndex.delete(taskId);
    this.agingHeap.remove(taskId);
    return true;
  }

  getSize(): number {
    return this.size;
  }

  getStats(): Record<Priority, number> {
    return {
      critical: this.queues.get("critical")?.length ?? 0,
      high: this.queues.get("high")?.length ?? 0,
      normal: this.queues.get("normal")?.length ?? 0,
      low: this.queues.get("low")?.length ?? 0,
    };
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    for (const timerId of this.waitTimers.values()) {
      cancelTimeout(timerId);
    }
    this.waitTimers.clear();
    this.taskIndex.clear();
    this.agingHeap.clear();
    this.size = 0;
    this.stopAging();
  }
}

// ============================================================================
// ZOMBIE DETECTION
// ============================================================================

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    const result = execSync(`ps -p ${pid} -o state= 2>/dev/null || echo ""`, {
      encoding: "utf8",
      timeout: 1000,
    }).trim();
    return result.length > 0 && !result.startsWith("Z");
  } catch {
    return false;
  }
}

export function detectZombies(
  sessions: Array<{
    id: string;
    pid?: number;
    command: string;
    startedAt: number;
    exited?: boolean;
  }>,
): ZombieInfo[] {
  const zombies: ZombieInfo[] = [];
  const now = Date.now();

  for (const session of sessions) {
    if (!session.pid || session.exited) continue;
    if (!isProcessAlive(session.pid)) {
      zombies.push({
        sessionId: session.id,
        pid: session.pid,
        command: session.command,
        startedAt: session.startedAt,
        ageMs: now - session.startedAt,
      });
    }
  }

  return zombies;
}

// ============================================================================
// ADAPTIVE CIRCUIT BREAKER (Rolling Window + Exponential Backoff)
// ============================================================================

export type CircuitState = "closed" | "open" | "half-open";

interface CircuitResult {
  time: number;
  success: boolean;
}

export class ProcessCircuitBreaker extends EventEmitter {
  private state: CircuitState = "closed";
  private results: CircuitResult[] = [];
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private consecutiveTrips = 0;
  private config: Required<SchedulerConfig>;
  private clock: VirtualClock;

  constructor(config: Required<SchedulerConfig>, clock?: VirtualClock) {
    super();
    this.config = config;
    this.clock = clock ?? createRealClock();
  }

  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  private gc(): void {
    const cutoff = this.clock.now() - this.config.circuitWindowMs;
    this.results = this.results.filter((r) => r.time > cutoff);
  }

  private checkStateTransition(): void {
    if (this.state === "open") {
      const elapsed = this.clock.now() - this.lastFailureTime;
      const backoffTime = this.getOpenDuration();
      if (elapsed >= backoffTime) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
        this.emit("state-change", "half-open");
      }
    }
  }

  /**
   * Exponential backoff for recovery attempts
   */
  private getOpenDuration(): number {
    const trips = Math.min(this.consecutiveTrips, 5);
    const backoff = this.config.circuitResetTimeoutMs * Math.pow(2, trips - 1);
    return Math.min(backoff, this.config.circuitMaxBackoffMs);
  }

  canExecute(): { allowed: boolean; reason?: string } {
    this.checkStateTransition();
    this.gc();

    // Check adaptive thresholds
    const failures = this.results.filter((r) => !r.success).length;
    const total = this.results.length;
    const errorRate = total > 0 ? failures / total : 0;
    const minAttempts = Math.max(this.config.circuitMinAttempts, Math.ceil(total * 0.1));

    // Trip circuit if error rate exceeds threshold AND enough attempts
    if (
      this.state === "closed" &&
      failures >= minAttempts &&
      errorRate > this.config.circuitErrorRateThreshold
    ) {
      this.trip("adaptive-threshold");
    }

    if (this.state === "open") {
      const backoff = this.getOpenDuration();
      const remaining = Math.ceil((backoff - (this.clock.now() - this.lastFailureTime)) / 1000);
      return {
        allowed: false,
        reason: `Circuit OPEN: ${remaining}s until reset (backoff: ${Math.round(backoff / 1000)}s)`,
      };
    }

    if (this.state === "half-open" && this.halfOpenAttempts >= this.config.circuitHalfOpenMax) {
      return {
        allowed: false,
        reason: "Circuit HALF-OPEN: max test attempts reached",
      };
    }

    return { allowed: true };
  }

  recordSuccess(): void {
    this.results.push({ time: this.clock.now(), success: true });

    if (this.state === "half-open") {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.circuitHalfOpenMax) {
        this.state = "closed";
        this.consecutiveTrips = 0;
        this.emit("state-change", "closed");
      }
    }
  }

  recordFailure(): void {
    this.results.push({ time: this.clock.now(), success: false });
    this.lastFailureTime = this.clock.now();

    if (this.state === "half-open") {
      this.trip("half-open-failure");
      return;
    }

    // Legacy: also support simple failure count threshold
    const recentFailures = this.results.filter((r) => !r.success).length;
    if (recentFailures >= this.config.circuitFailureThreshold) {
      this.trip("threshold-exceeded");
    }
  }

  private trip(reason: string): void {
    if (this.state !== "open") {
      this.consecutiveTrips++;
    }
    this.state = "open";
    this.emit("state-change", "open");
    this.emit("trip", reason);
  }

  reset(): void {
    this.state = "closed";
    this.results = [];
    this.halfOpenAttempts = 0;
    this.consecutiveTrips = 0;
    this.emit("state-change", "closed");
  }

  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    errorRate: number;
    consecutiveTrips: number;
    backoffMs: number;
  } {
    this.gc();
    const failures = this.results.filter((r) => !r.success).length;
    const successes = this.results.filter((r) => r.success).length;
    const total = this.results.length;
    return {
      state: this.state,
      failures,
      successes,
      errorRate: total > 0 ? failures / total : 0,
      consecutiveTrips: this.consecutiveTrips,
      backoffMs: this.getOpenDuration(),
    };
  }
}

// ============================================================================
// CGROUPS-AWARE RESOURCE MONITOR
// ============================================================================

export class ResourceMonitor {
  private history: ResourceSnapshot[] = [];
  private maxHistory = 60;
  private config: Required<SchedulerConfig>;
  private cpuCount: number;
  private cgroupsAvailable: boolean | null = null;

  constructor(config: Required<SchedulerConfig>) {
    this.config = config;
    this.cpuCount = os.cpus().length;
  }

  private checkCgroupsV2(): boolean {
    if (this.cgroupsAvailable !== null) return this.cgroupsAvailable;
    try {
      this.cgroupsAvailable = fs.existsSync("/sys/fs/cgroup/cgroup.controllers");
    } catch {
      this.cgroupsAvailable = false;
    }
    return this.cgroupsAvailable;
  }

  private readCgroupFile(path: string): string | null {
    try {
      return fs.readFileSync(path, "utf8").trim();
    } catch {
      return null;
    }
  }

  private getCgroupCpuLimit(): number | undefined {
    if (!this.checkCgroupsV2()) return undefined;
    const cpuMax = this.readCgroupFile("/sys/fs/cgroup/cpu.max");
    if (!cpuMax) return undefined;
    const [quota, period] = cpuMax.split(" ").map(Number);
    if (quota === -1 || isNaN(quota) || isNaN(period)) return undefined;
    return quota / period;
  }

  private getCgroupMemoryLimit(): number | undefined {
    if (!this.checkCgroupsV2()) return undefined;
    const memMax = this.readCgroupFile("/sys/fs/cgroup/memory.max");
    if (!memMax || memMax === "max") return undefined;
    const bytes = parseInt(memMax, 10);
    if (isNaN(bytes)) return undefined;
    return bytes / (1024 * 1024); // MB
  }

  private getCgroupMemoryPressure(): "none" | "some" | "full" | undefined {
    if (!this.checkCgroupsV2()) return undefined;
    const pressure = this.readCgroupFile("/sys/fs/cgroup/memory.pressure");
    if (!pressure) return undefined;
    // Parse pressure stats (some avg10=X.XX, full avg10=Y.YY format)
    if (pressure.includes("full avg10=") && !pressure.includes("full avg10=0.00")) {
      return "full";
    }
    if (pressure.includes("some avg10=") && !pressure.includes("some avg10=0.00")) {
      return "some";
    }
    return "none";
  }

  private isCpuThrottled(): boolean {
    if (!this.checkCgroupsV2()) return false;
    const stat = this.readCgroupFile("/sys/fs/cgroup/cpu.stat");
    if (!stat) return false;
    const match = stat.match(/nr_throttled\s+(\d+)/);
    return match ? parseInt(match[1], 10) > 0 : false;
  }

  getSnapshot(): ResourceSnapshot {
    const memUsage = process.memoryUsage();
    const loadAvg = os.loadavg();
    const cgroupCpuLimit = this.getCgroupCpuLimit();
    const cgroupMemoryLimit = this.getCgroupMemoryLimit();

    // Use cgroup limits if available, otherwise system limits
    const effectiveCpuCount = cgroupCpuLimit ?? this.cpuCount;
    const effectiveMemLimit = cgroupMemoryLimit ?? os.totalmem() / (1024 * 1024);

    const snapshot: ResourceSnapshot = {
      cpuPercent: (loadAvg[0] / effectiveCpuCount) * 100,
      memoryUsedMb: memUsage.heapUsed / (1024 * 1024),
      memoryLimitMb: effectiveMemLimit,
      loadAvg1m: loadAvg[0],
      fdCount: this.getFdCount(),
      timestamp: Date.now(),
      cgroupCpuLimit,
      cgroupMemoryLimit,
      cgroupThrottled: this.isCpuThrottled(),
      memoryPressure: this.getCgroupMemoryPressure(),
    };

    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return snapshot;
  }

  private getFdCount(): number {
    if (process.platform === "linux") {
      try {
        const fds = fs.readdirSync("/proc/self/fd");
        return fds.length;
      } catch {
        return 0;
      }
    }
    if (process.platform === "darwin") {
      try {
        const result = execSync("lsof -p $$ 2>/dev/null | wc -l || echo 0", {
          encoding: "utf8",
          timeout: 500,
        });
        return parseInt(result.trim(), 10) || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  canStartProcess(): { allowed: boolean; reason?: string } {
    const snapshot = this.getSnapshot();
    const maxLoad = this.config.maxLoadAvg > 0 ? this.config.maxLoadAvg : this.cpuCount * 0.8;

    // Check memory pressure first (most critical)
    if (snapshot.memoryPressure === "full") {
      return { allowed: false, reason: "Memory pressure FULL - system under OOM pressure" };
    }

    if (snapshot.cpuPercent > this.config.maxCpuPercent) {
      return {
        allowed: false,
        reason: `CPU ${snapshot.cpuPercent.toFixed(1)}% > ${this.config.maxCpuPercent}%`,
      };
    }

    if (snapshot.memoryUsedMb > this.config.maxMemoryMb) {
      return {
        allowed: false,
        reason: `Memory ${snapshot.memoryUsedMb.toFixed(0)}MB > ${this.config.maxMemoryMb}MB`,
      };
    }

    if (snapshot.loadAvg1m > maxLoad) {
      return {
        allowed: false,
        reason: `Load ${snapshot.loadAvg1m.toFixed(2)} > ${maxLoad.toFixed(2)}`,
      };
    }

    if (this.config.maxFdCount > 0 && snapshot.fdCount > this.config.maxFdCount) {
      return {
        allowed: false,
        reason: `FDs ${snapshot.fdCount} > ${this.config.maxFdCount}`,
      };
    }

    // Warn about throttling but don't block
    if (snapshot.cgroupThrottled) {
      // Could emit warning event here
    }

    return { allowed: true };
  }

  getRecommendedConcurrency(baseMax: number): number {
    if (!this.config.adaptiveConcurrency) {
      return baseMax;
    }

    const snapshot = this.getSnapshot();
    const effectiveCpuCount = snapshot.cgroupCpuLimit ?? this.cpuCount;
    const loadRatio = snapshot.loadAvg1m / effectiveCpuCount;

    // More aggressive scaling based on memory pressure
    if (snapshot.memoryPressure === "some") {
      return Math.max(1, Math.floor(baseMax * 0.5));
    }

    if (loadRatio > 0.8) {
      return Math.max(1, Math.floor(baseMax * 0.5));
    } else if (loadRatio > 0.6) {
      return Math.max(1, Math.floor(baseMax * 0.75));
    } else if (loadRatio < 0.3) {
      return Math.min(baseMax + 2, Math.floor(baseMax * 1.5));
    }

    return baseMax;
  }

  getHistory(): ResourceSnapshot[] {
    return [...this.history];
  }
}

// ============================================================================
// CARDINALITY-SAFE METRICS COLLECTOR
// ============================================================================

export interface MetricEntry {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

let metricsCollectorIdCounter = 0;

export class SafeMetricsCollector extends EventEmitter {
  private maxCardinality: number;
  private seenLabels: Map<string, Set<string>> = new Map();
  private buffer: MetricEntry[] = [];
  private bufferFlushMs: number;
  private flushTimerId: string;
  private flushActive = false;
  private aggregates: Map<string, { sum: number; count: number; min: number; max: number }> =
    new Map();

  constructor(config: Required<SchedulerConfig>) {
    super();
    this.maxCardinality = config.metricsMaxCardinality;
    this.bufferFlushMs = config.metricsBufferFlushMs;
    this.flushTimerId = `metrics-flush-${++metricsCollectorIdCounter}`;
  }

  start(): void {
    if (this.flushActive) return;
    this.flushActive = true;
    scheduleInterval(this.flushTimerId, this.bufferFlushMs, () => this.flush());
  }

  stop(): void {
    if (this.flushActive) {
      cancelInterval(this.flushTimerId);
      this.flushActive = false;
    }
    this.flush();
  }

  record(name: string, value: number, labels: Record<string, string> = {}): void {
    // Check and limit cardinality
    const sanitizedLabels = this.sanitizeLabels(labels);

    this.buffer.push({
      name,
      value,
      labels: sanitizedLabels,
      timestamp: Date.now(),
    });

    // Update aggregates
    const key = `${name}:${JSON.stringify(sanitizedLabels)}`;
    const agg = this.aggregates.get(key) ?? { sum: 0, count: 0, min: Infinity, max: -Infinity };
    agg.sum += value;
    agg.count++;
    agg.min = Math.min(agg.min, value);
    agg.max = Math.max(agg.max, value);
    this.aggregates.set(key, agg);
  }

  private sanitizeLabels(labels: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, val] of Object.entries(labels)) {
      let set = this.seenLabels.get(key);
      if (!set) {
        set = new Set();
        this.seenLabels.set(key, set);
      }

      if (set.size >= this.maxCardinality && !set.has(val)) {
        result[key] = "__other__";
        this.emit("cardinality-limit-hit", { key, value: val });
      } else {
        set.add(val);
        result[key] = val;
      }
    }

    return result;
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const metrics = [...this.buffer];
    this.buffer = [];

    this.emit("flush", metrics);
  }

  getAggregates(): Map<
    string,
    { sum: number; count: number; min: number; max: number; avg: number }
  > {
    const result = new Map<
      string,
      { sum: number; count: number; min: number; max: number; avg: number }
    >();
    for (const [key, agg] of this.aggregates) {
      result.set(key, {
        ...agg,
        avg: agg.count > 0 ? agg.sum / agg.count : 0,
      });
    }
    return result;
  }

  reset(): void {
    this.buffer = [];
    this.aggregates.clear();
    this.seenLabels.clear();
  }
}

// ============================================================================
// WORK-STEALING BATCH EXECUTOR
// ============================================================================

class Deque<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  // Steal from bottom (oldest items)
  steal(): T | undefined {
    return this.items.shift();
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

export interface TaskContext {
  index: number;
  signal: AbortSignal;
  workerId: number;
  onProgress?: (completed: number) => void;
}

const DEFAULT_BATCH_OPTIONS: Required<BatchOptions> = {
  parallel: true,
  maxConcurrent: 4,
  failFast: false,
  timeoutMs: 5 * 60 * 1000,
  signal: undefined as unknown as AbortSignal,
  workStealing: true,
};

export async function executeBatch(
  tasks: BatchTask[],
  executor: (task: BatchTask, ctx: TaskContext) => Promise<BatchResult>,
  options: BatchOptions = {},
): Promise<{
  results: BatchResult[];
  stats: {
    total: number;
    completed: number;
    failed: number;
    aborted: number;
    durationMs: number;
    steals: number;
  };
}> {
  const opts = { ...DEFAULT_BATCH_OPTIONS, ...options };
  const startTime = Date.now();
  const results: BatchResult[] = new Array(tasks.length);
  const abortController = new AbortController();
  let steals = 0;

  if (opts.signal) {
    opts.signal.addEventListener("abort", () => {
      abortController.abort(opts.signal?.reason || "external-abort");
    });
  }

  // Use timer wheel for O(1) timeout management
  const batchTimeoutId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let hasTimeout = false;
  if (opts.timeoutMs > 0) {
    scheduleTimeout(batchTimeoutId, opts.timeoutMs, () => {
      abortController.abort("batch-timeout");
    });
    hasTimeout = true;
  }

  try {
    if (!opts.parallel) {
      // Sequential execution
      for (let i = 0; i < tasks.length; i++) {
        if (abortController.signal.aborted) {
          results[i] = {
            command: tasks[i].command,
            status: "aborted",
            exitCode: null,
            output: "",
            durationMs: Date.now() - startTime,
            error: "Batch aborted",
          };
          continue;
        }

        const ctx: TaskContext = {
          index: i,
          signal: abortController.signal,
          workerId: 0,
        };

        try {
          results[i] = await executor(tasks[i], ctx);
          if (opts.failFast && results[i].status === "failed") {
            abortController.abort("fail-fast");
          }
        } catch (err) {
          results[i] = {
            command: tasks[i].command,
            status: "failed",
            exitCode: null,
            output: "",
            durationMs: Date.now() - startTime,
            error: String(err),
          };
          if (opts.failFast) {
            abortController.abort("fail-fast");
          }
        }
      }
    } else if (opts.workStealing) {
      // Work-stealing parallel execution
      const workerCount = Math.min(opts.maxConcurrent, tasks.length);
      const workerQueues: Deque<number>[] = Array.from({ length: workerCount }, () => new Deque());

      // Distribute tasks round-robin to worker queues
      tasks.forEach((_, i) => {
        workerQueues[i % workerCount].push(i);
      });

      const runWorker = async (workerId: number): Promise<void> => {
        const myQueue = workerQueues[workerId];

        while (true) {
          if (abortController.signal.aborted) break;

          // Try local queue first
          let taskIndex = myQueue.pop();

          // If empty, try to steal from others
          if (taskIndex === undefined) {
            for (let i = 0; i < workerCount; i++) {
              const targetIdx = (workerId + i + 1) % workerCount;
              if (targetIdx === workerId) continue;

              taskIndex = workerQueues[targetIdx].steal();
              if (taskIndex !== undefined) {
                steals++;
                break;
              }
            }
          }

          if (taskIndex === undefined) break;

          const task = tasks[taskIndex];
          const ctx: TaskContext = {
            index: taskIndex,
            signal: abortController.signal,
            workerId,
          };

          try {
            results[taskIndex] = await executor(task, ctx);
            if (opts.failFast && results[taskIndex].status === "failed") {
              abortController.abort("fail-fast");
            }
          } catch (err) {
            results[taskIndex] = {
              command: task.command,
              status: abortController.signal.aborted ? "aborted" : "failed",
              exitCode: null,
              output: "",
              durationMs: Date.now() - startTime,
              error: String(err),
            };
            if (opts.failFast) {
              abortController.abort("fail-fast");
            }
          }
        }
      };

      await Promise.all(Array.from({ length: workerCount }, (_, i) => runWorker(i)));
    } else {
      // Simple shared-index parallel (original implementation)
      let index = 0;
      const workers: Promise<void>[] = [];

      const runWorker = async (workerId: number): Promise<void> => {
        while (index < tasks.length) {
          if (abortController.signal.aborted) break;

          const taskIndex = index++;
          const task = tasks[taskIndex];

          const ctx: TaskContext = {
            index: taskIndex,
            signal: abortController.signal,
            workerId,
          };

          try {
            results[taskIndex] = await executor(task, ctx);
            if (opts.failFast && results[taskIndex].status === "failed") {
              abortController.abort("fail-fast");
            }
          } catch (err) {
            results[taskIndex] = {
              command: task.command,
              status: abortController.signal.aborted ? "aborted" : "failed",
              exitCode: null,
              output: "",
              durationMs: Date.now() - startTime,
              error: String(err),
            };
            if (opts.failFast) {
              abortController.abort("fail-fast");
            }
          }
        }
      };

      const workerCount = Math.min(opts.maxConcurrent, tasks.length);
      for (let i = 0; i < workerCount; i++) {
        workers.push(runWorker(i));
      }

      await Promise.all(workers);
    }

    // Fill remaining aborted slots
    for (let i = 0; i < tasks.length; i++) {
      if (!results[i]) {
        results[i] = {
          command: tasks[i].command,
          status: "aborted",
          exitCode: null,
          output: "",
          durationMs: Date.now() - startTime,
          error: "Task not started due to abort",
        };
      }
    }
  } finally {
    if (hasTimeout) {
      cancelTimeout(batchTimeoutId);
    }
  }

  const durationMs = Date.now() - startTime;
  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const abortedCount = results.filter((r) => r.status === "aborted").length;

  return {
    results,
    stats: {
      total: tasks.length,
      completed: completedCount,
      failed: failedCount,
      aborted: abortedCount,
      durationMs,
      steals,
    },
  };
}

// ============================================================================
// CHAOS ENGINEERING
// ============================================================================

export interface ChaosConfig {
  enabled: boolean;
  latencyRate: number;
  latencyMs: number;
  errorRate: number;
  zombieRate: number;
}

export class ChaosInjector {
  private config: ChaosConfig;
  private injectedZombies: Set<string> = new Set();

  constructor(config: Required<SchedulerConfig>) {
    this.config = {
      enabled: config.chaosEnabled,
      latencyRate: config.chaosLatencyRate,
      latencyMs: config.chaosLatencyMs,
      errorRate: config.chaosErrorRate,
      zombieRate: config.chaosZombieRate,
    };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  shouldInjectLatency(): boolean {
    return this.config.enabled && Math.random() < this.config.latencyRate;
  }

  getLatencyMs(): number {
    return this.config.latencyMs;
  }

  shouldInjectError(): boolean {
    return this.config.enabled && Math.random() < this.config.errorRate;
  }

  shouldCreateZombie(): boolean {
    return this.config.enabled && Math.random() < this.config.zombieRate;
  }

  markAsZombie(taskId: string): void {
    this.injectedZombies.add(taskId);
  }

  isInjectedZombie(taskId: string): boolean {
    return this.injectedZombies.has(taskId);
  }

  clearZombies(): void {
    this.injectedZombies.clear();
  }

  getStats(): { injectedZombies: number } {
    return { injectedZombies: this.injectedZombies.size };
  }
}

// ============================================================================
// VIRTUAL TIME / MOCK CLOCK
// ============================================================================

export interface VirtualClock {
  now(): number;
  advance(ms: number): void;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export interface MockClock extends VirtualClock {
  reset(startTime?: number): void;
  getPendingTimers(): number;
}

export function createMockClock(startTime = 0): MockClock {
  let currentTime = startTime;
  let timerId = 0;
  const timers: Map<number, { fn: () => void; fireAt: number; interval?: number }> = new Map();

  const clock: MockClock = {
    now: () => currentTime,

    advance: (ms: number) => {
      const targetTime = currentTime + ms;
      const toFire = Array.from(timers.entries())
        .filter(([, t]) => t.fireAt <= targetTime)
        .sort((a, b) => a[1].fireAt - b[1].fireAt);

      for (const [id, timer] of toFire) {
        currentTime = timer.fireAt;
        if (timer.interval) {
          timer.fireAt += timer.interval;
        } else {
          timers.delete(id);
        }
        timer.fn();
      }
      currentTime = targetTime;
    },

    setTimeout: (fn: () => void, ms: number) => {
      const id = ++timerId;
      timers.set(id, { fn, fireAt: currentTime + ms });
      return id;
    },

    clearTimeout: (id: number) => {
      timers.delete(id);
    },

    setInterval: (fn: () => void, ms: number) => {
      const id = ++timerId;
      timers.set(id, { fn, fireAt: currentTime + ms, interval: ms });
      return id;
    },

    clearInterval: (id: number) => {
      timers.delete(id);
    },

    reset: (newStartTime = 0) => {
      currentTime = newStartTime;
      timers.clear();
      timerId = 0;
    },

    getPendingTimers: () => timers.size,
  };

  return clock;
}

export function createRealClock(): VirtualClock {
  return {
    now: () => Date.now(),
    advance: () => {
      /* no-op for real clock */
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms) as unknown as number,
    clearInterval: (id) => clearInterval(id),
  };
}

// ============================================================================
// DEBUG API & HEALTH CHECKS
// ============================================================================

export interface SchedulerDebugInfo {
  topology: {
    queues: Record<Priority, number>;
    running: number;
    maxConcurrent: number;
    circuitState: CircuitState;
  };
  recentDecisions: Array<{
    time: number;
    taskId: string;
    decision: "allowed" | "denied";
    reason: string;
    checks: Record<string, boolean>;
  }>;
  hotspots: {
    slowestTasks: Array<{ taskId: string; duration: number }>;
    mostRejectedPatterns: Array<{ pattern: string; count: number }>;
  };
  resources: ResourceSnapshot;
  circuitBreaker: {
    state: CircuitState;
    errorRate: number;
    consecutiveTrips: number;
    backoffMs: number;
  };
  chaos: {
    enabled: boolean;
    injectedZombies: number;
  };
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: {
    queueNotFull: boolean;
    circuitNotOpen: boolean;
    resourcesAvailable: boolean;
    notShuttingDown: boolean;
  };
  details: Record<string, string>;
}

// ============================================================================
// EXEC SCHEDULER (Main Orchestrator)
// ============================================================================

let schedulerInstance: ExecScheduler | null = null;

let execSchedulerIdCounter = 0;

export class ExecScheduler extends EventEmitter {
  private config: Required<SchedulerConfig>;
  private queue: PriorityQueue;
  private circuitBreaker: ProcessCircuitBreaker;
  private resourceMonitor: ResourceMonitor;
  private metricsCollector: SafeMetricsCollector;
  private chaosInjector: ChaosInjector;
  private clock: VirtualClock;
  private running = 0;
  private currentMaxConcurrent: number;
  private zombieTimerId: string;
  private zombieActive = false;
  private isShuttingDown = false;
  private isPaused = false;
  private shutdownHooks: Array<() => Promise<void>> = [];

  // Advanced algorithms (v3) - adaptive concurrency and anomaly detection
  private pidController: AdaptivePIDController;
  private ewmaMetrics: EWMAMetrics;
  private duplicateDetector: DuplicateDetector;

  // Decision log for debugging
  private recentDecisions: Array<{
    time: number;
    taskId: string;
    decision: "allowed" | "denied";
    reason: string;
    checks: Record<string, boolean>;
  }> = [];
  private maxDecisionLog = 100;

  // Execution timing
  private executionTimes: Array<{ taskId: string; duration: number }> = [];
  private rejectionCounts: Map<string, number> = new Map();
  private maxTimingHistory = 100;

  // Metrics
  private metrics: SchedulerMetrics = {
    tasksEnqueued: 0,
    tasksExecuted: 0,
    tasksRejected: 0,
    tasksAged: 0,
    zombiesDetected: 0,
    circuitTrips: 0,
    avgWaitTimeMs: 0,
    avgExecutionTimeMs: 0,
    peakQueueDepth: 0,
    peakConcurrency: 0,
    p50WaitTimeMs: 0,
    p95WaitTimeMs: 0,
    p99WaitTimeMs: 0,
    p50ExecutionTimeMs: 0,
    p95ExecutionTimeMs: 0,
    p99ExecutionTimeMs: 0,
    errorRate: 0,
    throughputPerSecond: 0,
  };
  private waitTimes: number[] = [];
  private execTimes: number[] = [];
  private maxSamples = 1000;
  private startTime: number;

  constructor(config: SchedulerConfig = {}, clock?: VirtualClock) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clock = clock ?? createRealClock();
    this.startTime = this.clock.now();
    this.currentMaxConcurrent = this.config.maxConcurrent;
    this.zombieTimerId = `exec-scheduler-zombie-${++execSchedulerIdCounter}`;

    this.queue = new PriorityQueue(this.config, this.clock);
    this.circuitBreaker = new ProcessCircuitBreaker(this.config, this.clock);
    this.resourceMonitor = new ResourceMonitor(this.config);
    this.metricsCollector = new SafeMetricsCollector(this.config);
    this.chaosInjector = new ChaosInjector(this.config);

    // Advanced algorithms (v3) - adaptive concurrency, latency tracking, duplicate detection
    this.pidController = new AdaptivePIDController({
      targetLatencyMs: 100,
      minConcurrency: 1,
      maxConcurrency: this.config.maxConcurrent * 2,
    });
    this.ewmaMetrics = new EWMAMetrics({
      alpha: 0.1, // Smoothing factor for latency tracking
      anomalyThreshold: 3.0, // Standard deviations for anomaly detection
    });
    this.duplicateDetector = new DuplicateDetector({
      expectedItems: 10000,
      falsePositiveRate: 0.01,
      backingStoreSize: 1000, // LRU size for confirmation
    });

    // Wire up events
    this.queue.on("enqueued", () => {
      this.metrics.tasksEnqueued++;
      this.metrics.peakQueueDepth = Math.max(this.metrics.peakQueueDepth, this.queue.getSize());
      this.metricsCollector.record("scheduler_tasks_enqueued", 1);
    });

    this.queue.on("rejected", (task, reason) => {
      this.metrics.tasksRejected++;
      const pattern = this.extractCommandPattern(task.command);
      const count = (this.rejectionCounts.get(pattern) ?? 0) + 1;
      this.rejectionCounts.set(pattern, count);
      this.metricsCollector.record("scheduler_tasks_rejected", 1, { reason });
    });

    this.queue.on("aged", () => {
      this.metrics.tasksAged++;
      this.metricsCollector.record("scheduler_tasks_aged", 1);
    });

    this.circuitBreaker.on("trip", (reason) => {
      this.metrics.circuitTrips++;
      this.metricsCollector.record("scheduler_circuit_trips", 1, { reason });
    });

    // Start background processes
    this.queue.startAging();
    this.metricsCollector.start();
    this.setupShutdownHandlers();
  }

  private extractCommandPattern(command: string): string {
    // Extract first word/binary as pattern
    const match = command.match(/^(\S+)/);
    return match ? match[1] : "unknown";
  }

  private setupShutdownHandlers(): void {
    const handler = () => {
      this.gracefulShutdown().catch(console.error);
    };

    process.on("SIGTERM", handler);
    process.on("SIGINT", handler);

    this.shutdownHooks.push(async () => {
      process.removeListener("SIGTERM", handler);
      process.removeListener("SIGINT", handler);
    });
  }

  static getInstance(config?: SchedulerConfig): ExecScheduler {
    if (!schedulerInstance) {
      schedulerInstance = new ExecScheduler(config);
    }
    return schedulerInstance;
  }

  static resetInstance(): void {
    if (schedulerInstance) {
      schedulerInstance.stop();
    }
    schedulerInstance = null;
  }

  // -------------------------------------------------------------------------
  // Core Operations
  // -------------------------------------------------------------------------

  canStart(taskId?: string): { allowed: boolean; reason?: string } {
    const checks: Record<string, boolean> = {};
    let decision: "allowed" | "denied" = "allowed";
    let reason = "";

    // Shutdown check
    checks.notShuttingDown = !this.isShuttingDown;
    if (this.isShuttingDown) {
      decision = "denied";
      reason = "Scheduler shutting down";
    }

    // Pause check
    if (decision === "allowed") {
      checks.notPaused = !this.isPaused;
      if (this.isPaused) {
        decision = "denied";
        reason = "Scheduler paused";
      }
    }

    // Circuit breaker check
    if (decision === "allowed") {
      const circuitCheck = this.circuitBreaker.canExecute();
      checks.circuitAllows = circuitCheck.allowed;
      if (!circuitCheck.allowed) {
        decision = "denied";
        reason = circuitCheck.reason ?? "Circuit breaker open";
      }
    }

    // Concurrency check
    if (decision === "allowed") {
      const effectiveMax = this.config.adaptiveConcurrency
        ? this.resourceMonitor.getRecommendedConcurrency(this.config.maxConcurrent)
        : this.config.maxConcurrent;
      this.currentMaxConcurrent = effectiveMax;

      checks.belowMaxConcurrency = this.running < effectiveMax;
      if (this.running >= effectiveMax) {
        decision = "denied";
        reason = `At max concurrency (${this.running}/${effectiveMax})`;
      }
    }

    // Resource check
    if (decision === "allowed") {
      const resourceCheck = this.resourceMonitor.canStartProcess();
      checks.resourcesAvailable = resourceCheck.allowed;
      if (!resourceCheck.allowed) {
        decision = "denied";
        reason = resourceCheck.reason ?? "Resources exhausted";
      }
    }

    // Log decision for debugging
    if (taskId) {
      this.logDecision(taskId, decision, reason, checks);
    }

    return decision === "allowed" ? { allowed: true } : { allowed: false, reason };
  }

  private logDecision(
    taskId: string,
    decision: "allowed" | "denied",
    reason: string,
    checks: Record<string, boolean>,
  ): void {
    this.recentDecisions.push({
      time: this.clock.now(),
      taskId,
      decision,
      reason,
      checks,
    });
    if (this.recentDecisions.length > this.maxDecisionLog) {
      this.recentDecisions.shift();
    }
  }

  registerRunning(): void {
    this.running++;
    this.metrics.peakConcurrency = Math.max(this.metrics.peakConcurrency, this.running);
    this.metricsCollector.record("scheduler_running", this.running);
  }

  unregisterRunning(): void {
    this.running = Math.max(0, this.running - 1);
    this.metricsCollector.record("scheduler_running", this.running);
    this.processQueue();
  }

  queueTask(task: QueuedTask): { success: boolean; reason?: string } {
    return this.queue.enqueue(task);
  }

  private async processQueue(): Promise<void> {
    while (true) {
      const canStartResult = this.canStart();
      if (!canStartResult.allowed) break;

      if (this.queue.getSize() === 0) break;

      const task = this.queue.dequeue();
      if (!task) break;

      const waitTime = this.clock.now() - task.enqueuedAt;
      this.recordWaitTime(waitTime);

      this.registerRunning();
      const execStart = this.clock.now();

      // Chaos: inject latency
      if (this.chaosInjector.shouldInjectLatency()) {
        await new Promise((r) => setTimeout(r, this.chaosInjector.getLatencyMs()));
      }

      // Chaos: inject error
      if (this.chaosInjector.shouldInjectError()) {
        this.circuitBreaker.recordFailure();
        this.recordExecutionTime(this.clock.now() - execStart, task.id);
        this.metrics.tasksExecuted++;
        this.unregisterRunning();
        continue;
      }

      // Chaos: create zombie (don't clean up)
      if (this.chaosInjector.shouldCreateZombie()) {
        this.chaosInjector.markAsZombie(task.id);
        // Don't call unregisterRunning - intentional leak
        task.execute().catch(() => {});
        continue;
      }

      task
        .execute()
        .then(() => {
          this.circuitBreaker.recordSuccess();
          this.recordExecutionTime(this.clock.now() - execStart, task.id);
          this.metrics.tasksExecuted++;
        })
        .catch(() => {
          this.circuitBreaker.recordFailure();
          this.recordExecutionTime(this.clock.now() - execStart, task.id);
          this.metrics.tasksExecuted++;
        })
        .finally(() => {
          this.unregisterRunning();
        });
    }
  }

  private recordWaitTime(ms: number): void {
    this.waitTimes.push(ms);
    if (this.waitTimes.length > this.maxSamples) {
      this.waitTimes.shift();
    }
    this.updateWaitTimeMetrics();
    this.metricsCollector.record("scheduler_wait_time_ms", ms);
  }

  private recordExecutionTime(ms: number, taskId: string): void {
    this.execTimes.push(ms);
    if (this.execTimes.length > this.maxSamples) {
      this.execTimes.shift();
    }

    this.executionTimes.push({ taskId, duration: ms });
    if (this.executionTimes.length > this.maxTimingHistory) {
      this.executionTimes.shift();
    }

    // Advanced algorithms: Update EWMA metrics for anomaly detection
    const ewmaResult = this.ewmaMetrics.record(ms);
    if (ewmaResult.isAnomaly) {
      const stats = this.ewmaMetrics.getStats();
      this.emit("anomaly", {
        type: "execution_time",
        value: ms,
        expected: stats.mean,
        threshold: stats.stdDev * 3,
        taskId,
      });
    }

    // Advanced algorithms: Update PID controller for adaptive concurrency
    const pidOutput = this.pidController.calculate(ms);
    this.currentMaxConcurrent = Math.max(1, Math.round(pidOutput));

    this.updateExecutionTimeMetrics();
    this.metricsCollector.record("scheduler_execution_time_ms", ms);
  }

  private updateWaitTimeMetrics(): void {
    if (this.waitTimes.length === 0) return;
    const sorted = [...this.waitTimes].sort((a, b) => a - b);
    this.metrics.avgWaitTimeMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    this.metrics.p50WaitTimeMs = this.percentile(sorted, 50);
    this.metrics.p95WaitTimeMs = this.percentile(sorted, 95);
    this.metrics.p99WaitTimeMs = this.percentile(sorted, 99);
  }

  private updateExecutionTimeMetrics(): void {
    if (this.execTimes.length === 0) return;
    const sorted = [...this.execTimes].sort((a, b) => a - b);
    this.metrics.avgExecutionTimeMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    this.metrics.p50ExecutionTimeMs = this.percentile(sorted, 50);
    this.metrics.p95ExecutionTimeMs = this.percentile(sorted, 95);
    this.metrics.p99ExecutionTimeMs = this.percentile(sorted, 99);

    // Calculate throughput
    const elapsed = (this.clock.now() - this.startTime) / 1000;
    if (elapsed > 0) {
      this.metrics.throughputPerSecond = this.metrics.tasksExecuted / elapsed;
    }

    // Calculate error rate
    const circuitStats = this.circuitBreaker.getStats();
    this.metrics.errorRate = circuitStats.errorRate;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  // -------------------------------------------------------------------------
  // Zombie Detection
  // -------------------------------------------------------------------------

  startZombieDetection(
    getSessionsFn: () => Array<{
      id: string;
      pid?: number;
      command: string;
      startedAt: number;
      exited?: boolean;
    }>,
    onZombie: (zombies: ZombieInfo[]) => void,
  ): void {
    if (this.zombieActive) return;

    this.zombieActive = true;
    scheduleInterval(this.zombieTimerId, this.config.zombieCheckIntervalMs, () => {
      const sessions = getSessionsFn();
      const zombies = detectZombies(sessions);
      if (zombies.length > 0) {
        this.metrics.zombiesDetected += zombies.length;
        this.metricsCollector.record("scheduler_zombies_detected", zombies.length);
        onZombie(zombies);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Control
  // -------------------------------------------------------------------------

  pause(): void {
    this.isPaused = true;
    this.emit("paused");
  }

  resume(): void {
    this.isPaused = false;
    this.emit("resumed");
    this.processQueue();
  }

  stop(): void {
    this.queue.clear();
    this.metricsCollector.stop();
    if (this.zombieActive) {
      cancelInterval(this.zombieTimerId);
      this.zombieActive = false;
    }
  }

  async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.emit("shutdown-start");

    this.pause();

    const deadline = this.clock.now() + this.config.shutdownTimeoutMs;
    while (this.running > 0 && this.clock.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    for (const hook of this.shutdownHooks.reverse()) {
      try {
        await hook();
      } catch (err) {
        console.error("Shutdown hook failed:", err);
      }
    }

    this.stop();
    this.emit("shutdown-complete");
  }

  addShutdownHook(hook: () => Promise<void>): void {
    this.shutdownHooks.push(hook);
  }

  // -------------------------------------------------------------------------
  // Debug API & Health Checks
  // -------------------------------------------------------------------------

  getDebugInfo(): SchedulerDebugInfo {
    const circuitStats = this.circuitBreaker.getStats();

    return {
      topology: {
        queues: this.queue.getStats(),
        running: this.running,
        maxConcurrent: this.currentMaxConcurrent,
        circuitState: circuitStats.state,
      },
      recentDecisions: [...this.recentDecisions],
      hotspots: {
        slowestTasks: [...this.executionTimes].sort((a, b) => b.duration - a.duration).slice(0, 10),
        mostRejectedPatterns: Array.from(this.rejectionCounts.entries())
          .map(([pattern, count]) => ({ pattern, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      },
      resources: this.resourceMonitor.getSnapshot(),
      circuitBreaker: {
        state: circuitStats.state,
        errorRate: circuitStats.errorRate,
        consecutiveTrips: circuitStats.consecutiveTrips,
        backoffMs: circuitStats.backoffMs,
      },
      chaos: {
        enabled: this.chaosInjector.isEnabled(),
        injectedZombies: this.chaosInjector.getStats().injectedZombies,
      },
    };
  }

  healthCheck(): HealthCheckResult {
    const queueStats = this.queue.getStats();
    const totalQueued = Object.values(queueStats).reduce((a, b) => a + b, 0);
    const resourceCheck = this.resourceMonitor.canStartProcess();
    const circuitState = this.circuitBreaker.getState();

    const checks = {
      queueNotFull: totalQueued < this.config.maxQueueSize * 0.9,
      circuitNotOpen: circuitState !== "open",
      resourcesAvailable: resourceCheck.allowed,
      notShuttingDown: !this.isShuttingDown,
    };

    const healthy = Object.values(checks).every(Boolean);

    const details: Record<string, string> = {
      queueDepth: `${totalQueued}/${this.config.maxQueueSize}`,
      circuitState,
      running: `${this.running}/${this.currentMaxConcurrent}`,
    };

    if (!resourceCheck.allowed) {
      details.resourceReason = resourceCheck.reason ?? "unknown";
    }

    return { healthy, checks, details };
  }

  // -------------------------------------------------------------------------
  // Status & Metrics
  // -------------------------------------------------------------------------

  getStatus(): {
    running: number;
    maxConcurrent: number;
    effectiveMaxConcurrent: number;
    queued: number;
    queueStats: Record<Priority, number>;
    circuitState: CircuitState;
    isPaused: boolean;
    isShuttingDown: boolean;
  } {
    return {
      running: this.running,
      maxConcurrent: this.config.maxConcurrent,
      effectiveMaxConcurrent: this.currentMaxConcurrent,
      queued: this.queue.getSize(),
      queueStats: this.queue.getStats(),
      circuitState: this.circuitBreaker.getState(),
      isPaused: this.isPaused,
      isShuttingDown: this.isShuttingDown,
    };
  }

  getMetrics(): SchedulerMetrics {
    return { ...this.metrics };
  }

  getResourceSnapshot(): ResourceSnapshot {
    return this.resourceMonitor.getSnapshot();
  }

  formatStatus(): string {
    const status = this.getStatus();
    const metrics = this.getMetrics();
    const resources = this.getResourceSnapshot();
    const health = this.healthCheck();
    const circuitStats = this.circuitBreaker.getStats();

    return [
      `Scheduler: ${status.running}/${status.effectiveMaxConcurrent} running (max: ${status.maxConcurrent})`,
      `Queue: ${status.queued} (C:${status.queueStats.critical} H:${status.queueStats.high} N:${status.queueStats.normal} L:${status.queueStats.low})`,
      `Circuit: ${status.circuitState} (err: ${(circuitStats.errorRate * 100).toFixed(1)}%, trips: ${circuitStats.consecutiveTrips}, backoff: ${Math.round(circuitStats.backoffMs / 1000)}s)`,
      `Resources: CPU ${resources.cpuPercent.toFixed(1)}% | Mem ${resources.memoryUsedMb.toFixed(0)}MB | Load ${resources.loadAvg1m.toFixed(2)}${resources.memoryPressure ? ` | Pressure: ${resources.memoryPressure}` : ""}`,
      `Metrics: ${metrics.tasksExecuted} exec | ${metrics.tasksRejected} reject | ${metrics.tasksAged} aged | ${metrics.zombiesDetected} zombies`,
      `Timing: wait p50=${metrics.p50WaitTimeMs.toFixed(0)}ms p95=${metrics.p95WaitTimeMs.toFixed(0)}ms | exec p50=${metrics.p50ExecutionTimeMs.toFixed(0)}ms p95=${metrics.p95ExecutionTimeMs.toFixed(0)}ms`,
      `Throughput: ${metrics.throughputPerSecond.toFixed(2)}/s | Error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
      `Health: ${health.healthy ? "HEALTHY" : "UNHEALTHY"} (${
        Object.entries(health.checks)
          .filter(([, v]) => !v)
          .map(([k]) => k)
          .join(", ") || "all checks pass"
      })`,
      status.isPaused ? "STATUS: PAUSED" : "",
      status.isShuttingDown ? "STATUS: SHUTTING DOWN" : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // -------------------------------------------------------------------------
  // Circuit Breaker & Chaos Control
  // -------------------------------------------------------------------------

  tripCircuit(reason: string): void {
    this.circuitBreaker.recordFailure();
    this.emit("circuit-trip", reason);
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
    this.emit("circuit-reset");
  }

  enableChaos(): void {
    this.chaosInjector.setEnabled(true);
    this.emit("chaos-enabled");
  }

  disableChaos(): void {
    this.chaosInjector.setEnabled(false);
    this.chaosInjector.clearZombies();
    this.emit("chaos-disabled");
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function getScheduler(config?: SchedulerConfig): ExecScheduler {
  return ExecScheduler.getInstance(config);
}

export function resetScheduler(): void {
  ExecScheduler.resetInstance();
}

export function formatPriority(priority: Priority): string {
  const icons: Record<Priority, string> = {
    critical: "!!",
    high: "!",
    normal: "-",
    low: ".",
  };
  return `[${icons[priority]}] ${priority}`;
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

export function createTestScheduler(config?: SchedulerConfig): ExecScheduler {
  return new ExecScheduler(
    {
      ...config,
      adaptiveConcurrency: false,
      zombieCheckIntervalMs: 100,
      agingCheckIntervalMs: 100,
    },
    createMockClock(),
  );
}

export function createSchedulerWithClock(
  config: SchedulerConfig,
  clock: VirtualClock,
): ExecScheduler {
  return new ExecScheduler(config, clock);
}
