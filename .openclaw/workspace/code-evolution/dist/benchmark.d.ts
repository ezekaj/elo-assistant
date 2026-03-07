import { SandboxRunner } from './sandbox';
export interface BenchmarkSuite {
    name: string;
    tests: string[];
    baseline: BenchmarkResult | null;
}
export interface BenchmarkResult {
    accuracy: number;
    speed: number;
    memory: number;
    coverage: number;
}
export declare class Benchmark {
    private sandbox;
    private baseline;
    constructor(sandbox: SandboxRunner);
    /**
     * Set baseline benchmark from main codebase
     */
    setBaseline(openclawDir: string): Promise<BenchmarkResult>;
    /**
     * Measure performance metrics
     */
    measure(sandboxPath: string): Promise<BenchmarkResult>;
    /**
     * Get code coverage
     */
    private getCoverage;
    /**
     * Compare candidate against baseline
     */
    compare(baseline: BenchmarkResult, candidate: BenchmarkResult): {
        better: boolean;
        improvements: {
            accuracy: number;
            speed: number;
            memory: number;
            coverage: number;
        };
    };
    /**
     * Get current baseline
     */
    getBaseline(): BenchmarkResult | null;
}
//# sourceMappingURL=benchmark.d.ts.map