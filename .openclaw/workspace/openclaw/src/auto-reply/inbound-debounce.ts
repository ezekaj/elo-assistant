import type { OpenClawConfig } from "../config/config.js";
import type { InboundDebounceByProvider } from "../config/types.messages.js";
import { scheduleTimeout, cancelTimeout } from "../agents/timer-wheel.js";

const resolveMs = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(value));
};

const resolveChannelOverride = (params: {
  byChannel?: InboundDebounceByProvider;
  channel: string;
}): number | undefined => {
  if (!params.byChannel) {
    return undefined;
  }
  return resolveMs(params.byChannel[params.channel]);
};

export function resolveInboundDebounceMs(params: {
  cfg: OpenClawConfig;
  channel: string;
  overrideMs?: number;
}): number {
  const inbound = params.cfg.messages?.inbound;
  const override = resolveMs(params.overrideMs);
  const byChannel = resolveChannelOverride({
    byChannel: inbound?.byChannel,
    channel: params.channel,
  });
  const base = resolveMs(inbound?.debounceMs);
  return override ?? byChannel ?? base ?? 0;
}

type DebounceBuffer<T> = {
  items: T[];
  timerActive: boolean;
};

let debouncerCounter = 0;

export function createInboundDebouncer<T>(params: {
  debounceMs: number;
  buildKey: (item: T) => string | null | undefined;
  shouldDebounce?: (item: T) => boolean;
  onFlush: (items: T[]) => Promise<void>;
  onError?: (err: unknown, items: T[]) => void;
}) {
  const debouncerId = ++debouncerCounter;
  const buffers = new Map<string, DebounceBuffer<T>>();
  const debounceMs = Math.max(0, Math.trunc(params.debounceMs));

  const makeTimerId = (key: string) => `inbound-debounce-${debouncerId}-${key}`;

  const flushBuffer = async (key: string, buffer: DebounceBuffer<T>) => {
    buffers.delete(key);
    if (buffer.timerActive) {
      cancelTimeout(makeTimerId(key));
      buffer.timerActive = false;
    }
    if (buffer.items.length === 0) {
      return;
    }
    try {
      await params.onFlush(buffer.items);
    } catch (err) {
      params.onError?.(err, buffer.items);
    }
  };

  const flushKey = async (key: string) => {
    const buffer = buffers.get(key);
    if (!buffer) {
      return;
    }
    await flushBuffer(key, buffer);
  };

  const scheduleFlush = (key: string, buffer: DebounceBuffer<T>) => {
    const timerId = makeTimerId(key);
    if (buffer.timerActive) {
      cancelTimeout(timerId);
    }
    buffer.timerActive = true;
    scheduleTimeout(timerId, debounceMs, () => {
      buffer.timerActive = false;
      void flushBuffer(key, buffer);
    });
  };

  const enqueue = async (item: T) => {
    const key = params.buildKey(item);
    const canDebounce = debounceMs > 0 && (params.shouldDebounce?.(item) ?? true);

    if (!canDebounce || !key) {
      if (key && buffers.has(key)) {
        await flushKey(key);
      }
      await params.onFlush([item]);
      return;
    }

    const existing = buffers.get(key);
    if (existing) {
      existing.items.push(item);
      scheduleFlush(key, existing);
      return;
    }

    const buffer: DebounceBuffer<T> = { items: [item], timerActive: false };
    buffers.set(key, buffer);
    scheduleFlush(key, buffer);
  };

  return { enqueue, flushKey };
}
