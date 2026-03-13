# 📦 SESSION TELEPORT IMPLEMENTATION PLAN

**Goal:** Implement Claude Code-style session teleport for OpenClaw  
**Date:** 2026-02-24  
**Status:** Ready for Implementation  

---

## 📋 EXECUTIVE SUMMARY

This plan implements **session teleport** for OpenClaw with:
- ✅ Local session export/import (works immediately)
- ✅ Cloud sync ready architecture (extendable later)
- ✅ Git repository validation
- ✅ Full session state preservation
- ✅ TUI integration with commands
- ✅ Zero data loss guarantee

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW TUI                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Teleport Commands                                    │ │
│  │  - /teleport <session-id>  (resume session)           │ │
│  │  - /export-session [path]  (export session)           │ │
│  │  - /import-session <path>  (import session)           │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           SESSION TELEPORT MANAGER (NEW)                    │
│  - Manages session export/import                            │
│  - Validates git repository                                 │
│  - Handles session state                                    │
│  - Cloud sync ready (optional)                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              SESSION STORAGE                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Local     │ │   Cloud     │ │   Git       │           │
│  │   (JSON)    │ │   (S3/GCS)  │ │   (LFS)     │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│  - Session files                                            │
│  - Session metadata                                         │
│  - Git validation                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### **PHASE 1: CORE TYPES & INTERFACES**

#### **1.1 Session Teleport Types**
**File:** `src/config/types.session-teleport.ts` (NEW)

**Key Types:**
```typescript
export interface TeleportedSessionInfo {
  isTeleported: boolean;
  hasLoggedFirstMessage: boolean;
  sessionId: string;
  teleportedAt: number;
  sourceDevice?: string;
}

export interface SessionExport {
  version: string;
  sessionId: string;
  exportedAt: number;
  gitRepo?: GitRepoInfo;
  messages: SessionMessage[];
  state: SessionState;
  metadata: SessionMetadata;
}

export interface GitRepoInfo {
  url: string;
  branch: string;
  commit: string;
  path: string;
}

export interface SessionState {
  currentAgentId: string;
  contextTokens: number;
  thinkingLevel: string;
  verboseLevel: string;
  reasoningLevel: string;
  model: string;
  modelProvider: string;
}

export interface SessionMetadata {
  title?: string;
  description?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}
```

#### **1.2 Teleport Status**
**File:** `src/config/types.session-teleport.ts` (continued)

```typescript
export type TeleportStatus = 
  | 'success'
  | 'not_in_repo'
  | 'repo_mismatch'
  | 'session_not_found'
  | 'invalid_format'
  | 'error';

export interface TeleportValidation {
  status: TeleportStatus;
  sessionRepo?: GitRepoInfo;
  currentRepo?: GitRepoInfo;
  errorMessage?: string;
}
```

---

### **PHASE 2: SESSION TELEPORT MANAGER**

#### **2.1 Teleport Manager Class**
**File:** `src/agents/session-teleport-manager.ts` (NEW)

**Purpose:** Manage session export/import/teleport operations

**Key Class:**
```typescript
export class SessionTeleportManager {
  private teleportedSessionInfo: TeleportedSessionInfo | null = null;
  
  // Export session to file
  async exportSession(
    sessionId: string,
    outputPath?: string
  ): Promise<string>;
  
  // Import session from file
  async importSession(
    importPath: string
  ): Promise<SessionExport>;
  
  // Validate git repository
  async validateGitRepo(
    session: SessionExport
  ): Promise<TeleportValidation>;
  
  // Set teleported session info
  setTeleportedSessionInfo(info: TeleportedSessionInfo): void;
  
  // Get teleported session info
  getTeleportedSessionInfo(): TeleportedSessionInfo | null;
  
  // Mark first message logged
  markFirstMessageLogged(): void;
}
```

**Implementation:**
```typescript
export class SessionTeleportManager {
  private teleportedSessionInfo: TeleportedSessionInfo | null = null;
  
  async exportSession(
    sessionId: string,
    outputPath?: string
  ): Promise<string> {
    // 1. Get current session
    const session = await this.getCurrentSession(sessionId);
    
    // 2. Get git repo info
    const gitRepo = await this.getGitRepoInfo();
    
    // 3. Build export object
    const exportData: SessionExport = {
      version: '1.0',
      sessionId: session.id,
      exportedAt: Date.now(),
      gitRepo,
      messages: session.messages,
      state: {
        currentAgentId: session.agentId,
        contextTokens: session.contextTokens,
        thinkingLevel: session.thinkingLevel,
        verboseLevel: session.verboseLevel,
        reasoningLevel: session.reasoningLevel,
        model: session.model,
        modelProvider: session.modelProvider
      },
      metadata: {
        title: session.title,
        description: session.description,
        tags: session.tags,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
        messageCount: session.messages.length
      }
    };
    
    // 4. Write to file
    const path = outputPath || `./session-${sessionId}.json`;
    await fs.writeFile(path, JSON.stringify(exportData, null, 2));
    
    log.info(`Session exported to ${path}`);
    return path;
  }
  
  async importSession(importPath: string): Promise<SessionExport> {
    // 1. Read file
    const content = await fs.readFile(importPath, 'utf-8');
    const exportData: SessionExport = JSON.parse(content);
    
    // 2. Validate format
    if (!this.validateExportFormat(exportData)) {
      throw new Error('Invalid session export format');
    }
    
    // 3. Validate git repo
    const validation = await this.validateGitRepo(exportData);
    if (validation.status === 'repo_mismatch') {
      throw new Error(
        `Git repository mismatch. Session is from ${validation.sessionRepo?.url}, ` +
        `current repo is ${validation.currentRepo?.url}`
      );
    }
    
    log.info(`Session imported from ${importPath}`);
    return exportData;
  }
  
  async validateGitRepo(session: SessionExport): Promise<TeleportValidation> {
    const currentRepo = await this.getGitRepoInfo();
    
    // No repo in session
    if (!session.gitRepo) {
      return { status: 'success' };
    }
    
    // Not in git directory
    if (!currentRepo) {
      return {
        status: 'not_in_repo',
        sessionRepo: session.gitRepo
      };
    }
    
    // Repo mismatch
    if (session.gitRepo.url !== currentRepo.url) {
      return {
        status: 'repo_mismatch',
        sessionRepo: session.gitRepo,
        currentRepo,
        errorMessage: 'Repository URL mismatch'
      };
    }
    
    return { status: 'success', sessionRepo: session.gitRepo, currentRepo };
  }
  
  setTeleportedSessionInfo(info: TeleportedSessionInfo): void {
    this.teleportedSessionInfo = {
      ...info,
      hasLoggedFirstMessage: false,
      teleportedAt: Date.now()
    };
    log.info(`Session teleport set: ${info.sessionId}`);
  }
  
  getTeleportedSessionInfo(): TeleportedSessionInfo | null {
    return this.teleportedSessionInfo;
  }
  
  markFirstMessageLogged(): void {
    if (this.teleportedSessionInfo) {
      this.teleportedSessionInfo.hasLoggedFirstMessage = true;
      log.debug('First message after teleport logged');
    }
  }
  
  private async getGitRepoInfo(): Promise<GitRepoInfo | null> {
    try {
      // Get git info using simple-git or child_process
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      const { stdout: urlOut } = await execAsync('git remote get-url origin');
      const { stdout: branchOut } = await execAsync('git branch --show-current');
      const { stdout: commitOut } = await execAsync('git rev-parse HEAD');
      const { stdout: pathOut } = await execAsync('git rev-parse --show-toplevel');
      
      return {
        url: urlOut.trim(),
        branch: branchOut.trim(),
        commit: commitOut.trim(),
        path: pathOut.trim()
      };
    } catch {
      return null;
    }
  }
  
  private validateExportFormat(exportData: SessionExport): boolean {
    return (
      exportData.version !== undefined &&
      exportData.sessionId !== undefined &&
      exportData.exportedAt !== undefined &&
      exportData.messages !== undefined &&
      exportData.state !== undefined &&
      exportData.metadata !== undefined
    );
  }
  
  private async getCurrentSession(sessionId: string): Promise<any> {
    // Get current session from session store
    // Implementation depends on existing session management
    throw new Error('Not implemented');
  }
}
```

---

### **PHASE 3: TUI COMMANDS**

#### **3.1 Teleport Commands**
**File:** `src/tui/commands.ts` (MODIFY)

**New Commands:**
```typescript
const teleportCommands: SlashCommand[] = [
  {
    name: 'teleport',
    description: 'Resume a session from export file',
    getArgumentCompletions: (prefix) => [
      { value: '<path>', label: 'Path to session export file' }
    ]
  },
  {
    name: 'export-session',
    description: 'Export current session to file',
    getArgumentCompletions: (prefix) => [
      { value: '<path>', label: 'Output path (optional)' }
    ]
  },
  {
    name: 'import-session',
    description: 'Import session from export file',
    getArgumentCompletions: (prefix) => [
      { value: '<path>', label: 'Path to session export file' }
    ]
  }
];
```

#### **3.2 Command Handlers**
**File:** `src/tui/tui-command-handlers.ts` (MODIFY)

**Handlers:**
```typescript
case 'teleport':
case 'import-session': {
  const { getSessionTeleportManager } = await import('../agents/session-teleport-manager.js');
  const manager = getSessionTeleportManager();
  
  try {
    // Import session
    const exportData = await manager.importSession(args);
    
    // Validate git repo
    const validation = await manager.validateGitRepo(exportData);
    if (validation.status === 'repo_mismatch') {
      chatLog.addSystem(
        `Git repository mismatch!\n` +
        `Session is from: ${validation.sessionRepo?.url}\n` +
        `Current repo: ${validation.currentRepo?.url}\n` +
        `Please cd to the correct repository.`
      );
      break;
    }
    
    // Set teleported session info
    manager.setTeleportedSessionInfo({
      isTeleported: true,
      sessionId: exportData.sessionId,
      hasLoggedFirstMessage: false
    });
    
    // Load session
    await loadSession(exportData);
    
    chatLog.addSystem(
      `Session imported successfully!\n` +
      `Session ID: ${exportData.sessionId}\n` +
      `Messages: ${exportData.metadata.messageCount}\n` +
      `Git repo: ${exportData.gitRepo?.url || 'N/A'}`
    );
  } catch (error: any) {
    chatLog.addSystem(`Import failed: ${error.message}`);
  }
  break;
}

case 'export-session': {
  const { getSessionTeleportManager } = await import('../agents/session-teleport-manager.js');
  const manager = getSessionTeleportManager();
  
  try {
    const path = await manager.exportSession(currentSessionId, args || undefined);
    chatLog.addSystem(`Session exported to: ${path}`);
  } catch (error: any) {
    chatLog.addSystem(`Export failed: ${error.message}`);
  }
  break;
}
```

---

### **PHASE 4: TUI INTEGRATION**

#### **4.1 Teleport Status Display**
**File:** `src/tui/components/teleport-status.ts` (NEW)

**Component:**
```typescript
import { Text, Box } from '@mariozechner/pi-tui';
import { getSessionTeleportManager } from '../agents/session-teleport-manager.js';

export function renderTeleportStatus(): any {
  const manager = getSessionTeleportManager();
  const info = manager.getTeleportedSessionInfo();
  
  if (!info?.isTeleported) {
    return null;
  }
  
  const statusColor = info.hasLoggedFirstMessage ? 'green' : 'yellow';
  const statusText = info.hasLoggedFirstMessage ? '✓' : '~';
  
  return Text.create(
    `${statusText} Teleported ${info.sessionId.slice(0, 8)}...`,
    { color: statusColor }
  );
}
```

#### **4.2 Footer Integration**
**File:** `src/tui/tui.ts` (MODIFY)

**Changes:**
```typescript
const updateFooter = () => {
  // ... existing code ...
  
  // Add teleport status
  const { renderTeleportStatus } = await import('./components/teleport-status.js');
  const teleportStatus = renderTeleportStatus();
  
  const footerParts = [
    `agent ${agentLabel}`,
    `session ${sessionLabel}`,
    modelLabel,
    think !== "off" ? `think ${think}` : null,
    verbose !== "off" ? `verbose ${verbose}` : null,
    reasoningLabel,
    cacheStatus,
    teleportStatus,  // NEW
    tokens,
  ].filter(Boolean);
  
  footer.setText(theme.dim(footerParts.join(" | ")));
};
```

---

### **PHASE 5: FIRST MESSAGE TRACKING**

#### **5.1 Message Handler Enhancement**
**File:** `src/tui/tui-submit-handler.ts` (MODIFY)

**Changes:**
```typescript
async function handleSubmit(message: string) {
  // ... existing code ...
  
  // Check if teleported session
  const { getSessionTeleportManager } = await import('../agents/session-teleport-manager.js');
  const manager = getSessionTeleportManager();
  const info = manager.getTeleportedSessionInfo();
  
  if (info?.isTeleported && !info.hasLoggedFirstMessage) {
    // Track first message after teleport
    log.info('First message after teleport', {
      sessionId: info.sessionId,
      message: message.slice(0, 100)
    });
    
    // Mark as logged
    manager.markFirstMessageLogged();
  }
  
  // ... continue with normal submit ...
}
```

---

## 🔧 IMPLEMENTATION STEPS

### **Step 1: Create Core Types**
```bash
touch src/config/types.session-teleport.ts
```

**Time:** 1 hour  
**Files:** 1  
**Lines:** ~200

### **Step 2: Create Teleport Manager**
```bash
touch src/agents/session-teleport-manager.ts
```

**Time:** 3 hours  
**Files:** 1  
**Lines:** ~400

### **Step 3: Add TUI Commands**
```bash
# Modify existing files
edit src/tui/commands.ts
edit src/tui/tui-command-handlers.ts
```

**Time:** 2 hours  
**Files:** 2 (modified)  
**Lines:** ~200 added

### **Step 4: Create TUI Components**
```bash
touch src/tui/components/teleport-status.ts
```

**Time:** 1 hour  
**Files:** 1  
**Lines:** ~100

### **Step 5: Integrate with TUI**
```bash
# Modify existing files
edit src/tui/tui.ts
edit src/tui/tui-submit-handler.ts
```

**Time:** 2 hours  
**Files:** 2 (modified)  
**Lines:** ~100 added

### **Step 6: Integration & Testing**
```bash
# Wire everything together
# Test export/import
# Test git validation
# Test teleport flow
```

**Time:** 4 hours  
**Files:** All  
**Lines:** N/A

### **Step 7: Documentation**
```bash
touch docs/session-teleport.md
```

**Time:** 2 hours  
**Files:** 1  
**Lines:** ~500

---

## 📊 TOTAL EFFORT

| Phase | Time | Files | Lines |
|-------|------|-------|-------|
| Core Types | 1h | 1 | 200 |
| Teleport Manager | 3h | 1 | 400 |
| TUI Commands | 2h | 2 | 200 |
| TUI Components | 1h | 1 | 100 |
| TUI Integration | 2h | 2 | 100 |
| Integration | 4h | All | N/A |
| Documentation | 2h | 1 | 500 |
| **TOTAL** | **15h** | **8** | **~1500** |

**Timeline:** 2 days (full-time) or 1 week (part-time)

---

## ✅ VERIFICATION CHECKLIST

- [ ] Types defined and exported
- [ ] Teleport manager implemented
- [ ] Git validation working
- [ ] TUI commands added
- [ ] TUI components created
- [ ] Footer integration working
- [ ] First message tracking working
- [ ] Export/import tested
- [ ] Git validation tested
- [ ] No breaking changes
- [ ] All tests passing
- [ ] Documentation complete

---

## 📈 EXPECTED RESULTS

| Feature | Before | After | Improvement |
|---------|--------|-------|-------------|
| **Session Portability** | ❌ None | ✅ Full | New feature |
| **Cross-Device** | ❌ No | ✅ Yes | New feature |
| **Git Validation** | ❌ No | ✅ Automatic | New feature |
| **Session Backup** | ❌ No | ✅ Export/Import | New feature |
| **Team Collaboration** | ❌ No | ✅ Share sessions | New feature |

---

## 🎯 SUCCESS CRITERIA

1. ✅ Export session to file
2. ✅ Import session from file
3. ✅ Git validation works
4. ✅ Teleport status displayed
5. ✅ First message tracked
6. ✅ No breaking changes
7. ✅ All tests passing
8. ✅ Documentation complete

---

**READY FOR IMPLEMENTATION** 🚀
