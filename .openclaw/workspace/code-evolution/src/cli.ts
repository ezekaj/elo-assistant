#!/usr/bin/env node
import { EvolutionOrchestrator } from './orchestrator';
import { SandboxRunner } from './sandbox';
import { CodeProposer } from './proposer';
import { Benchmark } from './benchmark';
import fs from 'fs/promises';

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || '/Users/tolga/.openclaw/workspace/openclaw';
const SANDBOX_BASE = process.env.SANDBOX_BASE || '/tmp/openclaw-sandbox';

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'run':
      await runEvolution();
      break;

    case 'test':
      await testSandbox();
      break;

    case 'analyze':
      await analyzeOnly();
      break;

    case 'history':
      await showHistory();
      break;

    case 'help':
    default:
      showHelp();
      break;
  }
}

async function runEvolution() {
  const orchestrator = new EvolutionOrchestrator({
    openclawDir: OPENCLAW_DIR,
    sandboxBase: SANDBOX_BASE
  });

  const analysisFile = process.argv[3];

  try {
    const result = await orchestrator.runEvolutionCycle(analysisFile);
    console.log(`\n✅ Evolution cycle complete`);
    console.log(`   Proposals: ${result.proposalsAnalyzed}`);
    console.log(`   Applied: ${result.improvementsApplied}`);
  } catch (error) {
    console.error(`\n❌ Evolution cycle failed:`, error);
    process.exit(1);
  }
}

async function testSandbox() {
  console.log(`\n🧪 Testing sandbox runner...\n`);

  const sandbox = new SandboxRunner({
    openclawDir: OPENCLAW_DIR,
    sandboxBase: SANDBOX_BASE
  });

  // Test creating a sandbox
  const sandboxPath = await sandbox.createSandbox();
  console.log(`✅ Sandbox created: ${sandboxPath}`);

  // Test a simple patch
  const result = await sandbox.applyPatch(
    sandboxPath,
    'package.json',
    '"name": "openclaw"',
    '"name": "openclaw-test"'
  );
  console.log(`✅ Patch result:`, result);

  // Cleanup
  await sandbox.cleanup(sandboxPath);
  console.log(`✅ Sandbox cleaned up\n`);
}

async function analyzeOnly() {
  const orchestrator = new EvolutionOrchestrator({
    openclawDir: OPENCLAW_DIR,
    sandboxBase: SANDBOX_BASE
  });

  const history = await orchestrator.getHistory(20);

  console.log(`\n📊 Evolution History (last 20):\n`);
  history.forEach((entry, i) => {
    console.log(`${i + 1}. ${entry.timestamp}`);
    console.log(`   Proposal: ${entry.proposal.description}`);
    console.log(`   Applied: ${entry.applied ? '✅' : '❌'}`);
    console.log(`   Tests: ${entry.result.passed} passed, ${entry.result.failed} failed`);
    console.log();
  });
}

async function showHistory() {
  await analyzeOnly();
}

function showHelp() {
  console.log(`
🧬 OpenClaw Code Evolution System

Usage:
  code-evolution run [analysis.json]    Run full evolution cycle
  code-evolution test                   Test sandbox system
  code-evolution analyze                Show evolution history
  code-evolution history                Alias for analyze

Environment Variables:
  OPENCLAW_DIR    Path to OpenClaw codebase (default: ~/workspace/openclaw)
  SANDBOX_BASE    Base path for sandboxes (default: /tmp/openclaw-sandbox)

Examples:
  # Run evolution with existing analysis
  code-evolution run /tmp/analysis.json

  # Run evolution and analyze from scratch
  code-evolution run

  # Test the sandbox system
  code-evolution test

  # View evolution history
  code-evolution history
`);
}

main().catch(console.error);
