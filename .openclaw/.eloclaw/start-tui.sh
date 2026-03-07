#!/bin/bash
# OpenClaw TUI start script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$SCRIPT_DIR/workspace/openclaw"

# Start OpenClaw TUI
cd "$WORKSPACE_DIR"
exec node scripts/run-node.mjs tui "$@"
