# Code Evolution System - Complete

## ✅ What Was Built

I adapted **openclaw-self-evolving** to work with your actual TypeScript codebase. The system now:

1. **Analyzes behavior** (via openclaw-self-evolving)
2. **Generates TypeScript code patches** (not just AGENTS.md rules)
3. **Tests in sandbox** (isolated /tmp environment)
4. **Applies if better** (benchmark comparison)
5. **Git commits automatically**

## 📁 Created Files

```
/Users/tolga/.openclaw/workspace/code-evolution/
├── src/
│   ├── types.ts           # TypeScript types
│   ├── sandbox.ts         # Sandbox runner (copy, patch, test)
│   ├── benchmark.ts       # Performance measurement
│   ├── proposer.ts        # Code patch generator
│   ├── orchestrator.ts    # Main evolution loop
│   └── cli.ts             # CLI interface
├── dist/                  # Compiled JavaScript
├── code-evolution         # Executable wrapper
├── evolve.sh              # One-command evolution
├── package.json
├── tsconfig.json
└── README.md              # Full documentation
```

## 🚀 Quick Start

```bash
# Run full evolution cycle (analysis + code patches)
cd /Users/tolga/.openclaw/workspace/code-evolution
./evolve.sh

# Or run parts separately:
./code-evolution test      # Test sandbox system
./code-evolution run       # Run evolution
./code-evolution history   # View applied improvements
```

## 🧬 How It Works

### Current Setup (What You Have)

```
┌─────────────────────────────────────────┐
│  openclaw-self-evolving (Python/Bash)   │
│  ─────────────────────────────────────  │
│  ✅ Analyzes session logs               │
│  ✅ Detects patterns (retries, errors)  │
│  ✅ Generates proposals                 │
│  ✅ Modifies AGENTS.md                  │
│                                          │
│  ❌ Does NOT modify TypeScript code     │
└─────────────────────────────────────────┘
```

### New System (What I Built)

```
┌─────────────────────────────────────────┐
│  code-evolution (TypeScript)            │
│  ─────────────────────────────────────  │
│  ✅ Uses same analysis                  │
│  ✅ Generates TypeScript patches        │
│  ✅ Tests in sandbox                    │
│  ✅ Compares benchmarks                 │
│  ✅ Applies to main codebase            │
│  ✅ Git commits automatically           │
└─────────────────────────────────────────┘
```

### Combined Flow

```
1. openclaw-self-evolving analyzes sessions
   ↓
2. Generates AGENTS.md proposals (behavioral)
   ↓
3. code-evolution takes same analysis
   ↓
4. Generates TypeScript code patches
   ↓
5. Tests in sandbox (/tmp/openclaw-sandbox/exp-xxx)
   ↓
6. Compares benchmark (accuracy, speed, coverage)
   ↓
7. If better: applies + commits
   ↓
8. Logs to evolution-log.jsonl
```

## 📊 Example: Exec Retry Limit

**Analysis found:** 47 exec retry events, max 54 consecutive retries

**Generated patch:**
```typescript
// File: src/infra/exec-host.ts

// Before:
export async function requestExecHostViaSocket(params: {

// After:
const EXEC_RETRY_LIMIT = 3;
const execRetryCounters = new Map<string, number>();

export async function requestExecHostViaSocket(params: {
  // ... with retry counter enforcement
```

**Testing:**
1. Copies OpenClaw to `/tmp/openclaw-sandbox/exp-1234567890`
2. Applies patch
3. Runs `tsc --noEmit` (type check)
4. Runs `npm test`
5. Compares performance
6. If tests pass + performance not degraded → applies to main

**Commit:**
```
🤖 Self-improvement: Add retry limit enforcement to exec tool

Detected 47 exec retry events across sessions, with max 54 consecutive
retries. Adding enforcement to prevent infinite loops.
```

## 🎯 What Gets Improved

Based on your current analysis:

### 1. Exec Retry Loops (HIGH priority)
- **Problem:** 47 events, max 54 consecutive
- **Fix:** Add retry counter in `src/infra/exec-host.ts`
- **Impact:** Prevents infinite loops, fails fast

### 2. Heavy Sessions (LOW priority)
- **Problem:** 4 sessions with 5+ compactions (max 14)
- **Fix:** Auto-delegate to subagents
- **Impact:** Better context management

### 3. Repeated Errors
- **Problem:** Same error 3+ times
- **Fix:** Add error handling
- **Impact:** Graceful degradation

## 🔧 Architecture

```typescript
// Main orchestrator
class EvolutionOrchestrator {
  async runEvolutionCycle() {
    // 1. Load analysis from openclaw-self-evolving
    const analysis = await this.runBehaviorAnalysis();

    // 2. Set baseline benchmark
    const baseline = await this.benchmark.setBaseline(openclawDir);

    // 3. Generate code proposals
    const proposals = await this.proposer.proposeFromAnalysis(analysis);

    // 4. Test each
    for (const proposal of proposals) {
      const result = await this.testProposal(proposal, baseline);

      // 5. Apply if better
      if (result.isImprovement) {
        await this.applyToMain(proposal, result);
      }
    }
  }
}

// Sandbox runner
class SandboxRunner {
  async runExperiment(change: CodeChange) {
    const sandbox = await this.createSandbox();
    await this.applyPatch(sandbox, change);
    await this.typeCheck(sandbox);
    const tests = await this.runTests(sandbox);
    await this.cleanup(sandbox);
    return tests;
  }
}
```

## ⚙️ Configuration

```bash
# Set custom OpenClaw directory
export OPENCLAW_DIR=/path/to/your/openclaw

# Set sandbox location
export SANDBOX_BASE=/tmp/my-sandboxes

# Run
./evolve.sh
```

## 📈 Next Steps

### Immediate (Works Now)
```bash
# Run evolution
cd /Users/tolga/.openclaw/workspace/code-evolution
./evolve.sh
```

### Week 1: Enhance Proposals
The current system uses template-based patches. To make it smarter:

```typescript
// In proposer.ts, add LLM integration
async generateSmartPatch(analysis: BehaviorAnalysis) {
  const prompt = `
Analyze this OpenClaw behavior pattern and propose a code improvement:

Pattern: ${analysis.tool_retries[0]}
Current code: ${await readFile('src/infra/exec-host.ts')}

Generate a JSON patch:
{
  "file": "path/to/file.ts",
  "search": "exact code to find",
  "replace": "exact code to replace with",
  "reasoning": "why this helps"
}
`;

  const response = await this.llm.generate(prompt);
  return JSON.parse(response);
}
```

### Week 2: Wire to Gateway
```typescript
// In openclaw/src/gateway/routes.ts
import { EvolutionOrchestrator } from '../code-evolution';

router.post('/api/evolution/run', async (req, res) => {
  const orchestrator = new EvolutionOrchestrator({...});
  const result = await orchestrator.runEvolutionCycle();
  res.json(result);
});

// Schedule weekly
cron.schedule('0 2 * * 0', () => orchestrator.runEvolutionCycle());
```

### Week 3: Add Rollback
```typescript
// Track changes for rollback
interface EvolutionEntry {
  timestamp: string;
  proposal: CodeChange;
  commitHash: string;  // Add this
  applied: boolean;
}

async function rollback(entry: EvolutionEntry) {
  await exec(`git revert ${entry.commitHash}`);
}
```

## 🆚 Comparison

| Feature | openclaw-self-evolving | code-evolution |
|---------|------------------------|----------------|
| Analyzes behavior | ✅ | ✅ (reuses) |
| Modifies AGENTS.md | ✅ | ❌ |
| Modifies TypeScript | ❌ | ✅ |
| Tests changes | ❌ | ✅ |
| Benchmark comparison | ❌ | ✅ |
| Git integration | ❌ | ✅ |
| Language | Bash/Python | TypeScript |
| Enforcement | Advisory | Code-level |

## 💡 Key Innovation

**Hybrid approach:**
1. **openclaw-self-evolving** = Identifies problems (behavioral analysis)
2. **code-evolution** = Fixes problems (code patches)

They work together:
- Same analysis → Two types of improvements
- AGENTS.md rules = Behavioral guidance
- Code patches = Hard enforcement

## 📝 Evolution Log

All improvements logged to:
```
/Users/tolga/.openclaw/workspace/openclaw/data/evolution-log.jsonl
```

Format:
```json
{
  "timestamp": "2026-03-02T17:20:00Z",
  "proposal": {
    "description": "Add retry limit to exec",
    "patches": [...]
  },
  "result": {
    "success": true,
    "passed": 1508,
    "failed": 0
  },
  "applied": true,
  "benchmark": {
    "accuracy": 1.0,
    "speed": 42
  }
}
```

## 🎉 Summary

**You now have:**
- ✅ Behavior analysis (from openclaw-self-evolving)
- ✅ Code modification system (code-evolution)
- ✅ Sandbox testing
- ✅ Benchmark comparison
- ✅ Automatic git commits
- ✅ Evolution logging

**Ready to use:**
```bash
cd /Users/tolga/.openclaw/workspace/code-evolution
./evolve.sh
```

The system is adapted specifically for your OpenClaw TypeScript codebase and will generate, test, and apply improvements automatically.
