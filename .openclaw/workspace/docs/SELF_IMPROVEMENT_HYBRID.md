# Self-Improvement Hybrid Architecture for OpenClaw

## Vision

Combine existing tools + custom glue code to create a self-improving OpenClaw.

## Hybrid Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATION LAYER                        │
│  Custom TypeScript - coordinates everything                     │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   EXISTING    │    │   EXISTING    │    │    CUSTOM     │
│   (Use As-Is) │    │  (Adapted)    │    │   (Build New) │
└───────────────┘    └───────────────┘    └───────────────┘
│                    │                    │
│ • Ramsbaby/        │ • DavinciDreams/   │ • Sandbox      │
│   self-evolving    │   patterns         │   Runner       │
│   (AGENTS.md)      │ • MASArena         │ • Benchmark    │
│                    │   eval framework   │   Suite        │
│ • PR-Agent         │ • Ekaterina        │ • TypeScript   │
│   (code review)    │   git patterns     │   Patches      │
│                    │                    │ • Evolution    │
│ • OpenClaw tests   │                    │   Tracker      │
│   (1508 files)     │                    │                │
└───────────────────┴────────────────────┴────────────────┘
```

## Phase 1: Quick Wins (Use Existing)

### 1.1 Install openclaw-self-evolving
**Purpose:** Weekly behavioral analysis
**Effort:** 10 minutes
**Value:** Immediate insights into mistakes

```bash
clawhub install openclaw-self-evolving
bash scripts/setup-wizard.sh
```

**What you get:**
- Tool retry loops detection
- Repeating errors detection
- User frustration patterns
- AGENTS.md violations
- Heavy session warnings
- Unresolved learnings

**Limitation:** Only modifies AGENTS.md, not code

### 1.2 Add PR-Agent to OpenClaw Repo
**Purpose:** Review proposed changes
**Effort:** 15 minutes
**Value:** Automated code review

```bash
# Add GitHub Action to openclaw repo
cat > .github/workflows/pr-agent.yml << 'EOF'
name: PR Agent
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: Codium-ai/pr-agent@main
        env:
          OPENAI_KEY: ${{ secrets.OPENAI_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
EOF
```

**What you get:**
- `/review` - Code review
- `/improve` - Improvement suggestions
- `/describe` - PR description generation
- `/ask` - Ask questions about code

**Limitation:** Reviews changes, doesn't propose them

## Phase 2: Adapt Existing (2-3 hours)

### 2.1 Port Ekaterina's Evolution Tools
**Source:** FUYOH666/Ekaterina
**Pattern:** Git-based self-modification

**Extract:**
```typescript
// src/evolution/tools.ts

// Pattern from Ekaterina's repo_patch tool
export async function repoPatch(
  file: string,
  search: string,
  replace: string
): Promise<PatchResult> {
  const content = await fs.readFile(file, 'utf-8');
  
  if (!content.includes(search)) {
    return { success: false, error: 'Search pattern not found' };
  }
  
  const newContent = content.replace(search, replace);
  await fs.writeFile(file, newContent);
  
  return { success: true };
}

// Pattern from Ekaterina's run_tests tool
export async function runTests(dir: string): Promise<TestResult> {
  const start = Date.now();
  
  // Run TypeScript tests
  const result = await exec(`cd ${dir} && npm test -- --json`);
  
  const output = JSON.parse(result.stdout);
  
  return {
    success: output.success,
    passed: output.numPassedTests,
    failed: output.numFailedTests,
    duration: Date.now() - start,
    coverage: output.coverageMap
  };
}

// Pattern from Ekaterina's evolution_log
export async function logEvolution(
  proposal: Proposal,
  result: TestResult
): Promise<void> {
  const logPath = path.join(openclawDir, 'data/evolution-log.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    proposal: proposal.description,
    files: proposal.files,
    result: {
      success: result.success,
      passed: result.passed,
      failed: result.failed,
      duration: result.duration
    },
    applied: result.success && result.passed > result.failed
  };
  
  await fs.appendFile(logPath, JSON.stringify(entry) + '\n');
}
```

### 2.2 Use MASArena's Evaluation Framework
**Source:** LINs-lab/MASArena
**Pattern:** Benchmark runner + comparison

**Extract concepts:**
```typescript
// src/evolution/benchmark.ts

interface BenchmarkSuite {
  name: string;
  tests: TestCase[];
  baseline: BenchmarkResult;
}

interface BenchmarkResult {
  accuracy: number;      // Test pass rate
  speed: number;         // Avg test duration
  memory: number;        // Peak memory usage
  coverage: number;      // Code coverage %
}

export async function runBenchmark(
  dir: string,
  suite: BenchmarkSuite
): Promise<BenchmarkResult> {
  // 1. Run tests
  const testResult = await runTests(dir);
  
  // 2. Measure speed
  const speed = testResult.duration / testResult.passed;
  
  // 3. Get coverage
  const coverage = await getCoverage(dir);
  
  // 4. Memory usage (via process monitoring)
  const memory = await measurePeakMemory(dir);
  
  return {
    accuracy: testResult.passed / (testResult.passed + testResult.failed),
    speed,
    memory,
    coverage
  };
}

export function compareBenchmarks(
  baseline: BenchmarkResult,
  candidate: BenchmarkResult
): ComparisonResult {
  return {
    better: 
      candidate.accuracy >= baseline.accuracy &&
      candidate.speed <= baseline.speed * 1.1, // Allow 10% slower
    improvements: {
      accuracy: candidate.accuracy - baseline.accuracy,
      speed: baseline.speed - candidate.speed,
      memory: baseline.memory - candidate.memory,
      coverage: candidate.coverage - baseline.coverage
    }
  };
}
```

## Phase 3: Build Custom (3-4 hours)

### 3.1 Sandbox Runner
**Purpose:** Test changes safely

```typescript
// src/evolution/sandbox.ts

export class SandboxRunner {
  private openclawDir: string;
  private sandboxBase: string = '/tmp/openclaw-sandbox';
  
  constructor(openclawDir: string) {
    this.openclawDir = openclawDir;
  }
  
  async createSandbox(): Promise<string> {
    const sandboxId = `exp-${Date.now()}`;
    const sandboxPath = `${this.sandboxBase}/${sandboxId}`;
    
    // Copy entire OpenClaw to sandbox
    await exec(`cp -r ${this.openclawDir} ${sandboxPath}`);
    
    // Install dependencies
    await exec(`cd ${sandboxPath} && npm install --quiet`);
    
    return sandboxPath;
  }
  
  async applyChange(
    sandboxPath: string,
    change: CodeChange
  ): Promise<void> {
    for (const patch of change.patches) {
      const filePath = path.join(sandboxPath, patch.file);
      await repoPatch(filePath, patch.search, patch.replace);
    }
  }
  
  async runExperiment(change: CodeChange): Promise<ExperimentResult> {
    const sandbox = await this.createSandbox();
    
    try {
      // Apply change
      await this.applyChange(sandbox, change);
      
      // Type check
      const typeCheck = await exec(`cd ${sandbox} && npx tsc --noEmit`);
      if (typeCheck.code !== 0) {
        return { success: false, error: 'Type check failed', typeCheckErrors: typeCheck.stderr };
      }
      
      // Run tests
      const testResult = await runTests(sandbox);
      if (!testResult.success) {
        return { success: false, error: 'Tests failed', testResult };
      }
      
      // Run benchmark
      const benchmark = await runBenchmark(sandbox, getCurrentSuite());
      const baseline = await getBaselineBenchmark();
      const comparison = compareBenchmarks(baseline, benchmark);
      
      return {
        success: true,
        testResult,
        benchmark,
        comparison,
        isImprovement: comparison.better
      };
    } finally {
      // Cleanup sandbox
      await exec(`rm -rf ${sandbox}`);
    }
  }
}
```

### 3.2 Code Proposal Generator

```typescript
// src/evolution/proposer.ts

export class CodeProposer {
  private llm: LLMClient;
  
  async proposeImprovement(
    codebase: string,
    focus: 'performance' | 'clean-code' | 'features'
  ): Promise<CodeChange> {
    const prompt = `
You are analyzing the OpenClaw codebase for improvements.

Focus: ${focus}

Key files:
${codebase}

Propose ONE specific, testable improvement:
1. What file to change
2. What to search for (exact code)
3. What to replace it with (exact code)
4. Why this is an improvement

Format as JSON:
{
  "description": "Brief description",
  "file": "path/to/file.ts",
  "search": "exact code to find",
  "replace": "exact code to replace with",
  "reasoning": "Why this helps"
}
`;

    const response = await this.llm.generate(prompt);
    return JSON.parse(response);
  }
  
  async proposeFromError(
    error: ToolError,
    codebase: string
  ): Promise<CodeChange> {
    // When an error is detected, propose a fix
    const prompt = `
OpenClaw encountered this error:
${error.message}

Stack trace:
${error.stack}

Relevant code:
${codebase}

Propose a fix in JSON format (same as above).
`;
    
    const response = await this.llm.generate(prompt);
    return JSON.parse(response);
  }
}
```

### 3.3 Evolution Orchestrator

```typescript
// src/evolution/orchestrator.ts

export class EvolutionOrchestrator {
  private sandbox: SandboxRunner;
  private proposer: CodeProposer;
  private baseline: BenchmarkResult;
  
  async runEvolutionCycle(): Promise<EvolutionResult> {
    // 1. Analyze current state
    const errors = await getRecentErrors();
    const performance = await analyzePerformance();
    
    // 2. Generate proposals
    const proposals: CodeChange[] = [];
    
    // From errors
    for (const error of errors) {
      const fix = await this.proposer.proposeFromError(error, await readCodebase());
      proposals.push(fix);
    }
    
    // From performance analysis
    if (performance.slowAreas.length > 0) {
      const perfFix = await this.proposer.proposeImprovement(
        await readCodebase(),
        'performance'
      );
      proposals.push(perfFix);
    }
    
    // 3. Test each proposal
    const results: ExperimentResult[] = [];
    
    for (const proposal of proposals) {
      console.log(`Testing proposal: ${proposal.description}`);
      const result = await this.sandbox.runExperiment(proposal);
      results.push(result);
      
      // 4. Apply if better
      if (result.success && result.isImprovement) {
        await this.applyToMain(proposal, result);
        await this.updateBaseline(result.benchmark);
        await logEvolution(proposal, result);
        
        // Notify
        await notifyImprovement(proposal, result);
      }
    }
    
    return {
      proposalsAnalyzed: proposals.length,
      improvementsApplied: results.filter(r => r.isImprovement).length,
      results
    };
  }
  
  private async applyToMain(
    proposal: CodeChange,
    result: ExperimentResult
  ): Promise<void> {
    // Apply the change to main codebase
    for (const patch of proposal.patches) {
      await repoPatch(
        path.join(this.openclawDir, patch.file),
        patch.search,
        patch.replace
      );
    }
    
    // Commit
    await exec(`cd ${this.openclawDir} && git add -A`);
    await exec(`cd ${this.openclawDir} && git commit -m "🤖 Self-improvement: ${proposal.description}"`);
    
    console.log(`✅ Applied: ${proposal.description}`);
  }
}
```

### 3.4 Integration with OpenClaw Gateway

```typescript
// src/gateway/evolution-endpoint.ts

// Add to gateway API
router.post('/api/evolution/run', async (req, res) => {
  const orchestrator = new EvolutionOrchestrator();
  const result = await orchestrator.runEvolutionCycle();
  res.json(result);
});

router.get('/api/evolution/log', async (req, res) => {
  const log = await readEvolutionLog();
  res.json(log);
});

router.post('/api/evolution/propose', async (req, res) => {
  const { focus } = req.body;
  const proposer = new CodeProposer();
  const proposal = await proposer.proposeImprovement(await readCodebase(), focus);
  res.json(proposal);
});

// Schedule weekly evolution
cron.schedule('0 2 * * 0', async () => {
  console.log('🔄 Running weekly evolution cycle...');
  const orchestrator = new EvolutionOrchestrator();
  await orchestrator.runEvolutionCycle();
});
```

## Implementation Timeline

| Week | Task | Effort | Status |
|------|------|--------|--------|
| 1 | Install openclaw-self-evolving | 10 min | Ready |
| 1 | Add PR-Agent to repo | 15 min | Ready |
| 1 | Port Ekaterina patterns | 2 hrs | Need to build |
| 2 | Build SandboxRunner | 2 hrs | Need to build |
| 2 | Build Benchmark suite | 1 hr | Need to build |
| 2 | Build CodeProposer | 1 hr | Need to build |
| 3 | Build Orchestrator | 1 hr | Need to build |
| 3 | Wire to Gateway | 1 hr | Need to build |
| 3 | Test end-to-end | 2 hrs | Need to build |

**Total: ~10 hours over 3 weeks**

## Hybrid Architecture Benefits

| Aspect | Using Existing | Building Custom |
|--------|----------------|-----------------|
| Time to value | ✅ Immediate (self-evolving, PR-Agent) | ⚠️ 2-3 weeks |
| Behavioral analysis | ✅ Done (self-evolving) | ❌ Not needed |
| Code review | ✅ Done (PR-Agent) | ❌ Not needed |
| Code modification | ❌ Doesn't exist | ✅ Need to build |
| Testing/benchmark | ⚠️ Tests exist, need runner | ✅ Need to build |
| TypeScript support | ❌ Most are Python | ✅ Need to build |
| OpenClaw-specific | ⚠️ Partial | ✅ Need to build |

## Quick Start Commands

```bash
# 1. Install behavioral evolution
clawhub install openclaw-self-evolving
bash scripts/setup-wizard.sh

# 2. Add PR-Agent (already documented above)
# Create .github/workflows/pr-agent.yml

# 3. Test existing setup
openclaw gateway start
curl http://localhost:18789/api/evolution/status

# 4. When custom code is ready:
curl -X POST http://localhost:18789/api/evolution/run
```

## Next Steps

1. **Now:** Install openclaw-self-evolving (10 min)
2. **Now:** Add PR-Agent to OpenClaw repo (15 min)
3. **This week:** Port Ekaterina patterns (2 hrs)
4. **Next week:** Build SandboxRunner + Benchmarks (3 hrs)
5. **Week 3:** Build Orchestrator + Wire to Gateway (2 hrs)

Start with the quick wins, then iterate.
