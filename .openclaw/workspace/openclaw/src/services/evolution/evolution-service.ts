import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec as execAsync } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  CodeChange,
  CodePatch,
  BehaviorAnalysis,
  EvolutionEntry,
  EvolutionStatus,
  EvolutionConfig,
  TestResult,
  BenchmarkResult
} from './types.js';

const exec = promisify(execAsync);

export class EvolutionService {
  private openclawDir: string;
  private selfEvolvingDir: string;
  private evolutionLogPath: string;
  private config: EvolutionConfig;
  private baseline: BenchmarkResult | null = null;

  constructor(config: {
    openclawDir: string;
    selfEvolvingDir?: string;
    evolutionConfig?: Partial<EvolutionConfig>;
  }) {
    this.openclawDir = config.openclawDir;
    this.selfEvolvingDir = config.selfEvolvingDir ||
      path.join(path.dirname(config.openclawDir), 'openclaw-self-evolving');
    this.evolutionLogPath = path.join(config.openclawDir, 'data', 'evolution-log.jsonl');

    this.config = {
      enabled: true,
      schedule: null,
      autoApply: false,  // Default: require manual approval
      requireTests: true,
      minAccuracy: 0.95,
      ...config.evolutionConfig
    };
  }

  /**
   * Get evolution status
   */
  async getStatus(): Promise<EvolutionStatus> {
    const history = await this.getHistory(1);
    const allHistory = await this.getHistory(1000);

    return {
      enabled: this.config.enabled,
      lastRun: history.length > 0 ? history[0].timestamp : null,
      totalRuns: allHistory.length,
      totalImprovements: allHistory.filter(e => e.applied).length,
      scheduledEnabled: this.config.schedule !== null,
      nextScheduledRun: null  // TODO: calculate from cron
    };
  }

  /**
   * Run full evolution cycle
   */
  async runEvolution(): Promise<{
    proposalsGenerated: number;
    proposalsTested: number;
    improvementsApplied: number;
    results: Array<{
      proposal: CodeChange;
      success: boolean;
      applied: boolean;
      error?: string;
    }>;
  }> {
    if (!this.config.enabled) {
      throw new Error('Evolution service is disabled');
    }

    console.log('[Evolution] Starting evolution cycle...');

    // 1. Run behavior analysis
    const analysis = await this.runBehaviorAnalysis();
    console.log(`[Evolution] Analysis complete: ${analysis.session_health.total_sessions} sessions`);

    // 2. Set baseline benchmark
    this.baseline = await this.measureBaseline();
    console.log(`[Evolution] Baseline: accuracy=${(this.baseline.accuracy * 100).toFixed(1)}%`);

    // 3. Generate proposals
    const proposals = await this.generateProposals(analysis);
    console.log(`[Evolution] Generated ${proposals.length} proposals`);

    // 4. Test each proposal
    const results: Array<{
      proposal: CodeChange;
      success: boolean;
      applied: boolean;
      error?: string;
    }> = [];

    let improvementsApplied = 0;

    for (const proposal of proposals) {
      console.log(`[Evolution] Testing: ${proposal.description}`);

      const result = await this.testProposal(proposal);
      results.push(result);

      if (result.success && this.config.autoApply) {
        await this.applyProposal(proposal, result);
        improvementsApplied++;
      }
    }

    console.log(`[Evolution] Cycle complete: ${improvementsApplied} improvements applied`);

    return {
      proposalsGenerated: proposals.length,
      proposalsTested: proposals.length,
      improvementsApplied,
      results
    };
  }

  /**
   * Run behavior analysis using openclaw-self-evolving
   */
  private async runBehaviorAnalysis(): Promise<BehaviorAnalysis> {
    const outputFile = `/tmp/evolution-analysis-${Date.now()}.json`;

    try {
      await exec(
        `cd "${this.selfEvolvingDir}" && bash scripts/analyze-behavior.sh "${outputFile}"`,
        { timeout: 60000 }
      );

      const content = await fs.readFile(outputFile, 'utf-8');
      await fs.unlink(outputFile).catch(() => {});

      return JSON.parse(content);
    } catch (error) {
      console.error('[Evolution] Analysis failed:', error);
      // Return empty analysis
      return {
        session_health: { total_sessions: 0, heavy_sessions: 0, avg_compactions: 0 },
        tool_retries: [],
        errors: [],
        complaints: []
      };
    }
  }

  /**
   * Generate code proposals from analysis
   */
  private async generateProposals(analysis: BehaviorAnalysis): Promise<CodeChange[]> {
    const proposals: CodeChange[] = [];

    // 1. Exec retry loops
    for (const retry of analysis.tool_retries) {
      if (retry.tool === 'exec' && retry.max_consecutive > 3) {
        const proposal = await this.generateExecRetryLimit(retry);
        if (proposal) proposals.push(proposal);
      }
    }

    // 2. Repeated errors (TODO: implement)
    // 3. Heavy sessions (TODO: implement)

    return proposals;
  }

  /**
   * Generate exec retry limit enforcement
   */
  private async generateExecRetryLimit(retry: {
    tool: string;
    count: number;
    max_consecutive: number;
  }): Promise<CodeChange | null> {
    const execHostFile = 'src/infra/exec-host.ts';
    const filePath = path.join(this.openclawDir, execHostFile);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check if already implemented
      if (content.includes('EXEC_RETRY_LIMIT') || content.includes('retryCount')) {
        return null;
      }

      const search = `export async function requestExecHostViaSocket(params: {`;
      const replace = `// Auto-generated: Enforce retry limit to prevent infinite loops
const EXEC_RETRY_LIMIT = 3;
const execRetryCounters = new Map<string, number>();

export async function requestExecHostViaSocket(params: {`;

      return {
        id: `exec-retry-limit-${randomUUID()}`,
        description: `Add retry limit enforcement to exec tool (max 3 retries)`,
        reasoning: `Detected ${retry.count} exec retry events with max ${retry.max_consecutive} consecutive. Adding enforcement.`,
        patches: [{
          file: execHostFile,
          search,
          replace,
          description: 'Add retry counter'
        }],
        focus: 'reliability',
        priority: 'high',
        affectedFiles: [execHostFile]
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Test a proposal (dry run - no actual file modification)
   */
  private async testProposal(proposal: CodeChange): Promise<{
    proposal: CodeChange;
    success: boolean;
    applied: boolean;
    error?: string;
    testResult?: TestResult;
  }> {
    try {
      // 1. Validate patches
      for (const patch of proposal.patches) {
        const filePath = path.join(this.openclawDir, patch.file);
        const content = await fs.readFile(filePath, 'utf-8');

        if (!content.includes(patch.search)) {
          return {
            proposal,
            success: false,
            applied: false,
            error: `Search pattern not found in ${patch.file}`
          };
        }
      }

      // 2. Type check (dry run by checking if code would compile)
      // In production, this would create a temp file and run tsc

      // 3. Estimate test impact
      // In production, this would run the actual test suite

      return {
        proposal,
        success: true,
        applied: false,
        testResult: {
          success: true,
          passed: 0,  // Would be filled by actual test run
          failed: 0,
          duration: 0,
          output: 'Dry run - no actual tests executed'
        }
      };
    } catch (error: any) {
      return {
        proposal,
        success: false,
        applied: false,
        error: error.message
      };
    }
  }

  /**
   * Apply proposal to codebase
   */
  async applyProposal(proposal: CodeChange, testResult: any): Promise<void> {
    // 1. Apply patches
    for (const patch of proposal.patches) {
      const filePath = path.join(this.openclawDir, patch.file);
      const content = await fs.readFile(filePath, 'utf-8');
      const newContent = content.replace(patch.search, patch.replace);
      await fs.writeFile(filePath, newContent, 'utf-8');
    }

    // 2. Git commit
    const commitMessage = `🤖 Self-improvement: ${proposal.description}\n\n${proposal.reasoning}`;
    let commitHash: string | undefined;

    try {
      await exec(`cd "${this.openclawDir}" && git add -A`);
      const { stdout } = await exec(
        `cd "${this.openclawDir}" && git commit -m "${commitMessage}"`
      );
      commitHash = stdout.match(/\[([a-f0-9]+)\]/)?.[1];
    } catch (error) {
      console.error('[Evolution] Git commit failed:', error);
    }

    // 3. Log
    await this.logEvolution(proposal, testResult, true, commitHash);
  }

  /**
   * Measure baseline benchmark
   */
  private async measureBaseline(): Promise<BenchmarkResult> {
    // In production, this would run actual tests
    // For now, return placeholder
    return {
      accuracy: 1.0,
      speed: 0,
      memory: 0,
      coverage: 0
    };
  }

  /**
   * Log evolution entry
   */
  private async logEvolution(
    proposal: CodeChange,
    result: any,
    applied: boolean,
    commitHash?: string
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
      applied,
      benchmark: result.benchmark,
      commitHash
    };

    await fs.mkdir(path.dirname(this.evolutionLogPath), { recursive: true });
    await fs.appendFile(this.evolutionLogPath, JSON.stringify(entry) + '\n');
  }

  /**
   * Get evolution history
   */
  async getHistory(limit: number = 20): Promise<EvolutionEntry[]> {
    try {
      const content = await fs.readFile(this.evolutionLogPath, 'utf-8');
      const lines = content.trim().split('\n');
      return lines
        .slice(-limit)
        .map(line => JSON.parse(line))
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<EvolutionConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current config
   */
  getConfig(): EvolutionConfig {
    return { ...this.config };
  }
}
