/**
 * Browser Automation - Claude Code Style
 *
 * Complete browser automation system independent of OpenClaw's Brave-based system.
 * Uses Playwright for Chromium automation.
 *
 * Features:
 * - 13 Claude Code-style tools
 * - WebFetch with domain permissions
 * - Computer tool (11 action types)
 * - Tab management
 * - Screenshots & GIF recording
 * - Console & network monitoring
 * - Form interaction
 * - Plan management
 */

export {
  BrowserOrchestrator,
  type TabInfo,
  type TabContext,
  type BrowserSession,
  type ComputerAction,
  type WebFetchOptions,
  type PlanApproval,
  getBrowserOrchestrator,
  initializeBrowser,
  closeBrowser,
} from "./browser-orchestrator.js";

export {
  BROWSER_TOOLS,
  WebFetchTool,
  NavigateTool,
  ComputerTool,
  TabsContextTool,
  TabsCreateTool,
  GifCreatorTool,
  ReadConsoleTool,
  ReadNetworkTool,
  UpdatePlanTool,
  GetPageTextTool,
  ResizeWindowTool,
  SetFormValueTool,
  UploadImageTool,
  registerBrowserTools,
} from "./browser-tools.js";
