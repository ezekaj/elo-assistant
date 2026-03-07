import { SandboxRunner } from './sandbox';

export interface BenchmarkSuite {
  name: string;
  tests: string[];
  baseline: BenchmarkResult | null;
}

export interface BenchmarkResult {
  accuracy: number;      // Test pass rate (0-1)
  speed: number;         // Avg test duration (ms)
  memory: number;        // Peak memory (MB) - placeholder
  coverage: number;      // Code coverage % (0-100)
}

export class Benchmark {
  private sandbox: SandboxRunner;
  private baseline: BenchmarkResult | null = null;

  constructor(sandbox: SandboxRunner) {
    this.sandbox = sandbox;
  }

  /**
   * Set baseline benchmark from main codebase
   */
  async setBaseline(openclawDir: string): Promise<BenchmarkResult> {
    console.log(`📊 Setting baseline benchmark...`);

    const result = await this.measure(openclawDir);
    this.baseline = result;

    console.log(`📊 Baseline: accuracy=${(result.accuracy * 100).toFixed(1)}%, speed=${result.speed.toFixed(0)}ms, coverage=${result.coverage.toFixed(1)}%`);

    return result;
  }

  /**
   * Measure performance metrics
   */
  async measure(sandboxPath: string): Promise<BenchmarkResult> {
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
  private async getCoverage(sandboxPath: string): Promise<number> {
    try {
      // Try to parse coverage from test output
      // In production, you'd run: npm test -- --coverage --json
      // For now, return placeholder
      return 0;
    } catch {
      return 0;
    }
  }

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
  } {
    const improvements = {
      accuracy: candidate.accuracy - baseline.accuracy,
      speed: baseline.speed - candidate.speed, // Lower is better
      memory: baseline.memory - candidate.memory, // Lower is better
      coverage: candidate.coverage - baseline.coverage
    };

    // Determine if candidate is better
    const better =
      candidate.accuracy >= baseline.accuracy && // At least as accurate
      improvements.speed >= -baseline.speed * 0.1; // No more than 10% slower

    return {
      better,
      improvements
    };
  }

  /**
   * Get current baseline
   */
  getBaseline(): BenchmarkResult | null {
    return this.baseline;
  }
}
