"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Benchmark = void 0;
class Benchmark {
    sandbox;
    baseline = null;
    constructor(sandbox) {
        this.sandbox = sandbox;
    }
    /**
     * Set baseline benchmark from main codebase
     */
    async setBaseline(openclawDir) {
        console.log(`📊 Setting baseline benchmark...`);
        const result = await this.measure(openclawDir);
        this.baseline = result;
        console.log(`📊 Baseline: accuracy=${(result.accuracy * 100).toFixed(1)}%, speed=${result.speed.toFixed(0)}ms, coverage=${result.coverage.toFixed(1)}%`);
        return result;
    }
    /**
     * Measure performance metrics
     */
    async measure(sandboxPath) {
        // Run tests and collect metrics
        const testResult = await this.sandbox.runTests(sandboxPath);
        const totalTests = testResult.passed + testResult.failed;
        const accuracy = totalTests > 0 ? testResult.passed / totalTests : 0;
        const speed = totalTests > 0 ? testResult.duration / totalTests : testResult.duration;
        // Get coverage (placeholder - would need actual coverage tool)
        const coverage = await this.getCoverage(sandboxPath);
        // Memory (placeholder - would need process monitoring)
        const memory = 0;
        return {
            accuracy,
            speed,
            memory,
            coverage
        };
    }
    /**
     * Get code coverage
     */
    async getCoverage(sandboxPath) {
        try {
            // Try to parse coverage from test output
            // In production, you'd run: npm test -- --coverage --json
            // For now, return placeholder
            return 0;
        }
        catch {
            return 0;
        }
    }
    /**
     * Compare candidate against baseline
     */
    compare(baseline, candidate) {
        const improvements = {
            accuracy: candidate.accuracy - baseline.accuracy,
            speed: baseline.speed - candidate.speed, // Lower is better
            memory: baseline.memory - candidate.memory, // Lower is better
            coverage: candidate.coverage - baseline.coverage
        };
        // Determine if candidate is better
        const better = candidate.accuracy >= baseline.accuracy && // At least as accurate
            improvements.speed >= -baseline.speed * 0.1; // No more than 10% slower
        return {
            better,
            improvements
        };
    }
    /**
     * Get current baseline
     */
    getBaseline() {
        return this.baseline;
    }
}
exports.Benchmark = Benchmark;
//# sourceMappingURL=benchmark.js.map