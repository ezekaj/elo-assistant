/**
 * Tests for automatic pattern learning and ambient delivery
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PredictiveEngine } from "./predictive-engine.js";
import { PredictiveService, type PredictiveServiceConfig } from "./predictive-service.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

describe("Automatic Pattern Learning", () => {
  let engine: PredictiveEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `predictive-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    engine = new PredictiveEngine({
      dbPath: join(tempDir, "test.db"),
      enablePersistence: true,
      enableNeuroMemory: false,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should learn patterns from tool usage events", () => {
    // Simulate tool usage pattern
    for (let i = 0; i < 5; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: "weather",
        timestamp: Date.now() - i * 3600000, // 1 hour apart
        data: { location: "San Francisco" },
      });
    }

    const patterns = engine.getPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    
    const weatherPattern = patterns.find(p => p.name.includes("weather"));
    expect(weatherPattern).toBeDefined();
    expect(weatherPattern!.occurrences).toBe(5);
    expect(weatherPattern!.confidence).toBeGreaterThan(0.5);
  });

  it("should learn time-based patterns", () => {
    // Simulate morning weather checks (8am pattern)
    const morningHours = [8, 8, 8, 8, 8];
    morningHours.forEach((hour, i) => {
      const date = new Date();
      date.setHours(hour, 0, 0, 0);
      date.setDate(date.getDate() - i);
      
      engine.recordEvent({
        type: "tool_execution",
        tool: "weather",
        timestamp: date.getTime(),
        data: { hour },
      });
    });

    const patterns = engine.getPatterns();
    const timePattern = patterns.find(p => 
      p.type === "time_based" && p.name.includes("weather")
    );
    
    expect(timePattern).toBeDefined();
    expect(timePattern!.confidence).toBeGreaterThan(0.7);
  });

  it("should learn sequence patterns", () => {
    // Simulate sequence: email → calendar → task
    const sequence = ["email", "calendar", "task"];
    
    for (let day = 0; day < 5; day++) {
      sequence.forEach((tool, i) => {
        engine.recordEvent({
          type: "tool_execution",
          tool,
          timestamp: Date.now() - day * 86400000 + i * 60000,
          sequenceId: `morning-routine-${day}`,
          sequencePosition: i,
        });
      });
    }

    const patterns = engine.getPatterns();
    const sequencePattern = patterns.find(p => p.type === "sequence");
    
    expect(sequencePattern).toBeDefined();
    expect(sequencePattern!.occurrences).toBeGreaterThanOrEqual(5);
  });

  it("should adjust confidence based on pattern consistency", () => {
    // Consistent pattern (same time, same tool)
    for (let i = 0; i < 10; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: "telegram",
        timestamp: Date.now() - i * 86400000, // Daily
        data: { hour: 9 },
      });
    }

    const patterns = engine.getPatterns();
    const consistentPattern = patterns.find(p => p.name.includes("telegram"));
    
    expect(consistentPattern).toBeDefined();
    expect(consistentPattern!.confidence).toBeGreaterThan(0.8);
  });

  it("should detect breaking patterns", () => {
    // Create pattern
    for (let i = 0; i < 5; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: "calendar",
        timestamp: Date.now() - i * 86400000,
      });
    }

    // Break pattern (skip 3 days)
    engine.recordEvent({
      type: "tool_execution",
      tool: "calendar",
      timestamp: Date.now() - 8 * 86400000,
    });

    const patterns = engine.getPatterns();
    const calendarPattern = patterns.find(p => p.name.includes("calendar"));
    
    expect(calendarPattern).toBeDefined();
    expect(calendarPattern!.confidence).toBeLessThan(0.9);
  });
});

describe("Ambient Delivery", () => {
  let service: PredictiveService;
  let tempDir: string;
  let deliveredPredictions: any[] = [];

  beforeEach(async () => {
    tempDir = join(tmpdir(), `predictive-service-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    deliveredPredictions = [];
    
    const config: PredictiveServiceConfig = {
      enabled: true,
      agentId: "test-agent",
      db: null,
      neuroMemory: {
        enabled: false,
      },
      autoDeliver: {
        enabled: true,
        maxPerDay: 3,
        channels: ["test"],
        quietHours: {
          start: 22,
          end: 8,
        },
        minConfidence: 0.8,
      },
      schedule: {
        checkIntervalMs: 60000,
        patternLearningEnabled: true,
        consolidationIntervalMs: 3600000,
      },
      categories: {
        calendar: true,
        email: true,
        task: true,
      },
    };

    // Create service with custom delivery function
    service = new PredictiveService(config);
    
    // Mock delivery function
    (service as any).deliverPrediction = async (prediction: any) => {
      deliveredPredictions.push(prediction);
      return true;
    };
  });

  afterEach(() => {
    service.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should not deliver more than maxPerDay predictions", async () => {
    // Create 5 high-confidence predictions
    const engine = service.getEngine();
    for (let i = 0; i < 5; i++) {
      engine.addRule({
        id: `test-rule-${i}`,
        name: `Test Rule ${i}`,
        condition: () => true,
        action: () => ({
          action: "test_action",
          category: "task",
          priority: "high",
          confidence: 0.9,
          message: `Test prediction ${i}`,
          data: {},
        }),
        enabled: true,
        priority: 1,
      });
    }

    await service.start();
    
    // Trigger check
    await service.checkAndDeliver();
    
    expect(deliveredPredictions.length).toBeLessThanOrEqual(3);
  });

  it("should respect quiet hours", async () => {
    // Mock current time to be within quiet hours (23:00)
    const originalDate = Date.now;
    Date.now = () => {
      const d = new Date();
      d.setHours(23, 0, 0, 0);
      return d.getTime();
    };

    const engine = service.getEngine();
    engine.addRule({
      id: "quiet-test",
      name: "Quiet Test",
      condition: () => true,
      action: () => ({
        action: "test",
        category: "task",
        priority: "high",
        confidence: 0.9,
        message: "Should not deliver",
        data: {},
      }),
      enabled: true,
      priority: 1,
    });

    await service.start();
    await service.checkAndDeliver();
    
    expect(deliveredPredictions.length).toBe(0);
    
    // Restore Date.now
    Date.now = originalDate;
  });

  it("should only deliver high confidence predictions", async () => {
    const engine = service.getEngine();
    
    // Add low confidence prediction
    engine.addRule({
      id: "low-confidence",
      name: "Low Confidence",
      condition: () => true,
      action: () => ({
        action: "test",
        category: "task",
        priority: "medium",
        confidence: 0.6,
        message: "Low confidence",
        data: {},
      }),
      enabled: true,
      priority: 1,
    });

    // Add high confidence prediction
    engine.addRule({
      id: "high-confidence",
      name: "High Confidence",
      condition: () => true,
      action: () => ({
        action: "test",
        category: "task",
        priority: "high",
        confidence: 0.95,
        message: "High confidence",
        data: {},
      }),
      enabled: true,
      priority: 1,
    });

    await service.start();
    await service.checkAndDeliver();
    
    expect(deliveredPredictions.length).toBe(1);
    expect(deliveredPredictions[0].confidence).toBeGreaterThan(0.8);
  });

  it("should track deliveries to prevent duplicates", async () => {
    const engine = service.getEngine();
    
    engine.addRule({
      id: "duplicate-test",
      name: "Duplicate Test",
      condition: () => true,
      action: () => ({
        action: "test",
        category: "task",
        priority: "high",
        confidence: 0.9,
        message: "Same prediction",
        data: { key: "value" },
      }),
      enabled: true,
      priority: 1,
    });

    await service.start();
    
    // Check multiple times
    await service.checkAndDeliver();
    await service.checkAndDeliver();
    await service.checkAndDeliver();
    
    // Should only deliver once
    expect(deliveredPredictions.length).toBe(1);
  });
});
