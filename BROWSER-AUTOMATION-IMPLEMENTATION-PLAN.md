# 🌐 BROWSER AUTOMATION IMPLEMENTATION PLAN

**Goal:** Replace Brave browser integration with Claude Code-style browser automation  
**Based on:** Claude Code source analysis (447k lines)  
**Date:** 2026-02-24  

---

## 📋 EXECUTIVE SUMMARY

This plan implements **complete browser automation** matching Claude Code's capabilities:
- ✅ WebFetch with domain-based permissions
- ✅ Navigation (URL + history)
- ✅ Computer tool (11 action types: click, type, scroll, etc.)
- ✅ Tab management (context, create, switch)
- ✅ Screenshots & GIF recording
- ✅ Form interaction
- ✅ Console & network reading
- ✅ Window management
- ✅ Image upload
- ✅ Plan management
- ✅ Full OpenClaw TUI integration

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW TUI                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Agent with Browser Tools                             │ │
│  │  - webfetch                                           │ │
│  │  - navigate                                           │ │
│  │  - computer (click, type, scroll, etc.)              │ │
│  │  - tabs_context_mcp                                  │ │
│  │  - read_console_messages                             │ │
│  │  - read_network_requests                             │ │
│  │  - ... (13 browser tools total)                      │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BROWSER AUTOMATION LAYER                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Browser Orchestrator (browser-orchestrator.ts)       │ │
│  │  - Manages Playwright instances                       │ │
│  │  - Tab context management                             │ │
│  │  - Permission enforcement                             │ │
│  └───────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Playwright Controller (playwright-controller.ts)     │ │
│  │  - Browser launch (Chromium)                          │ │
│  │  - Page navigation                                    │ │
│  │  - Element interaction                                │ │
│  │  - Screenshots & recording                            │ │
│  └───────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  PLAYWRIGHT (Browser Engine)                │
│  - Chromium browser instance                                │
│  - Multiple tabs/pages                                      │
│  - Full automation API                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### **PHASE 1: CORE INFRASTRUCTURE**

#### **1.1 Browser Orchestrator**
**File:** `src/browser/browser-orchestrator.ts`

**Responsibilities:**
- Initialize Playwright
- Manage browser instances
- Tab context tracking
- Permission enforcement
- Event emission

**Key Functions:**
```typescript
- initializeBrowser(): Promise<void>
- closeBrowser(): Promise<void>
- createTab(): Promise<TabInfo>
- getTabContext(): Promise<TabContext>
- switchTab(tabId: number): Promise<void>
- closeTab(tabId: number): Promise<void>
```

#### **1.2 Playwright Controller**
**File:** `src/browser/playwright-controller.ts`

**Responsibilities:**
- Direct Playwright API wrapper
- Page navigation
- Element interaction
- Screenshots
- Console/network monitoring

**Key Functions:**
```typescript
- navigate(url: string): Promise<void>
- click(x: number, y: number): Promise<void>
- type(text: string): Promise<void>
- screenshot(): Promise<Buffer>
- getConsoleMessages(): Promise<ConsoleMessage[]>
- getNetworkRequests(): Promise<NetworkRequest[]>
```

#### **1.3 Permission Manager**
**File:** `src/browser/permission-manager.ts`

**Responsibilities:**
- Domain-based permissions (WebFetch)
- Plan approval tracking
- Allow/deny domain lists
- Enterprise settings

**Key Functions:**
```typescript
- checkDomainPermission(domain: string): boolean
- approvePlan(domains: string[]): void
- isDomainAllowed(domain: string): boolean
```

---

### **PHASE 2: BROWSER TOOLS**

#### **2.1 WebFetch Tool**
**File:** `src/browser/tools/webfetch.ts`

**Implements:**
- Domain-based permissions
- Wildcard domain support
- Enterprise settings
- Blocklist checking

**Tool Definition:**
```typescript
{
  name: "webfetch",
  description: "Fetch web content with domain-based permissions",
  inputSchema: {
    url: string,
    domain: string  // For permission check
  }
}
```

#### **2.2 Navigate Tool**
**File:** `src/browser/tools/navigate.ts`

**Implements:**
- URL navigation
- Browser history (forward/back)
- Tab-specific navigation
- Loading state tracking

**Tool Definition:**
```typescript
{
  name: "navigate",
  description: "Navigate to URL or history",
  inputSchema: {
    url: string,
    tabId: number
  }
}
```

#### **2.3 Computer Tool**
**File:** `src/browser/tools/computer.ts`

**Implements:** 11 action types

**Actions:**
1. `left_click` - Click at coordinates
2. `right_click` - Right-click
3. `double_click` - Double-click
4. `triple_click` - Triple-click
5. `left_click_drag` - Drag operation
6. `type` - Type text
7. `key` - Keyboard shortcut
8. `scroll` - Scroll in direction
9. `scroll_to` - Scroll element into view
10. `hover` - Hover without clicking
11. `screenshot` - Take screenshot
12. `wait` - Wait seconds
13. `zoom` - Region screenshot

**Tool Definition:**
```typescript
{
  name: "computer",
  description: "Mouse & keyboard interaction",
  inputSchema: {
    action: enum,
    coordinate?: [number, number],
    text?: string,
    ref?: string,
    tabId: number
  }
}
```

#### **2.4 Tab Management Tools**
**Files:** `src/browser/tools/tabs-*.ts`

**Tools:**
- `tabs_context_mcp` - Get tab context
- `tabs_create_mcp` - Create new tab
- `tabs_close_mcp` - Close tab
- `tabs_switch_mcp` - Switch tab

#### **2.5 Screenshot & GIF Tools**
**Files:** `src/browser/tools/screenshot.ts`, `src/browser/tools/gif-recorder.ts`

**Tools:**
- `screenshot` - Full screenshot
- `zoom` - Region screenshot
- `gif_creator` - Start/stop/export recording

#### **2.6 Form Interaction Tool**
**File:** `src/browser/tools/form-interaction.ts`

**Tool:**
- `set_form_value` - Set input/select/checkbox values

#### **2.7 Console & Network Tools**
**Files:** `src/browser/tools/console.ts`, `src/browser/tools/network.ts`

**Tools:**
- `read_console_messages` - Read console logs
- `read_network_requests` - Read HTTP requests

#### **2.8 Additional Tools**
**Files:** `src/browser/tools/*.ts`

**Tools:**
- `resize_window` - Resize browser window
- `upload_image` - Upload image to file input
- `get_page_text` - Extract page text
- `shortcuts_list` - List shortcuts
- `shortcuts_execute` - Execute shortcut
- `update_plan` - Present plan for approval
- `switch_browser` - Switch browser instance

---

### **PHASE 3: INTEGRATION**

#### **3.1 Tool Registration**
**File:** `src/browser/tools/register-tools.ts`

**Responsibilities:**
- Register all 13 browser tools
- Integrate with OpenClaw tool system
- Permission checking middleware

#### **3.2 TUI Integration**
**File:** `src/tui/browser-integration.ts`

**Responsibilities:**
- Browser status display
- Tab context in status bar
- Screenshot preview
- Recording indicator

#### **3.3 Event Mesh Integration**
**File:** `src/agents/browser-event-mesh.ts`

**Responsibilities:**
- Emit browser events
- Track browser state
- Sync with neuro-memory

---

## 🔧 IMPLEMENTATION STEPS

### **Step 1: Dependencies**
```bash
pnpm add playwright
pnpm add @playwright/test  # For testing
```

### **Step 2: Core Infrastructure**
1. Create `src/browser/browser-orchestrator.ts`
2. Create `src/browser/playwright-controller.ts`
3. Create `src/browser/permission-manager.ts`
4. Test browser launch/close

### **Step 3: Browser Tools**
5. Create `src/browser/tools/webfetch.ts`
6. Create `src/browser/tools/navigate.ts`
7. Create `src/browser/tools/computer.ts`
8. Create `src/browser/tools/tabs-*.ts`
9. Create `src/browser/tools/screenshot.ts`
10. Create `src/browser/tools/gif-recorder.ts`
11. Create remaining tools (form, console, network, etc.)

### **Step 4: Integration**
12. Create `src/browser/tools/register-tools.ts`
13. Create `src/tui/browser-integration.ts`
14. Create `src/agents/browser-event-mesh.ts`
15. Update OpenClaw config

### **Step 5: Testing**
16. Unit tests for each tool
17. Integration tests
18. E2E tests with real browser
19. Performance tests

### **Step 6: Documentation**
20. API documentation
21. Usage guide
22. Migration guide (from Brave)

---

## 📊 EXPECTED RESULTS

| Feature | Before (Brave) | After (Playwright) | Improvement |
|---------|----------------|-------------------|-------------|
| **Navigation** | Basic | Full (URL + history) | +100% |
| **Click Actions** | Limited | 11 types | +1000% |
| **Screenshots** | Basic | Full + GIF | +200% |
| **Tab Management** | None | Full context | NEW |
| **Console Reading** | None | Full | NEW |
| **Network Reading** | None | Full | NEW |
| **Form Interaction** | None | Full | NEW |
| **Permissions** | None | Domain-based | NEW |
| **Plan Management** | None | Full | NEW |

---

## ✅ VERIFICATION CHECKLIST

- [ ] Browser launches successfully
- [ ] All 13 tools registered
- [ ] WebFetch permissions work
- [ ] Navigation works (URL + history)
- [ ] Click actions work (all 11 types)
- [ ] Tab management works
- [ ] Screenshots work
- [ ] GIF recording works
- [ ] Form interaction works
- [ ] Console reading works
- [ ] Network reading works
- [ ] TUI integration works
- [ ] No breaking changes
- [ ] All tests pass

---

**READY FOR IMPLEMENTATION** 🚀
