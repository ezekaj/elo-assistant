/**
 * Browser Integration with OpenClaw TUI
 *
 * Wires the new Claude Code-style browser automation
 * with OpenClaw TUI seamlessly.
 */

import {
  initializeBrowser,
  closeBrowser,
  BROWSER_TOOLS,
  registerBrowserTools,
} from "../browser-automation/index.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("browser-tui-integration");

let isInitialized = false;

/**
 * Initialize browser automation for TUI
 * Call this when TUI starts
 */
export async function initializeBrowserForTUI(): Promise<void> {
  if (isInitialized) {
    log.debug("Browser already initialized");
    return;
  }

  try {
    log.info("Initializing browser automation for TUI...");

    // Initialize browser orchestrator
    await initializeBrowser();

    // Register all 13 browser tools with OpenClaw
    registerBrowserTools();

    isInitialized = true;
    log.info("✅ Browser automation ready - 13 Claude Code tools available");
    log.info("   Tools: webfetch, navigate, computer, tabs_context_mcp, tabs_create_mcp,");
    log.info("          gif_creator, read_console_messages, read_network_requests,");
    log.info("          update_plan, get_page_text, resize_window, set_form_value, upload_image");
  } catch (error: any) {
    log.error("Failed to initialize browser:", error.message);
    throw error;
  }
}

/**
 * Cleanup browser on TUI exit
 */
export async function cleanupBrowserForTUI(): Promise<void> {
  if (!isInitialized) return;

  try {
    log.info("Closing browser...");
    await closeBrowser();
    isInitialized = false;
    log.info("Browser closed");
  } catch (error: any) {
    log.error("Error closing browser:", error.message);
  }
}

/**
 * Get browser status for TUI display
 */
export function getBrowserStatus(): {
  initialized: boolean;
  toolCount: number;
  tools: string[];
} {
  return {
    initialized: isInitialized,
    toolCount: BROWSER_TOOLS.length,
    tools: BROWSER_TOOLS.map((t) => t.name),
  };
}

/**
 * Check if a tool is a browser tool
 */
export function isBrowserTool(toolName: string): boolean {
  return BROWSER_TOOLS.some((t) => t.name === toolName);
}

// Auto-cleanup on process exit
process.on("exit", () => {
  if (isInitialized) {
    log.info("Auto-closing browser on exit...");
    closeBrowser().catch(() => {});
  }
});

process.on("SIGINT", () => {
  if (isInitialized) {
    log.info("Closing browser on SIGINT...");
    closeBrowser().catch(() => {});
  }
});
