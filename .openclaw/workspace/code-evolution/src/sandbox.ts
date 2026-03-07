import { exec as execAsync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const exec = promisify(execAsync);

export interface SandboxConfig {
  openclawDir: string;
  sandboxBase: string;
}

export class SandboxRunner {
  private openclawDir: string;
  private sandboxBase: string;

  constructor(config: SandboxConfig) {
    this.openclawDir = config.openclawDir;
    this.sandboxBase = config.sandboxBase;
  }

  /**
   * Create a sandboxed copy of OpenClaw codebase
   */
  async createSandbox(): Promise<string> {
    const sandboxId = `exp-${Date.now()}`;
    const sandboxPath = path.join(this.sandboxBase, sandboxId);

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
  async applyPatch(
    sandboxPath: string,
    file: string,
    search: string,
    replace: string
  ): Promise<{ success: boolean; error?: string }> {
    const filePath = path.join(sandboxPath, file);

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      if (!content.includes(search)) {
        return {
          success: false,
          error: `Search pattern not found in ${file}`
        };
      }

      const newContent = content.replace(search, replace);
      await fs.writeFile(filePath, newContent, 'utf-8');

      console.log(`✅ Patched: ${file}`);
      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: `Failed to patch ${file}: ${error}`
      };
    }
  }

  /**
   * Run TypeScript type checking
   */
  async typeCheck(sandboxPath: string): Promise<{ success: boolean; errors?: string }> {
    console.log(`🔍 Type checking...`);

    try {
      const { stderr } = await exec(
        `cd ${sandboxPath} && npx tsc --noEmit`,
        { timeout: 60000 }
      );

      return { success: true };

    } catch (error: any) {
      return {
        success: false,
        errors: error.stderr || error.message
      };
    }
  }

  /**
   * Run tests in sandbox
   */
  async runTests(sandboxPath: string): Promise<{
    success: boolean;
    passed: number;
    failed: number;
    duration: number;
    output: string;
  }> {
    console.log(`🧪 Running tests...`);

    const start = Date.now();

    try {
      const { stdout, stderr } = await exec(
        `cd ${sandboxPath} && npm test -- --json --silent`,
        { timeout: 180000 } // 3 minutes
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
      } catch {
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

    } catch (error: any) {
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
  async runExperiment(codeChange: {
    patches: Array<{ file: string; search: string; replace: string }>;
  }): Promise<{
    success: boolean;
    sandboxPath?: string;
    typeCheckErrors?: string;
    testResult?: any;
    error?: string;
  }> {
    let sandboxPath: string | undefined;

    try {
      // 1. Create sandbox
      sandboxPath = await this.createSandbox();

      // 2. Apply patches
      for (const patch of codeChange.patches) {
        const result = await this.applyPatch(
          sandboxPath,
          patch.file,
          patch.search,
          patch.replace
        );

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

    } catch (error: any) {
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
  async cleanup(sandboxPath: string): Promise<void> {
    console.log(`🧹 Cleaning up sandbox: ${sandboxPath}`);
    await exec(`rm -rf ${sandboxPath}`);
  }
}
