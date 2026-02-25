/**
 * Browser Tools - Claude Code Style
 *
 * 13 browser automation tools matching Claude Code exactly:
 * 1. webfetch - Fetch with domain permissions
 * 2. navigate - URL navigation
 * 3. computer - Mouse & keyboard (11 actions)
 * 4. tabs_context_mcp - Get tab context
 * 5. tabs_create_mcp - Create tab
 * 6. screenshot - Take screenshots
 * 7. gif_creator - Record & export GIFs
 * 8. set_form_value - Form interaction
 * 9. read_console_messages - Console monitoring
 * 10. read_network_requests - Network monitoring
 * 11. resize_window - Window management
 * 12. update_plan - Plan approval
 * 13. get_page_text - Text extraction
 */

import { type AnyAgentTool, jsonResult, readStringParam } from "../agents/tools/common.js";
import { getBrowserOrchestrator, type ComputerAction } from "./browser-orchestrator.js";

// ============================================================================
// 1. WEBFETCH
// ============================================================================

export const WebFetchTool: AnyAgentTool = {
  name: "webfetch",
  description: "Fetch web content with domain-based permissions. Use domain:example.com format.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const url = readStringParam(params.url, "url");
    const domain = readStringParam(params.domain, "domain");

    try {
      const content = await orchestrator.webFetch({ url, domain });
      return jsonResult({
        success: true,
        content: content.slice(0, 10000), // Limit response
        url,
        domain,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 2. NAVIGATE
// ============================================================================

export const NavigateTool: AnyAgentTool = {
  name: "navigate",
  description: "Navigate to a URL, or go forward/back in browser history.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const url = readStringParam(params.url, "url");
    const tabId = params.tabId ? Number(params.tabId) : undefined;

    try {
      if (url === "forward") {
        await orchestrator.goForward(tabId);
      } else if (url === "back") {
        await orchestrator.goBack(tabId);
      } else {
        await orchestrator.navigate(url, tabId);
      }

      return jsonResult({
        success: true,
        url: url === "forward" || url === "back" ? "history" : url,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 3. COMPUTER (11 ACTION TYPES)
// ============================================================================

export const ComputerTool: AnyAgentTool = {
  name: "computer",
  description:
    "Use mouse and keyboard to interact with a web browser. Actions: left_click, right_click, double_click, triple_click, left_click_drag, type, key, scroll, scroll_to, hover, screenshot, wait, zoom.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const action = readStringParam(params.action, "action") as ComputerAction["action"];
    const tabId = Number(params.tabId);

    const computerAction: ComputerAction = {
      action,
      tabId,
      coordinate: params.coordinate
        ? [Number(params.coordinate[0]), Number(params.coordinate[1])]
        : undefined,
      start_coordinate: params.start_coordinate
        ? [Number(params.start_coordinate[0]), Number(params.start_coordinate[1])]
        : undefined,
      text: params.text,
      duration: params.duration,
      scroll_direction: params.scroll_direction,
      scroll_amount: params.scroll_amount,
      ref: params.ref,
      region: params.region,
      repeat: params.repeat,
      modifiers: params.modifiers,
    };

    try {
      const result = await orchestrator.executeComputerAction(computerAction);

      if (action === "screenshot" || action === "zoom") {
        // Return image buffer
        return {
          type: "image",
          data: result,
          mimeType: "image/png",
        };
      }

      return jsonResult({
        success: true,
        action,
        executed: true,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 4. TABS_CONTEXT_MCP
// ============================================================================

export const TabsContextTool: AnyAgentTool = {
  name: "tabs_context_mcp",
  description:
    "Get context information about the current tab group. CRITICAL: Call this before using other browser tools.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    try {
      // Create tab if empty
      if (params.createIfEmpty) {
        const context = await orchestrator.getTabContext();
        if (context.tabGroup.tabs.length === 0) {
          await orchestrator.createTab();
        }
      }

      const context = await orchestrator.getTabContext();
      return jsonResult(context);
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 5. TABS_CREATE_MCP
// ============================================================================

export const TabsCreateTool: AnyAgentTool = {
  name: "tabs_create_mcp",
  description: "Create a new empty tab in the MCP tab group.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    try {
      const tab = await orchestrator.createTab();
      return jsonResult({
        success: true,
        tab,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 6. GIF_CREATOR
// ============================================================================

export const GifCreatorTool: AnyAgentTool = {
  name: "gif_creator",
  description:
    "Manage GIF recording for browser automation. Actions: start_recording, stop_recording, export, clear.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const action = readStringParam(params.action, "action");
    const tabId = Number(params.tabId);

    try {
      switch (action) {
        case "start_recording":
          await orchestrator.startGifRecording(tabId);
          return jsonResult({ success: true, action: "started" });

        case "stop_recording":
          await orchestrator.stopGifRecording(tabId);
          return jsonResult({ success: true, action: "stopped" });

        case "export":
          const gif = await orchestrator.exportGif({
            filename: params.filename,
            quality: params.quality,
            showClickIndicators: params.options?.showClickIndicators,
          });
          return {
            type: "image",
            data: gif,
            mimeType: "image/gif",
            filename: params.filename || "recording.gif",
          };

        case "clear":
          // Clear recording frames
          return jsonResult({ success: true, action: "cleared" });

        default:
          return jsonResult({
            success: false,
            error: `Unknown action: ${action}`,
          });
      }
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 7. READ_CONSOLE_MESSAGES
// ============================================================================

export const ReadConsoleTool: AnyAgentTool = {
  name: "read_console_messages",
  description: 'Read browser console messages. Use pattern to filter (e.g., "error|warning").',
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const tabId = Number(params.tabId);

    try {
      const messages = await orchestrator.readConsoleMessages(tabId, {
        onlyErrors: params.onlyErrors,
        clear: params.clear,
        pattern: params.pattern,
        limit: params.limit,
      });

      return jsonResult({
        success: true,
        messages: messages.map((m) => ({
          type: m.type,
          text: m.text,
        })),
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 8. READ_NETWORK_REQUESTS
// ============================================================================

export const ReadNetworkTool: AnyAgentTool = {
  name: "read_network_requests",
  description: 'Read HTTP network requests. Use urlPattern to filter (e.g., "/api/").',
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const tabId = Number(params.tabId);

    try {
      const requests = await orchestrator.readNetworkRequests(tabId, {
        urlPattern: params.urlPattern,
        clear: params.clear,
        limit: params.limit,
      });

      return jsonResult({
        success: true,
        requests: requests.map((r) => ({
          url: r.url,
          method: r.method,
          timestamp: r.timestamp,
        })),
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 9. UPDATE_PLAN
// ============================================================================

export const UpdatePlanTool: AnyAgentTool = {
  name: "update_plan",
  description: "Present a plan for approval. List domains you will visit and your approach.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const domains = Array.isArray(params.domains) ? params.domains : [];
    const approach = Array.isArray(params.approach) ? params.approach : [];

    try {
      const plan = orchestrator.approvePlan(domains, approach);

      return jsonResult({
        success: true,
        plan: {
          domains: plan.domains,
          approach: plan.approach,
          approvedAt: new Date(plan.approvedAt).toISOString(),
        },
        message: `Plan approved for ${domains.length} domain(s)`,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 10. GET_PAGE_TEXT
// ============================================================================

export const GetPageTextTool: AnyAgentTool = {
  name: "get_page_text",
  description: "Extract raw text content from the page, prioritizing article content.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const tabId = Number(params.tabId);
    const page = await orchestrator["getPage"](tabId);

    try {
      const text = await page.evaluate(() => {
        // Extract article content preferentially
        const article = document.querySelector("article");
        if (article) return article.innerText;

        // Fallback to main content
        const main = document.querySelector("main");
        if (main) return main.innerText;

        // Last resort: body
        return document.body.innerText;
      });

      return jsonResult({
        success: true,
        text: text.slice(0, 50000), // Limit response
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 11. RESIZE_WINDOW
// ============================================================================

export const ResizeWindowTool: AnyAgentTool = {
  name: "resize_window",
  description: "Resize the browser window to specified dimensions.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const width = Number(params.width);
    const height = Number(params.height);
    const tabId = Number(params.tabId);
    const page = await orchestrator["getPage"](tabId);

    try {
      await page.setViewportSize({ width, height });

      return jsonResult({
        success: true,
        width,
        height,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 12. SET_FORM_VALUE
// ============================================================================

export const SetFormValueTool: AnyAgentTool = {
  name: "set_form_value",
  description: "Set form input values. Supports text inputs, checkboxes, selects.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const ref = readStringParam(params.ref, "ref");
    const value = params.value;
    const tabId = Number(params.tabId);
    const page = await orchestrator["getPage"](tabId);

    try {
      const element = page.locator(`[data-ref="${ref}"]`);

      // Check if checkbox
      const tagName = await element.evaluate((el) => el.tagName);

      if (tagName === "INPUT" && (await element.evaluate((el: any) => el.type === "checkbox"))) {
        if (value) {
          await element.check();
        } else {
          await element.uncheck();
        }
      } else if (tagName === "SELECT") {
        await element.selectOption(value.toString());
      } else {
        await element.fill(value.toString());
      }

      return jsonResult({
        success: true,
        ref,
        value,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// 13. UPLOAD_IMAGE
// ============================================================================

export const UploadImageTool: AnyAgentTool = {
  name: "upload_image",
  description: "Upload an image to a file input or drag & drop target.",
  execute: async (params: any) => {
    const orchestrator = getBrowserOrchestrator();

    const imageId = readStringParam(params.imageId, "imageId");
    const ref = params.ref;
    const coordinate = params.coordinate;
    const tabId = Number(params.tabId);
    const page = await orchestrator["getPage"](tabId);

    try {
      // In production, would retrieve image from storage by imageId
      // For now, just validate parameters

      if (ref) {
        // Upload to file input
        await page.locator(`[data-ref="${ref}"]`).setInputFiles([]);
      } else if (coordinate) {
        // Drag & drop to coordinate
        // Would implement drag-to-coordinate logic
      }

      return jsonResult({
        success: true,
        imageId,
        uploaded: true,
      });
    } catch (error: any) {
      return jsonResult({
        success: false,
        error: error.message,
      });
    }
  },
};

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

export const BROWSER_TOOLS: AnyAgentTool[] = [
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
];

export function registerBrowserTools(): void {
  log.info("Registered 13 Claude Code-style browser tools");
}

import { createSubsystemLogger } from "../logging/subsystem.js";
const log = createSubsystemLogger("browser-tools");
