/**
 * Performance tests for predictive engine with large event history
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PredictiveEngine } from "./predictive-engine.js";
import { PredictiveService, type PredictiveServiceConfig } from "./predictive-service.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

describe("Performance - Large Event History", () => {
  let engine: PredictiveEngine;
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `predictive-perf-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    engine = new PredictiveEngine({
      dbPath: join(tempDir, "perf-test.db"),
      enablePersistence: true,
      enableNeuroMemory: false,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should handle 10,000 events efficiently", () => {
    const startTime = Date.now();
    
    // Record 10,000 events
    for (let i = 0; i < 10000; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: ["weather", "calendar", "email", "task", "telegram"][i % 5],
        timestamp: Date.now() - i * 1000,
        data: { index: i },
      });
    }
    
    const recordTime = Date.now() - startTime;
    console.log(`Recording 10,000 events: ${recordTime}ms`);
    
    // Should complete in under 5 seconds
    expect(recordTime).toBeLessThan(5000);
    
    // Pattern detection should still be fast
    const patterns = engine.getPatterns();
    const patternTime = Date.now() - startTime - recordTime;
    console.log(`Pattern detection: ${patternTime}ms`);
    
    expect(patterns.length).toBeGreaterThan(0);
    expect(patternTime).toBeLessThan(1000);
  });

  it("should generate predictions quickly with large pattern set", async () => {
    // Create 100 custom rules
    for (let i = 0; i < 100; i++) {
      engine.addRule({
        id: `perf-rule-${i}`,
        name: `Performance Rule ${i}`,
        condition: () => Math.random() > 0.5,
        action: () => ({
          action: `action_${i}`,
          category: "task",
          priority: "medium",
          confidence: 0.7 + Math.random() * 0.3,
          message: `Test prediction ${i}`,
          data: {},
        }),
        enabled: true,
        priority: i,
      });
    }
    
    // Record 1,000 events
    for (let i = 0; i < 1000; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: "test",
        timestamp: Date.now() - i * 1000,
      });
    }
    
    const startTime = Date.now();
    const predictions = await engine.predict({ timestamp: Date.now() });
    const predictTime = Date.now() - startTime;
    
    console.log(`Prediction generation with 100 rules: ${predictTime}ms`);
    
    expect(predictTime).toBeLessThan(500);
    expect(predictions.length).toBeGreaterThan(0);
  });

  it("should prune old patterns efficiently", () => {
    // Create 500 patterns
    for (let i = 0; i < 500; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: `tool_${i % 50}`,
        timestamp: Date.now() - i * 86400000, // Spread over 500 days
        data: { pattern: i },
      });
    }
    
    const beforePrune = engine.getPatterns().length;
    
    const startTime = Date.now();
    engine.prunePatterns();
    const pruneTime = Date.now() - startTime;
    
    const afterPrune = engine.getPatterns().length;
    
    console.log(`Pruning ${beforePrune} patterns: ${pruneTime}ms`);
    console.log(`Before: ${beforePrune}, After: ${afterPrune}`);
    
    expect(pruneTime).toBeLessThan(1000);
    expect(afterPrune).toBeLessThan(beforePrune);
  });

  it("should maintain performance with concurrent event recording", async () => {
    const eventsPerBatch = 1000;
    const batches = 5;
    
    const startTime = Date.now();
    
    // Simulate concurrent recording
    const promises = Array.from({ length: batches }, (_, batchIndex) => {
      return new Promise<void>((resolve) => {
        for (let i = 0; i < eventsPerBatch; i++) {
          engine.recordEvent({
            type: "tool_execution",
            tool: "concurrent_test",
            timestamp: Date.now() - (batchIndex * eventsPerBatch + i) * 1000,
            data: { batch: batchIndex },
          });
        }
        resolve();
      });
    });
    
    await Promise.all(promises);
    
    const recordTime = Date.now() - startTime;
    console.log(`Concurrent recording of ${eventsPerBatch * batches} events: ${recordTime}ms`);
    
    expect(recordTime).toBeLessThan(3000);
  });

  it("should handle database queries efficiently", () => {
    // Populate with 5,000 events
    for (let i = 0; i < 5000; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: ["weather", "calendar", "email"][i % 3],
        timestamp: Date.now() - i * 1000,
        data: { index: i },
      });
    }
    
    const statsStart = Date.now();
    const stats = engine.getStats();
    const statsTime = Date.now() - statsStart;
    
    console.log(`Stats query: ${statsTime}ms`);
    expect(statsTime).toBeLessThan(100);
    
    const patternsStart = Date.now();
    const patterns = engine.getPatterns();
    const patternsTime = Date.now() - patternsStart;
    
    console.log(`Patterns query: ${patternsTime}ms`);
    expect(patternsTime).toBeLessThan(100);
  });

  it("should handle memory pressure gracefully", () => {
    // Force garbage collection before test
    if (global.gc) {
      global.gc();
    }
    
    const memoryBefore = process.memoryUsage().heapUsed;
    
    // Process large batch
    for (let i = 0; i < 20000; i++) {
      engine.recordEvent({
        type: "tool_execution",
        tool: "memory_test",
        timestamp: Date.now() - i * 1000,
        data: {
          largePayload: "x".repeat(100), // 100 bytes per event
        },
      });
    }
    
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryIncrease = memoryAfter - memoryBefore;
    const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
    
    console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);
    
    // Should not use more than 50MB for 20k events
    expect(memoryIncreaseMB).toBeLessThan(50);
  });
});

describe("Service Performance", () => {
  let service: PredictiveService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `predictive-service-perf-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    const config: PredictiveServiceConfig = {
      enabled: true,
      agentId: "perf-test",
      db: null,
      neuroMemory: { enabled: false },
      autoDeliver: {
        enabled: true,
        maxPerDay: 3,
        channels: ["test"],
        quietHours: { start: 22, end: 8 },
        minConfidence: 0.8,
      },
      schedule: {
        checkIntervalMs: 60000,
        patternLearningEnabled: true,
        consolidationIntervalMs: 3600000,
      },
    };

    service = new PredictiveService(config);
  });

  afterEach(() => {
    service.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should start service quickly", async () => {
    const startTime = Date.now();
    await service.start();
    const start_time = Date.now() - startTime;
    
    console.log(`Service start: ${start_time}ms`);
    expect(start_time).toBeLessThan(1000);
  });

  it("should handle rapid check cycles", async () => {
    await service.start();
    
    // Add predictions
    const engine = service.getEngine();
    engine.addRule({
      id: "rapid-test",
      name: "Rapid Test",
      condition: () => true,
      action: () => ({
        action: "test",
        category: "task",
        priority: "high",
        confidence: 0.9,
        message: "Test",
        data: {},
      }),
      enabled: true,
      priority: 1,
    });
    
    const startTime = Date.now();
    
    // Run 10 check cycles
    for (let i = 0; i < 10; i++) {
      await service.checkAndDeliver();
    }
    
    const checkTime = Date.now() - startTime;
    console.log(`10 check cycles: ${checkTime}ms`);
    
    expect(checkTime).toBeLessThan(2000);
  });
});
