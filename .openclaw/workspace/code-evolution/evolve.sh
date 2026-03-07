#!/bin/bash
# ============================================================
# evolve.sh - Run complete evolution cycle
# Combines openclaw-self-evolving analysis with code-evolution
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF_EVOLVING_DIR="${SCRIPT_DIR}/../openclaw-self-evolving"
CODE_EVOLUTION="${SCRIPT_DIR}/code-evolution"

echo ""
echo "🧬 =================================="
echo "🧬 OpenClaw Evolution System"
echo "🧬 =================================="
echo ""

# Step 1: Run behavior analysis
echo "📊 Step 1: Analyzing behavior..."
ANALYSIS_FILE="/tmp/evolution-analysis-$$.json"

cd "$SELF_EVOLVING_DIR"
bash scripts/analyze-behavior.sh "$ANALYSIS_FILE" >/dev/null 2>&1

if [ ! -f "$ANALYSIS_FILE" ]; then
  echo "❌ Analysis failed"
  exit 1
fi

echo "✅ Analysis complete"

# Step 2: Generate AGENTS.md proposals (original self-evolving)
echo ""
echo "📝 Step 2: Generating AGENTS.md proposals..."
bash scripts/generate-proposal.sh 2>&1 | tail -30

# Step 3: Generate and test code proposals
echo ""
echo "🔧 Step 3: Generating and testing code proposals..."
cd "$SCRIPT_DIR"
"$CODE_EVOLUTION" run "$ANALYSIS_FILE"

# Cleanup
rm -f "$ANALYSIS_FILE"

echo ""
echo "✅ Evolution cycle complete!"
echo ""
