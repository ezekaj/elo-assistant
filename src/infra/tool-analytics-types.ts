/**
 * Tool Analytics Types
 * Shared types for production-grade analytics system
 */

export type TimeRange = "1h" | "24h" | "7d" | "30d" | "90d";

export interface ToolExecutionRecord {
  tool: string;
  skill?: string;
  success: boolean;
  durationMs: number;
  error?: string;
  paramsHash?: string;
  timestamp: number;
  agentId: string;
  sessionId: string;
  context?: Record<string, unknown>;
}

export interface ToolRecommendation {
  tool: string;
  successRate: number;
  avgDuration: number;
  usageCount: number;
  confidence: number;
}

export interface ToolInsights {
  topTools: Array<{
    tool: string;
    calls: number;
    successRate: number;
    avgDuration: number;
  }>;
  failingTools: Array<{
    tool: string;
    errorRate: number;
    commonError: string;
    occurrences: number;
  }>;
  slowTools: Array<{
    tool: string;
    avgDuration: number;
    calls: number;
  }>;
  summary: {
    totalCalls: number;
    overallSuccessRate: number;
    averageDuration: number;
    uniqueTools: number;
  };
}

export interface ToolSelectionPolicy {
  tool: string;
  confidence: number;
  expectedReward: number;
  explorationBonus: number;
}

export interface ToolContext {
  query: string;
  availableTools: string[];
  recentTools: string[];
  memory: string[];
  taskComplexity: number;
}

export interface AnalyticsBackend {
  track(record: ToolExecutionRecord): Promise<void>;
  getToolSuccessRate(tool: string, timeRange?: TimeRange): Promise<number>;
  getInsights(timeRange?: TimeRange): Promise<ToolInsights>;
  getAdaptiveToolInsights?(
    agentId: string,
    context: Record<string, unknown>,
  ): Promise<ToolRecommendation[]>;
  isAvailable(): boolean;
}

export interface AnalyticsConfig {
  enabled: boolean;
  backend: "sqlite" | "pinot" | "clickhouse" | "hybrid";
  pinot?: {
    brokerUrl: string;
    kafkaBrokers: string;
  };
  clickhouse?: {
    host: string;
    database: string;
    username?: string;
    password?: string;
  };
  retention?: {
    hotDays: number;
    coldDays: number;
  };
  rl?: {
    enabled: boolean;
    learningRate: number;
    explorationRate: number;
    batchSize: number;
  };
}
