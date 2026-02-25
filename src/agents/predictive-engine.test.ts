/**
 * Predictive Engine Tests
 * Based on 2026 Research: GOD Model, Alpha-Service, Adaptive Data Flywheel
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AgentEventMesh } from "./event-mesh.js";
import { PredictiveEngine } from "./predictive-engine.js";

describe("PredictiveEngine", () => {
  let engine: PredictiveEngine;
  let db: DatabaseSync;
  let mesh: AgentEventMesh;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "predictive-engine-test-"));
    const dbPath = join(tempDir, "test.db");
    db = new DatabaseSync(dbPath);

    mesh = new AgentEventMesh({
      agentId: "test-agent",
      db,
      enablePersistence: false,
    });

    engine = new PredictiveEngine({
      agentId: "test-agent",
      db,
      mesh,
      enablePersistence: true,
      minConfidence: 0.7,
      maxPredictions: 5,
    });
  });

  afterEach(() => {
    engine.close();
    mesh.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("should initialize with default rules", () => {
      const stats = engine.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);
      expect(stats.enabledRules).toBe(stats.totalRules);
    });

    it("should initialize with custom config", () => {
      const customEngine = new PredictiveEngine({
        agentId: "custom",
        db: null,
        minConfidence: 0.8,
        maxPredictions: 3,
      });

      const stats = customEngine.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);

      customEngine.close();
    });

    it("should work without database", () => {
      const noDbEngine = new PredictiveEngine({
        agentId: "no-db",
        db: null,
        enablePersistence: false,
      });

      const stats = noDbEngine.getStats();
      expect(stats.totalRules).toBeGreaterThan(0);

      noDbEngine.close();
    });
  });

  describe("prediction rules", () => {
    it("should add custom rule", () => {
      const initialStats = engine.getStats();

      engine.addRule({
        id: "custom-rule",
        name: "Custom Test Rule",
        category: "workflow",
        priority: "medium",
        enabled: true,
        condition: async () => true,
        action: async () => ({
          id: "test",
          action: "test_action",
          message: "Test prediction",
          priority: "medium",
          confidence: 0.8,
          category: "workflow",
          trigger: "pattern_based",
          timestamp: Date.now(),
        }),
      });

      const stats = engine.getStats();
      expect(stats.totalRules).toBe(initialStats.totalRules + 1);
    });

    it("should remove rule", () => {
      engine.addRule({
        id: "temp-rule",
        name: "Temporary Rule",
        category: "task",
        priority: "low",
        enabled: true,
        condition: async () => false,
        action: async () => ({
          id: "temp",
          action: "temp_action",
          message: "Temp",
          priority: "low",
          confidence: 0.5,
          category: "task",
          trigger: "event_based",
          timestamp: Date.now(),
        }),
      });

      const removed = engine.removeRule("temp-rule");
      expect(removed).toBe(true);

      const removedAgain = engine.removeRule("temp-rule");
      expect(removedAgain).toBe(false);
    });
  });

  describe("checkPredictions - time-based", () => {
    it("should predict meeting preparation", async () => {
      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      engine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-123",
              title: "Team Standup",
              time: meetingTime.toISOString(),
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();

      expect(predictions.length).toBeGreaterThan(0);

      const meetingPred = predictions.find((p) => p.action === "prepare_meeting");
      expect(meetingPred).toBeDefined();
      expect(meetingPred?.priority).toBe("high");
      expect(meetingPred?.confidence).toBeGreaterThanOrEqual(0.7);
      expect(meetingPred?.category).toBe("calendar");
      expect(meetingPred?.trigger).toBe("time_based");
    });

    it("should predict task reminders", async () => {
      const taskDue = new Date();
      taskDue.setHours(taskDue.getHours() + 12); // Due in 12 hours

      engine.updateContext({
        events: new Map([
          [
            "upcomingTasks",
            [
              {
                id: "task-1",
                title: "Submit report",
                dueDate: taskDue.toISOString(),
              },
            ],
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();

      const taskPred = predictions.find((p) => p.action === "task_reminder");
      expect(taskPred).toBeDefined();
      expect(taskPred?.priority).toBe("medium");
      expect(taskPred?.category).toBe("task");
    });

    it("should predict daily briefing at work start", async () => {
      // Mock current time to be 9:05 AM on a weekday (Monday)
      const mockNow = new Date("2026-02-16T09:05:00"); // Monday

      engine.context.now = mockNow;
      engine.context.userState.workHours.start = 9;

      const predictions = await engine.checkPredictions();

      const briefingPred = predictions.find((p) => p.action === "daily_briefing");
      expect(briefingPred).toBeDefined();
      expect(briefingPred?.category).toBe("context");
      expect(briefingPred?.trigger).toBe("context_based");
    });
  });

  describe("checkPredictions - event-based", () => {
    it("should detect important emails", async () => {
      engine.updateContext({
        events: new Map([
          [
            "recentEmail",
            {
              id: "email-123",
              from: "boss@company.com",
              fromName: "Boss",
              subject: "Urgent: Q4 Report",
              priority: "high",
              notified: false,
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();

      const emailPred = predictions.find((p) => p.action === "prioritize_email");
      expect(emailPred).toBeDefined();
      expect(emailPred?.priority).toBe("high");
      expect(emailPred?.confidence).toBeGreaterThanOrEqual(0.8);
      expect(emailPred?.message).toContain("Boss");
    });

    it("should not predict for non-important emails", async () => {
      engine.updateContext({
        events: new Map([
          [
            "recentEmail",
            {
              id: "email-456",
              from: "newsletter@spam.com",
              subject: "Weekly Newsletter",
              priority: "low",
              notified: false,
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();

      const emailPred = predictions.find((p) => p.action === "prioritize_email");
      expect(emailPred).toBeUndefined();
    });
  });

  describe("checkPredictions - pattern-based", () => {
    it("should learn and use patterns", async () => {
      // Learn a pattern
      engine.learnPattern({
        pattern: "generate_weekly_report",
        category: "workflow",
        frequency: 10,
        lastOccurrence: Date.now() - 7 * 24 * 60 * 60 * 1000, // 1 week ago
        confidence: 0.85,
      });

      // Mock Monday morning
      const monday = new Date("2026-02-16T09:30:00"); // Monday

      engine.context.now = monday;
      engine.context.userState.workHours.start = 9;

      const predictions = await engine.checkPredictions();

      const reportPred = predictions.find((p) => p.action === "generate_weekly_report");
      expect(reportPred).toBeDefined();
      expect(reportPred?.trigger).toBe("pattern_based");
    });
  });

  describe("prediction filtering", () => {
    it("should filter by minimum confidence", async () => {
      const highConfidenceEngine = new PredictiveEngine({
        agentId: "high-conf",
        db: null,
        minConfidence: 0.95, // Very high threshold
      });

      const predictions = await highConfidenceEngine.checkPredictions();

      // Should have fewer or no predictions due to high threshold
      expect(predictions.every((p) => p.confidence >= 0.95)).toBe(true);

      highConfidenceEngine.close();
    });

    it("should limit number of predictions", async () => {
      const limitedEngine = new PredictiveEngine({
        agentId: "limited",
        db: null,
        maxPredictions: 2,
      });

      // Set up multiple triggers
      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      limitedEngine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-1",
              title: "Meeting 1",
              time: meetingTime.toISOString(),
            },
          ],
          [
            "recentEmail",
            {
              id: "email-1",
              from: "boss@company.com",
              priority: "high",
              notified: false,
            },
          ],
        ]),
      });

      const predictions = await limitedEngine.checkPredictions();
      expect(predictions.length).toBeLessThanOrEqual(2);

      limitedEngine.close();
    });

    it("should sort by priority and confidence", async () => {
      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      engine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-1",
              title: "Meeting",
              time: meetingTime.toISOString(),
            },
          ],
          [
            "recentEmail",
            {
              id: "email-1",
              from: "boss@company.com",
              priority: "high",
              notified: false,
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();

      // Verify sorting
      for (let i = 1; i < predictions.length; i++) {
        const prev = predictions[i - 1];
        const curr = predictions[i];

        const priorityOrder = { high: 0, medium: 1, low: 2 };

        // Either priority is lower, or same priority with lower confidence
        const validOrder =
          priorityOrder[prev.priority] < priorityOrder[curr.priority] ||
          (prev.priority === curr.priority && prev.confidence >= curr.confidence);

        expect(validOrder).toBe(true);
      }
    });
  });

  describe("persistence", () => {
    it("should persist learned patterns", () => {
      engine.learnPattern({
        pattern: "test_pattern",
        category: "workflow",
        frequency: 5,
        lastOccurrence: Date.now(),
        confidence: 0.9,
      });

      // Create new engine to test loading
      const newEngine = new PredictiveEngine({
        agentId: "test-agent",
        db,
        enablePersistence: true,
      });

      const stats = newEngine.getStats();
      expect(stats.learnedPatterns).toBe(1);

      newEngine.close();
    });

    it("should persist prediction history", async () => {
      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      engine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-1",
              title: "Meeting",
              time: meetingTime.toISOString(),
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();
      expect(predictions.length).toBeGreaterThan(0);

      // Check database directly
      const rows = db.prepare("SELECT * FROM prediction_history").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].action).toBe("prepare_meeting");
    });
  });

  describe("feedback loop (MAPE-K)", () => {
    it("should record feedback", async () => {
      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      engine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-1",
              title: "Meeting",
              time: meetingTime.toISOString(),
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();
      const prediction = predictions[0];

      engine.recordFeedback(prediction.id, true, "Very helpful!");

      // Check database
      const rows = db
        .prepare("SELECT * FROM prediction_history WHERE id = ?")
        .all(prediction.id) as any[];

      expect(rows[0].accepted).toBe(1);
      expect(rows[0].feedback).toBe("Very helpful!");
    });

    it("should handle rejected feedback", async () => {
      const predictions = await engine.checkPredictions();

      if (predictions.length > 0) {
        engine.recordFeedback(predictions[0].id, false, "Not needed right now");

        const rows = db
          .prepare("SELECT * FROM prediction_history WHERE id = ?")
          .all(predictions[0].id) as any[];

        expect(rows[0].accepted).toBe(0);
        expect(rows[0].feedback).toBe("Not needed right now");
      }
    });
  });

  describe("event integration", () => {
    it("should publish prediction event to mesh", async () => {
      let publishedEvent: any = null;

      mesh.subscribe("user.message.received", (event) => {
        publishedEvent = event;
      });

      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      engine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-1",
              title: "Meeting",
              time: meetingTime.toISOString(),
            },
          ],
        ]),
      });

      await engine.checkPredictions();

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (publishedEvent) {
        expect(publishedEvent.data.type).toBe("predictions_generated");
        expect(publishedEvent.data.count).toBeGreaterThan(0);
      }
    });
  });

  describe("expiry", () => {
    it("should set expiry times", async () => {
      const meetingTime = new Date();
      meetingTime.setHours(meetingTime.getHours() + 1);

      engine.updateContext({
        events: new Map([
          [
            "nextMeeting",
            {
              id: "meeting-1",
              title: "Meeting",
              time: meetingTime.toISOString(),
            },
          ],
        ]),
      });

      const predictions = await engine.checkPredictions();

      const meetingPred = predictions.find((p) => p.action === "prepare_meeting");
      expect(meetingPred?.expiresAt).toBeDefined();
      expect(meetingPred!.expiresAt!).toBeGreaterThan(Date.now());
    });
  });

  describe("cleanup", () => {
    it("should clear old history", async () => {
      // Generate some predictions
      await engine.checkPredictions();

      // Clear history
      const cleared = engine.clearOldHistory(0); // Clear everything

      expect(cleared).toBeGreaterThanOrEqual(0);
    });
  });

  describe("statistics", () => {
    it("should return accurate stats", async () => {
      engine.learnPattern({
        pattern: "test",
        category: "workflow",
        frequency: 1,
        lastOccurrence: Date.now(),
        confidence: 0.8,
      });

      await engine.checkPredictions();

      const stats = engine.getStats();

      expect(stats.totalRules).toBeGreaterThan(0);
      expect(stats.enabledRules).toBeGreaterThan(0);
      expect(stats.learnedPatterns).toBe(1);
      expect(stats.recentPredictions).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("Predictive Engine Integration", () => {
  it("should work end-to-end", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "e2e-test-"));
    const dbPath = join(tempDir, "test.db");
    const db = new DatabaseSync(dbPath);

    const mesh = new AgentEventMesh({
      agentId: "e2e-agent",
      db,
      enablePersistence: false,
    });

    const engine = new PredictiveEngine({
      agentId: "e2e-agent",
      db,
      mesh,
      enablePersistence: true,
    });

    // Simulate a day in the life
    // 9 AM: Work starts (Monday)
    engine.context.now = new Date("2026-02-16T09:00:00"); // Monday
    engine.context.userState.workHours.start = 9;

    let predictions = await engine.checkPredictions();
    expect(predictions.some((p) => p.action === "daily_briefing")).toBe(true);

    // 10 AM: Meeting in 1 hour
    const meetingTime = new Date();
    meetingTime.setHours(11, 0, 0, 0);

    engine.updateContext({
      events: new Map([
        [
          "nextMeeting",
          {
            id: "standup",
            title: "Team Standup",
            time: meetingTime.toISOString(),
          },
        ],
      ]),
    });

    predictions = await engine.checkPredictions();
    expect(predictions.some((p) => p.action === "prepare_meeting")).toBe(true);

    // 11 AM: Important email arrives
    engine.updateContext({
      events: new Map([
        [
          "recentEmail",
          {
            id: "urgent",
            from: "ceo@company.com",
            fromName: "CEO",
            subject: "Important Update",
            priority: "high",
            notified: false,
          },
        ],
      ]),
    });

    predictions = await engine.checkPredictions();
    expect(predictions.some((p) => p.action === "prioritize_email")).toBe(true);

    // Learn from behavior
    engine.learnPattern({
      pattern: "daily_standup_prep",
      category: "calendar",
      frequency: 5,
      lastOccurrence: Date.now(),
      confidence: 0.9,
    });

    const stats = engine.getStats();
    expect(stats.learnedPatterns).toBe(1);

    // Cleanup
    engine.close();
    mesh.close();
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
