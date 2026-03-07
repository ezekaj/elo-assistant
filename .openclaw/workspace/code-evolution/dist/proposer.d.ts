import { CodeChange, BehaviorAnalysis } from './types';
export declare class CodeProposer {
    private openclawDir;
    constructor(openclawDir: string);
    /**
     * Generate code changes based on behavior analysis
     */
    proposeFromAnalysis(analysis: BehaviorAnalysis): Promise<CodeChange[]>;
    /**
     * Generate exec retry limit enforcement
     */
    private generateExecRetryLimit;
    /**
     * Generate error handling improvements
     */
    private generateErrorHandling;
    /**
     * Generate subagent delegation logic
     */
    private generateSubagentDelegation;
    /**
     * Generate proposal from specific issue
     */
    proposeFromIssue(issue: {
        type: 'performance' | 'reliability' | 'clean-code';
        description: string;
        file?: string;
    }): Promise<CodeChange | null>;
}
//# sourceMappingURL=proposer.d.ts.map