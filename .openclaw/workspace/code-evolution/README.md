# OpenClaw Code Evolution System

**Self-evolving code for OpenClaw** - Automatically analyzes behavior, generates TypeScript patches, tests in sandbox, and applies improvements.

## 🧬 What It Does

```
┌─────────────────────────────────────────────────────────────┐
│  Behavior Analysis (from openclaw-self-evolving)            │
│  • Tool retry loops                                          │
│  • Repeated errors                                           │
│  • Heavy sessions                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Code Proposal Generation                                    │
│  • Generate TypeScript patches                               │
│  • Focus on reliability, performance, clean-code             │
│  • Specific to YOUR codebase                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Sandbox Testing                                             │
│  • Copy OpenClaw to /tmp/sandbox                             │
│  • Apply patches                                             │
│  • Type check (tsc --noEmit)                                 │
│  • Run tests (npm test)                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Benchmark Comparison                                        │
│  • Accuracy (test pass rate)                                 │
│  • Speed (avg test duration)                                 │
│  • Coverage (code coverage %)                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Apply if Better                                             │
│  • Apply to main codebase                                    │
│  • Git commit: "🤖 Self-improvement: ..."                   │
│  • Log to evolution-log.jsonl                                │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

```bash
# 1. Build the system
cd /Users/tolga/.openclaw/workspace/code-evolution
npm install
npm run build

# 2. Test the sandbox system
npm run dev test

# 3. Run evolution cycle
npm run dev run

# 4. View history
npm run dev history
```

## 📋 Commands

### `code-evolution run [analysis.json]`

Run full evolution cycle:
1. Load behavior analysis (or run from scratch)
2. Generate code proposals
3. Test each in sandbox
4. Apply if better than baseline

```bash
# With existing analysis
npm run dev run /tmp/analysis.json

# From scratch (runs openclaw-self-evolving analysis)
npm run dev run
```

### `code-evolution test`

Test the sandbox system:
- Creates a sandbox
- Applies a test patch
- Cleans up

```bash
npm run dev test
```

### `code-evolution history`

Show evolution history (last 20 improvements)

```bash
npm run dev history
```

## 🔧 Configuration

Environment variables:

```bash
# OpenClaw codebase location
export OPENCLAW_DIR=/Users/tolga/.openclaw/workspace/openclaw

# Sandbox base path
export SANDBOX_BASE=/tmp/openclaw-sandbox
```

## 📊 How It Works

### 1. Behavior Analysis

Uses `openclaw-self-evolving` to analyze:
- Tool retry loops (exec called 5+ times)
- Repeated errors (same error 3+ times)
- Heavy sessions (5+ compactions)

### 2. Code Proposal Generation

For each issue, generates specific TypeScript patches:

**Example: Exec Retry Limit**
```typescript
// Before:
export async function requestExecHostViaSocket(params: {

// After:
const EXEC_RETRY_LIMIT = 3;
const execRetryCounters = new Map<string, number>();

export async function requestExecHostViaSocket(params: {
  // ... with retry counter check
```

### 3. Sandbox Testing

Each proposal is tested in isolation:
```bash
/tmp/openclaw-sandbox/exp-1234567890/
  ├── src/           # OpenClaw source
  ├── node_modules/  # Installed dependencies
  └── package.json
```

### 4. Benchmark Comparison

Measures:
- **Accuracy**: Test pass rate
- **Speed**: Average test duration
- **Coverage**: Code coverage %

A proposal is accepted if:
- Accuracy ≥ baseline
- Speed ≤ 110% of baseline (max 10% slower)

### 5. Git Integration

Applied changes are automatically committed:
```
🤖 Self-improvement: Add retry limit enforcement to exec tool

Detected 47 exec retry events across sessions, with max 54 consecutive
retries. Adding enforcement to prevent infinite loops.
```

## 📁 File Structure

```
code-evolution/
├── src/
│   ├── types.ts           # Type definitions
│   ├── sandbox.ts         # Sandbox runner
│   ├── benchmark.ts       # Benchmark system
│   ├── proposer.ts        # Code proposal generator
│   ├── orchestrator.ts    # Main orchestrator
│   └── cli.ts             # CLI interface
├── dist/                  # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## 🔗 Integration with OpenClaw

### Add to Gateway

```typescript
// In gateway routes
import { EvolutionOrchestrator } from './code-evolution';

router.post('/api/evolution/run', async (req, res) => {
  const orchestrator = new EvolutionOrchestrator({
    openclawDir: process.env.OPENCLAW_DIR,
    sandboxBase: '/tmp/openclaw-sandbox'
  });

  const result = await orchestrator.runEvolutionCycle();
  res.json(result);
});

router.get('/api/evolution/history', async (req, res) => {
  const orchestrator = new EvolutionOrchestrator({...});
  const history = await orchestrator.getHistory();
  res.json(history);
});
```

### Schedule Weekly Evolution

```typescript
// In gateway cron
import { EvolutionOrchestrator } from './code-evolution';

cron.schedule('0 2 * * 0', async () => {
  console.log('🔄 Running weekly evolution...');
  const orchestrator = new EvolutionOrchestrator({...});
  await orchestrator.runEvolutionCycle();
});
```

## 🎯 Example Improvements

### 1. Exec Retry Limit
**Problem**: 47 retry events, max 54 consecutive
**Solution**: Add retry counter, limit to 3
**File**: `src/infra/exec-host.ts`

### 2. Subagent Delegation
**Problem**: 4 heavy sessions (5+ compactions)
**Solution**: Auto-spawn subagent for complex tasks
**File**: `src/orchestration/subagent-spawner.ts`

### 3. Error Handling
**Problem**: Same error repeated 3+ times
**Solution**: Add early detection and graceful handling
**File**: Depends on error pattern

## ⚠️ Safety

- **Sandbox isolation**: Tests never touch main codebase
- **Type checking**: All patches must compile
- **Test suite**: Must pass existing tests
- **Benchmark gate**: Only applies if performance doesn't degrade
- **Git history**: All changes tracked

## 📈 Future Enhancements

- [ ] LLM-powered proposal generation (currently template-based)
- [ ] Memory profiling
- [ ] Coverage-based optimization
- [ ] Multi-file refactoring
- [ ] Rollback mechanism
- [ ] A/B testing (keep both versions, measure which performs better)

## 🤝 Relationship with openclaw-self-evolving

```
openclaw-self-evolving  →  Analyzes behavior, generates AGENTS.md rules
         ↓
code-evolution         →  Takes same analysis, generates CODE patches
```

They work together:
1. **openclaw-self-evolving** identifies problems (e.g., exec retries)
2. **code-evolution** fixes them in code (e.g., adds retry limit)
3. Both log to same evolution log

## 📝 License

MIT

---

Built for OpenClaw by adapting openclaw-self-evolving to work with actual TypeScript code.
