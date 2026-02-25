/**
 * Production-Grade Event Mesh - FoundationDB State Layer
 *
 * Uses FoundationDB for:
 * - Strict serializability (strongest consistency)
 * - Apple-proven reliability
 * - Transactional event storage
 *
 * Note: Requires foundationdb npm package and local FDB installation
 */

import type { AgentEvent } from "./redpanda";

export interface EventRecord {
  id: string;
  sequence: bigint;
  type: string;
  source: string;
  timestamp: number;
  data: string; // Base64 encoded
  metadata: Record<string, unknown>;
}

export interface FoundationDBConfig {
  clusterFile?: string;
  enabled?: boolean;
}

// In-memory fallback when FoundationDB is not available
class InMemoryEventStore {
  private events: Map<bigint, EventRecord> = new Map();
  private lastSequence: bigint = BigInt(0);
  private byType: Map<string, Set<bigint>> = new Map();
  private bySource: Map<string, Set<bigint>> = new Map();
  private byTime: Map<number, Set<bigint>> = new Map();

  async append(event: Omit<EventRecord, "sequence">): Promise<bigint> {
    const sequence = this.lastSequence + BigInt(1);
    this.lastSequence = sequence;

    const record: EventRecord = {
      ...event,
      sequence,
    };

    this.events.set(sequence, record);

    // Update indexes
    if (!this.byType.has(event.type)) {
      this.byType.set(event.type, new Set());
    }
    this.byType.get(event.type)!.add(sequence);

    if (!this.bySource.has(event.source)) {
      this.bySource.set(event.source, new Set());
    }
    this.bySource.get(event.source)!.add(sequence);

    const timeBucket = Math.floor(event.timestamp / 60000); // 1-minute buckets
    if (!this.byTime.has(timeBucket)) {
      this.byTime.set(timeBucket, new Set());
    }
    this.byTime.get(timeBucket)!.add(sequence);

    return sequence;
  }

  async getBySequence(startSeq: bigint, endSeq: bigint): Promise<EventRecord[]> {
    const events: EventRecord[] = [];
    for (let seq = startSeq; seq < endSeq; seq++) {
      const event = this.events.get(seq);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  async getByType(type: string, limit: number = 100): Promise<EventRecord[]> {
    const seqs = this.byType.get(type);
    if (!seqs) return [];

    const events: EventRecord[] = [];
    for (const seq of seqs) {
      if (events.length >= limit) break;
      const event = this.events.get(seq);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  async getBySource(source: string, limit: number = 100): Promise<EventRecord[]> {
    const seqs = this.bySource.get(source);
    if (!seqs) return [];

    const events: EventRecord[] = [];
    for (const seq of seqs) {
      if (events.length >= limit) break;
      const event = this.events.get(seq);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }

  async getLastSequence(): Promise<bigint> {
    return this.lastSequence;
  }
}

export class FoundationDBEventStore {
  private config: FoundationDBConfig;
  private inMemoryStore: InMemoryEventStore;
  private fdb: any = null;
  private subspace: any = null;
  private useInMemory: boolean = true;

  constructor(config: FoundationDBConfig = {}) {
    this.config = config;
    this.inMemoryStore = new InMemoryEventStore();

    // Try to load FoundationDB
    if (config.enabled !== false) {
      this.tryLoadFoundationDB();
    }
  }

  private tryLoadFoundationDB(): void {
    try {
      // Dynamic import for FoundationDB
      const fdb = require("foundationdb");
      fdb.setAPIVersion(630);
      this.fdb = fdb.open(this.config.clusterFile);
      this.subspace = new fdb.Subspace(["agent-events"]);
      this.useInMemory = false;
      console.log("FoundationDB connected successfully");
    } catch (error) {
      console.warn("FoundationDB not available, using in-memory store:", (error as Error).message);
      this.useInMemory = true;
    }
  }

  async appendEvent<T>(event: AgentEvent<T>): Promise<bigint> {
    const record: Omit<EventRecord, "sequence"> = {
      id: event.id,
      type: event.type,
      source: event.source,
      timestamp: event.timestamp,
      data: Buffer.from(JSON.stringify(event.data)).toString("base64"),
      metadata: event.metadata || {},
    };

    if (this.useInMemory) {
      return this.inMemoryStore.append(record);
    }

    // Real FoundationDB implementation
    return this.fdb.doTransaction(async (tr: any) => {
      const lastSeqKey = this.subspace.pack(["last-sequence"]);
      const lastSeq = await tr.get(lastSeqKey);
      const nextSeq = lastSeq ? BigInt(lastSeq.toString()) + BigInt(1) : BigInt(1);

      const eventKey = this.subspace.pack(["events", nextSeq]);
      const eventValue = Buffer.from(JSON.stringify(record));

      tr.set(eventKey, eventValue);
      tr.set(lastSeqKey, Buffer.from(nextSeq.toString()));

      // Update indexes
      tr.set(this.subspace.pack(["by-type", record.type, nextSeq]), eventKey);
      tr.set(this.subspace.pack(["by-source", record.source, nextSeq]), eventKey);
      tr.set(this.subspace.pack(["by-time", record.timestamp, nextSeq]), eventKey);

      return nextSeq;
    });
  }

  async getEventsBySequence(startSeq: bigint, endSeq: bigint): Promise<EventRecord[]> {
    if (this.useInMemory) {
      return this.inMemoryStore.getBySequence(startSeq, endSeq);
    }

    const events: EventRecord[] = [];
    await this.fdb.doTransaction(async (tr: any) => {
      const startKey = this.subspace.pack(["events", startSeq]);
      const endKey = this.subspace.pack(["events", endSeq]);

      for await (const [key, value] of tr.getRange(startKey, endKey)) {
        const parsed = JSON.parse(value.toString());
        events.push({
          ...parsed,
          sequence: BigInt(this.subspace.unpack(key)[1] as string),
        });
      }
    });

    return events;
  }

  async getEventsByType(type: string, limit: number = 100): Promise<EventRecord[]> {
    if (this.useInMemory) {
      return this.inMemoryStore.getByType(type, limit);
    }

    const events: EventRecord[] = [];
    await this.fdb.doTransaction(async (tr: any) => {
      const indexPrefix = this.subspace.pack(["by-type", type]);
      for await (const [key, eventKey] of tr.getRange(indexPrefix)) {
        if (events.length >= limit) break;

        const eventData = await tr.get(eventKey);
        if (eventData) {
          events.push(JSON.parse(eventData.toString()));
        }
      }
    });

    return events;
  }

  async watchForNewEvents(
    lastKnownSeq: bigint,
    callback: (event: EventRecord) => void,
  ): Promise<void> {
    if (this.useInMemory) {
      // Polling fallback for in-memory
      const poll = async () => {
        const lastSeq = await this.inMemoryStore.getLastSequence();
        if (lastSeq > lastKnownSeq) {
          const events = await this.inMemoryStore.getBySequence(
            lastKnownSeq + BigInt(1),
            lastSeq + BigInt(1),
          );
          for (const event of events) {
            callback(event);
            lastKnownSeq = event.sequence;
          }
        }
        setTimeout(poll, 100);
      };
      poll();
      return;
    }

    // Real FoundationDB watch
    const watchKey = this.subspace.pack(["last-sequence"]);
    while (true) {
      await this.fdb.watch(watchKey);
      const events = await this.getEventsBySequence(
        lastKnownSeq + BigInt(1),
        lastKnownSeq + BigInt(100),
      );
      for (const event of events) {
        callback(event);
        lastKnownSeq = event.sequence;
      }
    }
  }

  async getLastSequence(): Promise<bigint> {
    if (this.useInMemory) {
      return this.inMemoryStore.getLastSequence();
    }

    return this.fdb.doTransaction(async (tr: any) => {
      const lastSeqKey = this.subspace.pack(["last-sequence"]);
      const lastSeq = await tr.get(lastSeqKey);
      return lastSeq ? BigInt(lastSeq.toString()) : BigInt(0);
    });
  }
}

// Singleton instance
let fdbInstance: FoundationDBEventStore | null = null;

export function getFoundationDBEventStore(config?: FoundationDBConfig): FoundationDBEventStore {
  if (!fdbInstance) {
    fdbInstance = new FoundationDBEventStore(config);
  }
  return fdbInstance;
}
