---
name: evolution
description: "Self-improving code evolution system for OpenClaw. Analyze codebase, propose improvements, and apply changes with approval. Runs weekly by default (Sundays 2am)."
metadata:
  {
    "openclaw":
      {
        "emoji": "🧬",
        "requires": { "bins": [], "services": ["evolution-service"] },
        "config": { "autoApply": false, "schedule": "cron(0 2 * * 0)" },
      },
  }
---

# Evolution Skill

Self-improving code evolution system that analyzes the OpenClaw codebase, identifies improvement opportunities, and proposes changes for approval.

## Status & Control

Check evolution system status:

```bash
curl -X POST http://localhost:18789/api -d '{"method":"evolution.status"}'
```

Run evolution cycle manually:

```bash
curl -X POST http://localhost:18789/api -d '{"method":"evolution.run"}'
```

View proposal history:

```bash
curl -X POST http://localhost:18789/api -d '{"method":"evolution.history"}'
```

## Configuration

Get current config:

```bash
curl -X POST http://localhost:18789/api -d '{"method":"evolution.config.get"}'
```

Update config (e.g., enable auto-apply - **risky**):

```bash
curl -X POST http://localhost:18789/api -d '{
  "method": "evolution.config.update",
  "params": { "autoApply": true }
}'
```

**Default Config:**
- `autoApply: false` - Proposals require manual approval
- `schedule: "cron(0 2 * * 0)"` - Runs Sundays at 2am
- `maxProposals: 5` - Max proposals per run
- `minConfidence: 0.8` - Minimum confidence score

## Applying Proposals

List pending proposals:

```bash
curl -X POST http://localhost:18789/api -d '{"method":"evolution.history"}' | jq '.pending'
```

Apply a specific proposal:

```bash
curl -X POST http://localhost:18789/api -d '{
  "method": "evolution.proposal.apply",
  "params": { "proposalId": "prop_123" }
}'
```

## MCP Tool Usage

From within the agent, use the MCP tool:

```
mcp_evolution action="status"
mcp_evolution action="run"
mcp_evolution action="history"
mcp_evolution action="apply" proposalId="prop_123"
mcp_evolution action="config"
```

## Safety

- **Auto-apply is OFF by default** - changes require explicit approval
- All proposals are logged with timestamps and confidence scores
- Failed applications are rolled back automatically
- Evolution runs are sandboxed - cannot affect system files

## Workflow

1. Evolution runs automatically on schedule (or manually via `evolution.run`)
2. Analyzes codebase using `openclaw-self-evolving` engine
3. Generates proposals with confidence scores
4. If `autoApply: false`, proposals wait for approval
5. Use `evolution.proposal.apply` to approve and apply changes
6. Check `evolution.history` to review past proposals and outcomes

## Requirements

- `openclaw-self-evolving` repo at `../openclaw-self-evolving` (relative to openclaw directory)
- Gateway running on `localhost:18789`
- Evolution service auto-starts with gateway
