# 🔮 CLAUDE CODE SESSION TELEPORT - COMPLETE ANALYSIS

**Based on:** Deep search of Claude Code source (447k lines)  
**Date:** 2026-02-24  
**Feature:** Session Teleport / Remote Sessions  

---

## 📋 EXECUTIVE SUMMARY

**Session Teleport** is Claude Code's **remote session continuation** feature that allows you to:

- ✅ Start a session on one device/context
- ✅ Continue the **exact same session** on another device/context
- ✅ Preserve full conversation history
- ✅ Preserve git repository context
- ✅ Preserve sandbox environment

**Think:** "iCloud for Claude Code sessions" - start on laptop, continue on desktop!

---

## 🎯 WHAT IT DOES

### **Core Functionality:**

```
Device 1 (Laptop)                    Cloud (Claude.ai)              Device 2 (Desktop)
─────────────                         ─────────────                  ─────────────
Start session    ────────────────>   Store session   ───────────>   Resume session
"claude --remote"                    Session ID: abc123              "claude --teleport abc123"
                                     │
                                     ├─ Conversation history
                                     ├─ Git repository info
                                     ├─ Sandbox environment
                                     └─ All tool calls/results
```

### **Key Features:**

| Feature | Description |
|---------|-------------|
| **Session Continuity** | Continue exact session from another device |
| **Git Integration** | Validates you're in same git repository |
| **Sandbox Preservation** | Preserves sandbox environment state |
| **Full History** | All messages, tool calls, results preserved |
| **First Message Tracking** | Tracks if first message was logged after teleport |

---

## 🔧 HOW IT WORKS (From Source Code)

### **1. Session State Structure:**

From source (line 2131):
```javascript
teleportedSessionInfo: {
  isTeleported: true,
  hasLoggedFirstMessage: false,
  sessionId: T.sessionId
}
```

**Fields:**
- `isTeleported` - Session was resumed from remote
- `hasLoggedFirstMessage` - Tracks if first message after teleport was logged
- `sessionId` - Remote session ID to resume

### **2. Set Teleported Session:**

From source (line 2699):
```javascript
function setTeleportedSessionInfo(T) {
  gR.teleportedSessionInfo = {
    isTeleported: !0,  // true
    hasLoggedFirstMessage: !1,  // false
    sessionId: T.sessionId
  }
}
```

**Called when:** User resumes a remote session

### **3. Get Teleported Session:**

From source (line 2707):
```javascript
function getTeleportedSessionInfo() {
  return gR.teleportedSessionInfo
}
```

**Returns:** Current teleport state or null

### **4. Mark First Message Logged:**

From source (line 2712):
```javascript
function markFirstMessageLogged() {
  if (gR.teleportedSessionInfo) 
    gR.teleportedSessionInfo.hasLoggedFirstMessage = !0  // true
}
```

**Purpose:** Track analytics for first message after teleport

---

## 📊 TELEPORT FLOW

### **Step 1: Create Remote Session**

```bash
claude --remote --description "Working on feature X"
```

**What happens:**
1. Creates session on Claude.ai
2. Gets session ID (e.g., `abc123`)
3. Stores conversation in cloud
4. Returns session ID to user

### **Step 2: Resume Session**

```bash
claude --teleport abc123
```

**What happens:**
```javascript
async function resumeCodeSession(sessionId, callback) {
  // 1. Validate authentication
  let accessToken = getAuth()?.accessToken;
  if (!accessToken) throw Error("No access token");
  
  // 2. Get organization
  let orgUuid = await getOrganizationUuid();
  
  // 3. Fetch session from API
  let session = await getSession(sessionId);
  
  // 4. Validate git repository
  let validation = await validateSessionRepository(session);
  switch (validation.status) {
    case "match":  // ✓ Same repo
    case "no_repo_required":  // ✓ No repo needed
      break;
    case "not_in_repo":  // ✗ Must be in git dir
    case "mismatch":  // ✗ Wrong repo
    case "error":  // ✗ Validation error
      throw Error("Repository validation failed");
  }
  
  // 5. Fetch session logs
  let logs = await fetchSessionFromIngressAPI(
    sessionId, 
    orgUuid, 
    accessToken
  );
  
  // 6. Set teleport state
  setTeleportedSessionInfo({
    sessionId: sessionId
  });
  
  // 7. Return session data
  return {
    log: logs,
    branch: getSessionGitBranch(session)
  };
}
```

### **Step 3: First Message After Teleport**

From source (line 186248):
```javascript
let f = getTeleportedSessionInfo();
if (f?.isTeleported && !f.hasLoggedFirstMessage) {
  // Log analytics for first message after teleport
  p("tengu_teleport_first_message_error", {
    session_id: f.sessionId,
    error_type: errorType
  });
  
  // Mark as logged
  markFirstMessageLogged();
}
```

**Purpose:** Track if first message after teleport succeeds/fails

---

## 🔐 REPOSITORY VALIDATION

### **Why Validate Git Repo?**

Claude Code sessions are tied to a **specific git repository** for:
- Context preservation
- File path consistency
- Sandbox environment
- Tool call reproducibility

### **Validation Logic:**

From source (line 273344):
```javascript
async function validateSessionRepository(session) {
  // Get session's git repo
  let sessionRepo = session.session_context.sources.find(
    (source) => source.type === "git_repository"
  );
  
  // Get current git repo
  let currentRepo = getCurrentGitRepo();
  
  // Compare
  if (!currentRepo) {
    return { status: "not_in_repo", sessionRepo };
  }
  
  if (sessionRepo.url !== currentRepo.url) {
    return { 
      status: "mismatch", 
      sessionRepo, 
      currentRepo,
      errorMessage: "Repository mismatch"
    };
  }
  
  return { status: "match", sessionRepo, currentRepo };
}
```

### **Validation Results:**

| Status | Meaning | User Action |
|--------|---------|-------------|
| `match` | ✓ Same repo | None - continues |
| `no_repo_required` | ✓ Session doesn't need repo | None - continues |
| `not_in_repo` | ✗ Not in git directory | `cd` to repo |
| `mismatch` | ✗ Wrong repository | `cd` to correct repo |
| `error` | ✗ Validation error | Fix git issue |

---

## 📡 API ENDPOINTS

### **1. Get Session:**

```
GET /v1/sessions/{sessionId}
Headers:
  - Authorization: Bearer {accessToken}
  - x-organization-uuid: {orgUuid}
  - anthropic-beta: ccr-byoc-2025-07-29
```

### **2. Fetch Session Logs:**

```javascript
async function fetchSessionFromIngressAPI(sessionId, orgUuid, accessToken) {
  let headers = getRequestHeaders(accessToken);
  
  let response = await axios.get(
    `${BASE_API_URL}/v1/sessions/${sessionId}/events`,
    {
      headers: {
        ...headers,
        "anthropic-beta": "ccr-byoc-2025-07-29",
        "x-organization-uuid": orgUuid
      },
      timeout: 30000
    }
  );
  
  // Filter messages
  let messages = response.data.data.filter(
    (msg) => isValidMessageType(msg) && !msg.isSidechain
  );
  
  return messages;
}
```

### **3. Poll for Updates:**

```javascript
async function pollSessionEvents(sessionId) {
  let response = await axios.get(
    `${BASE_API_URL}/v1/sessions/${sessionId}/events`,
    {
      headers: {
        "anthropic-beta": "ccr-byoc-2025-07-29",
        "x-organization-uuid": orgUuid
      }
    }
  );
  
  return response.data.data;
}
```

---

## 🎯 TELEPORT STATES

### **UI States (from React component):**

```javascript
function TeleportResumeWrapper({ onComplete, onCancel, onError, source }) {
  const {
    resumeSession,
    isResuming,
    error,
    selectedSession
  } = useTeleportResume(source);
  
  if (isResuming && selectedSession) {
    return (
      <Box>
        <Spinner />
        <Text bold>Resuming session…</Text>
        <Text dim>Loading "{selectedSession.title}"…</Text>
      </Box>
    );
  }
  
  if (error && !onError) {
    return (
      <Box>
        <Text bold color="error">Failed to resume session</Text>
        <Text dim>{error.message}</Text>
        <Text dim>Press Esc to cancel</Text>
      </Box>
    );
  }
  
  return <SessionSelector onSelect={onComplete} onCancel={onCancel} />;
}
```

### **States:**

| State | UI Display |
|-------|------------|
| `isResuming` | "Resuming session…" + spinner |
| `error` | "Failed to resume session" + error |
| `selectedSession` | Loading session title |
| `onCancel` | Session selector UI |

---

## 📊 ANALYTICS TRACKING

### **Tracked Events:**

```javascript
// Teleport started
p("tengu_teleport_started", {
  source: "cli" | "tui" | "web"
});

// Teleport completed
p("tengu_teleport_resume_session", {
  source: "cli",
  session_id: sessionId
});

// Teleport cancelled
p("tengu_teleport_cancelled", {});

// First message error after teleport
p("tengu_teleport_first_message_error", {
  session_id: sessionId,
  error_type: errorType
});

// First message success after teleport
p("tengu_teleport_first_message_success", {
  session_id: sessionId
});

// Teleport error
p("tengu_teleport_error_session_not_found_404", {
  sessionId: sessionId
});

p("tengu_teleport_error_repo_mismatch", {
  sessionId: sessionId
});
```

---

## 🔒 SECURITY & PERMISSIONS

### **Requirements:**

1. **Authentication:**
   - Requires Claude.ai account
   - API key NOT sufficient
   - Must run `/login` to authenticate

2. **Organization:**
   - Must have organization UUID
   - Sessions tied to organization

3. **Policy:**
   - `allow_remote_sessions` must be enabled
   - Can be disabled by organization policy

### **From Source (line 273371):**
```javascript
if (!TE("allow_remote_sessions")) 
  throw Error("Remote sessions are disabled by your organization's policy.");
```

---

## 🆚 CLAUDE CODE vs OPENCLAW

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **Session Teleport** | ✅ Full support | ❌ Not implemented | HIGH |
| **Remote Sessions** | ✅ Claude.ai sync | ❌ No cloud sync | HIGH |
| **Git Validation** | ✅ Automatic | ⚠️ Manual only | MEDIUM |
| **Session Continuity** | ✅ Cross-device | ❌ Local only | HIGH |
| **First Message Tracking** | ✅ Analytics | ❌ No tracking | LOW |

---

## 💡 OPENCLAW INTEGRATION STATUS

### **Current Status:**

OpenClaw **does NOT currently support** session teleport.

**What OpenClaw Has:**
- ✅ Local session storage
- ✅ Session history
- ✅ Git integration (basic)
- ❌ Cloud sync
- ❌ Remote sessions
- ❌ Cross-device continuity
- ❌ Session teleport

### **What's Needed:**

#### **1. Cloud Storage Backend**

```typescript
// src/session/session-cloud-sync.ts
export interface SessionCloudStorage {
  uploadSession(session: Session): Promise<string>;
  downloadSession(sessionId: string): Promise<Session>;
  listSessions(): Promise<SessionSummary[]>;
  deleteSession(sessionId: string): Promise<void>;
}
```

#### **2. Session Teleport Command**

```typescript
// src/commands/teleport.ts
export const teleportCommand: Command = {
  name: 'teleport',
  description: 'Resume a session from another device',
  execute: async (sessionId: string) => {
    // 1. Fetch session from cloud
    const session = await sessionCloud.downloadSession(sessionId);
    
    // 2. Validate git repo
    const validation = await validateGitRepo(session);
    if (validation.status !== 'match') {
      throw new Error('Git repository mismatch');
    }
    
    // 3. Load session
    await loadSession(session);
    
    // 4. Set teleport state
    setTeleportedSessionInfo({
      sessionId,
      isTeleported: true,
      hasLoggedFirstMessage: false
    });
  }
};
```

#### **3. Remote Session Creation**

```typescript
// src/commands/remote.ts
export const remoteCommand: Command = {
  name: 'remote',
  description: 'Create a remote session',
  execute: async (description?: string) => {
    // 1. Upload session to cloud
    const sessionId = await sessionCloud.uploadSession(currentSession);
    
    // 2. Return session ID
    console.log(`Session ID: ${sessionId}`);
    console.log(`Resume with: /teleport ${sessionId}`);
  }
};
```

---

## 🎯 IMPLEMENTATION RECOMMENDATION

### **Priority:** MEDIUM

**Why:**
- ✅ Great for multi-device workflows
- ✅ Professional feature for teams
- ⚠️ Requires cloud infrastructure
- ⚠️ Requires authentication system

### **Implementation Steps:**

1. **Cloud Storage** (HIGH effort) - 2-3 days
   - Choose provider (S3, GCS, etc.)
   - Implement upload/download
   - Add encryption

2. **Authentication** (MEDIUM effort) - 1-2 days
   - OAuth or API key
   - Session management
   - Token refresh

3. **Teleport Command** (MEDIUM effort) - 1-2 days
   - Fetch session
   - Validate git repo
   - Load session state

4. **Remote Command** (LOW effort) - 1 day
   - Upload session
   - Return session ID

5. **Git Validation** (MEDIUM effort) - 1-2 days
   - Get current repo
   - Compare with session repo
   - Handle mismatches

**Total:** 6-10 days

---

## 📝 CONCLUSION

**Session Teleport** is Claude Code's **remote session continuation** feature:

- ✅ Start on one device, continue on another
- ✅ Full conversation history preserved
- ✅ Git repository validation
- ✅ Sandbox environment preserved
- ✅ First message tracking

**For OpenClaw:**
- Current support: NONE
- Implementation priority: MEDIUM
- Estimated effort: 6-10 days
- Requires: Cloud infrastructure, auth system

**Recommendation:** Implement if multi-device workflow is a priority for your users.

---

**ANALYSIS COMPLETE** 🎯
