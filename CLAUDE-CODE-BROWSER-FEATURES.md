# 🌐 CLAUDE CODE BROWSER AUTOMATION - COMPLETE FEATURES

**Based on:** Deep search of Claude Code source (447k lines)  
**Date:** 2026-02-24  
**Features:** WebFetch, Navigation, Click, Browser Automation

---

## 📋 COMPLETE FEATURE LIST

### **1. WEBFETCH (Web Fetch)**

**Location:** Line 100477-100488, 101077

#### **Permission Format:**
```javascript
WebFetch(domain:example.com)
WebFetch(domain:*.google.com)  // Wildcard support
```

#### **Validation Rules:**
```javascript
// ✅ Valid
WebFetch(domain:example.com)
WebFetch(domain:github.com)
WebFetch(domain:*.google.com)

// ❌ Invalid
WebFetch(https://example.com)  // No URLs, only domains
WebFetch(example.com)          // Must use "domain:" prefix
```

#### **Enterprise Settings:**
```javascript
skipWebFetchPreflight: boolean  // Skip blocklist check for enterprise
allowManagedDomainsOnly: boolean  // Only allow managed domains
```

---

### **2. NAVIGATION**

**Location:** Line 16198-16211

#### **Function:**
```typescript
navigate(url: string, tabId: number)
```

#### **Features:**
- Navigate to URL (auto-adds https://)
- Go forward/back in browser history
- Tab-specific navigation
- Requires tab context first

#### **Usage:**
```javascript
// Navigate to URL
navigate("https://github.com", tabId: 1)
navigate("github.com", tabId: 1)  // Protocol optional

// Browser history
navigate("forward", tabId: 1)
navigate("back", tabId: 1)
```

#### **Required Flow:**
```javascript
1. tabs_context_mcp()  // Get tab context FIRST
2. navigate(url, tabId)  // Then navigate
```

---

### **3. CLICK & MOUSE INTERACTION**

**Location:** Line 16116-16195

#### **Computer Tool Actions:**

```typescript
computer(action: string, options: object)
```

#### **Available Actions:**

| Action | Description | Required Params |
|--------|-------------|----------------|
| `left_click` | Click left mouse button | `coordinate: [x, y]` |
| `right_click` | Right-click (context menu) | `coordinate: [x, y]` |
| `double_click` | Double-click | `coordinate: [x, y]` |
| `triple_click` | Triple-click | `coordinate: [x, y]` |
| `left_click_drag` | Drag from start to end | `start_coordinate`, `coordinate` |
| `type` | Type text | `text: string` |
| `key` | Press keyboard key | `text: "Ctrl+C"` |
| `scroll` | Scroll in direction | `scroll_direction` |
| `scroll_to` | Scroll element into view | `ref: "ref_1"` |
| `hover` | Hover without clicking | `coordinate: [x, y]` |
| `screenshot` | Take screenshot | - |
| `wait` | Wait seconds | `duration: number` |
| `zoom` | Screenshot region | `region: [x0,y0,x1,y1]` |

#### **Click Best Practices:**

```javascript
// ✅ Best Practice
1. Take screenshot first
2. Determine coordinates from screenshot
3. Click at element center
4. Adjust if failed

// ❌ Don't
- Click element edges
- Click without screenshot
- Click same location twice if failed
```

#### **Advanced Features:**

```javascript
// Modifiers for click
computer({
  action: "left_click",
  coordinate: [100, 200],
  modifiers: "ctrl+shift",  // or "cmd", "alt", "meta"
  tabId: 1
})

// Element reference (alternative to coordinates)
computer({
  action: "left_click",
  ref: "ref_1",  // From read_page or find tools
  tabId: 1
})

// Drag operation
computer({
  action: "left_click_drag",
  start_coordinate: [100, 100],
  coordinate: [200, 200],
  tabId: 1
})

// Keyboard shortcuts
computer({
  action: "key",
  text: "cmd+a",  // or "ctrl+a"
  repeat: 1,
  tabId: 1
})
```

---

### **4. TAB MANAGEMENT**

**Location:** Line 16339-16384

#### **Get Tab Context (REQUIRED FIRST STEP):**

```typescript
tabs_context_mcp(createIfEmpty?: boolean)
```

**Returns:**
```javascript
{
  tabGroup: {
    id: "group-123",
    tabs: [
      { id: 1, url: "https://github.com", title: "GitHub" },
      { id: 2, url: "https://stackoverflow.com", title: "Stack Overflow" }
    ]
  }
}
```

**CRITICAL:** Must call before ANY browser automation!

#### **Create New Tab:**

```typescript
tabs_create_mcp()
```

**Creates:** New empty tab in MCP tab group

**Best Practice:** Each conversation creates its own tab

---

### **5. SCREENSHOT & VISUAL**

**Location:** Line 16125-16184

#### **Take Screenshot:**

```javascript
computer({
  action: "screenshot",
  tabId: 1
})
```

#### **Zoom (Region Screenshot):**

```javascript
computer({
  action: "zoom",
  region: [x0, y0, x1, y1],  // Top-left to bottom-right
  tabId: 1
})
```

#### **GIF Creator (Recording):**

```typescript
gif_creator(action, tabId, options)
```

**Actions:**
- `start_recording` - Begin capturing
- `stop_recording` - Stop capturing
- `export` - Generate GIF
- `clear` - Discard frames

**Export Options:**
```javascript
{
  download: true,  // Download to browser
  filename: "recording.gif",
  options: {
    showClickIndicators: true,  // Orange circles at clicks
    showDragPaths: true,        // Red arrows for drags
    showActionLabels: true,     // Black action labels
    showProgressBar: true,      // Orange progress bar
    showWatermark: true,        // Claude logo watermark
    quality: 10                 // 1-30 (lower = better)
  }
}
```

---

### **6. FORM INTERACTION**

**Location:** Line 16080-16114

#### **Set Form Value:**

```typescript
set_form_value(ref, value, tabId)
```

**Supports:**
- Text inputs → string
- Checkboxes → boolean
- Selects → option value/text
- Number inputs → number

**Example:**
```javascript
set_form_value({
  ref: "ref_1",  // From read_page
  value: "test@example.com",
  tabId: 1
})

// Checkbox
set_form_value({
  ref: "ref_2",
  value: true,  // boolean for checkboxes
  tabId: 1
})
```

---

### **7. BROWSER CONSOLE & NETWORK**

**Location:** Line 16386-16446

#### **Read Console Messages:**

```typescript
read_console_messages(tabId, options)
```

**Options:**
```javascript
{
  tabId: 1,
  onlyErrors: false,    // Only errors/exceptions
  clear: true,          // Clear after reading
  pattern: "error|MyApp",  // Regex filter
  limit: 100            // Max messages
}
```

**Use Case:** Debug JavaScript errors, app logs

#### **Read Network Requests:**

```typescript
read_network_requests(tabId, options)
```

**Options:**
```javascript
{
  tabId: 1,
  urlPattern: "/api/",  // Filter by URL
  clear: true,          // Clear after reading
  limit: 100            // Max requests
}
```

**Returns:** All HTTP requests (XHR, Fetch, documents, images)

**Auto-Clears:** When page navigates to different domain

---

### **8. WINDOW MANAGEMENT**

**Location:** Line 16213-16235

#### **Resize Window:**

```typescript
resize_window(width, height, tabId)
```

**Use Case:** Test responsive designs

**Example:**
```javascript
resize_window({
  width: 1920,
  height: 1080,
  tabId: 1
})
```

#### **Switch Browser:**

```typescript
switch_browser()
```

**Function:** Switch which Chrome browser is used

**Process:**
1. Broadcasts connection request
2. User clicks "Connect" in desired browser
3. Returns connected browser name

---

### **9. IMAGE UPLOAD**

**Location:** Line 16237-16283

#### **Upload Image:**

```typescript
upload_image(imageId, options)
```

**Two Approaches:**

1. **Element Reference (for file inputs):**
```javascript
upload_image({
  imageId: "screenshot-123",
  ref: "ref_1",  // File input element
  tabId: 1,
  filename: "image.png"
})
```

2. **Coordinate (for drag & drop):**
```javascript
upload_image({
  imageId: "screenshot-123",
  coordinate: [500, 300],  // Drop location
  tabId: 1,
  filename: "image.png"
})
```

---

### **10. PAGE TEXT EXTRACTION**

**Location:** Line 16285-16300

#### **Get Page Text:**

```typescript
get_page_text(tabId)
```

**Returns:** Plain text (no HTML formatting)

**Prioritizes:** Article content, blog posts, text-heavy pages

**Example:**
```javascript
get_page_text({ tabId: 1 })
// Returns: "Article Title\nArticle content here..."
```

---

### **11. SHORTCUTS & WORKFLOWS**

**Location:** Line 16448-16470

#### **List Shortcuts:**

```typescript
shortcuts_list(tabId)
```

**Returns:** Available shortcuts with commands, descriptions

#### **Execute Shortcut:**

```typescript
shortcuts_execute(tabId, shortcutId?, command?)
```

**Example:**
```javascript
// List first
shortcuts_list({ tabId: 1 })

// Execute
shortcuts_execute({
  tabId: 1,
  command: "debug"  // or "summarize"
})
```

---

### **12. PLAN MANAGEMENT**

**Location:** Line 16302-16337

#### **Update Plan:**

```typescript
update_plan(domains, approach)
```

**Purpose:** Get user approval before visiting domains

**Example:**
```javascript
update_plan({
  domains: ["github.com", "stackoverflow.com"],
  approach: [
    "Search for similar issues on GitHub",
    "Check Stack Overflow for solutions",
    "Summarize findings"
  ]
})
```

**Benefits:**
- User sees domains upfront
- No permission prompts for approved domains
- Clear approach description

---

## 🔧 COMPLETE WORKFLOW EXAMPLE

```javascript
// 1. Get tab context (REQUIRED FIRST!)
const context = await tabs_context_mcp({ createIfEmpty: true });

// 2. Create new tab for this conversation
await tabs_create_mcp();

// 3. Get updated context
const updatedContext = await tabs_context_mcp();
const tabId = updatedContext.tabGroup.tabs[0].id;

// 4. Navigate to website
await navigate({ url: "https://github.com", tabId });

// 5. Take screenshot to see page
await computer({ action: "screenshot", tabId });

// 6. Click on element (using coordinates from screenshot)
await computer({
  action: "left_click",
  coordinate: [150, 300],
  tabId
});

// 7. Wait for page to load
await computer({ action: "wait", duration: 2, tabId });

// 8. Take another screenshot
await computer({ action: "screenshot", tabId });

// 9. Type in search box
await computer({
  action: "type",
  text: "search query",
  tabId
});

// 10. Press Enter
await computer({
  action: "key",
  text: "Enter",
  tabId
});

// 11. Read console for errors
const consoleMessages = await read_console_messages({
  tabId,
  onlyErrors: true,
  pattern: "error"
});

// 12. Read network requests
const networkRequests = await read_network_requests({
  tabId,
  urlPattern: "/api/"
});

// 13. Extract page text
const pageText = await get_page_text({ tabId });

// 14. Start GIF recording
await gif_creator({
  action: "start_recording",
  tabId
});

// ... more actions ...

// 15. Stop and export recording
await gif_creator({
  action: "stop_recording",
  tabId
});

await gif_creator({
  action: "export",
  tabId,
  download: true,
  filename: "automation.gif",
  options: {
    showClickIndicators: true,
    quality: 10
  }
});
```

---

## 📊 FEATURE COMPARISON

| Feature | Claude Code | OpenClaw | Gap |
|---------|-------------|----------|-----|
| **WebFetch** | ✅ Domain-based | ❌ Not implemented | HIGH |
| **Navigation** | ✅ Full | ⚠️ Partial | MEDIUM |
| **Click Actions** | ✅ 11 types | ❌ Not implemented | HIGH |
| **Tab Management** | ✅ Full | ⚠️ Basic | MEDIUM |
| **Screenshots** | ✅ Full | ⚠️ Basic | MEDIUM |
| **GIF Recording** | ✅ Full | ❌ Not implemented | HIGH |
| **Form Interaction** | ✅ Full | ❌ Not implemented | HIGH |
| **Console Reading** | ✅ Full | ❌ Not implemented | HIGH |
| **Network Reading** | ✅ Full | ❌ Not implemented | HIGH |
| **Window Resize** | ✅ Full | ❌ Not implemented | HIGH |
| **Image Upload** | ✅ Full | ❌ Not implemented | HIGH |
| **Shortcuts** | ✅ Full | ❌ Not implemented | HIGH |
| **Plan Management** | ✅ Full | ❌ Not implemented | HIGH |

---

## 🎯 IMPLEMENTATION PRIORITY

### **HIGH PRIORITY (Core Features):**
1. ✅ WebFetch (domain-based permissions)
2. ✅ Click actions (left_click, right_click, type)
3. ✅ Navigation (URL + history)
4. ✅ Tab management (context + create)

### **MEDIUM PRIORITY (Enhanced UX):**
5. ✅ Screenshots
6. ✅ Form interaction
7. ✅ Console reading
8. ✅ Network reading

### **LOW PRIORITY (Advanced):**
9. ✅ GIF recording
10. ✅ Window resize
11. ✅ Image upload
12. ✅ Shortcuts
13. ✅ Plan management

---

**COMPLETE CLAUDE CODE BROWSER AUTOMATION FEATURES DOCUMENTED!** 🎯
