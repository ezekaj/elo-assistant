export interface SandboxConfig {
    openclawDir: string;
    sandboxBase: string;
}
export declare class SandboxRunner {
    private openclawDir;
    private sandboxBase;
    constructor(config: SandboxConfig);
    /**
     * Create a sandboxed copy of OpenClaw codebase
     */
    createSandbox(): Promise<string>;
    /**
     * Apply a code patch to a file
     */
    applyPatch(sandboxPath: string, file: string, search: string, replace: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Run TypeScript type checking
     */
    typeCheck(sandboxPath: string): Promise<{
        success: boolean;
        errors?: string;
    }>;
    /**
     * Run tests in sandbox
     */
    runTests(sandboxPath: string): Promise<{
        success: boolean;
        passed: number;
        failed: number;
        duration: number;
        output: string;
    }>;
    /**
     * Run full experiment: patch, type check, test
     */
    runExperiment(codeChange: {
        patches: Array<{
            file: string;
            search: string;
            replace: string;
        }>;
    }): Promise<{
        success: boolean;
        sandboxPath?: string;
        typeCheckErrors?: string;
        testResult?: any;
        error?: string;
    }>;
    /**
     * Cleanup sandbox
     */
    cleanup(sandboxPath: string): Promise<void>;
}
//# sourceMappingURL=sandbox.d.ts.map