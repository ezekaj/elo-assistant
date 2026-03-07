#!/bin/bash
# OpenClaw cleanup and start script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$SCRIPT_DIR/workspace/openclaw"

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    # Remove stale lock files
    find "$SCRIPT_DIR" -name "*.lock" -mmin +60 -delete 2>/dev/null || true
}

# Run cleanup
cleanup

# Start OpenClaw with passed arguments
cd "$WORKSPACE_DIR"
exec node scripts/run-node.mjs "$@"
