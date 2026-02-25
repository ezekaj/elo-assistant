import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  browserAct,
  browserArmDialog,
  browserArmFileChooser,
  browserConsoleMessages,
  browserNavigate,
  browserPdfSave,
  browserScreenshotAction,
} from "../../browser/client-actions.js";
import {
  browserCloseTab,
  browserFocusTab,
  browserOpenTab,
  browserProfiles,
  browserSnapshot,
  browserStart,
  browserStatus,
  browserStop,
  browserTabs,
} from "../../browser/client.js";
import { resolveBrowserConfig } from "../../browser/config.js";
import { DEFAULT_AI_SNAPSHOT_MAX_CHARS } from "../../browser/constants.js";
import { loadConfig } from "../../config/config.js";
import { saveMediaBuffer } from "../../media/store.js";
import { BrowserToolSchema } from "./browser-tool.schema.js";
import { type AnyAgentTool, imageResultFromFile, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool } from "./gateway.js";
import { listNodes, resolveNodeIdFromList, type NodeListNode } from "./nodes-utils.js";

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE ENHANCEMENTS v2 - Session Reuse & Connection Pooling
// ═══════════════════════════════════════════════════════════════════════════

// 1. CONFIG CACHE - avoid reloading config multiple times per request
let cachedConfig: ReturnType<typeof loadConfig> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 5000;

function getCachedConfig() {
  const now = Date.now();
  if (!cachedConfig || now - configCacheTime > CONFIG_CACHE_TTL_MS) {
    cachedConfig = loadConfig();
    configCacheTime = now;
  }
  return cachedConfig;
}

// 2. BROWSER SESSION REUSE - Keep browser running between requests
type BrowserSession = {
  profile: string;
  pid: number;
  cdpPort: number;
  startedAt: number;
  lastUsed: number;
  targetId?: string;
};

const activeSessions = new Map<string, BrowserSession>();
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function getActiveSession(profile: string): BrowserSession | undefined {
  const session = activeSessions.get(profile);
  if (session) {
    const now = Date.now();
    if (now - session.lastUsed < SESSION_IDLE_TIMEOUT_MS) {
      session.lastUsed = now;
      return session;
    }
    // Session expired, remove it
    activeSessions.delete(profile);
  }
  return undefined;
}

function registerSession(profile: string, status: { pid?: number | null; cdpPort?: number }): void {
  if (status.pid && status.cdpPort) {
    const now = Date.now();
    activeSessions.set(profile, {
      profile,
      pid: status.pid,
      cdpPort: status.cdpPort,
      startedAt: now,
      lastUsed: now,
    });
  }
}

function updateSessionTargetId(profile: string, targetId: string): void {
  const session = activeSessions.get(profile);
  if (session) {
    session.targetId = targetId;
    session.lastUsed = Date.now();
  }
}

function clearSession(profile: string): void {
  activeSessions.delete(profile);
}

// 3. NODE RESOLUTION CACHE - avoid re-resolving nodes
type NodeResolutionCache = {
  result: Awaited<ReturnType<typeof resolveBrowserNodeTarget>>;
  timestamp: number;
};
const nodeResolutionCache = new Map<string, NodeResolutionCache>();
const NODE_CACHE_TTL_MS = 10000; // 10 seconds

function getCachedNodeResolution(key: string): NodeResolutionCache["result"] | undefined {
  const cached = nodeResolutionCache.get(key);
  if (cached && Date.now() - cached.timestamp < NODE_CACHE_TTL_MS) {
    return cached.result;
  }
  nodeResolutionCache.delete(key);
  return undefined;
}

function cacheNodeResolution(key: string, result: NodeResolutionCache["result"]): void {
  nodeResolutionCache.set(key, { result, timestamp: Date.now() });
}

/** Clear all caches (used in tests) */
export function clearBrowserToolCache() {
  cachedConfig = null;
  configCacheTime = 0;
  snapshotStates.clear();
  globalSnapshotVersion = 0;
  activeSessions.clear();
  nodeResolutionCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
// macOS VISION OCR - Fast native text extraction (~1s)
// ═══════════════════════════════════════════════════════════════════════════

const MACOS_VISION_OCR_SCRIPT = `
import Quartz
from Foundation import NSURL
import Vision
import sys
import json

def ocr_image(image_path):
    image_url = NSURL.fileURLWithPath_(image_path)
    image_source = Quartz.CGImageSourceCreateWithURL(image_url, None)
    if not image_source:
        return {"error": "Failed to load image"}

    cg_image = Quartz.CGImageSourceCreateImageAtIndex(image_source, 0, None)
    if not cg_image:
        return {"error": "Failed to create CGImage"}

    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    request.setUsesLanguageCorrection_(True)

    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_image, None)
    success, error = handler.performRequests_error_([request], None)

    if not success:
        return {"error": str(error)}

    results = request.results()
    texts = []
    for obs in results:
        candidate = obs.topCandidates_(1)
        if candidate and len(candidate) > 0:
            texts.append(candidate[0].string())

    return {"text": "\\n".join(texts), "lines": len(texts)}

if __name__ == "__main__":
    result = ocr_image(sys.argv[1])
    print(json.dumps(result))
`;

type MacOSVisionOCRResult = {
  text: string;
  lines: number;
  durationMs: number;
};

async function runMacOSVisionOCR(imagePath: string): Promise<MacOSVisionOCRResult> {
  const startTime = Date.now();

  // Write the Python script to a temp file
  const scriptPath = join(tmpdir(), `openclaw-ocr-${Date.now()}.py`);
  writeFileSync(scriptPath, MACOS_VISION_OCR_SCRIPT);

  try {
    // Use /usr/bin/python3 explicitly as it has pyobjc (Quartz/Vision) on macOS
    const result = execSync(`/usr/bin/python3 "${scriptPath}" "${imagePath}"`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    const parsed = JSON.parse(result.trim());
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return {
      text: parsed.text || "",
      lines: parsed.lines || 0,
      durationMs: Date.now() - startTime,
    };
  } finally {
    // Clean up script file
    if (existsSync(scriptPath)) {
      unlinkSync(scriptPath);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI 2.5 FLASH VISION - Direct multimodal understanding (~3-4s)
// ═══════════════════════════════════════════════════════════════════════════

type GeminiVisionResult = {
  text: string;
  durationMs: number;
};

const GEMINI_VISION_SCRIPT = `
import base64
import json
import urllib.request
import sys
import time

def vision_query(image_path, prompt, api_key):
    start = time.time()

    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/png", "data": image_data}}
            ]
        }],
        "generationConfig": {"maxOutputTokens": 4096}
    }

    req = urllib.request.Request(url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return {"text": text, "durationMs": int((time.time() - start) * 1000)}
    except Exception as e:
        return {"error": str(e), "durationMs": int((time.time() - start) * 1000)}

if __name__ == "__main__":
    result = vision_query(sys.argv[1], sys.argv[2], sys.argv[3])
    print(json.dumps(result))
`;

async function runGeminiVision(
  imagePath: string,
  prompt: string,
  apiKey: string,
): Promise<GeminiVisionResult> {
  const startTime = Date.now();
  const scriptPath = join(tmpdir(), `openclaw-gemini-vision-${Date.now()}.py`);
  writeFileSync(scriptPath, GEMINI_VISION_SCRIPT);

  try {
    // Escape prompt for shell
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\$/g, "\\$");
    const result = execSync(
      `/usr/bin/python3 "${scriptPath}" "${imagePath}" "${escapedPrompt}" "${apiKey}"`,
      {
        encoding: "utf-8",
        timeout: 60000,
      },
    );

    const parsed = JSON.parse(result.trim());
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return {
      text: parsed.text || "",
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (existsSync(scriptPath)) {
      unlinkSync(scriptPath);
    }
  }
}

// Retry configuration with exponential backoff
type RetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: RegExp[];
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  retryableErrors: [
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /socket hang up/i,
    /network.*unavailable/i,
    /fetch failed/i,
  ],
};

function isRetryableError(err: unknown, config: RetryConfig): boolean {
  const msg = String(err);
  return config.retryableErrors.some((re) => re.test(msg));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= config.maxAttempts || !isRetryableError(err, config)) {
        throw err;
      }
      const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt - 1), config.maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// Recovery hints for actionable error messages
type RecoveryHint = { pattern: RegExp; hint: string; action: string };
const RECOVERY_HINTS: RecoveryHint[] = [
  {
    pattern: /timeout.*exceeded.*waiting for locator/i,
    hint: "Element not found or page still loading.",
    action: "Take a fresh snapshot with action=snapshot to see current page state.",
  },
  {
    pattern: /net::ERR_NAME_NOT_RESOLVED/i,
    hint: "DNS resolution failed.",
    action: "Check the URL spelling or try a different domain.",
  },
  {
    pattern: /net::ERR_CONNECTION_REFUSED/i,
    hint: "Server refused the connection.",
    action: "The target server may be down. Try again or use a different URL.",
  },
  {
    pattern: /Chrome extension relay.*no tab.*connected/i,
    hint: "No Chrome tab attached to the relay.",
    action:
      'Click the OpenClaw toolbar icon on a tab, or use profile="openclaw" for isolated browser.',
  },
  {
    pattern: /target.*closed/i,
    hint: "The browser tab was closed.",
    action: "Open a new tab with action=open or restart with action=start.",
  },
  {
    pattern: /page crashed/i,
    hint: "Browser tab crashed.",
    action: "Close and reopen the tab, or restart the browser with action=stop then action=start.",
  },
  {
    pattern: /no.*browser.*found/i,
    hint: "Chrome/Brave/Edge not installed or not detected.",
    action: "Install a Chromium-based browser or set browser.executablePath in config.",
  },
  {
    pattern: /ref.*not found|invalid.*ref/i,
    hint: "Element reference is stale or invalid.",
    action: "Take a fresh snapshot to get current element refs.",
  },
  {
    pattern: /navigation.*timeout/i,
    hint: "Page took too long to load.",
    action:
      "The page may be slow. Try action=navigate with a longer timeout or check connectivity.",
  },
];

function enhanceErrorWithHints(error: unknown): Error {
  const msg = String(error);
  for (const { pattern, hint, action } of RECOVERY_HINTS) {
    if (pattern.test(msg)) {
      const enhanced = error instanceof Error ? error : new Error(msg);
      enhanced.message = `${enhanced.message}\n\n💡 ${hint}\n→ ${action}`;
      return enhanced;
    }
  }
  return error instanceof Error ? error : new Error(msg);
}

// Snapshot state tracking for stale ref detection
type SnapshotState = {
  version: number;
  targetId?: string;
  url?: string;
  timestamp: number;
};

const snapshotStates = new Map<string, SnapshotState>();
let globalSnapshotVersion = 0;

function recordSnapshot(targetId: string | undefined, url: string | undefined): number {
  const version = ++globalSnapshotVersion;
  const key = targetId ?? "__default__";
  snapshotStates.set(key, { version, targetId, url, timestamp: Date.now() });
  return version;
}

function getSnapshotState(targetId: string | undefined): SnapshotState | undefined {
  return snapshotStates.get(targetId ?? "__default__");
}

type BrowserProxyFile = {
  path: string;
  base64: string;
  mimeType?: string;
};

type BrowserProxyResult = {
  result: unknown;
  files?: BrowserProxyFile[];
};

const DEFAULT_BROWSER_PROXY_TIMEOUT_MS = 20_000;

type BrowserNodeTarget = {
  nodeId: string;
  label?: string;
};

function isBrowserNode(node: NodeListNode) {
  const caps = Array.isArray(node.caps) ? node.caps : [];
  const commands = Array.isArray(node.commands) ? node.commands : [];
  return caps.includes("browser") || commands.includes("browser.proxy");
}

async function resolveBrowserNodeTarget(params: {
  requestedNode?: string;
  target?: "sandbox" | "host" | "node";
  sandboxBridgeUrl?: string;
}): Promise<BrowserNodeTarget | null> {
  // Check cache first
  const cacheKey = `${params.requestedNode ?? ""}_${params.target ?? ""}_${params.sandboxBridgeUrl ?? ""}`;
  const cached = getCachedNodeResolution(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const cfg = getCachedConfig();
  const policy = cfg.gateway?.nodes?.browser;
  const mode = policy?.mode ?? "auto";
  if (mode === "off") {
    if (params.target === "node" || params.requestedNode) {
      throw new Error("Node browser proxy is disabled (gateway.nodes.browser.mode=off).");
    }
    return null;
  }
  if (params.sandboxBridgeUrl?.trim() && params.target !== "node" && !params.requestedNode) {
    return null;
  }
  if (params.target && params.target !== "node") {
    return null;
  }
  if (mode === "manual" && params.target !== "node" && !params.requestedNode) {
    return null;
  }

  const nodes = await listNodes({});
  const browserNodes = nodes.filter((node) => node.connected && isBrowserNode(node));
  if (browserNodes.length === 0) {
    if (params.target === "node" || params.requestedNode) {
      throw new Error("No connected browser-capable nodes.");
    }
    return null;
  }

  const requested = params.requestedNode?.trim() || policy?.node?.trim();
  if (requested) {
    const nodeId = resolveNodeIdFromList(browserNodes, requested, false);
    const node = browserNodes.find((entry) => entry.nodeId === nodeId);
    const result = { nodeId, label: node?.displayName ?? node?.remoteIp ?? nodeId };
    cacheNodeResolution(cacheKey, result);
    return result;
  }

  if (params.target === "node") {
    if (browserNodes.length === 1) {
      const node = browserNodes[0];
      const result = {
        nodeId: node.nodeId,
        label: node.displayName ?? node.remoteIp ?? node.nodeId,
      };
      cacheNodeResolution(cacheKey, result);
      return result;
    }
    throw new Error(
      `Multiple browser-capable nodes connected (${browserNodes.length}). Set gateway.nodes.browser.node or pass node=<id>.`,
    );
  }

  if (mode === "manual") {
    cacheNodeResolution(cacheKey, null);
    return null;
  }

  if (browserNodes.length === 1) {
    const node = browserNodes[0];
    const result = { nodeId: node.nodeId, label: node.displayName ?? node.remoteIp ?? node.nodeId };
    cacheNodeResolution(cacheKey, result);
    return result;
  }
  cacheNodeResolution(cacheKey, null);
  return null;
}

async function callBrowserProxy(params: {
  nodeId: string;
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
  profile?: string;
}): Promise<BrowserProxyResult> {
  const gatewayTimeoutMs =
    typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
      ? Math.max(1, Math.floor(params.timeoutMs))
      : DEFAULT_BROWSER_PROXY_TIMEOUT_MS;
  const payload = await callGatewayTool<{ payloadJSON?: string; payload?: string }>(
    "node.invoke",
    { timeoutMs: gatewayTimeoutMs },
    {
      nodeId: params.nodeId,
      command: "browser.proxy",
      params: {
        method: params.method,
        path: params.path,
        query: params.query,
        body: params.body,
        timeoutMs: params.timeoutMs,
        profile: params.profile,
      },
      idempotencyKey: crypto.randomUUID(),
    },
  );
  const parsed =
    payload?.payload ??
    (typeof payload?.payloadJSON === "string" && payload.payloadJSON
      ? (JSON.parse(payload.payloadJSON) as BrowserProxyResult)
      : null);
  if (!parsed || typeof parsed !== "object" || !("result" in parsed)) {
    throw new Error("browser proxy failed");
  }
  return parsed;
}

async function persistProxyFiles(files: BrowserProxyFile[] | undefined) {
  if (!files || files.length === 0) {
    return new Map<string, string>();
  }
  const mapping = new Map<string, string>();
  for (const file of files) {
    const buffer = Buffer.from(file.base64, "base64");
    const saved = await saveMediaBuffer(buffer, file.mimeType, "browser", buffer.byteLength);
    mapping.set(file.path, saved.path);
  }
  return mapping;
}

function applyProxyPaths(result: unknown, mapping: Map<string, string>) {
  if (!result || typeof result !== "object") {
    return;
  }
  const obj = result as Record<string, unknown>;
  if (typeof obj.path === "string" && mapping.has(obj.path)) {
    obj.path = mapping.get(obj.path);
  }
  if (typeof obj.imagePath === "string" && mapping.has(obj.imagePath)) {
    obj.imagePath = mapping.get(obj.imagePath);
  }
  const download = obj.download;
  if (download && typeof download === "object") {
    const d = download as Record<string, unknown>;
    if (typeof d.path === "string" && mapping.has(d.path)) {
      d.path = mapping.get(d.path);
    }
  }
}

function resolveBrowserBaseUrl(params: {
  target?: "sandbox" | "host";
  sandboxBridgeUrl?: string;
  allowHostControl?: boolean;
}): string | undefined {
  const cfg = getCachedConfig();
  const resolved = resolveBrowserConfig(cfg.browser, cfg);
  const normalizedSandbox = params.sandboxBridgeUrl?.trim() ?? "";
  const target = params.target ?? (normalizedSandbox ? "sandbox" : "host");

  if (target === "sandbox") {
    if (!normalizedSandbox) {
      throw new Error(
        'Sandbox browser is unavailable. Enable agents.defaults.sandbox.browser.enabled or use target="host" if allowed.',
      );
    }
    return normalizedSandbox.replace(/\/$/, "");
  }

  if (params.allowHostControl === false) {
    throw new Error("Host browser control is disabled by sandbox policy.");
  }
  if (!resolved.enabled) {
    throw new Error(
      "Browser control is disabled. Set browser.enabled=true in ~/.openclaw/openclaw.json.",
    );
  }
  return undefined;
}

export function createBrowserTool(opts?: {
  sandboxBridgeUrl?: string;
  allowHostControl?: boolean;
}): AnyAgentTool {
  const targetDefault = opts?.sandboxBridgeUrl ? "sandbox" : "host";
  const hostHint =
    opts?.allowHostControl === false ? "Host target blocked by policy." : "Host target allowed.";
  return {
    label: "Browser",
    name: "browser",
    description: [
      "Control the browser via OpenClaw's browser control server (status/start/stop/profiles/tabs/open/snapshot/screenshot/actions).",
      'Profiles: use profile="chrome" for Chrome extension relay takeover (your existing Chrome tabs). Use profile="openclaw" for the isolated openclaw-managed browser.',
      'If the user mentions the Chrome extension / Browser Relay / toolbar button / “attach tab”, ALWAYS use profile="chrome" (do not ask which profile).',
      'When a node-hosted browser proxy is available, the tool may auto-route to it. Pin a node with node=<id|name> or target="node".',
      "Chrome extension relay needs an attached tab: user must click the OpenClaw Browser Relay toolbar icon on the tab (badge ON). If no tab is connected, ask them to attach it.",
      "When using refs from snapshot (e.g. e12), keep the same tab: prefer passing targetId from the snapshot response into subsequent actions (act/click/type/etc).",
      'For stable, self-resolving refs across calls, use snapshot with refs="aria" (Playwright aria-ref ids). Default refs="role" are role+name-based.',
      "Use snapshot+act for UI automation. Avoid act:wait by default; use only in exceptional cases when no reliable UI state exists.",
      `target selects browser location (sandbox|host|node). Default: ${targetDefault}.`,
      hostHint,
    ].join(" "),
    parameters: BrowserToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const profile = readStringParam(params, "profile");
      const requestedNode = readStringParam(params, "node");
      let target = readStringParam(params, "target") as "sandbox" | "host" | "node" | undefined;

      if (requestedNode && target && target !== "node") {
        throw new Error('node is only supported with target="node".');
      }

      if (!target && !requestedNode && profile === "chrome") {
        // Chrome extension relay takeover is a host Chrome feature; prefer host unless explicitly targeting a node.
        target = "host";
      }

      const nodeTarget = await resolveBrowserNodeTarget({
        requestedNode: requestedNode ?? undefined,
        target,
        sandboxBridgeUrl: opts?.sandboxBridgeUrl,
      });

      const resolvedTarget = target === "node" ? undefined : target;
      const baseUrl = nodeTarget
        ? undefined
        : resolveBrowserBaseUrl({
            target: resolvedTarget,
            sandboxBridgeUrl: opts?.sandboxBridgeUrl,
            allowHostControl: opts?.allowHostControl,
          });

      const proxyRequest = nodeTarget
        ? async (opts: {
            method: string;
            path: string;
            query?: Record<string, string | number | boolean | undefined>;
            body?: unknown;
            timeoutMs?: number;
            profile?: string;
          }) => {
            const proxy = await callBrowserProxy({
              nodeId: nodeTarget.nodeId,
              method: opts.method,
              path: opts.path,
              query: opts.query,
              body: opts.body,
              timeoutMs: opts.timeoutMs,
              profile: opts.profile,
            });
            const mapping = await persistProxyFiles(proxy.files);
            applyProxyPaths(proxy.result, mapping);
            return proxy.result;
          }
        : null;

      switch (action) {
        case "status":
          if (proxyRequest) {
            return jsonResult(
              await proxyRequest({
                method: "GET",
                path: "/",
                profile,
              }),
            );
          }
          return jsonResult(await browserStatus(baseUrl, { profile }));
        case "start": {
          // SESSION REUSE: Check if browser is already running for this profile
          const existingSession = getActiveSession(profile ?? "default");
          if (existingSession) {
            // Verify it's still alive with a quick status check
            try {
              const status = proxyRequest
                ? await proxyRequest({ method: "GET", path: "/", profile })
                : await browserStatus(baseUrl, { profile });
              const statusObj = status as { running?: boolean; pid?: number };
              if (statusObj.running && statusObj.pid === existingSession.pid) {
                return jsonResult({
                  ...(typeof status === "object" && status !== null ? status : {}),
                  _reused: true,
                  _sessionAge: Date.now() - existingSession.startedAt,
                });
              }
            } catch {
              // Session invalid, clear it and start fresh
              clearSession(profile ?? "default");
            }
          }

          try {
            if (proxyRequest) {
              await withRetry(() =>
                proxyRequest({
                  method: "POST",
                  path: "/start",
                  profile,
                }),
              );
              const status = await proxyRequest({
                method: "GET",
                path: "/",
                profile,
              });
              // Register the new session
              registerSession(profile ?? "default", status as { pid?: number; cdpPort?: number });
              return jsonResult(status);
            }
            await withRetry(() => browserStart(baseUrl, { profile }));
            const status = await browserStatus(baseUrl, { profile });
            registerSession(profile ?? "default", status);
            return jsonResult(status);
          } catch (err) {
            throw enhanceErrorWithHints(err);
          }
        }
        case "stop":
          // Clear the session cache when stopping
          clearSession(profile ?? "default");
          if (proxyRequest) {
            await proxyRequest({
              method: "POST",
              path: "/stop",
              profile,
            });
            return jsonResult(
              await proxyRequest({
                method: "GET",
                path: "/",
                profile,
              }),
            );
          }
          await browserStop(baseUrl, { profile });
          return jsonResult(await browserStatus(baseUrl, { profile }));
        case "profiles":
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "GET",
              path: "/profiles",
            });
            return jsonResult(result);
          }
          return jsonResult({ profiles: await browserProfiles(baseUrl) });
        case "tabs":
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "GET",
              path: "/tabs",
              profile,
            });
            const tabs = (result as { tabs?: unknown[] }).tabs ?? [];
            return jsonResult({ tabs });
          }
          return jsonResult({ tabs: await browserTabs(baseUrl, { profile }) });
        case "open": {
          const targetUrl = readStringParam(params, "targetUrl", {
            required: true,
          });
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "POST",
              path: "/tabs/open",
              profile,
              body: { url: targetUrl },
            });
            return jsonResult(result);
          }
          return jsonResult(await browserOpenTab(baseUrl, targetUrl, { profile }));
        }
        case "focus": {
          const targetId = readStringParam(params, "targetId", {
            required: true,
          });
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "POST",
              path: "/tabs/focus",
              profile,
              body: { targetId },
            });
            return jsonResult(result);
          }
          await browserFocusTab(baseUrl, targetId, { profile });
          return jsonResult({ ok: true });
        }
        case "close": {
          const targetId = readStringParam(params, "targetId");
          if (proxyRequest) {
            const result = targetId
              ? await proxyRequest({
                  method: "DELETE",
                  path: `/tabs/${encodeURIComponent(targetId)}`,
                  profile,
                })
              : await proxyRequest({
                  method: "POST",
                  path: "/act",
                  profile,
                  body: { kind: "close" },
                });
            return jsonResult(result);
          }
          if (targetId) {
            await browserCloseTab(baseUrl, targetId, { profile });
          } else {
            await browserAct(baseUrl, { kind: "close" }, { profile });
          }
          return jsonResult({ ok: true });
        }
        case "snapshot": {
          const snapshotDefaults = getCachedConfig().browser?.snapshotDefaults;
          const format =
            params.snapshotFormat === "ai" || params.snapshotFormat === "aria"
              ? params.snapshotFormat
              : "ai";
          const mode =
            params.mode === "efficient"
              ? "efficient"
              : format === "ai" && snapshotDefaults?.mode === "efficient"
                ? "efficient"
                : undefined;
          const labels = typeof params.labels === "boolean" ? params.labels : undefined;
          const refs = params.refs === "aria" || params.refs === "role" ? params.refs : undefined;
          const hasMaxChars = Object.hasOwn(params, "maxChars");
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const limit =
            typeof params.limit === "number" && Number.isFinite(params.limit)
              ? params.limit
              : undefined;
          const maxChars =
            typeof params.maxChars === "number" &&
            Number.isFinite(params.maxChars) &&
            params.maxChars > 0
              ? Math.floor(params.maxChars)
              : undefined;
          const resolvedMaxChars =
            format === "ai"
              ? hasMaxChars
                ? maxChars
                : mode === "efficient"
                  ? undefined
                  : DEFAULT_AI_SNAPSHOT_MAX_CHARS
              : undefined;
          const interactive =
            typeof params.interactive === "boolean" ? params.interactive : undefined;
          const compact = typeof params.compact === "boolean" ? params.compact : undefined;
          const depth =
            typeof params.depth === "number" && Number.isFinite(params.depth)
              ? params.depth
              : undefined;
          const selector = typeof params.selector === "string" ? params.selector.trim() : undefined;
          const frame = typeof params.frame === "string" ? params.frame.trim() : undefined;
          let snapshot: Awaited<ReturnType<typeof browserSnapshot>>;
          try {
            snapshot = proxyRequest
              ? ((await withRetry(() =>
                  proxyRequest({
                    method: "GET",
                    path: "/snapshot",
                    profile,
                    query: {
                      format,
                      targetId,
                      limit,
                      ...(typeof resolvedMaxChars === "number"
                        ? { maxChars: resolvedMaxChars }
                        : {}),
                      refs,
                      interactive,
                      compact,
                      depth,
                      selector,
                      frame,
                      labels,
                      mode,
                    },
                  }),
                )) as Awaited<ReturnType<typeof browserSnapshot>>)
              : await withRetry(() =>
                  browserSnapshot(baseUrl, {
                    format,
                    targetId,
                    limit,
                    ...(typeof resolvedMaxChars === "number" ? { maxChars: resolvedMaxChars } : {}),
                    refs,
                    interactive,
                    compact,
                    depth,
                    selector,
                    frame,
                    labels,
                    mode,
                    profile,
                  }),
                );
          } catch (err) {
            throw enhanceErrorWithHints(err);
          }
          // Track snapshot state for stale ref detection
          const snapshotVersion = recordSnapshot(snapshot.targetId, snapshot.url);
          if (snapshot.format === "ai") {
            if (labels && snapshot.imagePath) {
              return await imageResultFromFile({
                label: "browser:snapshot",
                path: snapshot.imagePath,
                extraText: snapshot.snapshot,
                details: snapshot,
              });
            }
            return {
              content: [{ type: "text", text: snapshot.snapshot }],
              details: snapshot,
            };
          }
          return jsonResult(snapshot);
        }
        case "screenshot": {
          const targetId = readStringParam(params, "targetId");
          const fullPage = Boolean(params.fullPage);
          const ref = readStringParam(params, "ref");
          const element = readStringParam(params, "element");
          const type = params.type === "jpeg" ? "jpeg" : "png";
          let result: Awaited<ReturnType<typeof browserScreenshotAction>>;
          try {
            result = proxyRequest
              ? ((await withRetry(() =>
                  proxyRequest({
                    method: "POST",
                    path: "/screenshot",
                    profile,
                    body: {
                      targetId,
                      fullPage,
                      ref,
                      element,
                      type,
                    },
                  }),
                )) as Awaited<ReturnType<typeof browserScreenshotAction>>)
              : await withRetry(() =>
                  browserScreenshotAction(baseUrl, {
                    targetId,
                    fullPage,
                    ref,
                    element,
                    type,
                    profile,
                  }),
                );
          } catch (err) {
            throw enhanceErrorWithHints(err);
          }
          return await imageResultFromFile({
            label: "browser:screenshot",
            path: result.path,
            details: result,
          });
        }
        case "navigate": {
          const targetUrl = readStringParam(params, "targetUrl", {
            required: true,
          });
          const targetId = readStringParam(params, "targetId");
          try {
            if (proxyRequest) {
              const result = await withRetry(() =>
                proxyRequest({
                  method: "POST",
                  path: "/navigate",
                  profile,
                  body: {
                    url: targetUrl,
                    targetId,
                  },
                }),
              );
              return jsonResult(result);
            }
            return jsonResult(
              await withRetry(() =>
                browserNavigate(baseUrl, {
                  url: targetUrl,
                  targetId,
                  profile,
                }),
              ),
            );
          } catch (err) {
            throw enhanceErrorWithHints(err);
          }
        }
        case "console": {
          const level = typeof params.level === "string" ? params.level.trim() : undefined;
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "GET",
              path: "/console",
              profile,
              query: {
                level,
                targetId,
              },
            });
            return jsonResult(result);
          }
          return jsonResult(await browserConsoleMessages(baseUrl, { level, targetId, profile }));
        }
        case "pdf": {
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const result = proxyRequest
            ? ((await proxyRequest({
                method: "POST",
                path: "/pdf",
                profile,
                body: { targetId },
              })) as Awaited<ReturnType<typeof browserPdfSave>>)
            : await browserPdfSave(baseUrl, { targetId, profile });
          return {
            content: [{ type: "text", text: `FILE:${result.path}` }],
            details: result,
          };
        }
        case "upload": {
          const paths = Array.isArray(params.paths) ? params.paths.map((p) => String(p)) : [];
          if (paths.length === 0) {
            throw new Error("paths required");
          }
          const ref = readStringParam(params, "ref");
          const inputRef = readStringParam(params, "inputRef");
          const element = readStringParam(params, "element");
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const timeoutMs =
            typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
              ? params.timeoutMs
              : undefined;
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "POST",
              path: "/hooks/file-chooser",
              profile,
              body: {
                paths,
                ref,
                inputRef,
                element,
                targetId,
                timeoutMs,
              },
            });
            return jsonResult(result);
          }
          return jsonResult(
            await browserArmFileChooser(baseUrl, {
              paths,
              ref,
              inputRef,
              element,
              targetId,
              timeoutMs,
              profile,
            }),
          );
        }
        case "dialog": {
          const accept = Boolean(params.accept);
          const promptText = typeof params.promptText === "string" ? params.promptText : undefined;
          const targetId = typeof params.targetId === "string" ? params.targetId.trim() : undefined;
          const timeoutMs =
            typeof params.timeoutMs === "number" && Number.isFinite(params.timeoutMs)
              ? params.timeoutMs
              : undefined;
          if (proxyRequest) {
            const result = await proxyRequest({
              method: "POST",
              path: "/hooks/dialog",
              profile,
              body: {
                accept,
                promptText,
                targetId,
                timeoutMs,
              },
            });
            return jsonResult(result);
          }
          return jsonResult(
            await browserArmDialog(baseUrl, {
              accept,
              promptText,
              targetId,
              timeoutMs,
              profile,
            }),
          );
        }
        case "act": {
          const request = params.request as Record<string, unknown> | undefined;
          if (!request || typeof request !== "object") {
            throw new Error("request required");
          }
          try {
            const result = proxyRequest
              ? await withRetry(() =>
                  proxyRequest({
                    method: "POST",
                    path: "/act",
                    profile,
                    body: request,
                  }),
                )
              : await withRetry(() =>
                  browserAct(baseUrl, request as Parameters<typeof browserAct>[1], {
                    profile,
                  }),
                );
            return jsonResult(result);
          } catch (err) {
            const msg = String(err);
            if (msg.includes("404:") && msg.includes("tab not found") && profile === "chrome") {
              const tabs = proxyRequest
                ? ((
                    (await proxyRequest({
                      method: "GET",
                      path: "/tabs",
                      profile,
                    })) as { tabs?: unknown[] }
                  ).tabs ?? [])
                : await browserTabs(baseUrl, { profile }).catch(() => []);
              if (!tabs.length) {
                throw new Error(
                  "No Chrome tabs are attached via the OpenClaw Browser Relay extension. Click the toolbar icon on the tab you want to control (badge ON), then retry.",
                  { cause: err },
                );
              }
              throw new Error(
                `Chrome tab not found (stale targetId?). Run action=tabs profile="chrome" and use one of the returned targetIds.`,
                { cause: err },
              );
            }
            throw enhanceErrorWithHints(err);
          }
        }
        case "ocr": {
          // macOS Vision OCR - Fast native text extraction (~1s)
          // Takes a screenshot and extracts all text using Apple's Vision framework
          const targetId = readStringParam(params, "targetId");
          const fullPage = Boolean(params.fullPage);

          // First take a screenshot
          let screenshotResult: Awaited<ReturnType<typeof browserScreenshotAction>>;
          try {
            screenshotResult = proxyRequest
              ? ((await withRetry(() =>
                  proxyRequest({
                    method: "POST",
                    path: "/screenshot",
                    profile,
                    body: {
                      targetId,
                      fullPage,
                      type: "png",
                    },
                  }),
                )) as Awaited<ReturnType<typeof browserScreenshotAction>>)
              : await withRetry(() =>
                  browserScreenshotAction(baseUrl, {
                    targetId,
                    fullPage,
                    type: "png",
                    profile,
                  }),
                );
          } catch (err) {
            throw enhanceErrorWithHints(err);
          }

          // Run macOS Vision OCR on the screenshot
          try {
            const ocrResult = await runMacOSVisionOCR(screenshotResult.path);
            return {
              content: [{ type: "text", text: ocrResult.text }],
              details: {
                action: "ocr",
                engine: "macos-vision",
                durationMs: ocrResult.durationMs,
                lines: ocrResult.lines,
                screenshotPath: screenshotResult.path,
              },
            };
          } catch (err) {
            throw new Error(
              `macOS Vision OCR failed: ${err}. This action requires macOS with Python3 and pyobjc installed.`,
            );
          }
        }
        case "vision": {
          // Gemini 2.5 Flash Vision - Direct multimodal understanding (~3-4s)
          // Takes a screenshot and sends it to Gemini Flash for direct understanding
          const targetId = readStringParam(params, "targetId");
          const fullPage = Boolean(params.fullPage);
          const prompt =
            readStringParam(params, "prompt") ||
            "Describe what you see in this screenshot. Extract any relevant text and information.";
          const apiKey = readStringParam(params, "apiKey") || process.env.GEMINI_API_KEY || "";

          if (!apiKey) {
            throw new Error(
              "Gemini API key required. Pass apiKey parameter or set GEMINI_API_KEY environment variable.",
            );
          }

          // First take a screenshot
          let screenshotResult: Awaited<ReturnType<typeof browserScreenshotAction>>;
          try {
            screenshotResult = proxyRequest
              ? ((await withRetry(() =>
                  proxyRequest({
                    method: "POST",
                    path: "/screenshot",
                    profile,
                    body: {
                      targetId,
                      fullPage,
                      type: "png",
                    },
                  }),
                )) as Awaited<ReturnType<typeof browserScreenshotAction>>)
              : await withRetry(() =>
                  browserScreenshotAction(baseUrl, {
                    targetId,
                    fullPage,
                    type: "png",
                    profile,
                  }),
                );
          } catch (err) {
            throw enhanceErrorWithHints(err);
          }

          // Run Gemini Vision on the screenshot
          try {
            const visionResult = await runGeminiVision(screenshotResult.path, prompt, apiKey);
            return {
              content: [{ type: "text", text: visionResult.text }],
              details: {
                action: "vision",
                engine: "gemini-2.0-flash",
                durationMs: visionResult.durationMs,
                prompt,
                screenshotPath: screenshotResult.path,
              },
            };
          } catch (err) {
            throw new Error(`Gemini Vision failed: ${err}`);
          }
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
