// Evolution service types

export interface CodePatch {
  file: string;
  search: string;
  replace: string;
  description: string;
}

export interface CodeChange {
  id: string;
  description: string;
  reasoning: string;
  patches: CodePatch[];
  focus: 'performance' | 'clean-code' | 'reliability' | 'features';
  priority: 'high' | 'medium' | 'low';
  affectedFiles: string[];
}

export interface TestResult {
  success: boolean;
  passed: number;
  failed: number;
  duration: number;
  coverage?: number;
  error?: string;
  output: string;
}

export interface BenchmarkResult {
  accuracy: number;      // Test pass rate (0-1)
  speed: number;         // Avg test duration (ms)
  memory: number;        // Peak memory (MB)
  coverage: number;      // Code coverage % (0-100)
}

export interface ComparisonResult {
  better: boolean;
  improvements: {
    accuracy: number;
    speed: number;
    memory: number;
    coverage: number;
  };
}

export interface ExperimentResult {
  success: boolean;
  testResult?: TestResult;
  benchmark?: BenchmarkResult;
  comparison?: ComparisonResult;
  isImprovement: boolean;
  error?: string;
  typeCheckErrors?: string;
}

export interface EvolutionEntry {
  timestamp: string;
  proposal: CodeChange;
  result: {
    success: boolean;
    passed: number;
    failed: number;
    duration: number;
  };
  applied: boolean;
  benchmark?: BenchmarkResult;
  commitHash?: string;
}

export interface BehaviorAnalysis {
  session_health: {
    total_sessions: number;
    heavy_sessions: number;
    avg_compactions: number;
  };
  tool_retries: Array<{
    tool: string;
    count: number;
    max_consecutive: number;
    sessions_affected: number;
  }>;
  errors: Array<{
    message: string;
    count: number;
    sessions: string[];
  }>;
  complaints: Array<{
    pattern: string;
    count: number;
    context: string;
  }>;
}

export interface EvolutionStatus {
  enabled: boolean;
  lastRun: string | null;
  totalRuns: number;
  totalImprovements: number;
  scheduledEnabled: boolean;
  nextScheduledRun: string | null;
}

export interface EvolutionConfig {
  enabled: boolean;
  schedule: string | null;  // cron expression
  autoApply: boolean;       // auto-apply improvements
  requireTests: boolean;    // require tests to pass
  minAccuracy: number;      // minimum accuracy threshold
}
