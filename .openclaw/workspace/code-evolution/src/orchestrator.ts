import { SandboxRunner } from './sandbox';
import { Benchmark } from './benchmark';
import { CodeProposer } from './proposer';
import { BehaviorAnalysis, CodeChange, EvolutionEntry } from './types';
import fs from 'fs/promises';
import { exec as execAsync } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execAsync);

export class EvolutionOrchestrator {
  private sandbox: SandboxRunner;
  private benchmark: Benchmark;
  private proposer: CodeProposer;
  private openclawDir: string;
  private evolutionLogPath: string;

  constructor(config: {
    openclawDir: string;
    sandboxBase: string;
  }) {
    this.openclawDir = config.openclawDir;
    this.evolutionLogPath = `${config.openclawDir}/data/evolution-log.jsonl`;

    this.sandbox = new SandboxRunner({
      openclawDir: config.openclawDir,
      sandboxBase: config.sandboxBase
    });

    this.benchmark = new Benchmark(this.sandbox);
    this.proposer = new CodeProposer(config.openclawDir);
  }

  /**
   * Run a complete evolution cycle
   */
  async runEvolutionCycle(analysisJson?: string): Promise<{
    proposalsAnalyzed: number;
    improvementsApplied: number;
    results: any[];
  }> {
    console.log(`\n🧬 === Evolution Cycle Started ===\n`);

    // 1. Load behavior analysis
    let analysis: BehaviorAnalysis;

    if (analysisJson) {
      const content = await fs.readFile(analysisJson, 'utf-8');
      analysis = JSON.parse(content);
    } else {
      // Run openclaw-self-evolving analysis
      analysis = await this.runBehaviorAnalysis();
    }

    console.log(`📊 Analysis loaded: ${analysis.session_health.total_sessions} sessions`);

    // 2. Set baseline benchmark
    console.log(`\n📊 Setting baseline benchmark...`);
    const baseline = await this.benchmark.setBaseline(this.openclawDir);

    // 3. Generate code proposals
    console.log(`\n💡 Generating code proposals...`);
    const proposals = await this.proposer.proposeFromAnalysis(analysis);
    console.log(`💡 Generated ${proposals.length} proposals`);

    // 4. Test each proposal
    const results: any[] = [];
    let improvementsApplied = 0;

    for (const proposal of proposals) {
      console.log(`\n🧪 Testing proposal: ${proposal.description}`);

      const result = await this.testProposal(proposal, baseline);
      results.push(result);

      // 5. Apply if better
      if (result.success && result.isImprovement) {
        console.log(`✅ Improvement found! Applying...`);
        await this.applyToMain(proposal, result);
        improvementsApplied++;

        // Update baseline
        await this.benchmark.setBaseline(this.openclawDir);
      } else {
        console.log(`⏭️  Proposal did not improve performance`);
      }
    }

    console.log(`\n🧬 === Evolution Cycle Complete ===`);
    console.log(`   Proposals analyzed: ${proposals.length}`);
    console.log(`   Improvements applied: ${improvementsApplied}\n`);

    return {
      proposalsAnalyzed: proposals.length,
      improvementsApplied,
      results
    };
  }

  /**
   * Run openclaw-self-evolving behavior analysis
   */
  private async runBehaviorAnalysis(): Promise<BehaviorAnalysis> {
    const selfEvolvingDir = `${this.openclawDir}/../openclaw-self-evolving`;
    const outputFile = '/tmp/evolution-analysis.json';

    console.log(`🔍 Running behavior analysis...`);

    try {
      await exec(
        `cd ${selfEvolvingDir} && bash scripts/analyze-behavior.sh ${outputFile}`,
        { timeout: 60000 }
      );

      const content = await fs.readFile(outputFile, 'utf-8');
      return JSON.parse(content);

    } catch (error) {
      console.log(`⚠️  Analysis failed, using empty analysis`);
      return {
        session_health: {
          total_sessions: 0,
          heavy_sessions: 0,
          avg_compactions: 0
        },
        tool_retries: [],
        errors: [],
        complaints: []
      };
    }
  }

  /**
   * Test a proposal in sandbox
   */
  private async testProposal(
    proposal: CodeChange,
    baseline: any
  ): Promise<{
    success: boolean;
    isImprovement: boolean;
    testResult?: any;
    benchmark?: any;
    error?: string;
  }> {
    // Create sandbox and run experiment
    const experiment = await this.sandbox.runExperiment({
      patches: proposal.patches
    });

    if (!experiment.success) {
      return {
        success: false,
        isImprovement: false,
        error: experiment.error || experiment.typeCheckErrors
      };
    }

    // Measure performance
    const benchmarkResult = await this.benchmark.measure(experiment.sandboxPath!);
    const comparison = this.benchmark.compare(baseline, benchmarkResult);

    // Cleanup
    await this.sandbox.cleanup(experiment.sandboxPath!);

    return {
      success: experiment.testResult?.success || false,
      isImprovement: comparison.better,
      testResult: experiment.testResult,
      benchmark: benchmarkResult
    };
  }

  /**
   * Apply approved changes to main codebase
   */
  private async applyToMain(
    proposal: CodeChange,
    result: any
  ): Promise<void> {
    for (const patch of proposal.patches) {
      const filePath = `${this.openclawDir}/${patch.file}`;
      const content = await fs.readFile(filePath, 'utf-8');
      const newContent = content.replace(patch.search, patch.replace);
      await fs.writeFile(filePath, newContent, 'utf-8');
    }

    // Git commit
    const commitMessage = `🤖 Self-improvement: ${proposal.description}\n\n${proposal.reasoning}`;

    try {
      await exec(`cd ${this.openclawDir} && git add -A`);
      await exec(`cd ${this.openclawDir} && git commit -m "${commitMessage}"`);
      console.log(`✅ Committed: ${proposal.description}`);
    } catch (error) {
      console.log(`⚠️  Git commit failed: ${error}`);
    }

    // Log evolution
    await this.logEvolution(proposal, result);
  }

  /**
   * Log evolution entry
   */
  private async logEvolution(
    proposal: CodeChange,
    result: any
  ): Promise<void> {
    const entry: EvolutionEntry = {
      timestamp: new Date().toISOString(),
      proposal,
      result: {
        success: result.success,
        passed: result.testResult?.passed || 0,
        failed: result.testResult?.failed || 0,
        duration: result.testResult?.duration || 0
      },
      applied: true,
      benchmark: result.benchmark
    };

    await fs.appendFile(
      this.evolutionLogPath,
      JSON.stringify(entry) + '\n'
    );
  }

  /**
   * Get evolution history
   */
  async getHistory(limit: number = 10): Promise<EvolutionEntry[]> {
    try {
      const content = await fs.readFile(this.evolutionLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      return lines
        .slice(-limit)
        .map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }
}
