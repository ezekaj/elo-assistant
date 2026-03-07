"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeProposer = void 0;
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("fs/promises"));
class CodeProposer {
    openclawDir;
    constructor(openclawDir) {
        this.openclawDir = openclawDir;
    }
    /**
     * Generate code changes based on behavior analysis
     */
    async proposeFromAnalysis(analysis) {
        const proposals = [];
        // 1. Tool retry loops → Add retry limits
        for (const retry of analysis.tool_retries) {
            if (retry.tool === 'exec' && retry.max_consecutive > 3) {
                const proposal = await this.generateExecRetryLimit(retry);
                if (proposal)
                    proposals.push(proposal);
            }
        }
        // 2. Repeated errors → Add error handling
        for (const error of analysis.errors) {
            if (error.count >= 3) {
                const proposal = await this.generateErrorHandling(error);
                if (proposal)
                    proposals.push(proposal);
            }
        }
        // 3. Heavy sessions → Add subagent delegation
        if (analysis.session_health.heavy_sessions > 0) {
            const proposal = await this.generateSubagentDelegation(analysis.session_health);
            if (proposal)
                proposals.push(proposal);
        }
        return proposals;
    }
    /**
     * Generate exec retry limit enforcement
     */
    async generateExecRetryLimit(retry) {
        // Find exec-host.ts file
        const execHostFile = 'src/infra/exec-host.ts';
        try {
            const content = await promises_1.default.readFile(`${this.openclawDir}/${execHostFile}`, 'utf-8');
            // Check if retry limit already exists
            if (content.includes('MAX_RETRIES') || content.includes('retryCount')) {
                console.log(`⏭️  Retry limit already implemented in ${execHostFile}`);
                return null;
            }
            // Generate patch to add retry counter
            const search = `export async function requestExecHostViaSocket(params: {`;
            const replace = `// Auto-generated: Enforce retry limit to prevent infinite loops
const EXEC_RETRY_LIMIT = 3;
const execRetryCounters = new Map<string, number>();

export async function requestExecHostViaSocket(params: {`;
            const patch = {
                file: execHostFile,
                search,
                replace,
                description: 'Add retry counter for exec tool'
            };
            return {
                id: `exec-retry-limit-${(0, crypto_1.randomUUID)()}`,
                description: `Add retry limit enforcement to exec tool (max ${retry.max_consecutive} retries)`,
                reasoning: `Detected ${retry.count} exec retry events across sessions, with max ${retry.max_consecutive} consecutive retries. Adding enforcement to prevent infinite loops.`,
                patches: [patch],
                focus: 'reliability',
                priority: 'high',
                affectedFiles: [execHostFile]
            };
        }
        catch (error) {
            console.log(`⚠️  Could not read ${execHostFile}: ${error}`);
            return null;
        }
    }
    /**
     * Generate error handling improvements
     */
    async generateErrorHandling(error) {
        // This would analyze the error and generate specific fixes
        // For now, return a placeholder
        console.log(`🔍 Analyzing error pattern: ${error.message.substring(0, 50)}...`);
        return null;
    }
    /**
     * Generate subagent delegation logic
     */
    async generateSubagentDelegation(health) {
        // This would add automatic subagent spawning for heavy tasks
        console.log(`🔍 Analyzing heavy sessions: ${health.heavy_sessions}/${health.total_sessions}`);
        return null;
    }
    /**
     * Generate proposal from specific issue
     */
    async proposeFromIssue(issue) {
        // Read the file if specified
        if (issue.file) {
            try {
                const content = await promises_1.default.readFile(`${this.openclawDir}/${issue.file}`, 'utf-8');
                // Analyze and generate patch
                // This is where you'd use an LLM to propose improvements
                console.log(`🔍 Analyzing ${issue.file} for ${issue.type} improvements...`);
            }
            catch (error) {
                console.log(`⚠️  Could not read ${issue.file}`);
            }
        }
        return null;
    }
}
exports.CodeProposer = CodeProposer;
//# sourceMappingURL=proposer.js.map