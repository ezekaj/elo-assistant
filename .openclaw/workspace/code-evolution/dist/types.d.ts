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
    accuracy: number;
    speed: number;
    memory: number;
    coverage: number;
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
}
export interface BehaviorAnalysis {
    session_health: {
        total_sessions: number;
        heavy_sessions: number;
        avg_compactions: number;
    };
    tool_retries: {
        tool: string;
        count: number;
        max_consecutive: number;
        sessions_affected: number;
    }[];
    errors: {
        message: string;
        count: number;
        sessions: string[];
    }[];
    complaints: {
        pattern: string;
        count: number;
        context: string;
    }[];
}
//# sourceMappingURL=types.d.ts.map