"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvolutionOrchestrator = void 0;
const sandbox_1 = require("./sandbox");
const benchmark_1 = require("./benchmark");
const proposer_1 = require("./proposer");
const promises_1 = __importDefault(require("fs/promises"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const exec = (0, util_1.promisify)(child_process_1.exec);
class EvolutionOrchestrator {
    sandbox;
    benchmark;
    proposer;
    openclawDir;
    evolutionLogPath;
    constructor(config) {
        this.openclawDir = config.openclawDir;
        this.evolutionLogPath = `${config.openclawDir}/data/evolution-log.jsonl`;
        this.sandbox = new sandbox_1.SandboxRunner({
            openclawDir: config.openclawDir,
            sandboxBase: config.sandboxBase
        });
        this.benchmark = new benchmark_1.Benchmark(this.sandbox);
        this.proposer = new proposer_1.CodeProposer(config.openclawDir);
    }
    /**
     * Run a complete evolution cycle
     */
    async runEvolutionCycle(analysisJson) {
        console.log(`\n🧬 === Evolution Cycle Started ===\n`);
        // 1. Load behavior analysis
        let analysis;
        if (analysisJson) {
            const content = await promises_1.default.readFile(analysisJson, 'utf-8');
            analysis = JSON.parse(content);
        }
        else {
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
        const results = [];
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
            }
            else {
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
    async runBehaviorAnalysis() {
        const selfEvolvingDir = `${this.openclawDir}/../openclaw-self-evolving`;
        const outputFile = '/tmp/evolution-analysis.json';
        console.log(`🔍 Running behavior analysis...`);
        try {
            await exec(`cd ${selfEvolvingDir} && bash scripts/analyze-behavior.sh ${outputFile}`, { timeout: 60000 });
            const content = await promises_1.default.readFile(outputFile, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
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
    async testProposal(proposal, baseline) {
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
        const benchmarkResult = await this.benchmark.measure(experiment.sandboxPath);
        const comparison = this.benchmark.compare(baseline, benchmarkResult);
        // Cleanup
        await this.sandbox.cleanup(experiment.sandboxPath);
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
    async applyToMain(proposal, result) {
        for (const patch of proposal.patches) {
            const filePath = `${this.openclawDir}/${patch.file}`;
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            const newContent = content.replace(patch.search, patch.replace);
            await promises_1.default.writeFile(filePath, newContent, 'utf-8');
        }
        // Git commit
        const commitMessage = `🤖 Self-improvement: ${proposal.description}\n\n${proposal.reasoning}`;
        try {
            await exec(`cd ${this.openclawDir} && git add -A`);
            await exec(`cd ${this.openclawDir} && git commit -m "${commitMessage}"`);
            console.log(`✅ Committed: ${proposal.description}`);
        }
        catch (error) {
            console.log(`⚠️  Git commit failed: ${error}`);
        }
        // Log evolution
        await this.logEvolution(proposal, result);
    }
    /**
     * Log evolution entry
     */
    async logEvolution(proposal, result) {
        const entry = {
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
        await promises_1.default.appendFile(this.evolutionLogPath, JSON.stringify(entry) + '\n');
    }
    /**
     * Get evolution history
     */
    async getHistory(limit = 10) {
        try {
            const content = await promises_1.default.readFile(this.evolutionLogPath, 'utf-8');
            const lines = content.trim().split('\n');
            return lines
                .slice(-limit)
                .map(line => JSON.parse(line));
        }
        catch {
            return [];
        }
    }
}
exports.EvolutionOrchestrator = EvolutionOrchestrator;
//# sourceMappingURL=orchestrator.js.map