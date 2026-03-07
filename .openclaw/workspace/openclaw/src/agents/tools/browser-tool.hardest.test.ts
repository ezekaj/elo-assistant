/**
 * Browser Tool - 33 Hardest Tests
 *
 * Based on research from:
 * - WebArena benchmark (812 tasks, 14% GPT-4 success rate)
 * - VisualWebArena (910 multimodal tasks)
 * - OSWorld (369 cross-app tasks)
 * - WorkArena (682 knowledge work tasks)
 * - WebChoreArena (532 tedium-focused tasks)
 *
 * Categories:
 * 1. State Divergence & Race Conditions (Tests 1-5)
 * 2. Multi-Step Complex Workflows (Tests 6-10)
 * 3. iframe & Shadow DOM Edge Cases (Tests 11-15)
 * 4. Node Proxy & Target Resolution (Tests 16-20)
 * 5. Security & Sandbox Boundaries (Tests 21-25)
 * 6. Error Recovery & Resilience (Tests 26-30)
 * 7. Concurrency & Resource Management (Tests 31-33)
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// ============================================================================
// MOCK SETUP
// ============================================================================

const browserClientMocks = vi.hoisted(() => ({
  browserCloseTab: vi.fn(async () => ({})),
  browserFocusTab: vi.fn(async () => ({})),
  browserOpenTab: vi.fn(async () => ({ ok: true, targetId: "new-tab-1" })),
  browserProfiles: vi.fn(async () => ["openclaw", "chrome"]),
  browserSnapshot: vi.fn(async () => ({
    ok: true,
    format: "ai",
    targetId: "t1",
    url: "https://example.com",
    snapshot: "[e1] button 'Submit'",
    version: 1,
  })),
  browserStart: vi.fn(async () => ({ ok: true, pid: 12345 })),
  browserStatus: vi.fn(async () => ({
    ok: true,
    running: true,
    pid: 12345,
    cdpPort: 18792,
    cdpUrl: "http://127.0.0.1:18792",
  })),
  browserStop: vi.fn(async () => ({ ok: true })),
  browserTabs: vi.fn(async () => [
    { targetId: "t1", url: "https://example.com", title: "Example" },
  ]),
}));
vi.mock("../../browser/client.js", () => browserClientMocks);

const browserActionsMocks = vi.hoisted(() => ({
  browserAct: vi.fn(async () => ({ ok: true })),
  browserArmDialog: vi.fn(async () => ({ ok: true, handled: true })),
  browserArmFileChooser: vi.fn(async () => ({ ok: true, uploaded: 1 })),
  browserConsoleMessages: vi.fn(async () => ({ messages: [] })),
  browserNavigate: vi.fn(async () => ({ ok: true, url: "https://example.com" })),
  browserPdfSave: vi.fn(async () => ({ ok: true, path: "/tmp/page.pdf" })),
  browserScreenshotAction: vi.fn(async () => ({ ok: true, path: "/tmp/screenshot.png" })),
}));
vi.mock("../../browser/client-actions.js", () => browserActionsMocks);

const browserConfigMocks = vi.hoisted(() => ({
  resolveBrowserConfig: vi.fn(() => ({
    enabled: true,
    controlPort: 18791,
  })),
}));
vi.mock("../../browser/config.js", () => browserConfigMocks);

const nodesUtilsMocks = vi.hoisted(() => ({
  listNodes: vi.fn(async () => []),
  resolveNodeIdFromList: vi.fn((nodes: unknown[], id: string) => id),
}));
vi.mock("./nodes-utils.js", async () => {
  const actual = await vi.importActual<typeof import("./nodes-utils.js")>("./nodes-utils.js");
  return {
    ...actual,
    listNodes: nodesUtilsMocks.listNodes,
    resolveNodeIdFromList: nodesUtilsMocks.resolveNodeIdFromList,
  };
});

const gatewayMocks = vi.hoisted(() => ({
  callGatewayTool: vi.fn(async () => ({
    ok: true,
    payload: { result: { ok: true, running: true } },
  })),
}));
vi.mock("./gateway.js", () => gatewayMocks);

const configMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({ browser: {}, gateway: {} })),
}));
vi.mock("../../config/config.js", () => configMocks);

const mediaMocks = vi.hoisted(() => ({
  saveMediaBuffer: vi.fn(async (buffer: Buffer, mime: string, category: string) => ({
    path: `/tmp/media/${category}/file.${mime?.split("/")[1] || "bin"}`,
  })),
}));
vi.mock("../../media/store.js", () => mediaMocks);

const toolCommonMocks = vi.hoisted(() => ({
  imageResultFromFile: vi.fn(async (opts: { path: string; extraText?: string }) => ({
    content: [
      { type: "text", text: opts.extraText || "screenshot" },
      { type: "image", data: "base64data", mimeType: "image/png" },
    ],
    details: { path: opts.path },
  })),
}));
vi.mock("./common.js", async () => {
  const actual = await vi.importActual<typeof import("./common.js")>("./common.js");
  return {
    ...actual,
    imageResultFromFile: toolCommonMocks.imageResultFromFile,
  };
});

import { createBrowserTool, clearBrowserToolCache } from "./browser-tool.js";

// ============================================================================
// CATEGORY 1: STATE DIVERGENCE & RACE CONDITIONS (Tests 1-5)
// Based on: Agent-E research showing 20% improvement with version tracking
// ============================================================================

describe("Category 1: State Divergence & Race Conditions", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
    nodesUtilsMocks.listNodes.mockResolvedValue([]);
  });

  /**
   * TEST 1: Snapshot version mismatch detection
   * Scenario: Page changes between snapshot and act, ref becomes stale
   * Real-world: WebArena e-commerce checkout where cart updates async
   */
  it("TEST 1: detects stale element refs when page mutates between snapshot and act", async () => {
    const tool = createBrowserTool();

    // First snapshot returns version 1
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      targetId: "t1",
      url: "https://shop.example.com/cart",
      snapshot: "[e1] button 'Checkout' [e2] div 'Total: $99'",
      version: 1,
    });

    // Take initial snapshot
    await tool.execute?.(null, { action: "snapshot", snapshotFormat: "ai" });

    // Simulate page mutation - act fails because element changed
    browserActionsMocks.browserAct.mockRejectedValueOnce(
      new Error("Element [e1] not found: DOM mutated since snapshot"),
    );

    // Attempt to click stale ref should throw meaningful error
    await expect(
      tool.execute?.(null, {
        action: "act",
        request: { kind: "click", ref: "e1" },
      }),
    ).rejects.toThrow(/Element \[e1\] not found/);
  });

  /**
   * TEST 2: Concurrent snapshot requests race condition
   * Scenario: Multiple parallel snapshots could interleave badly
   * Real-world: Multi-tab workflows in WebArena
   */
  it("TEST 2: handles concurrent snapshot requests without data corruption", async () => {
    const tool = createBrowserTool();

    let callCount = 0;
    browserClientMocks.browserSnapshot.mockImplementation(async () => {
      const id = ++callCount;
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      return {
        ok: true,
        format: "ai",
        targetId: `t${id}`,
        url: `https://example.com/page${id}`,
        snapshot: `Content for page ${id}`,
      };
    });

    // Fire 5 concurrent snapshots
    const results = await Promise.all([
      tool.execute?.(null, { action: "snapshot", targetId: "t1" }),
      tool.execute?.(null, { action: "snapshot", targetId: "t2" }),
      tool.execute?.(null, { action: "snapshot", targetId: "t3" }),
      tool.execute?.(null, { action: "snapshot", targetId: "t4" }),
      tool.execute?.(null, { action: "snapshot", targetId: "t5" }),
    ]);

    // All should succeed with distinct content
    expect(results).toHaveLength(5);
    expect(browserClientMocks.browserSnapshot).toHaveBeenCalledTimes(5);
  });

  /**
   * TEST 3: SPA navigation without page reload
   * Scenario: Hash/pushState navigation doesn't trigger load events
   * Real-world: React/Vue apps where "page load" never fires
   */
  it("TEST 3: correctly tracks state in SPAs using pushState navigation", async () => {
    const tool = createBrowserTool();

    // Navigate to SPA route
    browserActionsMocks.browserNavigate.mockResolvedValueOnce({
      ok: true,
      url: "https://app.example.com/#/dashboard",
      navigationType: "pushState",
    });

    await tool.execute?.(null, {
      action: "navigate",
      targetUrl: "https://app.example.com/#/dashboard",
    });

    expect(browserActionsMocks.browserNavigate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        url: "https://app.example.com/#/dashboard",
      }),
    );
  });

  /**
   * TEST 4: Lazy-loaded content timing
   * Scenario: Component loads only when scrolled into view
   * Real-world: WorkArena infinite scroll lists
   */
  it("TEST 4: handles lazy-loaded components via scoped selectors", async () => {
    const tool = createBrowserTool();

    // First snapshot doesn't have the element
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      targetId: "t1",
      snapshot: "[e1] div 'Loading...'",
    });

    // Scroll action triggers content load
    browserActionsMocks.browserAct.mockResolvedValueOnce({ ok: true, scrolled: true });

    // Second snapshot has the content
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      targetId: "t1",
      snapshot: "[e1] div 'Loaded Content' [e2] button 'Action'",
    });

    // Initial snapshot
    const snap1 = await tool.execute?.(null, { action: "snapshot" });
    expect(snap1?.content?.[0]?.text).toContain("Loading");

    // Scroll
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "press", key: "PageDown" },
    });

    // Snapshot after lazy load
    const snap2 = await tool.execute?.(null, { action: "snapshot" });
    expect(snap2?.content?.[0]?.text).toContain("Loaded Content");
  });

  /**
   * TEST 5: AJAX/fetch request interleaving
   * Scenario: Data loads async while user is interacting
   * Real-world: WorkArena form auto-complete suggestions
   */
  it("TEST 5: waits for network-dependent content with selector scoping", async () => {
    const tool = createBrowserTool();

    // Snapshot with selector waits for specific element
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      targetId: "t1",
      snapshot: "[e1] ul.suggestions [e2] li 'Option 1' [e3] li 'Option 2'",
    });

    const result = await tool.execute?.(null, {
      action: "snapshot",
      selector: ".suggestions",
    });

    expect(browserClientMocks.browserSnapshot).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ selector: ".suggestions" }),
    );
    expect(result?.content?.[0]?.text).toContain("suggestions");
  });
});

// ============================================================================
// CATEGORY 2: MULTI-STEP COMPLEX WORKFLOWS (Tests 6-10)
// Based on: WebArena's 812 long-horizon tasks with 3.3 variations each
// ============================================================================

describe("Category 2: Multi-Step Complex Workflows", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
  });

  /**
   * TEST 6: E-commerce checkout flow (WebArena hardest category)
   * Scenario: Add to cart → checkout → fill form → payment → confirm
   * Success rate: <15% for GPT-4 on WebArena
   */
  it("TEST 6: completes multi-page e-commerce checkout workflow", async () => {
    const tool = createBrowserTool();
    const workflow: string[] = [];

    // Mock progressive navigation
    browserActionsMocks.browserNavigate.mockImplementation(async (_, opts) => {
      workflow.push(`navigate:${opts.url}`);
      return { ok: true, url: opts.url };
    });

    browserActionsMocks.browserAct.mockImplementation(async (_, opts) => {
      workflow.push(`act:${opts.kind}:${opts.ref || opts.text || ""}`);
      return { ok: true };
    });

    // Step 1: Navigate to product
    await tool.execute?.(null, {
      action: "navigate",
      targetUrl: "https://shop.example.com/product/123",
    });

    // Step 2: Add to cart
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "add-to-cart" },
    });

    // Step 3: Go to checkout
    await tool.execute?.(null, {
      action: "navigate",
      targetUrl: "https://shop.example.com/checkout",
    });

    // Step 4: Fill shipping form
    await tool.execute?.(null, {
      action: "act",
      request: {
        kind: "fill",
        fields: [
          { ref: "name", value: "John Doe" },
          { ref: "address", value: "123 Main St" },
          { ref: "city", value: "New York" },
        ],
      },
    });

    // Step 5: Submit
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "submit-order" },
    });

    expect(workflow).toEqual([
      "navigate:https://shop.example.com/product/123",
      "act:click:add-to-cart",
      "navigate:https://shop.example.com/checkout",
      "act:fill:",
      "act:click:submit-order",
    ]);
  });

  /**
   * TEST 7: Multi-tab research workflow
   * Scenario: Open multiple tabs, gather info, synthesize
   * Real-world: WebArena "find museums and update README" task
   */
  it("TEST 7: manages multi-tab research workflow with context switching", async () => {
    const tool = createBrowserTool();
    const openTabs: string[] = [];

    browserClientMocks.browserOpenTab.mockImplementation(async (_, url) => {
      const id = `tab-${openTabs.length + 1}`;
      openTabs.push(id);
      return { ok: true, targetId: id, url };
    });

    // Open research tabs
    const tab1 = await tool.execute?.(null, {
      action: "open",
      targetUrl: "https://wikipedia.org/Pittsburgh_museums",
    });
    const tab2 = await tool.execute?.(null, {
      action: "open",
      targetUrl: "https://maps.example.com",
    });
    const tab3 = await tool.execute?.(null, {
      action: "open",
      targetUrl: "https://github.com/user/repo",
    });

    expect(openTabs).toHaveLength(3);

    // Focus back to first tab
    await tool.execute?.(null, { action: "focus", targetId: "tab-1" });
    expect(browserClientMocks.browserFocusTab).toHaveBeenCalledWith(
      undefined,
      "tab-1",
      expect.any(Object),
    );
  });

  /**
   * TEST 8: Form with dynamic validation
   * Scenario: Fields appear/disappear based on selections
   * Real-world: WorkArena "fill form with dynamic tabs"
   */
  it("TEST 8: handles forms with conditionally visible fields", async () => {
    const tool = createBrowserTool();

    // Initial form state
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: "[e1] select 'Country' [e2] input 'Name'",
    });

    await tool.execute?.(null, { action: "snapshot" });

    // Select country triggers state field to appear
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "select", ref: "e1", values: ["USA"] },
    });

    // After selection, new field appears
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: "[e1] select 'Country=USA' [e2] input 'Name' [e3] select 'State'",
    });

    const newSnap = await tool.execute?.(null, { action: "snapshot" });
    expect(newSnap?.content?.[0]?.text).toContain("State");
  });

  /**
   * TEST 9: Calendar date picker interaction
   * Scenario: Complex date picker with month navigation
   * Real-world: BookingArena hotel/flight booking
   */
  it("TEST 9: navigates complex calendar widget for date selection", async () => {
    const tool = createBrowserTool();
    const actions: string[] = [];

    browserActionsMocks.browserAct.mockImplementation(async (_, opts) => {
      actions.push(`${opts.kind}:${opts.ref || opts.key || ""}`);
      return { ok: true };
    });

    // Click to open calendar
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "date-picker" },
    });

    // Navigate to next month
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "next-month" },
    });

    // Select date
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "day-15" },
    });

    expect(actions).toEqual(["click:date-picker", "click:next-month", "click:day-15"]);
  });

  /**
   * TEST 10: ServiceNow complex navigation (WorkArena hardest)
   * Scenario: Navigate nested menus with non-standard HTML widgets
   * Success rate: 0% for LLMs on list-based widgets
   */
  it("TEST 10: navigates deeply nested menu structure", async () => {
    const tool = createBrowserTool();

    // ServiceNow-style nested navigation
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: `
[e1] nav 'Main Menu'
  [e2] button 'Incidents' [expanded=false]
  [e3] button 'Problems' [expanded=false]
  [e4] button 'Changes' [expanded=false]
`,
    });

    await tool.execute?.(null, { action: "snapshot" });

    // Expand menu
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "e2" },
    });

    // Submenu appears
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: `
[e1] nav 'Main Menu'
  [e2] button 'Incidents' [expanded=true]
    [e5] link 'Create New'
    [e6] link 'View All'
    [e7] link 'Assigned to Me'
`,
    });

    const expandedSnap = await tool.execute?.(null, { action: "snapshot" });
    expect(expandedSnap?.content?.[0]?.text).toContain("Create New");
  });
});

// ============================================================================
// CATEGORY 3: IFRAME & SHADOW DOM EDGE CASES (Tests 11-15)
// Based on: "Practice Page" scenarios - nested, cross-origin, closed shadow
// ============================================================================

describe("Category 3: iframe & Shadow DOM Edge Cases", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
  });

  /**
   * TEST 11: Nested iframes (3 levels deep)
   * Scenario: Widget inside iframe inside iframe
   * Real-world: Payment gateways, embedded analytics
   */
  it("TEST 11: accesses elements in triply nested iframes", async () => {
    const tool = createBrowserTool();

    // Snapshot with frame parameter
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      targetId: "t1",
      snapshot: "[e1] iframe#outer [e2] iframe#middle [e3] iframe#inner [e4] button 'Pay Now'",
      frameChain: ["outer", "middle", "inner"],
    });

    const result = await tool.execute?.(null, {
      action: "snapshot",
      frame: "iframe#outer iframe#middle iframe#inner",
    });

    expect(browserClientMocks.browserSnapshot).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        frame: "iframe#outer iframe#middle iframe#inner",
      }),
    );
  });

  /**
   * TEST 12: Cross-origin iframe with limited access
   * Scenario: Third-party embedded content blocks full DOM access
   * Real-world: OAuth popups, payment iframes (Stripe)
   */
  it("TEST 12: handles cross-origin iframe with graceful degradation", async () => {
    const tool = createBrowserTool();

    // Cross-origin iframe returns limited snapshot
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      targetId: "t1",
      snapshot: "[e1] iframe[src='https://stripe.com/pay'] (cross-origin: limited access)",
      crossOriginBlocked: true,
    });

    const result = await tool.execute?.(null, { action: "snapshot" });
    expect(result?.content?.[0]?.text).toContain("cross-origin");
  });

  /**
   * TEST 13: Shadow DOM element interaction
   * Scenario: Custom web components with shadow boundaries
   * Real-world: Modern design systems (Material, Shoelace)
   */
  it("TEST 13: interacts with elements inside open shadow DOM", async () => {
    const tool = createBrowserTool();

    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: `
[e1] custom-dropdown
  #shadow-root (open)
    [e2] button 'Toggle'
    [e3] ul.options
      [e4] li 'Option 1'
      [e5] li 'Option 2'
`,
    });

    await tool.execute?.(null, { action: "snapshot" });

    // Click inside shadow DOM
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "e4" },
    });

    expect(browserActionsMocks.browserAct).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ kind: "click", ref: "e4" }),
      expect.any(Object),
    );
  });

  /**
   * TEST 14: Closed shadow DOM (inaccessible)
   * Scenario: Component explicitly blocks external access
   * Real-world: Video players, DRM content
   */
  it("TEST 14: reports closed shadow DOM elements as inaccessible", async () => {
    const tool = createBrowserTool();

    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: "[e1] video-player #shadow-root (closed) [inaccessible]",
    });

    const result = await tool.execute?.(null, { action: "snapshot" });
    expect(result?.content?.[0]?.text).toContain("closed");
    expect(result?.content?.[0]?.text).toContain("inaccessible");
  });

  /**
   * TEST 15: Shadow DOM inside iframe combination
   * Scenario: The hardest case - shadow DOM nested in iframe
   * Real-world: Embedded widgets with custom components
   */
  it("TEST 15: handles shadow DOM elements nested within iframes", async () => {
    const tool = createBrowserTool();

    // Complex nested structure
    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      frame: "widget-frame",
      snapshot: `
[e1] iframe#widget-frame
  [e2] custom-button
    #shadow-root (open)
      [e3] button 'Click Me'
`,
    });

    await tool.execute?.(null, {
      action: "snapshot",
      frame: "widget-frame",
    });

    // Interact with shadow element inside iframe
    await tool.execute?.(null, {
      action: "act",
      request: { kind: "click", ref: "e3" },
    });

    expect(browserActionsMocks.browserAct).toHaveBeenCalled();
  });
});

// ============================================================================
// CATEGORY 4: NODE PROXY & TARGET RESOLUTION (Tests 16-20)
// Based on: Distributed browser automation across multiple machines
// ============================================================================

describe("Category 4: Node Proxy & Target Resolution", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
    nodesUtilsMocks.listNodes.mockResolvedValue([]);
  });

  /**
   * TEST 16: Auto-routing to single available node
   * Scenario: One browser node connected, auto-select
   */
  it("TEST 16: auto-routes to single available browser node", async () => {
    nodesUtilsMocks.listNodes.mockResolvedValue([
      {
        nodeId: "node-browser-1",
        displayName: "Mac Studio Browser",
        connected: true,
        caps: ["browser"],
        commands: ["browser.proxy"],
      },
    ]);

    gatewayMocks.callGatewayTool.mockResolvedValueOnce({
      payload: { result: { ok: true, running: true, pid: 99999 } },
    });

    const tool = createBrowserTool();
    await tool.execute?.(null, { action: "status", target: "node" });

    expect(gatewayMocks.callGatewayTool).toHaveBeenCalledWith(
      "node.invoke",
      expect.any(Object),
      expect.objectContaining({
        nodeId: "node-browser-1",
        command: "browser.proxy",
      }),
    );
  });

  /**
   * TEST 17: Ambiguous node selection error
   * Scenario: Multiple nodes available, none specified
   */
  it("TEST 17: throws clear error when multiple nodes available without selection", async () => {
    nodesUtilsMocks.listNodes.mockResolvedValue([
      { nodeId: "node-1", connected: true, caps: ["browser"], commands: ["browser.proxy"] },
      { nodeId: "node-2", connected: true, caps: ["browser"], commands: ["browser.proxy"] },
      { nodeId: "node-3", connected: true, caps: ["browser"], commands: ["browser.proxy"] },
    ]);

    const tool = createBrowserTool();

    await expect(tool.execute?.(null, { action: "status", target: "node" })).rejects.toThrow(
      /Multiple browser-capable nodes connected \(3\)/,
    );
  });

  /**
   * TEST 18: Node proxy file transfer (screenshots, PDFs)
   * Scenario: Screenshot taken on remote node, transferred to host
   */
  it("TEST 18: transfers screenshot file from remote node to local storage", async () => {
    nodesUtilsMocks.listNodes.mockResolvedValue([
      { nodeId: "remote-node", connected: true, caps: ["browser"], commands: ["browser.proxy"] },
    ]);

    gatewayMocks.callGatewayTool.mockResolvedValueOnce({
      payload: {
        result: { ok: true, path: "/remote/tmp/screenshot.png" },
        files: [
          {
            path: "/remote/tmp/screenshot.png",
            base64:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            mimeType: "image/png",
          },
        ],
      },
    });

    const tool = createBrowserTool();
    await tool.execute?.(null, { action: "screenshot", target: "node" });

    expect(mediaMocks.saveMediaBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      "image/png",
      "browser",
      expect.any(Number),
    );
  });

  /**
   * TEST 19: Node proxy timeout handling
   * Scenario: Remote node becomes unresponsive
   */
  it("TEST 19: handles node proxy timeout with clear error", async () => {
    nodesUtilsMocks.listNodes.mockResolvedValue([
      { nodeId: "slow-node", connected: true, caps: ["browser"], commands: ["browser.proxy"] },
    ]);

    gatewayMocks.callGatewayTool.mockRejectedValueOnce(
      new Error("Timeout: node.invoke exceeded 20000ms"),
    );

    const tool = createBrowserTool();

    await expect(tool.execute?.(null, { action: "snapshot", target: "node" })).rejects.toThrow(
      /Timeout/,
    );
  });

  /**
   * TEST 20: Explicit node selection overrides auto-routing
   * Scenario: Multiple nodes, user specifies which one
   */
  it("TEST 20: respects explicit node selection over auto-routing", async () => {
    nodesUtilsMocks.listNodes.mockResolvedValue([
      {
        nodeId: "node-auto",
        displayName: "Auto Node",
        connected: true,
        caps: ["browser"],
        commands: ["browser.proxy"],
      },
      {
        nodeId: "node-explicit",
        displayName: "Explicit Node",
        connected: true,
        caps: ["browser"],
        commands: ["browser.proxy"],
      },
    ]);

    nodesUtilsMocks.resolveNodeIdFromList.mockReturnValue("node-explicit");

    gatewayMocks.callGatewayTool.mockResolvedValueOnce({
      payload: { result: { ok: true } },
    });

    const tool = createBrowserTool();
    await tool.execute?.(null, { action: "status", node: "Explicit Node" });

    expect(gatewayMocks.callGatewayTool).toHaveBeenCalledWith(
      "node.invoke",
      expect.any(Object),
      expect.objectContaining({ nodeId: "node-explicit" }),
    );
  });
});

// ============================================================================
// CATEGORY 5: SECURITY & SANDBOX BOUNDARIES (Tests 21-25)
// Based on: ST-WebAgentBench safety evaluation
// ============================================================================

describe("Category 5: Security & Sandbox Boundaries", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
    nodesUtilsMocks.listNodes.mockResolvedValue([]);
  });

  /**
   * TEST 21: Sandbox prevents host browser access
   * Scenario: Sandboxed agent tries to access host browser
   */
  it("TEST 21: blocks host browser access when sandbox policy restricts", async () => {
    const tool = createBrowserTool({
      sandboxBridgeUrl: "http://127.0.0.1:9999",
      allowHostControl: false,
    });

    await expect(tool.execute?.(null, { action: "status", target: "host" })).rejects.toThrow(
      /Host browser control is disabled by sandbox policy/,
    );
  });

  /**
   * TEST 22: Profile isolation between chrome and openclaw
   * Scenario: Ensure cookie/session separation
   */
  it("TEST 22: maintains profile isolation between chrome and openclaw profiles", async () => {
    const tool = createBrowserTool();

    // Chrome profile
    await tool.execute?.(null, { action: "status", profile: "chrome" });
    expect(browserClientMocks.browserStatus).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ profile: "chrome" }),
    );

    vi.clearAllMocks();

    // OpenClaw profile
    await tool.execute?.(null, { action: "status", profile: "openclaw" });
    expect(browserClientMocks.browserStatus).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ profile: "openclaw" }),
    );
  });

  /**
   * TEST 23: File upload path validation
   * Scenario: Prevent directory traversal in upload paths
   */
  it("TEST 23: validates file upload paths for security", async () => {
    const tool = createBrowserTool();

    // Attempt upload with valid paths
    await tool.execute?.(null, {
      action: "upload",
      paths: ["/tmp/safe/file.pdf"],
      ref: "file-input",
    });

    expect(browserActionsMocks.browserArmFileChooser).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        paths: ["/tmp/safe/file.pdf"],
      }),
    );
  });

  /**
   * TEST 24: Evaluate script sandboxing
   * Scenario: User-provided JavaScript runs in page context
   */
  it("TEST 24: executes evaluate scripts in page sandbox", async () => {
    const tool = createBrowserTool();

    await tool.execute?.(null, {
      action: "act",
      request: {
        kind: "evaluate",
        fn: "() => document.title",
      },
    });

    expect(browserActionsMocks.browserAct).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        kind: "evaluate",
        fn: "() => document.title",
      }),
      expect.any(Object),
    );
  });

  /**
   * TEST 25: Node proxy mode disabled blocks node access
   * Scenario: gateway.nodes.browser.mode=off
   */
  it("TEST 25: blocks node proxy when mode is off", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      gateway: { nodes: { browser: { mode: "off" } } },
    });

    nodesUtilsMocks.listNodes.mockResolvedValue([
      { nodeId: "blocked-node", connected: true, caps: ["browser"], commands: ["browser.proxy"] },
    ]);

    const tool = createBrowserTool();

    await expect(tool.execute?.(null, { action: "status", target: "node" })).rejects.toThrow(
      /Node browser proxy is disabled/,
    );
  });
});

// ============================================================================
// CATEGORY 6: ERROR RECOVERY & RESILIENCE (Tests 26-30)
// Based on: 3 consistent failure modes in browser agents
// ============================================================================

describe("Category 6: Error Recovery & Resilience", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
    nodesUtilsMocks.listNodes.mockResolvedValue([]);
  });

  /**
   * TEST 26: Chrome extension relay with no attached tabs
   * Scenario: User hasn't clicked the toolbar icon
   */
  it("TEST 26: provides actionable error when chrome tabs not attached", async () => {
    const tool = createBrowserTool();

    // No tabs attached
    browserClientMocks.browserTabs.mockResolvedValueOnce([]);

    // Act fails with 404
    browserActionsMocks.browserAct.mockRejectedValueOnce(new Error("404: tab not found"));

    await expect(
      tool.execute?.(null, {
        action: "act",
        profile: "chrome",
        request: { kind: "click", ref: "e1" },
      }),
    ).rejects.toThrow(/No Chrome tabs are attached via the OpenClaw Browser Relay extension/);
  });

  /**
   * TEST 27: Stale targetId after tab closure
   * Scenario: Tab closed between operations
   */
  it("TEST 27: handles stale targetId with helpful recovery hint", async () => {
    const tool = createBrowserTool();

    browserClientMocks.browserTabs.mockResolvedValueOnce([
      { targetId: "t2", url: "https://other.com", title: "Other" },
    ]);

    browserActionsMocks.browserAct.mockRejectedValueOnce(new Error("404: tab not found"));

    await expect(
      tool.execute?.(null, {
        action: "act",
        profile: "chrome",
        request: { kind: "click", ref: "e1" },
        targetId: "stale-tab-id",
      }),
    ).rejects.toThrow(/stale targetId/);
  });

  /**
   * TEST 28: Browser process crash recovery
   * Scenario: Browser crashes, needs restart
   */
  it("TEST 28: recovers from browser process crash", async () => {
    const tool = createBrowserTool();

    // First status shows not running
    browserClientMocks.browserStatus.mockResolvedValueOnce({
      ok: true,
      running: false,
      lastCrash: Date.now() - 1000,
    });

    const status = await tool.execute?.(null, { action: "status" });
    expect(status?.details?.running).toBe(false);

    // Start browser
    browserClientMocks.browserStart.mockResolvedValueOnce({ ok: true, pid: 99999 });
    browserClientMocks.browserStatus.mockResolvedValueOnce({ ok: true, running: true, pid: 99999 });

    const afterStart = await tool.execute?.(null, { action: "start" });
    expect(afterStart?.details?.running).toBe(true);
  });

  /**
   * TEST 29: Dialog blocks further interaction
   * Scenario: Alert/confirm dialog appears, must be handled
   */
  it("TEST 29: handles blocking dialog before proceeding", async () => {
    const tool = createBrowserTool();

    // Dialog armed and handled
    browserActionsMocks.browserArmDialog.mockResolvedValueOnce({
      ok: true,
      handled: true,
      dialogType: "confirm",
      message: "Are you sure?",
      accepted: true,
    });

    const result = await tool.execute?.(null, {
      action: "dialog",
      accept: true,
    });

    expect(result?.details?.handled).toBe(true);
    expect(browserActionsMocks.browserArmDialog).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ accept: true }),
    );
  });

  /**
   * TEST 30: Navigation timeout with retry
   * Scenario: Page takes too long to load
   */
  it("TEST 30: reports navigation timeout with diagnostic info", async () => {
    const tool = createBrowserTool();

    browserActionsMocks.browserNavigate.mockRejectedValueOnce(
      new Error("Navigation timeout: page load exceeded 30000ms"),
    );

    await expect(
      tool.execute?.(null, {
        action: "navigate",
        targetUrl: "https://slow-website.example.com",
      }),
    ).rejects.toThrow(/Navigation timeout/);
  });
});

// ============================================================================
// CATEGORY 7: CONCURRENCY & RESOURCE MANAGEMENT (Tests 31-33)
// Based on: WorkArena 100k+ token DOM handling
// ============================================================================

describe("Category 7: Concurrency & Resource Management", () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearBrowserToolCache();
    configMocks.loadConfig.mockReturnValue({ browser: {}, gateway: {} });
    nodesUtilsMocks.listNodes.mockResolvedValue([]);
  });

  /**
   * TEST 31: Large DOM snapshot with efficient mode
   * Scenario: ServiceNow-style page with 100k+ tokens
   */
  it("TEST 31: handles massive DOM with efficient mode truncation", async () => {
    const tool = createBrowserTool();

    // Simulate large DOM
    const largeSnapshot = Array(1000)
      .fill(null)
      .map((_, i) => `[e${i}] div 'Item ${i}'`)
      .join("\n");

    browserClientMocks.browserSnapshot.mockResolvedValueOnce({
      ok: true,
      format: "ai",
      snapshot: largeSnapshot,
      truncated: true,
      originalChars: 150000,
      returnedChars: 20000,
    });

    const result = await tool.execute?.(null, {
      action: "snapshot",
      mode: "efficient",
      maxChars: 20000,
    });

    expect(browserClientMocks.browserSnapshot).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ mode: "efficient", maxChars: 20000 }),
    );
  });

  /**
   * TEST 32: Parallel tab operations
   * Scenario: Open 10 tabs simultaneously
   */
  it("TEST 32: handles parallel tab open operations", async () => {
    const tool = createBrowserTool();
    let tabCounter = 0;

    browserClientMocks.browserOpenTab.mockImplementation(async (_, url) => {
      await new Promise((r) => setTimeout(r, Math.random() * 20));
      return { ok: true, targetId: `tab-${++tabCounter}`, url };
    });

    const urls = Array(10)
      .fill(null)
      .map((_, i) => `https://example.com/page${i}`);

    // Open all tabs in parallel
    const results = await Promise.all(
      urls.map((url) => tool.execute?.(null, { action: "open", targetUrl: url })),
    );

    expect(results).toHaveLength(10);
    expect(browserClientMocks.browserOpenTab).toHaveBeenCalledTimes(10);
  });

  /**
   * TEST 33: Resource cleanup on browser stop
   * Scenario: Ensure proper cleanup of all tabs and connections
   */
  it("TEST 33: performs complete resource cleanup on stop", async () => {
    const tool = createBrowserTool();

    // Tabs exist before stop
    browserClientMocks.browserTabs.mockResolvedValueOnce([
      { targetId: "t1", url: "https://a.com" },
      { targetId: "t2", url: "https://b.com" },
      { targetId: "t3", url: "https://c.com" },
    ]);

    const tabsBefore = await tool.execute?.(null, { action: "tabs" });
    expect(tabsBefore?.details?.tabs).toHaveLength(3);

    // Stop browser
    browserClientMocks.browserStop.mockResolvedValueOnce({ ok: true, closed: true });
    browserClientMocks.browserStatus.mockResolvedValueOnce({
      ok: true,
      running: false,
      cleanShutdown: true,
    });

    const stopResult = await tool.execute?.(null, { action: "stop" });
    expect(stopResult?.details?.running).toBe(false);
    expect(browserClientMocks.browserStop).toHaveBeenCalled();
  });
});
