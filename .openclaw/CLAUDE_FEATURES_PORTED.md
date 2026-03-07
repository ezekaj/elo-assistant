# Claude Code Core Features Ported to OpenClaw

## Overview

This document describes the core Claude Code features that have been ported to OpenClaw to enhance its capabilities.

---

## ✅ Features Ported

### 1. **Grep Tool** (Full ripgrep implementation)
**File:** `/src/agents/tools/grep.ts`

**Features:**
- Full ripgrep (rg) integration with all Claude Code parameters
- Three output modes: `content`, `files_with_matches`, `count`
- Context lines support (`-A`, `-B`, `-C`, `context`)
- Glob pattern filtering (`--glob`, `include`, `type`)
- Case insensitive search (`-i`)
- Line numbers (`-n`)
- Multiline mode for cross-line patterns
- Pagination with `head_limit` and `offset`
- Automatic exclusion of VCS directories (.git, .svn, etc.)
- Results sorted by modification time (newest first)
- Permission-based path exclusions from config

**Usage Example:**
```typescript
// Search for TODO comments in TypeScript files
grep({
  pattern: 'TODO',
  glob: '*.ts',
  output_mode: 'content',
  '-n': true,
  '-C': 2
})

// Count occurrences across project
grep({
  pattern: 'function.*export',
  output_mode: 'count'
})

// Search with pagination
grep({
  pattern: 'error',
  head_limit: 20,
  offset: 0
})
```

---

### 2. **Task Tool** (Background operations)
**Files:** `/src/agents/tools/task.ts`, `/src/mcp/client.ts`

**Features:**
- Execute long-running commands in background
- Returns immediately with task ID for tracking
- Real-time output streaming via events
- Timeout support with automatic cancellation
- Task status tracking (running, completed, failed, cancelled)
- PID tracking for process management
- Output capture (stdout + stderr)
- Graceful SIGTERM cancellation
- Security validation (blocks dangerous commands)

**Sub-Tools:**
- `task` - Create and start a background task
- `task_get` - Get task status and output
- `task_list` - List all tasks (optionally filtered by status)
- `task_cancel` - Cancel a running task

**Usage Example:**
```typescript
// Start a long-running build
task({
  command: 'npm run build',
  cwd: '/path/to/project',
  timeout: 300, // 5 minutes
  description: 'Building project'
})
// Returns: { taskId: 'task_...', pid: 12345, status: 'running' }

// Check status
task_get({ taskId: 'task_...' })

// Cancel if needed
task_cancel({ taskId: 'task_...' })

// List all running tasks
task_list({ status: 'running' })
```

---

### 3. **MCP Client** (Model Context Protocol)
**File:** `/src/mcp/client.ts`

**Features:**
- Full MCP protocol 2024-11-05 implementation
- Connect to multiple MCP servers simultaneously
- Automatic tool registration from servers
- Real-time tool list change notifications
- JSON-RPC 2.0 message handling
- Automatic reconnection on server disconnect
- Timeout handling (30s default)
- Stdio-based transport

**Usage Example:**
```typescript
import { McpClient, createMcpTools } from './mcp/client.js';

const client = new McpClient();

// Connect to filesystem server
await client.connectServer('filesystem', {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed'],
  timeout: 30000
});

// Connect to git server
await client.connectServer('git', {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-git'],
  cwd: '/path/to/repo'
});

// Get all MCP tools
const mcpTools = createMcpTools(client);

// Call a tool directly
const result = await client.callTool('filesystem/read_file', {
  path: '/path/to/file.txt'
});
```

---

## 🔧 Configuration

### Grep Tool Configuration

Add to `openclaw.json`:

```json
{
  "tools": {
    "grep": {
      "excludePaths": [
        "node_modules",
        ".git",
        "dist",
        "build"
      ],
      "defaultMaxBuffer": 52428800,
      "defaultTimeout": 60
    }
  }
}
```

### Task Tool Configuration

```json
{
  "tools": {
    "task": {
      "defaultTimeout": 0,
      "maxConcurrentTasks": 10,
      "dangerousPatterns": [
        "rm -rf /",
        "mkfs",
        "dd if=/dev/zero"
      ]
    }
  }
}
```

### MCP Configuration

```json
{
  "mcp": {
    "enabled": true,
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"],
        "env": {},
        "timeout": 30000
      },
      "git": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-git"],
        "cwd": "/home/user/project",
        "timeout": 30000
      },
      "postgres": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
        "timeout": 30000
      }
    }
  }
}
```

---

## 📊 Comparison: Before vs After

| Feature | Before | After |
|---------|--------|-------|
| **File Search** | ❌ None | ✅ Full ripgrep with all options |
| **Background Tasks** | ❌ None | ✅ Full task management |
| **MCP Support** | ❌ None | ✅ Full MCP protocol |
| **Web Fetch** | ✅ Excellent | ✅ Excellent (unchanged) |
| **Browser Control** | ✅ CDP | ✅ CDP (unchanged) |
| **Memory** | ✅ Vector | ✅ Vector (unchanged) |

---

## 🚀 Performance Characteristics

### Grep Tool
- **Speed**: Uses ripgrep (10-100x faster than grep)
- **Memory**: 50MB max buffer (configurable)
- **Concurrency**: Safe for concurrent use
- **Respects**: .gitignore, .rgignore

### Task Tool
- **Overhead**: Minimal (direct child_process spawn)
- **Memory**: Output buffered in memory (monitor for large outputs)
- **Timeout**: Configurable per-task
- **Cleanup**: Automatic on process exit

### MCP Client
- **Connection**: Stdio-based (no network overhead)
- **Latency**: Sub-millisecond message parsing
- **Reconnection**: Automatic on server restart
- **Tool Sync**: Real-time via notifications

---

## 🔒 Security Considerations

### Grep Tool
- ✅ Path validation before search
- ✅ Configurable exclusions
- ✅ Read-only operation
- ✅ Max buffer limit (50MB default)

### Task Tool
- ✅ Command validation (blocks dangerous patterns)
- ✅ Timeout enforcement
- ✅ Signal-based cancellation (SIGTERM)
- ⚠️ Runs with user permissions (use sandbox for untrusted code)

### MCP Client
- ✅ Server isolation (separate processes)
- ✅ Timeout enforcement
- ✅ Message validation
- ⚠️ Trust server implementations (review before connecting)

---

## 📝 Migration Guide

### From Claude Code to OpenClaw

If you're migrating from Claude Code, here's the mapping:

| Claude Code | OpenClaw | Notes |
|-------------|----------|-------|
| `Grep(pattern, path)` | `grep({ pattern, path })` | Same functionality |
| `Task(command)` | `task({ command })` | Returns task ID instead of direct output |
| `MCP: server/tool` | `mcp_server_tool` | Naming convention: `mcp_{server}_{tool}` |

---

## 🐛 Known Limitations

1. **Grep Tool**
   - Requires `rg` (ripgrep) to be installed
   - Install: `brew install ripgrep` (macOS) or `apt install ripgrep` (Linux)

2. **Task Tool**
   - Output buffered in memory (not suitable for very large outputs)
   - No interactive input support (stdin is ignored)

3. **MCP Client**
   - Only stdio transport supported (no SSE/WebSocket yet)
   - No automatic server installation (must install manually)

---

## 📚 Additional Resources

- [Ripgrep Documentation](https://github.com/BurntSushi/ripgrep)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)

---

## ✅ Testing

Run the test suite:

```bash
cd /Users/tolga/.openclaw/workspace/openclaw
npm test -- --grep "grep"
npm test -- --grep "task"
```

Manual testing:

```bash
# Test grep
pi -p "Search for TODO in TypeScript files using grep with pattern 'TODO' and glob '*.ts'"

# Test task
pi -p "Run a background task to execute 'sleep 10 && echo done'"

# Test MCP (after configuring servers)
pi -p "List all available MCP tools"
```

---

## 🎯 Next Steps

1. **Install ripgrep** if not already installed
2. **Configure MCP servers** in `openclaw.json`
3. **Test the new tools** with simple queries
4. **Monitor performance** and adjust limits as needed

---

**Last Updated:** 2026-02-23
**OpenClaw Version:** 2026.2.3
**Claude Code Version Reference:** 2.1.50
