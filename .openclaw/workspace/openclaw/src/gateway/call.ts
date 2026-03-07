import { randomUUID } from "node:crypto";
import type { OpenClawConfig } from "../config/config.js";
import {
  loadConfig,
  resolveConfigPath,
  resolveGatewayPort,
  resolveStateDir,
} from "../config/config.js";
import { loadOrCreateDeviceIdentity } from "../infra/device-identity.js";
import { type RetryConfig, retryAsync } from "../infra/retry.js";
import { pickPrimaryTailnetIPv4 } from "../infra/tailnet.js";
import { loadGatewayTlsRuntime } from "../infra/tls/gateway.js";
import { logDebug } from "../logger.js";
import {
  GATEWAY_CLIENT_MODES,
  GATEWAY_CLIENT_NAMES,
  type GatewayClientMode,
  type GatewayClientName,
} from "../utils/message-channel.js";
import { GatewayClient, GATEWAY_CLOSE_CODE_HINTS } from "./client.js";
import { PROTOCOL_VERSION } from "./protocol/index.js";

export type CallGatewayOptions = {
  url?: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
  config?: OpenClawConfig;
  method: string;
  params?: unknown;
  expectFinal?: boolean;
  timeoutMs?: number;
  clientName?: GatewayClientName;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: GatewayClientMode;
  instanceId?: string;
  minProtocol?: number;
  maxProtocol?: number;
  /**
   * Overrides the config path shown in connection error details.
   * Does not affect config loading; callers still control auth via opts.token/password/env/config.
   */
  configPath?: string;
  /**
   * Idempotency key for retry safety. If provided, the server can deduplicate
   * retried requests. Use randomIdempotencyKey() to generate one.
   */
  idempotencyKey?: string;
  /**
   * Retry configuration for transient failures (network errors, 5xx, timeouts).
   * Defaults to { attempts: 3, minDelayMs: 500, maxDelayMs: 10000, jitter: 0.2 }.
   * Set to false to disable retries.
   */
  retry?: RetryConfig | false;
};

export type GatewayConnectionDetails = {
  url: string;
  urlSource: string;
  bindDetail?: string;
  remoteFallbackNote?: string;
  message: string;
};

export function buildGatewayConnectionDetails(
  options: { config?: OpenClawConfig; url?: string; configPath?: string } = {},
): GatewayConnectionDetails {
  const config = options.config ?? loadConfig();
  const configPath =
    options.configPath ?? resolveConfigPath(process.env, resolveStateDir(process.env));
  const isRemoteMode = config.gateway?.mode === "remote";
  const remote = isRemoteMode ? config.gateway?.remote : undefined;
  const tlsEnabled = config.gateway?.tls?.enabled === true;
  const localPort = resolveGatewayPort(config);
  const tailnetIPv4 = pickPrimaryTailnetIPv4();
  const bindMode = config.gateway?.bind ?? "loopback";
  const preferTailnet = bindMode === "tailnet" && !!tailnetIPv4;
  const scheme = tlsEnabled ? "wss" : "ws";
  const localUrl =
    preferTailnet && tailnetIPv4
      ? `${scheme}://${tailnetIPv4}:${localPort}`
      : `${scheme}://127.0.0.1:${localPort}`;
  const urlOverride =
    typeof options.url === "string" && options.url.trim().length > 0
      ? options.url.trim()
      : undefined;
  const remoteUrl =
    typeof remote?.url === "string" && remote.url.trim().length > 0 ? remote.url.trim() : undefined;
  const remoteMisconfigured = isRemoteMode && !urlOverride && !remoteUrl;
  const url = urlOverride || remoteUrl || localUrl;
  const urlSource = urlOverride
    ? "cli --url"
    : remoteUrl
      ? "config gateway.remote.url"
      : remoteMisconfigured
        ? "missing gateway.remote.url (fallback local)"
        : preferTailnet && tailnetIPv4
          ? `local tailnet ${tailnetIPv4}`
          : "local loopback";
  const remoteFallbackNote = remoteMisconfigured
    ? "Warn: gateway.mode=remote but gateway.remote.url is missing; set gateway.remote.url or switch gateway.mode=local."
    : undefined;
  const bindDetail = !urlOverride && !remoteUrl ? `Bind: ${bindMode}` : undefined;
  const message = [
    `Gateway target: ${url}`,
    `Source: ${urlSource}`,
    `Config: ${configPath}`,
    bindDetail,
    remoteFallbackNote,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    url,
    urlSource,
    bindDetail,
    remoteFallbackNote,
    message,
  };
}

/**
 * Internal single-attempt gateway call. Used by callGateway with retry wrapper.
 */
async function callGatewayOnce<T = Record<string, unknown>>(
  opts: CallGatewayOptions,
  resolvedConfig: {
    url: string;
    token: string | undefined;
    password: string | undefined;
    tlsFingerprint: string | undefined;
    connectionDetails: GatewayConnectionDetails;
  },
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const { url, token, password, tlsFingerprint, connectionDetails } = resolvedConfig;

  const formatCloseError = (code: number, reason: string) => {
    const reasonText = reason?.trim() || "no close reason";
    const hint = GATEWAY_CLOSE_CODE_HINTS[code] ?? "";
    const suffix = hint ? ` ${hint}` : "";
    return `gateway closed (${code}${suffix}): ${reasonText}\n${connectionDetails.message}`;
  };
  const formatTimeoutError = () =>
    `gateway timeout after ${timeoutMs}ms\n${connectionDetails.message}`;

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    let ignoreClose = false;
    const stop = (err?: Error, value?: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(value as T);
      }
    };

    const client = new GatewayClient({
      url,
      token,
      password,
      tlsFingerprint,
      instanceId: opts.instanceId ?? randomUUID(),
      clientName: opts.clientName ?? GATEWAY_CLIENT_NAMES.CLI,
      clientDisplayName: opts.clientDisplayName,
      clientVersion: opts.clientVersion ?? "dev",
      platform: opts.platform,
      mode: opts.mode ?? GATEWAY_CLIENT_MODES.CLI,
      role: "operator",
      scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
      deviceIdentity: loadOrCreateDeviceIdentity(),
      minProtocol: opts.minProtocol ?? PROTOCOL_VERSION,
      maxProtocol: opts.maxProtocol ?? PROTOCOL_VERSION,
      onHelloOk: async () => {
        try {
          // Include idempotency key in params if provided
          const params = opts.idempotencyKey
            ? {
                ...(typeof opts.params === "object" && opts.params !== null ? opts.params : {}),
                _idempotencyKey: opts.idempotencyKey,
              }
            : opts.params;
          const result = await client.request<T>(opts.method, params, {
            expectFinal: opts.expectFinal,
          });
          ignoreClose = true;
          stop(undefined, result);
          client.stop();
        } catch (err) {
          ignoreClose = true;
          client.stop();
          stop(err as Error);
        }
      },
      onClose: (code, reason) => {
        if (settled || ignoreClose) {
          return;
        }
        ignoreClose = true;
        client.stop();
        stop(new Error(formatCloseError(code, reason)));
      },
    });

    const timer = setTimeout(() => {
      ignoreClose = true;
      client.stop();
      stop(new Error(formatTimeoutError()));
    }, timeoutMs);

    client.start();
  });
}

export async function callGateway<T = Record<string, unknown>>(
  opts: CallGatewayOptions,
): Promise<T> {
  const config = opts.config ?? loadConfig();
  const isRemoteMode = config.gateway?.mode === "remote";
  const remote = isRemoteMode ? config.gateway?.remote : undefined;
  const urlOverride =
    typeof opts.url === "string" && opts.url.trim().length > 0 ? opts.url.trim() : undefined;
  const remoteUrl =
    typeof remote?.url === "string" && remote.url.trim().length > 0 ? remote.url.trim() : undefined;
  if (isRemoteMode && !urlOverride && !remoteUrl) {
    const configPath =
      opts.configPath ?? resolveConfigPath(process.env, resolveStateDir(process.env));
    throw new Error(
      [
        "gateway remote mode misconfigured: gateway.remote.url missing",
        `Config: ${configPath}`,
        "Fix: set gateway.remote.url, or set gateway.mode=local.",
      ].join("\n"),
    );
  }
  const authToken = config.gateway?.auth?.token;
  const authPassword = config.gateway?.auth?.password;
  const connectionDetails = buildGatewayConnectionDetails({
    config,
    url: urlOverride,
    ...(opts.configPath ? { configPath: opts.configPath } : {}),
  });
  const url = connectionDetails.url;
  const useLocalTls =
    config.gateway?.tls?.enabled === true && !urlOverride && !remoteUrl && url.startsWith("wss://");
  const tlsRuntime = useLocalTls ? await loadGatewayTlsRuntime(config.gateway?.tls) : undefined;
  const remoteTlsFingerprint =
    isRemoteMode && !urlOverride && remoteUrl && typeof remote?.tlsFingerprint === "string"
      ? remote.tlsFingerprint.trim()
      : undefined;
  const overrideTlsFingerprint =
    typeof opts.tlsFingerprint === "string" ? opts.tlsFingerprint.trim() : undefined;
  const tlsFingerprint =
    overrideTlsFingerprint ||
    remoteTlsFingerprint ||
    (tlsRuntime?.enabled ? tlsRuntime.fingerprintSha256 : undefined);
  const token =
    (typeof opts.token === "string" && opts.token.trim().length > 0
      ? opts.token.trim()
      : undefined) ||
    (isRemoteMode
      ? typeof remote?.token === "string" && remote.token.trim().length > 0
        ? remote.token.trim()
        : undefined
      : process.env.OPENCLAW_GATEWAY_TOKEN?.trim() ||
        process.env.CLAWDBOT_GATEWAY_TOKEN?.trim() ||
        (typeof authToken === "string" && authToken.trim().length > 0
          ? authToken.trim()
          : undefined));
  const password =
    (typeof opts.password === "string" && opts.password.trim().length > 0
      ? opts.password.trim()
      : undefined) ||
    process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() ||
    process.env.CLAWDBOT_GATEWAY_PASSWORD?.trim() ||
    (isRemoteMode
      ? typeof remote?.password === "string" && remote.password.trim().length > 0
        ? remote.password.trim()
        : undefined
      : typeof authPassword === "string" && authPassword.trim().length > 0
        ? authPassword.trim()
        : undefined);

  const resolvedConfig = { url, token, password, tlsFingerprint, connectionDetails };

  // If retry is disabled, call once without retry wrapper
  if (opts.retry === false) {
    return callGatewayOnce<T>(opts, resolvedConfig);
  }

  // Merge user-provided retry config with defaults
  const retryConfig: RetryConfig = {
    ...DEFAULT_GATEWAY_RETRY,
    ...(typeof opts.retry === "object" ? opts.retry : {}),
  };

  return retryAsync(() => callGatewayOnce<T>(opts, resolvedConfig), {
    ...retryConfig,
    label: `gateway:${opts.method}`,
    shouldRetry: (err) => isRetryableGatewayError(err),
    onRetry: (info) => {
      logDebug(
        `[gateway] Retrying ${opts.method} (attempt ${info.attempt + 1}/${info.maxAttempts}) ` +
          `after ${info.delayMs}ms: ${String(info.err)}`,
      );
    },
  });
}

export function randomIdempotencyKey() {
  return randomUUID();
}

/** Default retry config for transient gateway failures. */
const DEFAULT_GATEWAY_RETRY: RetryConfig = {
  attempts: 3,
  minDelayMs: 500,
  maxDelayMs: 10_000,
  jitter: 0.2,
};

/** WebSocket close codes that indicate transient failures worth retrying. */
const RETRYABLE_CLOSE_CODES = new Set([
  1006, // Abnormal closure (no close frame) - network issue
  1012, // Service restart - gateway restarting
  1013, // Try again later
  4000, // Custom: tick timeout
]);

/** Error patterns that indicate transient failures. */
const RETRYABLE_ERROR_PATTERNS = [
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /EPIPE/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /gateway timeout/i,
  /gateway closed \(1006\)/i,
  /gateway closed \(1012\)/i,
  /gateway closed \(1013\)/i,
  /gateway closed \(4000\)/i,
  /abnormal closure/i,
  /service restart/i,
];

/**
 * Determines if an error is a transient failure that should be retried.
 * Returns false for auth errors, policy violations, and other permanent failures.
 */
function isRetryableGatewayError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message;

  // Don't retry auth/policy errors
  if (
    msg.includes("gateway closed (1008)") || // Policy violation
    msg.includes("auth") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid token")
  ) {
    return false;
  }

  // Check for retryable patterns
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(msg));
}
