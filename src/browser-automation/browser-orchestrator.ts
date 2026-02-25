/**
 * Browser Orchestrator - Claude Code Style
 *
 * Completely independent browser automation system
 * Uses Playwright for Chromium automation
 * No dependency on OpenClaw's Brave-based system
 *
 * Features:
 * - WebFetch with domain permissions
 * - Computer tool (11 action types)
 * - Navigation & tab management
 * - Screenshots & GIF recording
 * - Console & network monitoring
 * - Form interaction
 * - Plan management
 */

import { EventEmitter } from "node:events";
import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("browser-orchestrator");

// ============================================================================
// TYPES
// ============================================================================

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  groupId?: string;
}

export interface TabContext {
  tabGroup: {
    id: string;
    tabs: TabInfo[];
  };
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  pages: Map<number, Page>;
  currentTabId: number;
  groupId: string;
  recording?: RecordingSession;
}

export interface RecordingSession {
  isRecording: boolean;
  frames: Buffer[];
  startTime: number;
}

export interface ComputerAction {
  action:
    | "left_click"
    | "right_click"
    | "double_click"
    | "triple_click"
    | "left_click_drag"
    | "type"
    | "key"
    | "scroll"
    | "scroll_to"
    | "hover"
    | "screenshot"
    | "wait"
    | "zoom";
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  ref?: string;
  tabId: number;
  region?: [number, number, number, number];
  repeat?: number;
  modifiers?: string;
}

export interface WebFetchOptions {
  url: string;
  domain: string;
  timeout?: number;
}

export interface PlanApproval {
  domains: string[];
  approach: string[];
  approvedAt: number;
}

// ============================================================================
// BROWSER ORCHESTRATOR
// ============================================================================

export class BrowserOrchestrator extends EventEmitter {
  private session: BrowserSession | null = null;
  private nextTabId = 1;
  private approvedPlans: PlanApproval[] = [];
  private allowedDomains = new Set<string>();
  private deniedDomains = new Set<string>();

  async initialize(): Promise<void> {
    log.info("Initializing browser orchestrator...");

    try {
      const browser = await chromium.launch({
        headless: false,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--no-sandbox",
        ],
      });

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });

      const pages = new Map<number, Page>();

      this.session = {
        browser,
        context,
        pages,
        currentTabId: 0,
        groupId: `group-${Date.now()}`,
      };

      log.info("Browser orchestrator initialized");
    } catch (error) {
      log.error("Failed to initialize browser:", error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.session) {
      await this.session.browser.close();
      this.session = null;
      log.info("Browser closed");
    }
  }

  // ============================================================================
  // TAB MANAGEMENT
  // ============================================================================

  async getTabContext(): Promise<TabContext> {
    if (!this.session) {
      throw new Error("Browser not initialized");
    }

    const tabs: TabInfo[] = [];
    for (const [id, page] of this.session.pages) {
      tabs.push({
        id,
        url: page.url(),
        title: await page.title(),
        groupId: this.session!.groupId,
      });
    }

    return {
      tabGroup: {
        id: this.session.groupId,
        tabs,
      },
    };
  }

  async createTab(): Promise<TabInfo> {
    if (!this.session) {
      throw new Error("Browser not initialized");
    }

    const page = await this.session.context.newPage();
    const tabId = this.nextTabId++;

    this.session.pages.set(tabId, page);
    this.session.currentTabId = tabId;

    const tabInfo: TabInfo = {
      id: tabId,
      url: page.url(),
      title: await page.title(),
      groupId: this.session.groupId,
    };

    log.info(`Created tab ${tabId}`);
    return tabInfo;
  }

  async switchTab(tabId: number): Promise<void> {
    if (!this.session) {
      throw new Error("Browser not initialized");
    }

    const page = this.session.pages.get(tabId);
    if (!page) {
      throw new Error(`Tab ${tabId} not found`);
    }

    await page.bringToFront();
    this.session.currentTabId = tabId;
    log.info(`Switched to tab ${tabId}`);
  }

  async closeTab(tabId: number): Promise<void> {
    if (!this.session) {
      throw new Error("Browser not initialized");
    }

    const page = this.session.pages.get(tabId);
    if (page) {
      await page.close();
      this.session.pages.delete(tabId);
      log.info(`Closed tab ${tabId}`);
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  async navigate(url: string, tabId?: number): Promise<void> {
    const page = await this.getPage(tabId);

    log.info(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  }

  async goBack(tabId?: number): Promise<void> {
    const page = await this.getPage(tabId);
    await page.goBack();
  }

  async goForward(tabId?: number): Promise<void> {
    const page = await this.getPage(tabId);
    await page.goForward();
  }

  // ============================================================================
  // COMPUTER TOOL (11 ACTION TYPES)
  // ============================================================================

  async executeComputerAction(action: ComputerAction): Promise<any> {
    const page = await this.getPage(action.tabId);

    switch (action.action) {
      case "left_click":
        return await this.click(page, action.coordinate, action.modifiers);

      case "right_click":
        return await this.click(page, action.coordinate, "right");

      case "double_click":
        return await this.click(page, action.coordinate, "left", 2);

      case "triple_click":
        return await this.click(page, action.coordinate, "left", 3);

      case "left_click_drag":
        return await this.drag(page, action.start_coordinate!, action.coordinate!);

      case "type":
        return await this.type(page, action.text!, action.ref);

      case "key":
        return await this.pressKey(page, action.text!, action.repeat);

      case "scroll":
        return await this.scroll(page, action.scroll_direction!, action.scroll_amount);

      case "scroll_to":
        return await this.scrollTo(page, action.ref!);

      case "hover":
        return await this.hover(page, action.coordinate);

      case "screenshot":
        return await this.screenshot(page);

      case "wait":
        return await this.wait(action.duration!);

      case "zoom":
        return await this.zoom(page, action.region!);

      default:
        throw new Error(`Unknown action: ${action.action}`);
    }
  }

  private async click(
    page: Page,
    coordinate?: [number, number],
    button: "left" | "right" = "left",
    clickCount = 1,
  ) {
    if (coordinate) {
      await page.mouse.click(coordinate[0], coordinate[1], { button, clickCount });
    } else {
      throw new Error("Coordinate required for click");
    }
  }

  private async drag(page: Page, start: [number, number], end: [number, number]) {
    await page.mouse.move(start[0], start[1]);
    await page.mouse.down();
    await page.mouse.move(end[0], end[1]);
    await page.mouse.up();
  }

  private async type(page: Page, text: string, ref?: string) {
    if (ref) {
      await page.locator(`[data-ref="${ref}"]`).fill(text);
    } else {
      await page.keyboard.type(text);
    }
  }

  private async pressKey(page: Page, key: string, repeat = 1) {
    for (let i = 0; i < repeat; i++) {
      await page.keyboard.press(key);
    }
  }

  private async scroll(page: Page, direction: "up" | "down" | "left" | "right", amount = 3) {
    const scrollAmount = 100 * amount;
    switch (direction) {
      case "down":
        await page.evaluate((h) => window.scrollBy(0, h), scrollAmount);
        break;
      case "up":
        await page.evaluate((h) => window.scrollBy(0, -h), scrollAmount);
        break;
      case "right":
        await page.evaluate((h) => window.scrollBy(h, 0), scrollAmount);
        break;
      case "left":
        await page.evaluate((h) => window.scrollBy(-h, 0), scrollAmount);
        break;
    }
  }

  private async scrollTo(page: Page, ref: string) {
    await page.locator(`[data-ref="${ref}"]`).scrollIntoViewIfNeeded();
  }

  private async hover(page: Page, coordinate?: [number, number]) {
    if (coordinate) {
      await page.mouse.move(coordinate[0], coordinate[1]);
    }
  }

  private async screenshot(page: Page): Promise<Buffer> {
    return await page.screenshot({ type: "png", fullPage: false });
  }

  private async wait(duration: number) {
    await new Promise((resolve) => setTimeout(resolve, duration * 1000));
  }

  private async zoom(page: Page, region: [number, number, number, number]): Promise<Buffer> {
    const [x, y, x1, y1] = region;
    return await page.screenshot({
      type: "png",
      clip: { x, y, width: x1 - x, height: y1 - y },
    });
  }

  // ============================================================================
  // WEBFETCH WITH DOMAIN PERMISSIONS
  // ============================================================================

  async webFetch(options: WebFetchOptions): Promise<string> {
    const { url, domain, timeout = 30000 } = options;

    // Check domain permission
    if (!this.isDomainAllowed(domain)) {
      throw new Error(`Domain ${domain} not approved. Use update_plan to approve.`);
    }

    log.info(`WebFetch: ${url} (domain: ${domain})`);

    const page = await this.getPage();
    await page.goto(url, { waitUntil: "networkidle", timeout });

    // Extract text content
    const text = await page.evaluate(() => {
      return document.body.innerText;
    });

    return text;
  }

  // ============================================================================
  // CONSOLE & NETWORK MONITORING
  // ============================================================================

  async readConsoleMessages(
    tabId: number,
    options?: {
      onlyErrors?: boolean;
      clear?: boolean;
      pattern?: string;
      limit?: number;
    },
  ): Promise<any[]> {
    const page = await this.getPage(tabId);

    const messages: any[] = [];

    page.on("console", (msg) => {
      if (options?.onlyErrors && msg.type() !== "error") return;
      if (options?.pattern && !msg.text().match(options.pattern)) return;

      messages.push({
        type: msg.type(),
        text: msg.text(),
        args: msg.args(),
      });
    });

    // Wait a bit for messages
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (options?.clear) {
      // Console clearing not directly supported via Playwright
      log.debug("Console clear requested (not directly supported)");
    }

    return messages.slice(0, options?.limit || 100);
  }

  async readNetworkRequests(
    tabId: number,
    options?: {
      urlPattern?: string;
      clear?: boolean;
      limit?: number;
    },
  ): Promise<any[]> {
    const page = await this.getPage(tabId);
    const requests: any[] = [];

    const requestHandler = (request: any) => {
      if (options?.urlPattern && !request.url().includes(options.urlPattern)) return;

      requests.push({
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
      });
    };

    page.on("request", requestHandler);

    // Wait a bit for requests
    await new Promise((resolve) => setTimeout(resolve, 100));

    page.removeListener("request", requestHandler);

    if (options?.clear) {
      // Requests auto-clear on navigation
    }

    return requests.slice(0, options?.limit || 100);
  }

  // ============================================================================
  // PERMISSION MANAGEMENT
  // ============================================================================

  approvePlan(domains: string[], approach: string[]): PlanApproval {
    const plan: PlanApproval = {
      domains,
      approach,
      approvedAt: Date.now(),
    };

    this.approvedPlans.push(plan);
    domains.forEach((d) => this.allowedDomains.add(d));

    log.info(`Approved plan for domains: ${domains.join(", ")}`);
    return plan;
  }

  private isDomainAllowed(domain: string): boolean {
    if (this.deniedDomains.has(domain)) return false;
    if (this.allowedDomains.has(domain)) return true;

    // Check wildcard patterns
    for (const allowed of this.allowedDomains) {
      if (allowed.startsWith("*.") && domain.endsWith(allowed.slice(1))) {
        return true;
      }
    }

    // Check approved plans
    return this.approvedPlans.some((plan) =>
      plan.domains.some((d) => d === domain || (d.startsWith("*.") && domain.endsWith(d.slice(1)))),
    );
  }

  // ============================================================================
  // GIF RECORDING
  // ============================================================================

  async startGifRecording(tabId: number): Promise<void> {
    const page = await this.getPage(tabId);

    if (!this.session!.recording) {
      this.session!.recording = {
        isRecording: true,
        frames: [],
        startTime: Date.now(),
      };
    }

    // Start capturing frames every 500ms
    const captureFrame = async () => {
      if (!this.session!.recording?.isRecording) return;

      const frame = await page.screenshot({ type: "png" });
      this.session!.recording.frames.push(frame);

      setTimeout(captureFrame, 500);
    };

    captureFrame();
    log.info("Started GIF recording");
  }

  async stopGifRecording(tabId: number): Promise<void> {
    if (this.session!.recording) {
      this.session!.recording.isRecording = false;
      log.info("Stopped GIF recording");
    }
  }

  async exportGif(options?: {
    filename?: string;
    quality?: number;
    showClickIndicators?: boolean;
  }): Promise<Buffer> {
    if (!this.session!.recording) {
      throw new Error("No recording in progress");
    }

    const { frames } = this.session!.recording;

    // Simple GIF export (in production, use gif.js or similar)
    log.info(`Exporting GIF with ${frames.length} frames`);

    // For now, return first frame as PNG
    // In production, would generate actual GIF
    return frames[0];
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async getPage(tabId?: number): Promise<Page> {
    if (!this.session) {
      throw new Error("Browser not initialized");
    }

    const id = tabId || this.session.currentTabId;
    const page = this.session.pages.get(id);

    if (!page) {
      throw new Error(`Tab ${id} not found`);
    }

    return page;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: BrowserOrchestrator | null = null;

export function getBrowserOrchestrator(): BrowserOrchestrator {
  if (!instance) {
    instance = new BrowserOrchestrator();
  }
  return instance;
}

export async function initializeBrowser(): Promise<BrowserOrchestrator> {
  const orchestrator = getBrowserOrchestrator();
  await orchestrator.initialize();
  return orchestrator;
}

export async function closeBrowser(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
