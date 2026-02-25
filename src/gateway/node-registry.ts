import { randomUUID } from "node:crypto";
import type { GatewayWsClient } from "./server/ws-types.js";
import { scheduleTimeout, cancelTimeout } from "../agents/timer-wheel.js";

export type NodeSession = {
  nodeId: string;
  connId: string;
  client: GatewayWsClient;
  displayName?: string;
  platform?: string;
  version?: string;
  coreVersion?: string;
  uiVersion?: string;
  deviceFamily?: string;
  modelIdentifier?: string;
  remoteIp?: string;
  caps: string[];
  commands: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  connectedAtMs: number;
};

type PendingInvoke = {
  nodeId: string;
  command: string;
  resolve: (value: NodeInvokeResult) => void;
  reject: (err: Error) => void;
  timerId: string;
};

/** TTL for idempotency key deduplication (5 minutes). */
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

type IdempotencyEntry = {
  result: NodeInvokeResult;
  expiresAt: number;
};

export type NodeInvokeResult = {
  ok: boolean;
  payload?: unknown;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
};

/** Max pending requests per node before backpressure kicks in */
const MAX_PENDING_PER_NODE = 100;

export class NodeRegistry {
  private nodesById = new Map<string, NodeSession>();
  private nodesByConn = new Map<string, string>();
  private pendingInvokes = new Map<string, PendingInvoke>();
  /** Cache for idempotency key deduplication. Key = idempotencyKey, Value = cached result. */
  private idempotencyCache = new Map<string, IdempotencyEntry>();
  /** Track pending count per node for backpressure */
  private pendingCountByNode = new Map<string, number>();

  register(client: GatewayWsClient, opts: { remoteIp?: string | undefined }) {
    const connect = client.connect;
    const nodeId = connect.device?.id ?? connect.client.id;
    const caps = Array.isArray(connect.caps) ? connect.caps : [];
    const commands = Array.isArray((connect as { commands?: string[] }).commands)
      ? ((connect as { commands?: string[] }).commands ?? [])
      : [];
    const permissions =
      typeof (connect as { permissions?: Record<string, boolean> }).permissions === "object"
        ? ((connect as { permissions?: Record<string, boolean> }).permissions ?? undefined)
        : undefined;
    const pathEnv =
      typeof (connect as { pathEnv?: string }).pathEnv === "string"
        ? (connect as { pathEnv?: string }).pathEnv
        : undefined;
    const session: NodeSession = {
      nodeId,
      connId: client.connId,
      client,
      displayName: connect.client.displayName,
      platform: connect.client.platform,
      version: connect.client.version,
      coreVersion: (connect as { coreVersion?: string }).coreVersion,
      uiVersion: (connect as { uiVersion?: string }).uiVersion,
      deviceFamily: connect.client.deviceFamily,
      modelIdentifier: connect.client.modelIdentifier,
      remoteIp: opts.remoteIp,
      caps,
      commands,
      permissions,
      pathEnv,
      connectedAtMs: Date.now(),
    };
    this.nodesById.set(nodeId, session);
    this.nodesByConn.set(client.connId, nodeId);
    return session;
  }

  unregister(connId: string): string | null {
    const nodeId = this.nodesByConn.get(connId);
    if (!nodeId) {
      return null;
    }
    this.nodesByConn.delete(connId);
    this.nodesById.delete(nodeId);
    for (const [id, pending] of this.pendingInvokes.entries()) {
      if (pending.nodeId !== nodeId) {
        continue;
      }
      cancelTimeout(pending.timerId);
      pending.reject(new Error(`node disconnected (${pending.command})`));
      this.pendingInvokes.delete(id);
    }
    return nodeId;
  }

  listConnected(): NodeSession[] {
    return [...this.nodesById.values()];
  }

  get(nodeId: string): NodeSession | undefined {
    return this.nodesById.get(nodeId);
  }

  async invoke(params: {
    nodeId: string;
    command: string;
    params?: unknown;
    timeoutMs?: number;
    idempotencyKey?: string;
  }): Promise<NodeInvokeResult> {
    // Check idempotency cache for duplicate requests
    if (params.idempotencyKey) {
      const cached = this.idempotencyCache.get(params.idempotencyKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }
      // Clean up expired entry if present
      if (cached) {
        this.idempotencyCache.delete(params.idempotencyKey);
      }
    }

    const node = this.nodesById.get(params.nodeId);
    if (!node) {
      return {
        ok: false,
        error: { code: "NOT_CONNECTED", message: "node not connected" },
      };
    }

    // Backpressure: reject if too many pending requests for this node
    const currentPending = this.pendingCountByNode.get(params.nodeId) ?? 0;
    if (currentPending >= MAX_PENDING_PER_NODE) {
      return {
        ok: false,
        error: {
          code: "OVERLOADED",
          message: `node ${params.nodeId} has too many pending requests (${currentPending})`,
        },
      };
    }
    this.pendingCountByNode.set(params.nodeId, currentPending + 1);

    const requestId = randomUUID();
    const payload = {
      id: requestId,
      nodeId: params.nodeId,
      command: params.command,
      paramsJSON:
        "params" in params && params.params !== undefined ? JSON.stringify(params.params) : null,
      timeoutMs: params.timeoutMs,
      idempotencyKey: params.idempotencyKey,
    };
    const ok = this.sendEventToSession(node, "node.invoke.request", payload);
    if (!ok) {
      // Decrement pending count on early failure
      const count = this.pendingCountByNode.get(params.nodeId) ?? 1;
      this.pendingCountByNode.set(params.nodeId, Math.max(0, count - 1));
      return {
        ok: false,
        error: { code: "UNAVAILABLE", message: "failed to send invoke to node" },
      };
    }
    const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 30_000;
    let result: NodeInvokeResult;
    try {
      result = await new Promise<NodeInvokeResult>((resolve, reject) => {
        const timerId = `node-invoke-${requestId}`;
        scheduleTimeout(timerId, timeoutMs, () => {
          this.pendingInvokes.delete(requestId);
          resolve({
            ok: false,
            error: { code: "TIMEOUT", message: "node invoke timed out" },
          });
        });
        this.pendingInvokes.set(requestId, {
          nodeId: params.nodeId,
          command: params.command,
          resolve,
          reject,
          timerId,
        });
      });
    } finally {
      // Always decrement pending count
      const count = this.pendingCountByNode.get(params.nodeId) ?? 1;
      this.pendingCountByNode.set(params.nodeId, Math.max(0, count - 1));
    }

    // Cache results with idempotency key (both success and error to prevent retry storms)
    if (params.idempotencyKey) {
      this.idempotencyCache.set(params.idempotencyKey, {
        result,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
      // Periodic cleanup: remove expired entries (limit to 100 at a time)
      this.cleanupExpiredIdempotencyEntries();
    }

    return result;
  }

  /** Clean up expired idempotency cache entries to prevent memory leaks. */
  private cleanupExpiredIdempotencyEntries(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.idempotencyCache) {
      if (entry.expiresAt <= now) {
        this.idempotencyCache.delete(key);
        cleaned++;
        if (cleaned >= 100) break; // Limit cleanup per call
      }
    }
  }

  handleInvokeResult(params: {
    id: string;
    nodeId: string;
    ok: boolean;
    payload?: unknown;
    payloadJSON?: string | null;
    error?: { code?: string; message?: string } | null;
  }): boolean {
    const pending = this.pendingInvokes.get(params.id);
    if (!pending) {
      return false;
    }
    if (pending.nodeId !== params.nodeId) {
      return false;
    }
    cancelTimeout(pending.timerId);
    this.pendingInvokes.delete(params.id);
    pending.resolve({
      ok: params.ok,
      payload: params.payload,
      payloadJSON: params.payloadJSON ?? null,
      error: params.error ?? null,
    });
    return true;
  }

  sendEvent(nodeId: string, event: string, payload?: unknown): boolean {
    const node = this.nodesById.get(nodeId);
    if (!node) {
      return false;
    }
    return this.sendEventToSession(node, event, payload);
  }

  private sendEventInternal(node: NodeSession, event: string, payload: unknown): boolean {
    try {
      node.client.socket.send(
        JSON.stringify({
          type: "event",
          event,
          payload,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private sendEventToSession(node: NodeSession, event: string, payload: unknown): boolean {
    return this.sendEventInternal(node, event, payload);
  }
}
