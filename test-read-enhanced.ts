#!/usr/bin/env npx tsx
/**
 * 33 Tests for Enhanced Read Tool
 * Compare with original implementation
 */

import { existsSync, mkdirSync, writeFileSync, symlinkSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
import EnhancedRead, { classifyPathRisk } from "./src/agents/read-enhanced.js";

let passCount = 0;
let failCount = 0;
const results: { name: string; passed: boolean; error?: string; duration: number }[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    passCount++;
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (e) {
    failCount++;
    const error = (e as Error).message;
    results.push({ name, passed: false, error, duration: Date.now() - start });
    console.log(`❌ ${name}: ${error}`);
  }
}

const TEST_DIR = "/tmp/read-enhanced-test";

function setupTestDir(): void {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
}

function cleanupTestDir(): void {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

async function runAllTests(): Promise<void> {
  console.log("\n🧪 Enhanced Read Tool - 33 Tests\n");
  console.log("=".repeat(60) + "\n");

  setupTestDir();
  const reader = new EnhancedRead({ cacheEnabled: true, metricsEnabled: true });

  // BASIC (1-5)
  await test("1. Read simple text file", async () => {
    writeFileSync(join(TEST_DIR, "simple.txt"), "Hello, World!");
    const { content } = reader.read(join(TEST_DIR, "simple.txt"));
    assert(content.includes("Hello"), "Content mismatch");
  });

  await test("2. Read with absolute path", async () => {
    writeFileSync(join(TEST_DIR, "abs.txt"), "Absolute");
    const { content } = reader.read(join(TEST_DIR, "abs.txt"));
    assert(content.includes("Absolute"), "Content mismatch");
  });

  await test("3. Read empty file", async () => {
    writeFileSync(join(TEST_DIR, "empty.txt"), "");
    const { content } = reader.read(join(TEST_DIR, "empty.txt"));
    assert(content === "", "Should be empty");
  });

  await test("4. Read unicode", async () => {
    writeFileSync(join(TEST_DIR, "unicode.txt"), "你好 🌍");
    const { content } = reader.read(join(TEST_DIR, "unicode.txt"));
    assert(content.includes("你好"), "Unicode missing");
  });

  await test("5. Read JSON", async () => {
    writeFileSync(join(TEST_DIR, "data.json"), '{"key": "value"}');
    const { content } = reader.read(join(TEST_DIR, "data.json"));
    assert(content.includes('"key"'), "JSON key missing");
  });

  // OFFSET & LIMIT (6-12)
  await test("6. Read with offset", async () => {
    writeFileSync(join(TEST_DIR, "lines.txt"), "L1\nL2\nL3\nL4\nL5");
    const { content } = reader.read(join(TEST_DIR, "lines.txt"), { offset: 3 });
    assert(content.startsWith("L3"), "Should start at L3");
  });

  await test("7. Read with limit", async () => {
    writeFileSync(join(TEST_DIR, "lines2.txt"), "L1\nL2\nL3\nL4\nL5");
    const { content } = reader.read(join(TEST_DIR, "lines2.txt"), { limit: 2 });
    assert(content.includes("L1") && content.includes("L2"), "Should have L1 L2");
    assert(!content.includes("L3"), "Should not have L3");
  });

  await test("8. Offset + limit", async () => {
    writeFileSync(join(TEST_DIR, "lines3.txt"), "L1\nL2\nL3\nL4\nL5");
    const { content } = reader.read(join(TEST_DIR, "lines3.txt"), { offset: 2, limit: 2 });
    assert(content.includes("L2") && content.includes("L3"), "Should have L2 L3");
  });

  await test("9. Offset beyond end errors", async () => {
    writeFileSync(join(TEST_DIR, "short.txt"), "One line");
    try {
      reader.read(join(TEST_DIR, "short.txt"), { offset: 100 });
      assert(false, "Should error");
    } catch (e) {
      assert((e as Error).message.includes("beyond"), "Should mention beyond");
    }
  });

  await test("10. Offset 1 = beginning", async () => {
    writeFileSync(join(TEST_DIR, "off1.txt"), "First\nSecond");
    const { content } = reader.read(join(TEST_DIR, "off1.txt"), { offset: 1 });
    assert(content.includes("First"), "Should include first");
  });

  await test("11. Limit 0", async () => {
    writeFileSync(join(TEST_DIR, "lim0.txt"), "Content");
    const { content } = reader.read(join(TEST_DIR, "lim0.txt"), { limit: 0 });
    assert(content === "", "Limit 0 = empty");
  });

  await test("12. Large file", async () => {
    const big = Array.from({ length: 5000 }, (_, i) => `Line ${i}`).join("\n");
    writeFileSync(join(TEST_DIR, "big.txt"), big);
    const { content, metrics } = reader.read(join(TEST_DIR, "big.txt"));
    assert(content.length > 0, "Should read content");
  });

  // CACHING (13-18)
  await test("13. Cache hit on second read", async () => {
    const cachePath = join(TEST_DIR, "cached.txt");
    writeFileSync(cachePath, "Cache me");
    reader.clearCache(); // Start fresh
    reader.read(cachePath);
    const { metrics } = reader.read(cachePath);
    assert(metrics.fromCache === true, `Should be from cache, got fromCache=${metrics.fromCache}`);
  });

  await test("14. Cache miss after file change", async () => {
    writeFileSync(join(TEST_DIR, "change.txt"), "Original");
    reader.read(join(TEST_DIR, "change.txt"));
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(join(TEST_DIR, "change.txt"), "Modified");
    const { content, metrics } = reader.read(join(TEST_DIR, "change.txt"));
    assert(content.includes("Modified"), "Should have new content");
  });

  await test("15. Skip cache option", async () => {
    writeFileSync(join(TEST_DIR, "skip.txt"), "Skip cache");
    reader.read(join(TEST_DIR, "skip.txt"));
    const { metrics } = reader.read(join(TEST_DIR, "skip.txt"), { skipCache: true });
    assert(metrics.fromCache === false, "Should skip cache");
  });

  await test("16. Cache stats", async () => {
    const stats = reader.getCacheStats();
    assert(stats.entries >= 0, "Should have entries count");
    assert(stats.bytes >= 0, "Should have bytes count");
  });

  await test("17. Clear cache", async () => {
    reader.clearCache();
    const stats = reader.getCacheStats();
    assert(stats.entries === 0, "Cache should be empty");
  });

  await test("18. Metrics tracking", async () => {
    writeFileSync(join(TEST_DIR, "metrics.txt"), "Track me");
    reader.read(join(TEST_DIR, "metrics.txt"));
    const summary = reader.getMetricsSummary();
    assert(summary.totalReads > 0, "Should have reads");
  });

  // RISK CLASSIFICATION (19-24)
  await test("19. Classify safe path", async () => {
    const risk = classifyPathRisk("src/index.ts");
    assert(risk.level === "safe", "Should be safe");
  });

  await test("20. Classify sensitive path", async () => {
    const risk = classifyPathRisk(".git/config");
    assert(risk.level === "sensitive", "Should be sensitive");
  });

  await test("21. Classify blocked path (ssh key)", async () => {
    const risk = classifyPathRisk("/home/user/.ssh/id_rsa");
    assert(risk.level === "blocked", "Should be blocked");
  });

  await test("22. Classify blocked path (env)", async () => {
    const risk = classifyPathRisk(".env");
    assert(risk.level === "blocked", "Should be blocked");
  });

  await test("23. Classify blocked path (aws)", async () => {
    const risk = classifyPathRisk("~/.aws/credentials");
    assert(risk.level === "blocked", "Should be blocked");
  });

  await test("24. Allow reading sensitive (warning only)", async () => {
    mkdirSync(join(TEST_DIR, ".git"), { recursive: true });
    writeFileSync(join(TEST_DIR, ".git/config"), "[core]");
    const readerAllowSensitive = new EnhancedRead({ blockSensitive: false });
    const { risk } = readerAllowSensitive.read(join(TEST_DIR, ".git/config"));
    assert(risk.level === "sensitive", "Should warn but allow");
  });

  // PARALLEL READS (25-27)
  await test("25. Read multiple files", async () => {
    writeFileSync(join(TEST_DIR, "multi1.txt"), "File 1");
    writeFileSync(join(TEST_DIR, "multi2.txt"), "File 2");
    writeFileSync(join(TEST_DIR, "multi3.txt"), "File 3");
    const results = await reader.readMany([
      join(TEST_DIR, "multi1.txt"),
      join(TEST_DIR, "multi2.txt"),
      join(TEST_DIR, "multi3.txt"),
    ]);
    assert(results.length === 3, "Should have 3 results");
    assert(
      results.every((r) => r.content),
      "All should have content",
    );
  });

  await test("26. Parallel read with errors", async () => {
    writeFileSync(join(TEST_DIR, "exists.txt"), "I exist");
    const results = await reader.readMany([
      join(TEST_DIR, "exists.txt"),
      join(TEST_DIR, "does-not-exist.txt"),
    ]);
    assert(results[0].content !== undefined, "First should succeed");
    assert(results[1].error !== undefined, "Second should have error");
  });

  await test("27. Parallel read performance", async () => {
    for (let i = 0; i < 10; i++) {
      writeFileSync(join(TEST_DIR, `perf${i}.txt`), `Content ${i}`);
    }
    const paths = Array.from({ length: 10 }, (_, i) => join(TEST_DIR, `perf${i}.txt`));
    const start = Date.now();
    await reader.readMany(paths);
    const duration = Date.now() - start;
    assert(duration < 1000, `Should be fast: ${duration}ms`);
  });

  // ENCODING (28-30)
  await test("28. Detect ASCII", async () => {
    writeFileSync(join(TEST_DIR, "ascii.txt"), "Plain ASCII text");
    const { metrics } = reader.read(join(TEST_DIR, "ascii.txt"));
    assert(metrics.encoding === "ascii" || metrics.encoding === "utf-8", "Should detect encoding");
  });

  await test("29. Detect UTF-8", async () => {
    writeFileSync(join(TEST_DIR, "utf8.txt"), "日本語テキスト");
    const { metrics } = reader.read(join(TEST_DIR, "utf8.txt"));
    assert(metrics.encoding === "utf-8", "Should be UTF-8");
  });

  await test("30. Reject binary", async () => {
    writeFileSync(join(TEST_DIR, "binary.bin"), Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00]));
    try {
      reader.read(join(TEST_DIR, "binary.bin"));
      assert(false, "Should reject binary");
    } catch (e) {
      assert((e as Error).message.includes("binary"), "Should mention binary");
    }
  });

  // EDGE CASES (31-33)
  await test("31. File not found", async () => {
    try {
      reader.read(join(TEST_DIR, "nonexistent.txt"));
      assert(false, "Should error");
    } catch (e) {
      assert((e as Error).message.includes("not found"), "Should say not found");
    }
  });

  await test("32. Path with spaces", async () => {
    writeFileSync(join(TEST_DIR, "file with spaces.txt"), "Spaced");
    const { content } = reader.read(join(TEST_DIR, "file with spaces.txt"));
    assert(content.includes("Spaced"), "Should handle spaces");
  });

  await test("33. Metrics summary", async () => {
    const summary = reader.getMetricsSummary();
    assert(summary.totalReads > 0, "Should have total reads");
    assert(summary.cacheHitRate >= 0, "Should have hit rate");
    assert(summary.avgReadTimeMs >= 0, "Should have avg time");
    console.log(`   Cache hit rate: ${summary.cacheHitRate}%`);
    console.log(`   Avg read time: ${summary.avgReadTimeMs}ms`);
  });

  cleanupTestDir();

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${passCount}/${passCount + failCount} passed\n`);

  if (failCount > 0) {
    console.log("Failed:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ❌ ${r.name}: ${r.error}`));
  }

  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`⏱️  Total: ${totalTime}ms | Avg: ${Math.round(totalTime / results.length)}ms\n`);

  writeFileSync(
    "/tmp/read-test-results-after.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        passed: passCount,
        failed: failCount,
        passRate: Math.round((passCount / (passCount + failCount)) * 100),
        totalTime,
        results,
      },
      null,
      2,
    ),
  );

  console.log("📁 Results saved to /tmp/read-test-results-after.json\n");

  // COMPARISON
  try {
    const before = JSON.parse(
      require("fs").readFileSync("/tmp/read-test-results-before.json", "utf8"),
    );
    console.log("📊 COMPARISON:");
    console.log(
      `   BEFORE: ${before.passed}/${before.total} (${before.passRate}%) in ${before.totalTime}ms`,
    );
    console.log(
      `   AFTER:  ${passCount}/${passCount + failCount} (${Math.round((passCount / (passCount + failCount)) * 100)}%) in ${totalTime}ms`,
    );
    console.log(
      `   Speed:  ${totalTime < before.totalTime ? "🚀 FASTER" : "🐢 SLOWER"} by ${Math.abs(totalTime - before.totalTime)}ms`,
    );
  } catch {}
}

runAllTests().catch(console.error);
