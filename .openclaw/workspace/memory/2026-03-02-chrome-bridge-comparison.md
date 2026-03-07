# Chrome Bridge Protocol Comparison: Claude Code vs OpenClaw

## Overview

**Claude Code** uses a WebSocket-based bridge for Chrome extension communication with a full tool call protocol.
**OpenClaw** uses a CDP (Chrome DevTools Protocol) relay for extension communication - lower level, no tool abstraction.

---

## Claude Code Chrome Bridge (from backup analysis)

### Architecture
```
┌──────────────────┐     WebSocket      ┌──────────────────┐
│   Claude CLI     │ ◄───────────────► │  Remote Bridge   │
│  (Bridge Client) │                    │    Server        │
└──────────────────┘                    └──────────────────┘
        │                                        │
        │ tool_call messages                     │
        ▼                                        ▼
┌──────────────────┐                    ┌──────────────────┐
│  Chrome Extension│ ◄───────────────► │ Other Extensions │
│    (paired)      │    peer_* events  │   (remote)       │
└──────────────────┘                    └──────────────────┘
```

### Event Types (Telemetry)
```javascript
Set([
  "chrome_bridge_connection_succeeded",
  "chrome_bridge_connection_failed",
  "chrome_bridge_disconnected",
  "chrome_bridge_tool_call_completed",
  "chrome_bridge_tool_call_error",
  "chrome_bridge_tool_call_started",
  "chrome_bridge_tool_call_timeout",
  "chrome_bridge_peer_connected",
  "chrome_bridge_peer_disconnected",
  "chrome_bridge_reconnect_exhausted",
])
```

### Message Types (Protocol)

**Client → Bridge:**
| Type | Purpose |
|------|---------|
| `connect` | Authenticate with OAuth token or dev_user_id |
| `tool_call` | Execute a tool on the extension |
| `list_extensions` | Query connected extensions |
| `pairing_request` | Request pairing with extension |
| `permission_response` | Respond to permission prompt |
| `pong` | Heartbeat response |

**Bridge → Client:**
| Type | Purpose |
|------|---------|
| `paired` | Successfully authenticated |
| `waiting` | Authenticated, waiting for extension |
| `extensions_list` | Response to list_extensions |
| `pairing_response` | Extension accepted pairing |
| `tool_result` | Tool execution result |
| `permission_request` | Extension needs user permission |
| `notification` | Generic notification |
| `error` | Error message |
| `ping` | Heartbeat |

### Tool Call Flow
```javascript
// 1. Send tool_call
{
  type: "tool_call",
  tool_use_id: "uuid-v4",
  client_type: "claude-cli",
  tool: "navigate", // or "computer", "gif_creator", etc.
  args: { url: "https://example.com", tabId: 123 },
  target_device_id: "extension-device-id",
  permission_mode: "acceptEdits",
  allowed_domains: ["example.com"],
  handle_permission_prompts: true
}

// 2. Receive tool_result
{
  type: "tool_result",
  tool_use_id: "uuid-v4",
  result: { content: [...] },
  is_error: false
}

// OR error
{
  type: "tool_result",
  tool_use_id: "uuid-v4",
  error: { content: [{ type: "text", text: "Error message" }] },
  is_error: true
}
```

### Extension Discovery & Pairing
1. Connect to bridge with OAuth token
2. Query `list_extensions` to find connected extensions
3. If none, wait for `peer_connected` event
4. If multiple, broadcast `pairing_request`
5. Extension responds with `pairing_response`
6. Select extension via `selectExtension(deviceId)`

### Pending Call Management
```javascript
pendingCalls = Map<tool_use_id, {
  resolve: Function,
  reject: Function,
  timer: Timeout,
  results: [],        // For tabs_context_mcp merging
  isTabsContext: boolean,
  onPermissionRequest: Function,
  startTime: number,
  toolName: string
}>

// Default timeout: toolCallTimeoutMs (varies by tool)
// tabs_context_mcp has longer timeout
```

### GIF Creator Tool (Lines 16236)
```javascript
{
  name: "gif_creator",
  description: "Manage GIF recording and export for browser automation sessions...",
  inputSchema: {
    properties: {
      action: { enum: ["start_recording", "stop_recording", "export", "clear"] },
      tabId: { type: "number" },
      download: { type: "boolean" },
      filename: { type: "string" },
      options: {
        properties: {
          showClickIndicators: { type: "boolean", default: true },
          showDragPaths: { type: "boolean", default: true },
          showActionLabels: { type: "boolean", default: true },
          showProgressBar: { type: "boolean", default: true },
          showWatermark: { type: "boolean", default: true },
          quality: { type: "number", default: 10 } // 1-30
        }
      }
    },
    required: ["action", "tabId"]
  }
}
```

---

## OpenClaw Chrome Extension Relay (Current)

### Architecture
```
┌──────────────────┐     HTTP/WS      ┌──────────────────┐
│   OpenClaw       │ ◄──────────────► │  Extension Relay │
│   Browser Tool   │     /cdp         │    Server        │
└──────────────────┘                  └──────────────────┘
        │                                     │
        │ CDP commands                        │
        ▼                                     ▼
┌──────────────────┐                  ┌──────────────────┐
│  Chrome Extension│ ◄─────────────── │ CDP Forwarding   │
│    (connected)   │   /extension     │                  │
└──────────────────┘                  └──────────────────┘
```

### Key Files
- `src/browser/extension-relay.ts` (794 lines) - CDP relay server
- `src/browser/bridge-server.ts` (76 lines) - HTTP routes
- `src/agents/sandbox/browser-bridges.ts` (3 lines) - registry

### What OpenClaw HAS
✅ WebSocket extension connection (`/extension` endpoint)
✅ CDP command forwarding (`forwardCDPCommand`)
✅ CDP event broadcasting (`forwardCDPEvent`)
✅ Target management (`Target.attachedToTarget`, etc.)
✅ Ping/pong heartbeat
✅ Auth token for CDP clients
✅ Loopback-only security

### What OpenClaw LACKS
❌ Tool call abstraction layer
❌ `tool_call` / `tool_result` message types
❌ Extension discovery & pairing protocol
❌ Permission request/response flow
❌ Pending call tracking with timeouts
❌ Multi-extension support
❌ GIF recording tool
❌ Telemetry events (connection_succeeded, tool_call_timeout, etc.)

---

## Gap Analysis

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| WebSocket bridge | ✅ | ✅ | None |
| Tool call protocol | ✅ | ❌ | **Major** |
| Extension pairing | ✅ | ❌ | **Major** |
| Permission handling | ✅ | ❌ | Medium |
| GIF recording | ✅ | ❌ | Medium |
| Pending call tracking | ✅ | ❌ | **Major** |
| Telemetry events | ✅ | ❌ | Low |
| CDP forwarding | ✅ | ✅ | None |

---

## Implementation Plan (If Needed)

### Phase 1: Tool Call Protocol
1. Add message types to `extension-relay.ts`:
   - `tool_call` (with tool_use_id, tool name, args)
   - `tool_result` (with result/error)
   - `permission_request` / `permission_response`
2. Add `pendingCalls` Map with timeout handling
3. Add `callTool()` method similar to Claude's

### Phase 2: Extension Discovery
1. Add `list_extensions` message type
2. Add `pairing_request` / `pairing_response`
3. Add `peer_connected` / `peer_disconnected` events
4. Implement device selection logic

### Phase 3: GIF Recording Tool
**Requires Chrome extension changes (not just relay):**
- Frame capture from tab
- GIF encoder (gif-encoder-2 npm package)
- Overlay rendering (click indicators, progress bar)
- Export via download or drag-drop

**This is a Chrome extension feature, not a relay feature.**

### Phase 4: Telemetry
1. Add event tracking for:
   - `chrome_bridge_connection_*`
   - `chrome_bridge_tool_call_*`
   - `chrome_bridge_peer_*`
2. Wire to OpenClaw's event system

---

## Recommendation

**Don't implement tool_call protocol in OpenClaw's relay.**

Reasons:
1. OpenClaw's browser-tool already works via CDP
2. Tool abstraction is in the agent layer, not the relay
3. GIF recording requires Chrome extension work, not relay work
4. Claude's bridge is for remote/extension communication; OpenClaw uses Playwright for local

**Instead, if GIF recording is needed:**
1. Implement as a separate browser tool action in `browser-tool.ts`
2. Use Playwright's page.video() or screenshots + ffmpeg
3. No Chrome extension changes required

---

## Summary

| Component | Claude Code | OpenClaw | Sync Status |
|-----------|-------------|----------|-------------|
| WebSocket relay | ✅ | ✅ | ✅ Synced |
| CDP forwarding | ✅ | ✅ | ✅ Synced |
| Tool call protocol | ✅ | ❌ | ⚠️ Different approach |
| GIF recording | ✅ | ❌ | ⚠️ Extension feature |
| Extension pairing | ✅ | ❌ | ⚠️ Not needed (OpenClaw is local) |

**Verdict:** The bridges serve different purposes. Claude's is for remote extension control; OpenClaw's is for local CDP relay. No synchronization needed - architectural difference is intentional.
