# 📋 100% CLAUDE CODE PARITY - COMPREHENSIVE IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Achieve 100% Claude Code feature parity with OpenClaw
**Status:** Ready for implementation

---

## 🎯 EXECUTIVE SUMMARY

This plan implements all missing features to achieve **100% Claude Code parity**:

1. **Session Teleport System** - Multi-device session transfer
2. **Advanced Plugin Hooks** - Prompt, Agent, HTTP hooks
3. **Plugin Marketplace Enhancements** - Git install, LSP, auto-update
4. **Complete TUI Integration** - All features accessible in TUI

---

## 📊 CURRENT STATUS

| Feature | Status | Priority |
|---------|--------|----------|
| Core Tools | ✅ 100% | N/A |
| JSON Schema Validation | ✅ 100% | N/A |
| Tool Choice | ✅ 100% | N/A |
| Effort Levels | ✅ 100% | N/A |
| WebFetch Domains | ✅ 100% | N/A |
| Plugin Hooks (Core) | ✅ 85% | N/A |
| **Session Teleport** | ❌ 0% | 🔴 HIGH |
| **Prompt Hooks** | ❌ 0% | 🟡 MEDIUM |
| **Agent Hooks** | ❌ 0% | 🟡 MEDIUM |
| **Git Install** | ❌ 0% | 🟡 MEDIUM |
| **LSP Servers** | ❌ 0% | 🟢 LOW |
| **Auto-update** | ❌ 0% | 🟢 LOW |

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPENCLAW 100% PARITY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Session    │    │   Plugin     │    │   Plugin     │      │
│  │   Teleport   │    │   Hooks      │    │ Marketplace  │      │
│  │   System     │    │   System     │    │   System     │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │   TUI Layer     │                          │
│                    │  (Unified UI)   │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │  Core Services  │                          │
│                    │  (Gateway/API)  │                          │
│                    └─────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 NEW FILE STRUCTURE

```
src/
├── teleport/                          # NEW: Session Teleport System
│   ├── types.ts                       # Teleport types
│   ├── teleport-api.ts                # Remote session API
│   ├── git-integration.ts             # Git operations
│   ├── stash-manager.ts               # Auto-stash management
│   ├── teleport-executor.ts           # Main teleport logic
│   └── index.ts                       # Public exports
│
├── hooks/                             # ENHANCED: Plugin Hooks
│   ├── types.ts                       # Enhanced with all hook types
│   ├── prompt-hook.ts                 # NEW: LLM-based hooks
│   ├── agent-hook.ts                  # NEW: Subagent hooks
│   ├── http-hook.ts                   # NEW: Webhook hooks
│   └── executor.ts                    # Enhanced executor
│
├── plugins/                           # ENHANCED: Marketplace
│   ├── install-git.ts                 # NEW: Git installation
│   ├── install-url.ts                 # NEW: URL installation
│   ├── lsp-server.ts                  # NEW: LSP server support
│   ├── auto-update.ts                 # NEW: Auto-update tracking
│   └── manifest.ts                    # Enhanced manifest
│
├── tui/                               # ENHANCED: TUI Integration
│   ├── teleport-panel.ts              # NEW: Teleport UI
│   ├── hooks-panel.ts                 # NEW: Hooks UI
│   └── commands.ts                    # Enhanced commands
│
└── gateway/
    └── server-methods/
        ├── teleport.ts                # NEW: Teleport API endpoints
        └── sessions.ts                # Enhanced sessions
```

---

## 🔧 IMPLEMENTATION PHASES

### **Phase 1: Session Teleport System** (Critical)

#### **1.1 Type Definitions** (`src/teleport/types.ts`)

```typescript
// Teleport session info
export interface TeleportedSessionInfo {
  isTeleported: boolean;
  hasLoggedFirstMessage: boolean;
  sessionId: string;
  teleportedAt: Date;
  originalDevice?: string;
  branch?: string;
}

// Teleport options
export interface TeleportOptions {
  sessionId: string;
  branch?: string;
  stashChanges?: boolean;
  validateGit?: boolean;
}

// Teleport result
export interface TeleportResult {
  success: boolean;
  messages: SessionMessage[];
  branch?: string;
  error?: string;
}

// Session API response
export interface SessionAPIResponse {
  sessionId: string;
  messages: SessionMessage[];
  branch: string;
  title: string;
  createdAt: Date;
}
```

#### **1.2 Teleport State Management** (`src/teleport/teleport-state.ts`)

```typescript
import type { TeleportedSessionInfo } from './types.js';

const state = {
  teleportedSessionInfo: null as TeleportedSessionInfo | null,
};

export function setTeleportedSessionInfo(info: TeleportedSessionInfo) {
  state.teleportedSessionInfo = info;
}

export function getTeleportedSessionInfo(): TeleportedSessionInfo | null {
  return state.teleportedSessionInfo;
}

export function markFirstTeleportMessageLogged() {
  if (state.teleportedSessionInfo) {
    state.teleportedSessionInfo.hasLoggedFirstMessage = true;
  }
}

export function clearTeleportedSessionInfo() {
  state.teleportedSessionInfo = null;
}
```

#### **1.3 Git Integration** (`src/teleport/git-integration.ts`)

```typescript
import { execa } from 'execa';

export async function isGitClean(options: { ignoreUntracked?: boolean } = {}): Promise<boolean> {
  try {
    const args = ['status', '--porcelain'];
    if (options.ignoreUntracked) {
      args.push('--untracked-files=no');
    }
    const { stdout } = await execa('git', args);
    return stdout.trim() === '';
  } catch {
    return false;
  }
}

export async function validateGitWorkingDirectory(): Promise<void> {
  const clean = await isGitClean({ ignoreUntracked: true });
  if (!clean) {
    throw new Error(
      'Git working directory is not clean. Please commit or stash your changes before teleporting.'
    );
  }
}

export async function fetchBranch(branch: string): Promise<void> {
  await execa('git', ['fetch', 'origin', branch]);
}

export async function checkoutBranch(branch: string): Promise<void> {
  await execa('git', ['checkout', branch]);
}

export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout.trim();
}

export async function stashChanges(message?: string): Promise<void> {
  const args = ['stash', 'push'];
  if (message) {
    args.push('-m', message);
  }
  await execa('git', args);
}

export async function popStash(): Promise<void> {
  await execa('git', ['stash', 'pop']);
}
```

#### **1.4 Session API Client** (`src/teleport/teleport-api.ts`)

```typescript
import type { SessionAPIResponse } from './types.js';

export interface TeleportAPIClient {
  fetchSession(sessionId: string): Promise<SessionAPIResponse>;
  fetchSessionLogs(sessionId: string): Promise<SessionMessage[]>;
}

export function createTeleportAPIClient(apiKey: string): TeleportAPIClient {
  const baseUrl = process.env.OPENCLAW_TELEPORT_API_URL || 'https://api.openclaw.dev';
  
  return {
    async fetchSession(sessionId: string): Promise<SessionAPIResponse> {
      const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch session: ${response.statusText}`);
      }
      
      return response.json() as Promise<SessionAPIResponse>;
    },
    
    async fetchSessionLogs(sessionId: string): Promise<SessionMessage[]> {
      const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}/logs`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch session logs: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.messages || [];
    },
  };
}
```

#### **1.5 Teleport Executor** (`src/teleport/teleport-executor.ts`)

```typescript
import type { TeleportOptions, TeleportResult } from './types.js';
import { setTeleportedSessionInfo, markFirstTeleportMessageLogged } from './teleport-state.js';
import {
  validateGitWorkingDirectory,
  fetchBranch,
  checkoutBranch,
  stashChanges,
  popStash,
} from './git-integration.js';
import { createTeleportAPIClient } from './teleport-api.js';

export async function executeTeleport(options: TeleportOptions): Promise<TeleportResult> {
  const apiKey = process.env.OPENCLAW_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      messages: [],
      error: 'API key required. Set OPENCLAW_API_KEY environment variable.',
    };
  }
  
  const api = createTeleportAPIClient(apiKey);
  
  try {
    // 1. Validate git working directory
    if (options.validateGit !== false) {
      await validateGitWorkingDirectory();
    }
    
    // 2. Fetch session from API
    const session = await api.fetchSession(options.sessionId);
    const messages = await api.fetchSessionLogs(options.sessionId);
    
    // 3. Stash changes if needed
    if (options.stashChanges) {
      await stashChanges('Teleport auto-stash');
    }
    
    // 4. Fetch and checkout branch
    const branch = options.branch || session.branch;
    if (branch) {
      await fetchBranch(branch);
      await checkoutBranch(branch);
    }
    
    // 5. Set teleported session info
    setTeleportedSessionInfo({
      isTeleported: true,
      hasLoggedFirstMessage: false,
      sessionId: options.sessionId,
      teleportedAt: new Date(),
      branch,
    });
    
    // 6. Mark first message as logged
    markFirstTeleportMessageLogged();
    
    return {
      success: true,
      messages,
      branch,
    };
  } catch (error) {
    return {
      success: false,
      messages: [],
      error: error instanceof Error ? error.message : 'Teleport failed',
    };
  }
}

export async function completeTeleport(): Promise<void> {
  // Pop stash if it exists
  try {
    await popStash();
  } catch {
    // No stash to pop
  }
}
```

---

### **Phase 2: Advanced Plugin Hooks** (High Priority)

#### **2.1 Prompt Hook** (`src/hooks/prompt-hook.ts`)

```typescript
import type { HookConfig, HookOutput } from './types.js';
import { validateHookOutput } from './output-schema.js';

export interface PromptHookConfig extends HookConfig {
  type: 'prompt';
  prompt: string;
  model?: string;
  timeout?: number;
}

export async function executePromptHook(
  config: PromptHookConfig,
  context: Record<string, unknown>
): Promise<HookOutput | null> {
  const model = config.model || process.env.OPENCLAW_HOOK_MODEL || 'claude-sonnet-4-6';
  const timeout = (config.timeout || 30) * 1000;
  
  // Build prompt with context
  const systemPrompt = 'You are evaluating a condition. Reply with ONLY valid JSON.';
  const userPrompt = `${config.prompt}\n\nContext: ${JSON.stringify(context, null, 2)}`;
  
  // Call LLM API
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2024-01-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.content[0]?.text || '';
    
    // Parse JSON output
    try {
      const output = JSON.parse(content);
      const validation = validateHookOutput(output);
      return validation.valid ? validation.data : null;
    } catch {
      return null;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Prompt hook error:', error);
    return null;
  }
}
```

#### **2.2 Agent Hook** (`src/hooks/agent-hook.ts`)

```typescript
import type { HookConfig, HookOutput } from './types.js';

export interface AgentHookConfig extends HookConfig {
  type: 'agent';
  prompt: string;
  tools?: string[];
  maxTurns?: number;
  timeout?: number;
}

export async function executeAgentHook(
  config: AgentHookConfig,
  context: Record<string, unknown>
): Promise<HookOutput | null> {
  // Spawn subagent with tools
  // This integrates with existing subagent system
  const { runSubagent } = await import('../agents/subagent-runner.js');
  
  const result = await runSubagent({
    prompt: config.prompt,
    tools: config.tools || [],
    maxTurns: config.maxTurns || 10,
    context,
  });
  
  // Parse agent output as hook output
  try {
    const output = JSON.parse(result.finalResponse);
    return output as HookOutput;
  } catch {
    return null;
  }
}
```

#### **2.3 HTTP Hook** (`src/hooks/http-hook.ts`)

```typescript
import type { HookConfig, HookOutput } from './types.js';

export interface HTTPHookConfig extends HookConfig {
  type: 'http';
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  timeout?: number;
}

export async function executeHTTPHook(
  config: HTTPHookConfig,
  context: Record<string, unknown>
): Promise<HookOutput | null> {
  const timeout = (config.timeout || 30) * 1000;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify({ context, event: 'hook_trigger' }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP hook error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as HookOutput;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('HTTP hook error:', error);
    return null;
  }
}
```

---

### **Phase 3: Plugin Marketplace Enhancements** (Medium Priority)

#### **3.1 Git Installation** (`src/plugins/install-git.ts`)

```typescript
import { execa } from 'execa';
import { installPluginFromPackageDir } from './install.js';

export interface GitInstallOptions {
  repo: string;
  ref?: string; // branch, tag, or SHA
  subdir?: string;
}

export async function installPluginFromGit(options: GitInstallOptions): Promise<{
  ok: boolean;
  error?: string;
  pluginId?: string;
}> {
  const tempDir = `/tmp/openclaw-plugin-${Date.now()}`;
  
  try {
    // Clone repository
    const cloneArgs = ['clone', options.repo, tempDir];
    if (options.ref) {
      cloneArgs.push('--branch', options.ref, '--depth', '1');
    }
    await execa('git', cloneArgs);
    
    // Handle subdirectory
    const pluginDir = options.subdir 
      ? `${tempDir}/${options.subdir}` 
      : tempDir;
    
    // Install from directory
    const result = await installPluginFromPackageDir({
      packageDir: pluginDir,
    });
    
    // Cleanup
    await execa('rm', ['-rf', tempDir]);
    
    return result;
  } catch (error) {
    await execa('rm', ['-rf', tempDir]).catch(() => {});
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Git install failed',
    };
  }
}
```

#### **3.2 Auto-update System** (`src/plugins/auto-update.ts`)

```typescript
import { loadPluginRegistry } from './registry.js';
import { installPluginFromNpmSpec } from './install.js';

export interface PluginUpdateInfo {
  pluginId: string;
  currentVersion: string;
  availableVersion: string;
  needsUpdate: boolean;
}

export async function checkForUpdates(): Promise<PluginUpdateInfo[]> {
  const registry = loadPluginRegistry();
  const updates: PluginUpdateInfo[] = [];
  
  for (const plugin of registry.plugins) {
    if (plugin.installSource !== 'npm') continue;
    
    try {
      // Check npm for latest version
      const response = await fetch(`https://registry.npmjs.org/${plugin.packageName}/latest`);
      const data = await response.json();
      const latestVersion = data.version;
      
      if (latestVersion !== plugin.version) {
        updates.push({
          pluginId: plugin.id,
          currentVersion: plugin.version,
          availableVersion: latestVersion,
          needsUpdate: true,
        });
      }
    } catch {
      // Skip on error
    }
  }
  
  return updates;
}

export async function updatePlugin(pluginId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const registry = loadPluginRegistry();
  const plugin = registry.plugins.find(p => p.id === pluginId);
  
  if (!plugin || plugin.installSource !== 'npm') {
    return { ok: false, error: 'Plugin not found or not npm-installed' };
  }
  
  try {
    await installPluginFromNpmSpec({
      npmSpec: `${plugin.packageName}@latest`,
    });
    
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Update failed',
    };
  }
}

export async function updateAllPlugins(): Promise<{
  updated: number;
  failed: number;
  errors: string[];
}> {
  const updates = await checkForUpdates();
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const update of updates) {
    const result = await updatePlugin(update.pluginId);
    if (result.ok) {
      updated++;
    } else {
      failed++;
      errors.push(`${update.pluginId}: ${result.error}`);
    }
  }
  
  return { updated, failed, errors };
}
```

---

### **Phase 4: TUI Integration** (High Priority)

#### **4.1 Teleport Commands** (`src/tui/commands.ts`)

```typescript
// Add to known commands
const knownCommands = [
  // ... existing
  "teleport", "teleport-status", "teleport-complete"
];

// Handle teleport command
case "teleport":
  {
    if (!args) {
      chatLog.addSystem("usage: /teleport <session-id> [--branch <branch>]");
      break;
    }
    
    const [sessionId, ...rest] = args.split(' ');
    const branchMatch = rest.join(' ').match(/--branch\s+(\S+)/);
    const branch = branchMatch ? branchMatch[1] : undefined;
    
    chatLog.addSystem(`Teleporting to session ${sessionId}...`);
    
    const { executeTeleport } = await import('../teleport/teleport-executor.js');
    const result = await executeTeleport({ sessionId, branch });
    
    if (result.success) {
      chatLog.addSystem(`✅ Teleported to session ${sessionId}`);
      chatLog.addSystem(`Branch: ${result.branch || 'N/A'}`);
      chatLog.addSystem(`Messages: ${result.messages.length}`);
    } else {
      chatLog.addSystem(`❌ Teleport failed: ${result.error}`);
    }
  }
  break;

case "teleport-status":
  {
    const { getTeleportedSessionInfo } = await import('../teleport/teleport-state.js');
    const info = getTeleportedSessionInfo();
    
    if (info?.isTeleported) {
      chatLog.addSystem("Session Teleport Status:");
      chatLog.addSystem(`  Session: ${info.sessionId}`);
      chatLog.addSystem(`  Branch: ${info.branch || 'N/A'}`);
      chatLog.addSystem(`  Teleported: ${info.teleportedAt}`);
      chatLog.addSystem(`  First Message Logged: ${info.hasLoggedFirstMessage}`);
    } else {
      chatLog.addSystem("Not a teleported session");
    }
  }
  break;

case "teleport-complete":
  {
    const { completeTeleport } = await import('../teleport/teleport-executor.js');
    await completeTeleport();
    chatLog.addSystem("✅ Teleport completed, changes restored");
  }
  break;
```

#### **4.2 Hooks Commands** (`src/tui/commands.ts`)

```typescript
case "hooks-list":
  {
    const { globalHookExecutor } = await import('../hooks/executor.js');
    const hooks = globalHookExecutor.getHooks();
    
    if (hooks.length === 0) {
      chatLog.addSystem("No hooks configured");
    } else {
      chatLog.addSystem(`Active hooks: ${hooks.length}`);
      for (const hook of hooks.slice(0, 20)) {
        chatLog.addSystem(`  - ${hook.event}: ${hook.hooks.length} hook(s)`);
      }
    }
  }
  break;

case "hooks-enable":
  {
    chatLog.addSystem("Hook management coming soon");
  }
  break;

case "hooks-disable":
  {
    chatLog.addSystem("Hook management coming soon");
  }
  break;
```

#### **4.3 Plugin Commands** (`src/tui/commands.ts`)

```typescript
case "plugins-update":
  {
    chatLog.addSystem("Checking for plugin updates...");
    
    const { checkForUpdates, updateAllPlugins } = await import('../plugins/auto-update.js');
    const updates = await checkForUpdates();
    
    if (updates.length === 0) {
      chatLog.addSystem("✅ All plugins up to date");
    } else {
      chatLog.addSystem(`Found ${updates.length} updates:`);
      for (const update of updates) {
        chatLog.addSystem(`  - ${update.pluginId}: ${update.currentVersion} → ${update.availableVersion}`);
      }
      
      chatLog.addSystem("Run /plugins-update-all to install updates");
    }
  }
  break;

case "plugins-update-all":
  {
    chatLog.addSystem("Updating all plugins...");
    
    const { updateAllPlugins } = await import('../plugins/auto-update.js');
    const result = await updateAllPlugins();
    
    chatLog.addSystem(`✅ Updated: ${result.updated}`);
    if (result.failed > 0) {
      chatLog.addSystem(`❌ Failed: ${result.failed}`);
    }
  }
  break;

case "plugins-install-git":
  {
    if (!args) {
      chatLog.addSystem("usage: /plugins-install-git <repo> [--ref <ref>] [--subdir <dir>]");
      break;
    }
    
    const [repo, ...rest] = args.split(' ');
    const refMatch = rest.join(' ').match(/--ref\s+(\S+)/);
    const subdirMatch = rest.join(' ').match(/--subdir\s+(\S+)/);
    
    const { installPluginFromGit } = await import('../plugins/install-git.js');
    const result = await installPluginFromGit({
      repo,
      ref: refMatch ? refMatch[1] : undefined,
      subdir: subdirMatch ? subdirMatch[1] : undefined,
    });
    
    if (result.ok) {
      chatLog.addSystem(`✅ Plugin installed: ${result.pluginId}`);
    } else {
      chatLog.addSystem(`❌ Install failed: ${result.error}`);
    }
  }
  break;
```

---

## ✅ VERIFICATION CHECKLIST

### **Code Quality:**
- [ ] All TypeScript types defined
- [ ] All functions have JSDoc comments
- [ ] All errors properly handled
- [ ] All async operations have error handling
- [ ] No circular dependencies

### **Feature Completeness:**
- [ ] Session Teleport working
- [ ] Prompt hooks working
- [ ] Agent hooks working
- [ ] HTTP hooks working
- [ ] Git installation working
- [ ] Auto-update working
- [ ] All TUI commands working

### **Integration:**
- [ ] Teleport integrated with sessions
- [ ] Hooks integrated with tool execution
- [ ] Plugins integrated with marketplace
- [ ] All TUI commands registered
- [ ] All features accessible in TUI

### **Testing:**
- [ ] Unit tests for teleport
- [ ] Unit tests for hooks
- [ ] Unit tests for plugin install
- [ ] Integration tests
- [ ] E2E tests

---

## 📝 IMPLEMENTATION ORDER

1. **Session Teleport System** (Phase 1)
2. **Advanced Plugin Hooks** (Phase 2)
3. **Plugin Marketplace Enhancements** (Phase 3)
4. **TUI Integration** (Phase 4)
5. **Testing & Verification** (Phase 5)

---

**Status:** Ready for implementation
**Estimated Lines:** ~5,000 new lines
**Estimated Files:** 20 new, 10 modified
