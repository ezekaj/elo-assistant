import { EvolutionEntry } from './types';
export declare class EvolutionOrchestrator {
    private sandbox;
    private benchmark;
    private proposer;
    private openclawDir;
    private evolutionLogPath;
    constructor(config: {
        openclawDir: string;
        sandboxBase: string;
    });
    /**
     * Run a complete evolution cycle
     */
    runEvolutionCycle(analysisJson?: string): Promise<{
        proposalsAnalyzed: number;
        improvementsApplied: number;
        results: any[];
    }>;
    /**
     * Run openclaw-self-evolving behavior analysis
     */
    private runBehaviorAnalysis;
    /**
     * Test a proposal in sandbox
     */
    private testProposal;
    /**
     * Apply approved changes to main codebase
     */
    private applyToMain;
    /**
     * Log evolution entry
     */
    private logEvolution;
    /**
     * Get evolution history
     */
    getHistory(limit?: number): Promise<EvolutionEntry[]>;
}
//# sourceMappingURL=orchestrator.d.ts.map