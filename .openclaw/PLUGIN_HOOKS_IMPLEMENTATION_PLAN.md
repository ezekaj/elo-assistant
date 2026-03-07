# 📋 PLUGIN HOOKS SYSTEM - COMPREHENSIVE IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Full Claude Code parity for Plugin Hooks System
**Status:** Ready for implementation

---

## 🎯 EXECUTIVE SUMMARY

This plan implements a **complete Plugin Hooks System** matching Claude Code's functionality:
- **18 event types** for comprehensive lifecycle coverage
- **4 hook types** (Command, Prompt, Agent, HTTP)
- **4 matcher types** for precise hook targeting
- **Full JSON output schema** for hook responses
- **TUI integration** for configuration and monitoring

---

## 📊 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLUGIN HOOKS SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │  Hook Registry   │◀───│  Hook Matchers   │                  │
│  │  (18 events)     │    │  (4 types)       │                  │
│  └────────┬─────────┘    └──────────────────┘                  │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              HOOK EXECUTION ENGINE                        │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │   │
│  │  │  Command   │  │   Prompt   │  │   Agent    │         │   │
│  │  │   Hook     │  │   Hook     │  │   Hook     │         │   │
│  │  └────────────┘  └────────────┘  └────────────┘         │   │
│  └──────────────────────────────────────────────────────────┘   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              JSON OUTPUT SCHEMA                           │   │
│  │  - permissionDecision (allow/deny/ask)                    │   │
│  │  - updatedInput (modify tool input)                       │   │
│  │  - additionalContext (inject to model)                    │   │
│  │  - systemMessage (display to user)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              TUI INTEGRATION                              │   │
│  │  - Hook configuration editor                              │   │
│  │  - Hook execution monitor                                 │   │
│  │  - Hook status display                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 FILE STRUCTURE

### **New Files to Create:**

```
src/
└── hooks/
    ├── types.ts                    # Type definitions
    ├── events.ts                   # 18 event types
    ├── matchers.ts                 # 4 matcher types
    ├── registry.ts                 # Hook registry
    ├── executor.ts                 # Hook execution engine
    ├── command-hook.ts             # Command hook execution
    ├── prompt-hook.ts              # Prompt hook execution
    ├── agent-hook.ts               # Agent hook execution
    ├── http-hook.ts                # HTTP hook execution
    ├── output-schema.ts            # JSON output validation
    ├── config.ts                   # Configuration loading
    └── index.ts                    # Public exports

src/tui/
└── hooks/
    ├── hooks-panel.ts              # Hooks status panel
    ├── hooks-config-editor.ts      # Configuration editor
    └── hooks-monitor.ts            # Execution monitor

ui/src/ui/
└── hooks/
    ├── hooks-config.json           # TUI hook configuration
    └── hooks-views.ts              # Hook views
```

### **Modified Files:**

```
src/agents/
├── tools/common.ts                 # Add hook execution
├── pi-embedded-subscribe.handlers.ts # Add hook events
└── tool-execution-wrapper.ts       # Integrate hooks

src/config/
└── types.ts                        # Add hook configuration types

src/tui/
├── commands.ts                     # Add /hooks command
└── app.ts                          # Add hooks panel

ui/src/ui/
└── tool-display.json               # Add hook tool entries
```

---

## 🔧 IMPLEMENTATION PHASES

### **Phase 1: Core Infrastructure** (Critical)

#### **1.1 Type Definitions** (`src/hooks/types.ts`)

```typescript
// 18 Hook Event Types
export type HookEventName =
  // Tool events (6)
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PermissionRequest'
  | 'Notification'
  | 'Stop'
  // Session events (4)
  | 'SessionStart'
  | 'SessionEnd'
  | 'Setup'
  | 'ConfigChange'
  // Agent events (4)
  | 'SubagentStart'
  | 'SubagentStop'
  | 'TeammateIdle'
  | 'TaskCompleted'
  // Other events (4)
  | 'UserPromptSubmit'
  | 'PreCompact'
  | 'WorktreeCreate'
  | 'WorktreeRemove';

// 4 Hook Types
export type HookType = 'command' | 'prompt' | 'agent' | 'http';

// Hook Matcher
export interface HookMatcher {
  tools?: string[];        // Tool names to match
  pattern?: string;        // Regex pattern for input
  filePattern?: string;    // Glob pattern for files
}

// Hook Configuration
export interface HookConfig {
  type: HookType;
  // Command hook
  command?: string;
  // Prompt hook
  prompt?: string;
  model?: string;
  // Agent hook
  tools?: string[];
  maxTurns?: number;
  // HTTP hook
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  // Common
  timeout?: number;
  async?: boolean;
  asyncTimeout?: number;
}

// Hook Registration
export interface HookRegistration {
  event: HookEventName;
  matcher: HookMatcher | null;
  hooks: HookConfig[];
  priority?: number;
  source?: 'user' | 'project' | 'local' | 'plugin';
  pluginId?: string;
}
```

#### **1.2 Event Context Types** (`src/hooks/events.ts`)

```typescript
// Base context for all events
export interface BaseHookContext {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode?: string;
}

// PreToolUse context
export interface PreToolUseContext extends BaseHookContext {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

// PostToolUse context
export interface PostToolUseContext extends BaseHookContext {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
}

// PostToolUseFailure context
export interface PostToolUseFailureContext extends BaseHookContext {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  error: string;
  is_interrupt?: boolean;
}

// SessionStart context
export interface SessionStartContext extends BaseHookContext {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear' | 'compact';
  agent_type?: string;
  model?: string;
}

// ... (14 more event contexts)
```

#### **1.3 JSON Output Schema** (`src/hooks/output-schema.ts`)

```typescript
// Hook output schema
export interface HookOutput {
  // Universal fields
  continue?: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  systemMessage?: string;
  reason?: string;
  
  // Hook-specific output
  hookSpecificOutput?: HookSpecificOutput;
}

// Event-specific output
export type HookSpecificOutput =
  | PreToolUseOutput
  | UserPromptSubmitOutput
  | PostToolUseOutput
  | PermissionRequestOutput
  | GenericHookOutput;

// PreToolUse output
export interface PreToolUseOutput {
  hookEventName: 'PreToolUse';
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
}

// UserPromptSubmit output
export interface UserPromptSubmitOutput {
  hookEventName: 'UserPromptSubmit';
  additionalContext: string;  // Required
}

// PostToolUse output
export interface PostToolUseOutput {
  hookEventName: 'PostToolUse';
  additionalContext?: string;
  updatedMCPToolOutput?: unknown;
}

// Generic hook output
export interface GenericHookOutput {
  hookEventName: HookEventName;
  additionalContext?: string;
}
```

---

### **Phase 2: Hook Matchers** (High Priority)

#### **2.1 Matcher System** (`src/hooks/matchers.ts`)

```typescript
import { HookMatcher, HookEventName } from './types.js';
import { minimatch } from 'minimatch';

/**
 * Check if a hook matcher matches the given context
 */
export function matchesHookContext(
  matcher: HookMatcher | null,
  context: {
    event: HookEventName;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    filePath?: string;
  }
): boolean {
  if (!matcher) return true;  // No matcher = always matches
  
  // Check tool name
  if (matcher.tools && context.toolName) {
    const matchesTool = matcher.tools.some(pattern => {
      // Support pipe-separated patterns: "Write|Edit"
      const patterns = pattern.split('|');
      return patterns.some(p => {
        // Support regex patterns
        if (p.includes('*') || p.includes('?')) {
          return minimatch(context.toolName!, p);
        }
        return context.toolName === p || context.toolName?.includes(p);
      });
    });
    if (!matchesTool) return false;
  }
  
  // Check input pattern
  if (matcher.pattern && context.toolInput) {
    const inputStr = JSON.stringify(context.toolInput);
    try {
      const regex = new RegExp(matcher.pattern);
      if (!regex.test(inputStr)) return false;
    } catch {
      // Invalid regex, skip pattern matching
    }
  }
  
  // Check file pattern
  if (matcher.filePattern && context.filePath) {
    if (!minimatch(context.filePath, matcher.filePattern)) return false;
  }
  
  return true;
}

/**
 * Get all matching hooks for an event
 */
export function getMatchingHooks(
  hooks: HookRegistration[],
  event: HookEventName,
  context: {
    toolName?: string;
    toolInput?: Record<string, unknown>;
    filePath?: string;
  }
): HookRegistration[] {
  return hooks
    .filter(h => h.event === event)
    .filter(h => matchesHookContext(h.matcher, context));
}
```

---

### **Phase 3: Hook Execution Engine** (High Priority)

#### **3.1 Command Hook Execution** (`src/hooks/command-hook.ts`)

```typescript
import { spawn } from 'child_process';
import { HookConfig, HookOutput } from './types.js';
import { validateHookOutput } from './output-schema.js';

export interface CommandHookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  output: HookOutput | null;
  validationError?: string;
}

export async function executeCommandHook(
  config: HookConfig,
  stdin: string,
  env: Record<string, string>
): Promise<CommandHookResult> {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const shellArgs = process.platform === 'win32' ? ['/c', config.command!] : ['-c', config.command!];
    
    const proc = spawn(shell, shellArgs, {
      env: { ...process.env, ...env },
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Write stdin
    proc.stdin.write(stdin, 'utf8');
    proc.stdin.end();
    
    // Handle timeout
    const timeout = config.timeout ? config.timeout * 1000 : 30000;
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        stdout,
        stderr,
        exitCode: -1,
        output: null,
        validationError: `Command hook timed out after ${timeout / 1000}s`
      });
    }, timeout);
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      
      // Try to parse JSON output
      let output: HookOutput | null = null;
      let validationError: string | undefined;
      
      try {
        const jsonOutput = JSON.parse(stdout.trim());
        const validation = validateHookOutput(jsonOutput);
        if (validation.valid) {
          output = validation.data;
        } else {
          validationError = validation.error;
        }
      } catch {
        // Not JSON, that's ok for some hooks
      }
      
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
        output,
        validationError
      });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: -1,
        output: null,
        validationError: err.message
      });
    });
  });
}
```

#### **3.2 Hook Executor** (`src/hooks/executor.ts`)

```typescript
import { HookRegistration, HookEventName, HookOutput } from './types.js';
import { executeCommandHook } from './command-hook.js';
import { executePromptHook } from './prompt-hook.js';
import { executeAgentHook } from './agent-hook.js';
import { getMatchingHooks } from './matchers.js';

export interface HookExecutionResult {
  preventContinuation?: boolean;
  stopReason?: string;
  systemMessage?: string;
  permissionBehavior?: 'allow' | 'deny' | 'ask';
  blockingError?: { blockingError: string; command: string };
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  updatedMCPToolOutput?: unknown;
  hookPermissionDecisionReason?: string;
}

export class HookExecutor {
  private hooks: HookRegistration[] = [];
  
  registerHooks(hooks: HookRegistration[]) {
    this.hooks = [...this.hooks, ...hooks];
  }
  
  async executeHooks(
    event: HookEventName,
    context: Record<string, unknown>
  ): Promise<HookExecutionResult> {
    const matchingHooks = getMatchingHooks(this.hooks, event, context);
    
    if (matchingHooks.length === 0) {
      return {};
    }
    
    const result: HookExecutionResult = {};
    
    for (const registration of matchingHooks) {
      for (const hook of registration.hooks) {
        const hookResult = await this.executeSingleHook(hook, event, context);
        
        // Merge results
        if (hookResult.preventContinuation) {
          result.preventContinuation = true;
          result.stopReason = hookResult.stopReason;
        }
        if (hookResult.systemMessage) {
          result.systemMessage = hookResult.systemMessage;
        }
        if (hookResult.permissionBehavior) {
          result.permissionBehavior = hookResult.permissionBehavior;
        }
        if (hookResult.updatedInput) {
          result.updatedInput = hookResult.updatedInput;
        }
        if (hookResult.additionalContext) {
          result.additionalContext = hookResult.additionalContext;
        }
        
        // Stop if continuation prevented
        if (result.preventContinuation) {
          break;
        }
      }
      
      if (result.preventContinuation) {
        break;
      }
    }
    
    return result;
  }
  
  private async executeSingleHook(
    hook: HookConfig,
    event: HookEventName,
    context: Record<string, unknown>
  ): Promise<HookExecutionResult> {
    const stdin = JSON.stringify(context);
    const env = this.buildHookEnv(context);
    
    let output: HookOutput | null = null;
    
    switch (hook.type) {
      case 'command':
        output = (await executeCommandHook(hook, stdin, env)).output;
        break;
      case 'prompt':
        output = await executePromptHook(hook, stdin, env);
        break;
      case 'agent':
        output = await executeAgentHook(hook, stdin, env);
        break;
      case 'http':
        // HTTP hooks not yet supported
        return {};
    }
    
    return this.processHookOutput(output, event);
  }
  
  private buildHookEnv(context: Record<string, unknown>): Record<string, string> {
    return {
      ...process.env,
      CLAUDE_PROJECT_DIR: process.cwd(),
      CLAUDE_SESSION_ID: context.session_id as string || '',
      // Add more context as env vars
    };
  }
  
  private processHookOutput(
    output: HookOutput | null,
    event: HookEventName
  ): HookExecutionResult {
    if (!output) return {};
    
    const result: HookExecutionResult = {};
    
    if (output.continue === false) {
      result.preventContinuation = true;
      result.stopReason = output.stopReason || 'Blocked by hook';
    }
    
    if (output.systemMessage) {
      result.systemMessage = output.systemMessage;
    }
    
    if (output.hookSpecificOutput) {
      const specific = output.hookSpecificOutput;
      
      if (specific.hookEventName === 'PreToolUse') {
        if (specific.permissionDecision === 'allow') {
          result.permissionBehavior = 'allow';
        } else if (specific.permissionDecision === 'deny') {
          result.permissionBehavior = 'deny';
          result.blockingError = {
            blockingError: specific.permissionDecisionReason || 'Blocked by hook',
            command: 'hook'
          };
        } else if (specific.permissionDecision === 'ask') {
          result.permissionBehavior = 'ask';
        }
        
        if (specific.permissionDecisionReason) {
          result.hookPermissionDecisionReason = specific.permissionDecisionReason;
        }
        
        if (specific.updatedInput) {
          result.updatedInput = specific.updatedInput;
        }
      }
      
      if (specific.additionalContext) {
        result.additionalContext = specific.additionalContext;
      }
      
      if ('updatedMCPToolOutput' in specific && specific.updatedMCPToolOutput) {
        result.updatedMCPToolOutput = specific.updatedMCPToolOutput;
      }
    }
    
    return result;
  }
}

// Global executor
export const globalHookExecutor = new HookExecutor();
```

---

### **Phase 4: Configuration System** (Medium Priority)

#### **4.1 Configuration Loading** (`src/hooks/config.ts`)

```typescript
import { HookRegistration } from './types.js';
import { loadConfig } from '../config/config.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function loadHooksFromConfig(): Promise<HookRegistration[]> {
  const config = loadConfig();
  const hooks: HookRegistration[] = [];
  
  // Load from settings.json
  if (config.hooks) {
    for (const [event, matchers] of Object.entries(config.hooks)) {
      if (Array.isArray(matchers)) {
        for (const matcher of matchers) {
          hooks.push({
            event: event as HookEventName,
            matcher: matcher.matcher || null,
            hooks: matcher.hooks || [],
            source: 'user'
          });
        }
      }
    }
  }
  
  // Load from project settings
  try {
    const projectConfigPath = join(process.cwd(), '.claude', 'settings.json');
    const projectConfig = JSON.parse(await readFile(projectConfigPath, 'utf8'));
    if (projectConfig.hooks) {
      // ... load project hooks
    }
  } catch {
    // No project config
  }
  
  // Load from local settings
  try {
    const localConfigPath = join(process.cwd(), '.claude', 'settings.local.json');
    const localConfig = JSON.parse(await readFile(localConfigPath, 'utf8'));
    if (localConfig.hooks) {
      // ... load local hooks
    }
  } catch {
    // No local config
  }
  
  return hooks;
}
```

---

### **Phase 5: Tool Integration** (High Priority)

#### **5.1 Integrate with Tool Execution** (`src/agents/tool-execution-wrapper.ts`)

```typescript
import { globalHookExecutor } from '../hooks/executor.js';
import type { AnyAgentTool } from './tools/common.js';

export async function executeToolWithHooks(
  tool: AnyAgentTool,
  args: Record<string, unknown>,
  context: {
    session_id: string;
    tool_use_id: string;
    cwd: string;
  }
) {
  // Execute PreToolUse hooks
  const preToolUseResult = await globalHookExecutor.executeHooks('PreToolUse', {
    ...context,
    tool_name: tool.name,
    tool_input: args
  });
  
  // Handle hook decisions
  if (preToolUseResult.preventContinuation) {
    return {
      blocked: true,
      reason: preToolUseResult.stopReason || 'Blocked by hook',
      systemMessage: preToolUseResult.systemMessage
    };
  }
  
  // Use modified input if provided
  const finalArgs = preToolUseResult.updatedInput || args;
  
  // Execute tool
  const result = await tool.call(finalArgs, context);
  
  // Execute PostToolUse hooks
  const postToolUseResult = await globalHookExecutor.executeHooks('PostToolUse', {
    ...context,
    tool_name: tool.name,
    tool_input: finalArgs,
    tool_response: result
  });
  
  // Add additional context
  if (postToolUseResult.additionalContext) {
    // Inject into model context
  }
  
  return {
    blocked: false,
    result: postToolUseResult.updatedMCPToolOutput || result
  };
}
```

---

### **Phase 6: TUI Integration** (Medium Priority)

#### **6.1 TUI Commands** (`src/tui/commands.ts`)

```typescript
export function getSlashCommands(): SlashCommand[] {
  return [
    // ... existing commands
    {
      name: 'hooks',
      description: 'Manage hook configurations'
    },
    {
      name: 'hooks-status',
      description: 'Show active hooks status'
    }
  ];
}
```

#### **6.2 TUI Hooks Panel** (`src/tui/hooks/hooks-panel.ts`)

```typescript
import { Box, Text } from 'blessed';

export function createHooksPanel(screen: any) {
  const panel = Box({
    top: 0,
    left: 0,
    width: '50%',
    height: 'shrink',
    border: { type: 'line' },
    style: { border: { fg: 'blue' } },
    label: ' Active Hooks '
  });
  
  screen.append(panel);
  
  return panel;
}

export function updateHooksPanel(panel: any, hooks: HookRegistration[]) {
  const content = hooks.map(h => 
    `${h.event}: ${h.matcher ? JSON.stringify(h.matcher) : '(all)'} - ${h.hooks.length} hooks`
  ).join('\n');
  
  panel.setContent(content || 'No hooks configured');
  screen.render();
}
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
- [ ] All 18 event types implemented
- [ ] All 4 hook types implemented
- [ ] All 4 matcher types implemented
- [ ] JSON output schema validated
- [ ] Permission decisions working
- [ ] updatedInput working
- [ ] additionalContext working

### **Integration:**
- [ ] Hooks integrated with tool execution
- [ ] Hooks integrated with session lifecycle
- [ ] Hooks integrated with subagent lifecycle
- [ ] TUI commands working
- [ ] TUI panel displaying

### **Testing:**
- [ ] Unit tests for matchers
- [ ] Unit tests for executors
- [ ] Integration tests for tool hooks
- [ ] E2E tests for full flow

---

## 📝 IMPLEMENTATION ORDER

1. **Phase 1:** Type definitions, events, output schema
2. **Phase 2:** Matcher system
3. **Phase 3:** Command hook execution, executor
4. **Phase 4:** Configuration loading
5. **Phase 5:** Tool integration
6. **Phase 6:** TUI integration
7. **Phase 7:** Prompt hooks, Agent hooks
8. **Phase 8:** Testing and verification

---

**Status:** Ready for implementation
**Estimated Lines:** ~3000 new lines
**Estimated Files:** 15 new, 8 modified
