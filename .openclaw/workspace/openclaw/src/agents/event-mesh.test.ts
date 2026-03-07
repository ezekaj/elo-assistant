/**
 * Event Mesh Tests
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AgentEventMesh, EventTypes } from "./event-mesh.js";

describe("AgentEventMesh", () => {
  let mesh: AgentEventMesh;
  let db: DatabaseSync;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "event-mesh-test-"));
    const dbPath = join(tempDir, "test.db");
    db = new DatabaseSync(dbPath);
    mesh = new AgentEventMesh({
      agentId: "test-agent",
      db,
      enablePersistence: true,
    });
  });

  afterEach(() => {
    mesh.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("publish", () => {
    it("should publish an event", async () => {
      const eventId = await mesh.publish("test.event", { foo: "bar" });

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe("string");

      const history = mesh.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe("test.event");
      expect(history[0].data).toEqual({ foo: "bar" });
    });

    it("should emit event to subscribers", async () => {
      let receivedEvent: any = null;

      mesh.subscribe("test.event", (event) => {
        receivedEvent = event;
      });

      await mesh.publish("test.event", { foo: "bar" });

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.type).toBe("test.event");
      expect(receivedEvent.data).toEqual({ foo: "bar" });
    });

    it("should persist events when enabled", async () => {
      await mesh.publish("test.event", { foo: "bar" });

      const events = mesh.queryEvents({ type: "test.event" });
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ foo: "bar" });
    });

    it("should limit history size", async () => {
      const smallMesh = new AgentEventMesh({
        agentId: "test",
        db: null,
        enablePersistence: false,
      });

      // Set max history size
      (smallMesh as any).maxHistorySize = 5;

      for (let i = 0; i < 10; i++) {
        await smallMesh.publish(`event.${i}`, { index: i });
      }

      const history = smallMesh.getHistory();
      expect(history.length).toBe(5);
      expect(history[0].type).toBe("event.5");

      smallMesh.close();
    });
  });

  describe("subscribe", () => {
    it("should subscribe to specific event type", async () => {
      let callCount = 0;

      mesh.subscribe("test.event", () => {
        callCount++;
      });

      await mesh.publish("test.event", {});
      await mesh.publish("other.event", {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount).toBe(1);
    });

    it("should support multiple subscribers", async () => {
      const calls: string[] = [];

      mesh.subscribe("test.event", () => {
        calls.push("handler1");
      });

      mesh.subscribe("test.event", () => {
        calls.push("handler2");
      });

      await mesh.publish("test.event", {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(calls).toContain("handler1");
      expect(calls).toContain("handler2");
    });

    it("should support filters", async () => {
      const received: any[] = [];

      mesh.subscribe(
        "test.event",
        (event) => {
          received.push(event);
        },
        { source: "other-agent" },
      );

      await mesh.publish("test.event", { id: 1 }); // Should be filtered
      await mesh.publish("test.event", { id: 2 }); // Should be filtered

      const otherMesh = new AgentEventMesh({
        agentId: "other-agent",
        db: null,
      });

      await otherMesh.publish("test.event", { id: 3 }); // Should match filter

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received).toHaveLength(1);
      expect(received[0].source).toBe("other-agent");

      otherMesh.close();
    });

    it("should return unsubscribe function", async () => {
      let callCount = 0;

      const unsubscribe = mesh.subscribe("test.event", () => {
        callCount++;
      });

      await mesh.publish("test.event", {});
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount).toBe(1);

      unsubscribe();

      await mesh.publish("test.event", {});
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callCount).toBe(1); // Still 1, not 2
    });

    it("should handle errors in handlers", async () => {
      let secondCalled = false;

      mesh.subscribe("test.event", () => {
        throw new Error("Handler error");
      });

      mesh.subscribe("test.event", () => {
        secondCalled = true;
      });

      await mesh.publish("test.event", {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(secondCalled).toBe(true); // Second handler still called
    });
  });

  describe("subscribeAll", () => {
    it("should subscribe to all events", async () => {
      const events: any[] = [];

      mesh.subscribeAll((event) => {
        events.push(event);
      });

      await mesh.publish("event1", {});
      await mesh.publish("event2", {});
      await mesh.publish("event3", {});

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events).toHaveLength(3);
    });
  });

  describe("queryEvents", () => {
    it("should query events from database", async () => {
      await mesh.publish("email.received", { from: "boss@company.com" });
      await mesh.publish("email.sent", { to: "team@company.com" });
      await mesh.publish("email.received", { from: "client@company.com" });

      const emailEvents = mesh.queryEvents({ type: "email.received" });
      expect(emailEvents).toHaveLength(2);

      const allEmailEvents = mesh.queryEvents({ type: "email" }, undefined, 10);
      expect(allEmailEvents).toHaveLength(0); // Type doesn't match exactly
    });

    it("should respect time range", async () => {
      const now = Date.now();

      await mesh.publish("event1", {});
      await new Promise((resolve) => setTimeout(resolve, 100));
      await mesh.publish("event2", {});

      const recentEvents = mesh.queryEvents(undefined, { start: now + 50 }, 10);
      expect(recentEvents).toHaveLength(1);
      expect(recentEvents[0].type).toBe("event2");
    });

    it("should respect limit", async () => {
      for (let i = 0; i < 10; i++) {
        await mesh.publish(`event.${i}`, { index: i });
      }

      const events = mesh.queryEvents(undefined, undefined, 5);
      expect(events).toHaveLength(5);
    });
  });

  describe("clearOldEvents", () => {
    it("should clear old events", async () => {
      // Mock old event by modifying timestamp
      await mesh.publish("old.event", {});
      const history = mesh.getHistory();
      history[0].timestamp = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago

      await mesh.publish("new.event", {});

      mesh.clearOldEvents(90);

      const remaining = mesh.getHistory();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].type).toBe("new.event");
    });
  });

  describe("getStats", () => {
    it("should return statistics", async () => {
      mesh.subscribe("test.event", () => {});

      await mesh.publish("event1", {});
      await mesh.publish("event2", {});

      const stats = mesh.getStats();

      expect(stats.totalEvents).toBe(2);
      expect(stats.subscriptions).toBe(1);
    });
  });

  describe("EventTypes", () => {
    it("should have predefined event types", () => {
      expect(EventTypes.CALENDAR_MEETING_SCHEDULED).toBe("calendar.meeting.scheduled");
      expect(EventTypes.EMAIL_RECEIVED).toBe("email.received");
      expect(EventTypes.TASK_CREATED).toBe("task.created");
    });
  });
});

describe("Event Mesh Integration", () => {
  it("should work without database", async () => {
    const mesh = new AgentEventMesh({
      agentId: "test",
      db: null,
      enablePersistence: false,
    });

    let received = false;

    mesh.subscribe("test.event", () => {
      received = true;
    });

    await mesh.publish("test.event", {});

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(received).toBe(true);

    const history = mesh.getHistory();
    expect(history).toHaveLength(1);

    mesh.close();
  });

  it("should handle high-volume events", async () => {
    const mesh = new AgentEventMesh({
      agentId: "test",
      db: null,
      enablePersistence: false,
    });

    let count = 0;

    mesh.subscribe("test.event", () => {
      count++;
    });

    // Publish 100 events
    for (let i = 0; i < 100; i++) {
      await mesh.publish("test.event", { index: i });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(count).toBe(100);

    mesh.close();
  });
});
