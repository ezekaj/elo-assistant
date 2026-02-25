/**
 * Enhanced Exec - Unified exports
 *
 * Combines all enhanced exec features:
 * - Risk Classification (GREEN/YELLOW/RED)
 * - Resource Governor (limits, monitoring)
 * - Snapshot Manager (backup/restore)
 * - Shell Context Memory (history, cwd)
 */

// Risk Classification
export {
  type RiskLevel,
  type RiskClassification,
  classifyCommandRisk,
  formatRiskWarning,
  shouldBlockCommand,
} from "./exec-risk-classifier.js";

// Resource Governor
export {
  type ResourceLimits,
  type ProcessMetrics,
  ResourceGovernor,
  canStartProcess,
  getResourceStatus,
  formatResourceBlockMessage,
} from "./exec-resource-governor.js";

// Snapshot Manager
export {
  type Snapshot,
  SnapshotManager,
  getSnapshotManager,
  resetSnapshotManager,
} from "./exec-snapshot-manager.js";

// Shell Context Memory
export {
  type CommandHistory,
  type ShellContext,
  getShellContextManager,
  resetShellContextManager,
  recordCommand,
  getContextSummary,
} from "./exec-shell-context.js";

// Circuit Breaker (auto-halt on thresholds)
export {
  type CircuitState,
  type CircuitBreakerThresholds,
  type CircuitStats,
  CircuitBreaker,
  canExecuteCommand,
  recordCommandExecution,
  getCircuitStatus,
  tripCircuit,
  resetCircuit,
  formatCircuitStatus,
} from "./exec-circuit-breaker.js";

// Scheduler (priority queue, zombie detection, batch, circuit breaker, resource monitor)
export {
  // Types
  type Priority,
  type QueuedTask,
  type ZombieInfo,
  type BatchTask,
  type BatchResult,
  type BatchOptions,
  type SchedulerConfig,
  type SchedulerMetrics,
  type ResourceSnapshot,
  type TaskContext,
  type CircuitState as SchedulerCircuitState,
  type QueueEvents,
  type MockClock,
  type VirtualClock,
  type MetricEntry,
  type ChaosConfig,
  type SchedulerDebugInfo,
  type HealthCheckResult,
  // Classes
  PriorityQueue,
  ExecScheduler,
  ProcessCircuitBreaker,
  ResourceMonitor,
  SafeMetricsCollector,
  ChaosInjector,
  // Functions
  isProcessAlive,
  isProcessRunning,
  detectZombies,
  executeBatch,
  getScheduler,
  resetScheduler,
  formatPriority,
  // Testing utilities
  createMockClock,
  createTestScheduler,
  createRealClock,
  createSchedulerWithClock,
} from "./exec-scheduler.js";

// Advanced Algorithms (v3) - World-class optimizations
export {
  // Types
  type TimingWheelConfig,
  type PIDConfig,
  type EWMAConfig,
  type BloomFilterConfig,
  type TDigestConfig,
  type FlowControlConfig,
  type FlowControlPhase,
  type VersionedConfigOptions,
  type DuplicateDetectorConfig,
  type AdvancedMetricsConfig,
  // Classes
  HierarchicalTimingWheel,
  AdaptivePIDController,
  EWMAMetrics,
  BloomFilter,
  TDigest,
  TCPFlowControl,
  VersionedConfig,
  DuplicateDetector,
  AdvancedMetricsCollector,
} from "./exec-scheduler-advanced.js";
