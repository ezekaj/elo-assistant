"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxRunner = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const exec = (0, util_1.promisify)(child_process_1.exec);
class SandboxRunner {
    openclawDir;
    sandboxBase;
    constructor(config) {
        this.openclawDir = config.openclawDir;
        this.sandboxBase = config.sandboxBase;
    }
    /**
     * Create a sandboxed copy of OpenClaw codebase
     */
    async createSandbox() {
        const sandboxId = `exp-${Date.now()}`;
        const sandboxPath = path_1.default.join(this.sandboxBase, sandboxId);
        console.log(`📦 Creating sandbox: ${sandboxPath}`);
        // Copy OpenClaw to sandbox
        await exec(`cp -r ${this.openclawDir} ${sandboxPath}`);
        // Install dependencies
        console.log(`📦 Installing dependencies...`);
        await exec(`cd ${sandboxPath} && npm install --quiet`, {
            timeout: 120000 // 2 minutes
        });
        return sandboxPath;
    }
    /**
     * Apply a code patch to a file
     */
    async applyPatch(sandboxPath, file, search, replace) {
        const filePath = path_1.default.join(sandboxPath, file);
        try {
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            if (!content.includes(search)) {
                return {
                    success: false,
                    error: `Search pattern not found in ${file}`
                };
            }
            const newContent = content.replace(search, replace);
            await promises_1.default.writeFile(filePath, newContent, 'utf-8');
            console.log(`✅ Patched: ${file}`);
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to patch ${file}: ${error}`
            };
        }
    }
    /**
     * Run TypeScript type checking
     */
    async typeCheck(sandboxPath) {
        console.log(`🔍 Type checking...`);
        try {
            const { stderr } = await exec(`cd ${sandboxPath} && npx tsc --noEmit`, { timeout: 60000 });
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                errors: error.stderr || error.message
            };
        }
    }
    /**
     * Run tests in sandbox
     */
    async runTests(sandboxPath) {
        console.log(`🧪 Running tests...`);
        const start = Date.now();
        try {
            const { stdout, stderr } = await exec(`cd ${sandboxPath} && npm test -- --json --silent`, { timeout: 180000 } // 3 minutes
            );
            const duration = Date.now() - start;
            // Parse Jest JSON output
            try {
                const result = JSON.parse(stdout);
                return {
                    success: result.success,
                    passed: result.numPassedTests || 0,
                    failed: result.numFailedTests || 0,
                    duration,
                    output: stdout
                };
            }
            catch {
                // Fallback if not JSON
                const passed = (stdout.match(/✓/g) || []).length;
                const failed = (stdout.match(/✗|FAIL/g) || []).length;
                return {
                    success: failed === 0,
                    passed,
                    failed,
                    duration,
                    output: stdout + stderr
                };
            }
        }
        catch (error) {
            const duration = Date.now() - start;
            return {
                success: false,
                passed: 0,
                failed: 1,
                duration,
                output: error.stdout + error.stderr
            };
        }
    }
    /**
     * Run full experiment: patch, type check, test
     */
    async runExperiment(codeChange) {
        let sandboxPath;
        try {
            // 1. Create sandbox
            sandboxPath = await this.createSandbox();
            // 2. Apply patches
            for (const patch of codeChange.patches) {
                const result = await this.applyPatch(sandboxPath, patch.file, patch.search, patch.replace);
                if (!result.success) {
                    return {
                        success: false,
                        sandboxPath,
                        error: result.error
                    };
                }
            }
            // 3. Type check
            const typeCheck = await this.typeCheck(sandboxPath);
            if (!typeCheck.success) {
                return {
                    success: false,
                    sandboxPath,
                    typeCheckErrors: typeCheck.errors
                };
            }
            // 4. Run tests
            const testResult = await this.runTests(sandboxPath);
            return {
                success: testResult.success,
                sandboxPath,
                testResult
            };
        }
        catch (error) {
            return {
                success: false,
                sandboxPath,
                error: error.message
            };
        }
    }
    /**
     * Cleanup sandbox
     */
    async cleanup(sandboxPath) {
        console.log(`🧹 Cleaning up sandbox: ${sandboxPath}`);
        await exec(`rm -rf ${sandboxPath}`);
    }
}
exports.SandboxRunner = SandboxRunner;
//# sourceMappingURL=sandbox.js.map