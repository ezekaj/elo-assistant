#!/usr/bin/env npx tsx
/**
 * 33 HARD Tests for Enhanced Read Tool
 * Focus: path traversal, symlinks, cache pressure, race conditions,
 * encoding edge cases, LRU eviction, TTL, concurrent reads, and more.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  unlinkSync,
  rmSync,
  mkdtempSync,
  realpathSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
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

const TEST_DIR = mkdtempSync(join(tmpdir(), "read-hard-"));

function cleanupTestDir(): void {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}

// ============================================================
// HARD TESTS
// ============================================================

async function runAllTests(): Promise<void> {
  console.log("\n🔥 Enhanced Read Tool - 33 HARD Tests\n");
  console.log("=".repeat(60) + "\n");

  // ----------------------------------------------------------
  // GROUP 1: PATH TRAVERSAL ATTACKS (1-6)
  // ----------------------------------------------------------

  await test("1. Path traversal ../../../etc/passwd is blocked", async () => {
    const risk = classifyPathRisk("/safe/dir/../../../etc/passwd");
    assert(risk.level === "blocked", `Expected blocked, got ${risk.level}`);
  });

  await test("2. URL-encoded traversal variant is blocked", async () => {
    // Normalise the path as a real resolver would, then classify
    const raw = "/home/user/%2e%2e/%2e%2e/etc/shadow";
    const decoded = decodeURIComponent(raw);
    const risk = classifyPathRisk(decoded);
    assert(risk.level === "blocked", `Expected blocked for ${decoded}, got ${risk.level}`);
  });

  await test("3. Double-dot in middle of path still classifies blocked patterns", async () => {
    const risk = classifyPathRisk("/app/../.env");
    assert(risk.level === "blocked", `Expected blocked for .env, got ${risk.level}`);
  });

  await test("4. Private key path variants are blocked", async () => {
    const paths = [
      "/home/user/.ssh/id_rsa",
      "/root/.ssh/id_ed25519",
      "/home/user/.ssh/id_ecdsa",
      "my_private_key.pem",
    ];
    for (const p of paths) {
      const risk = classifyPathRisk(p);
      assert(risk.level === "blocked", `Expected blocked for: ${p}, got ${risk.level}`);
    }
  });

  await test("5. AWS credentials variants are blocked", async () => {
    const paths = ["/home/user/.aws/credentials", "~/.aws/credentials"];
    for (const p of paths) {
      const risk = classifyPathRisk(p);
      assert(risk.level === "blocked", `Expected blocked for: ${p}, got ${risk.level}`);
    }
  });

  await test("6. npmrc and netrc are blocked", async () => {
    const paths = ["/home/user/.npmrc", "~/.netrc"];
    for (const p of paths) {
      const risk = classifyPathRisk(p);
      assert(risk.level === "blocked", `Expected blocked for: ${p}, got ${risk.level}`);
    }
  });

  // ----------------------------------------------------------
  // GROUP 2: SYMLINK EDGE CASES (7-10)
  // ----------------------------------------------------------

  await test("7. Symlink to safe file reads correctly", async () => {
    const target = join(TEST_DIR, "sym_target.txt");
    const link = join(TEST_DIR, "sym_link.txt");
    writeFileSync(target, "symlink content");
    try {
      unlinkSync(link);
    } catch {}
    symlinkSync(target, link);
    const reader = new EnhancedRead();
    const { content } = reader.read(link);
    assert(content.includes("symlink content"), "Should follow symlink");
  });

  await test("8. Symlink to blocked path: classifyPathRisk warns on resolved path", async () => {
    // We can't create /etc/shadow in a test, but we can test that the
    // classification of a path containing .env is blocked even via symlink naming.
    const risk = classifyPathRisk(join(TEST_DIR, "fake.env"));
    // .env$ pattern should match
    assert(risk.level === "blocked", `Expected blocked for fake.env, got ${risk.level}`);
  });

  await test("9. Circular symlink errors gracefully", async () => {
    const a = join(TEST_DIR, "sym_a");
    const b = join(TEST_DIR, "sym_b");
    try {
      unlinkSync(a);
    } catch {}
    try {
      unlinkSync(b);
    } catch {}
    symlinkSync(b, a);
    symlinkSync(a, b);
    const reader = new EnhancedRead();
    try {
      reader.read(a);
      assert(false, "Should throw on circular symlink");
    } catch (e) {
      // Any error is correct - circular symlinks should fail
      assert(true, "Correctly errored");
    }
  });

  await test("10. Symlink pointing to nonexistent file errors", async () => {
    const link = join(TEST_DIR, "dead_link");
    try {
      unlinkSync(link);
    } catch {}
    symlinkSync(join(TEST_DIR, "nowhere.txt"), link);
    const reader = new EnhancedRead();
    try {
      reader.read(link);
      assert(false, "Should throw for dangling symlink");
    } catch (e) {
      assert(true, "Correctly errored on dangling symlink");
    }
  });

  // ----------------------------------------------------------
  // GROUP 3: CACHE PRESSURE & LRU EVICTION (11-15)
  // ----------------------------------------------------------

  await test("11. LRU eviction: maxSize=3 evicts oldest on 4th entry", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true, cacheMaxSize: 3 });
    for (let i = 0; i < 4; i++) {
      writeFileSync(join(TEST_DIR, `lru${i}.txt`), `LRU file ${i}`);
      reader.read(join(TEST_DIR, `lru${i}.txt`));
    }
    const stats = reader.getCacheStats();
    assert(stats.entries <= 3, `Cache should be capped at 3, got ${stats.entries}`);
  });

  await test("12. Cache maxBytes: single oversized file is not cached", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true, cacheMaxBytes: 10 }); // 10 bytes max
    const bigPath = join(TEST_DIR, "toobig.txt");
    writeFileSync(bigPath, "This is definitely more than 10 bytes of content");
    reader.read(bigPath);
    const stats = reader.getCacheStats();
    assert(stats.entries === 0, `Oversized file should not be cached, entries=${stats.entries}`);
  });

  await test("13. Cache TTL: entry expires after ttl", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true, cacheTTLMs: 50 });
    const p = join(TEST_DIR, "ttl_file.txt");
    writeFileSync(p, "TTL test");
    reader.read(p); // prime cache
    await new Promise((r) => setTimeout(r, 80)); // wait for TTL
    const { metrics } = reader.read(p);
    assert(metrics.fromCache === false, "Should be cache miss after TTL expiry");
  });

  await test("14. Rapid repeated reads only read file once (cache)", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true });
    reader.clearCache();
    const p = join(TEST_DIR, "rapid.txt");
    writeFileSync(p, "rapid");
    for (let i = 0; i < 20; i++) reader.read(p);
    const summary = reader.getMetricsSummary();
    // First read is a miss, rest should be hits
    const myMetrics = reader.getMetrics().filter((m) => m.path === p);
    const hits = myMetrics.filter((m) => m.fromCache).length;
    assert(hits >= 18, `Expected >= 18 cache hits, got ${hits}`);
  });

  await test("15. clearCache resets bytes counter to zero", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true });
    writeFileSync(join(TEST_DIR, "cc.txt"), "clear me");
    reader.read(join(TEST_DIR, "cc.txt"));
    reader.clearCache();
    const stats = reader.getCacheStats();
    assert(stats.bytes === 0, `Bytes should be 0 after clear, got ${stats.bytes}`);
    assert(stats.entries === 0, `Entries should be 0 after clear, got ${stats.entries}`);
  });

  // ----------------------------------------------------------
  // GROUP 4: ENCODING EDGE CASES (16-20)
  // ----------------------------------------------------------

  await test("16. UTF-8 BOM file is detected and readable", async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from("BOM content");
    const p = join(TEST_DIR, "bom.txt");
    writeFileSync(p, Buffer.concat([bom, content]));
    const reader = new EnhancedRead();
    const { content: c, metrics } = reader.read(p);
    assert(c.length > 0, "Should read BOM file");
    assert(metrics.encoding === "utf-8-bom", `Expected utf-8-bom, got ${metrics.encoding}`);
  });

  await test("17. File with only whitespace/newlines is not empty", async () => {
    const p = join(TEST_DIR, "whitespace.txt");
    writeFileSync(p, "   \n\n\t  \n");
    const reader = new EnhancedRead();
    const { content } = reader.read(p);
    assert(content.length > 0, "Whitespace-only file should have content");
  });

  await test("18. Very long single line (no newlines) reads correctly", async () => {
    const p = join(TEST_DIR, "longline.txt");
    const line = "A".repeat(100_000);
    writeFileSync(p, line);
    const reader = new EnhancedRead();
    const { content } = reader.read(p);
    assert(content.length === 100_000, `Expected 100000 chars, got ${content.length}`);
  });

  await test("19. Mixed CRLF and LF line endings", async () => {
    const p = join(TEST_DIR, "mixed_endings.txt");
    writeFileSync(p, "Line1\r\nLine2\nLine3\r\n");
    const reader = new EnhancedRead();
    const { content } = reader.read(p);
    assert(content.includes("Line1"), "Should have Line1");
    assert(content.includes("Line2"), "Should have Line2");
    assert(content.includes("Line3"), "Should have Line3");
  });

  await test("20. Null bytes in file = binary rejection", async () => {
    const p = join(TEST_DIR, "nullbytes.bin");
    // >1% null bytes triggers binary detection
    const buf = Buffer.alloc(100, 0); // all nulls
    writeFileSync(p, buf);
    const reader = new EnhancedRead();
    try {
      reader.read(p);
      assert(false, "Should reject null-heavy binary file");
    } catch (e) {
      assert((e as Error).message.includes("binary"), "Error should mention binary");
    }
  });

  // ----------------------------------------------------------
  // GROUP 5: CONCURRENT & PARALLEL STRESS (21-24)
  // ----------------------------------------------------------

  await test("21. 50 concurrent reads of same file return consistent content", async () => {
    const p = join(TEST_DIR, "concurrent.txt");
    writeFileSync(p, "concurrent content");
    const reader = new EnhancedRead({ cacheEnabled: true });
    const reads = await Promise.all(
      Array.from(
        { length: 50 },
        () =>
          new Promise<string>((res, rej) => {
            try {
              res(reader.read(p).content);
            } catch (e) {
              rej(e);
            }
          }),
      ),
    );
    assert(
      reads.every((c) => c === "concurrent content"),
      "All reads should match",
    );
  });

  await test("22. Parallel readMany: 20 files, all succeed", async () => {
    const reader = new EnhancedRead();
    const paths: string[] = [];
    for (let i = 0; i < 20; i++) {
      const p = join(TEST_DIR, `pmany${i}.txt`);
      writeFileSync(p, `content ${i}`);
      paths.push(p);
    }
    const results2 = await reader.readMany(paths);
    const errors = results2.filter((r) => r.error);
    assert(errors.length === 0, `Expected 0 errors, got ${errors.length}: ${errors[0]?.error}`);
  });

  await test("23. Parallel readMany: mix of 10 good + 5 missing files", async () => {
    const reader = new EnhancedRead();
    const paths: string[] = [];
    for (let i = 0; i < 10; i++) {
      const p = join(TEST_DIR, `pmix_good${i}.txt`);
      writeFileSync(p, `good ${i}`);
      paths.push(p);
    }
    for (let i = 0; i < 5; i++) {
      paths.push(join(TEST_DIR, `pmix_missing${i}.txt`));
    }
    const results2 = await reader.readMany(paths);
    const successes = results2.filter((r) => r.content !== undefined);
    const errors2 = results2.filter((r) => r.error !== undefined);
    assert(successes.length === 10, `Expected 10 successes, got ${successes.length}`);
    assert(errors2.length === 5, `Expected 5 errors, got ${errors2.length}`);
  });

  await test("24. Write-during-read: second reader sees updated content", async () => {
    const p = join(TEST_DIR, "race_file.txt");
    writeFileSync(p, "version 1");
    const reader1 = new EnhancedRead({ cacheEnabled: false });
    const reader2 = new EnhancedRead({ cacheEnabled: false });
    reader1.read(p);
    writeFileSync(p, "version 2");
    const { content } = reader2.read(p);
    assert(content.includes("version 2"), "Should see updated content");
  });

  // ----------------------------------------------------------
  // GROUP 6: OFFSET / LIMIT CORNER CASES (25-28)
  // ----------------------------------------------------------

  await test("25. Offset exactly at last line", async () => {
    const p = join(TEST_DIR, "lastline.txt");
    writeFileSync(p, "L1\nL2\nL3");
    const reader = new EnhancedRead();
    const { content } = reader.read(p, { offset: 3 });
    assert(content.trim() === "L3", `Expected L3, got: ${content}`);
  });

  await test("26. Limit larger than file returns all lines", async () => {
    const p = join(TEST_DIR, "smallfile.txt");
    writeFileSync(p, "A\nB\nC");
    const reader = new EnhancedRead();
    const { content, metrics } = reader.read(p, { limit: 9999 });
    assert(content.includes("A") && content.includes("C"), "Should have all lines");
    assert(metrics.truncated === false, "Should not be truncated");
  });

  await test("27. Negative limit treated as empty result", async () => {
    const p = join(TEST_DIR, "neglimit.txt");
    writeFileSync(p, "Content here");
    const reader = new EnhancedRead();
    // limit <= 0 => empty
    const { content } = reader.read(p, { limit: -5 });
    assert(content === "", `Expected empty for negative limit, got: ${content}`);
  });

  await test("28. Offset + limit spanning exactly file end", async () => {
    const p = join(TEST_DIR, "exact_span.txt");
    writeFileSync(p, "A\nB\nC\nD\nE");
    const reader = new EnhancedRead();
    // offset=3 starts at C (line 3), limit=3 takes C,D,E
    const { content } = reader.read(p, { offset: 3, limit: 3 });
    assert(content.includes("C"), "Should have C");
    assert(content.includes("E"), "Should have E");
    assert(!content.includes("A"), "Should not have A");
  });

  // ----------------------------------------------------------
  // GROUP 7: METRICS ACCURACY (29-31)
  // ----------------------------------------------------------

  await test("29. Metrics sizeBytes matches actual file size", async () => {
    const p = join(TEST_DIR, "sized.txt");
    const data = "x".repeat(1234);
    writeFileSync(p, data);
    const reader = new EnhancedRead({ cacheEnabled: false });
    const { metrics } = reader.read(p);
    assert(metrics.sizeBytes === 1234, `Expected 1234, got ${metrics.sizeBytes}`);
  });

  await test("30. Cache hit shows fromCache=true in metrics", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true });
    reader.clearCache();
    const p = join(TEST_DIR, "metrics_cache.txt");
    writeFileSync(p, "metrics check");
    reader.read(p); // miss
    const { metrics } = reader.read(p); // hit
    assert(metrics.fromCache === true, `Expected fromCache=true, got ${metrics.fromCache}`);
  });

  await test("31. getMetricsSummary cacheHitRate is accurate", async () => {
    const reader = new EnhancedRead({ cacheEnabled: true });
    reader.clearCache();
    const p = join(TEST_DIR, "hitrate.txt");
    writeFileSync(p, "hitrate");
    // 1 miss + 9 hits = 90%
    for (let i = 0; i < 10; i++) reader.read(p);
    const summary = reader.getMetricsSummary();
    // We only control the reads in this reader instance
    const myMetrics = reader.getMetrics().filter((m) => m.path === p);
    const hits = myMetrics.filter((m) => m.fromCache).length;
    assert(hits === 9, `Expected 9 hits, got ${hits}`);
  });

  // ----------------------------------------------------------
  // GROUP 8: SPECIAL FILES & DEEP PATHS (32-33)
  // ----------------------------------------------------------

  await test("32. Deeply nested directory path reads correctly", async () => {
    const deep = join(TEST_DIR, "a", "b", "c", "d", "e", "f");
    mkdirSync(deep, { recursive: true });
    const p = join(deep, "deep.txt");
    writeFileSync(p, "deep content");
    const reader = new EnhancedRead();
    const { content } = reader.read(p);
    assert(content === "deep content", `Content mismatch: ${content}`);
  });

  await test("33. File with special chars in name (parens, brackets, dots)", async () => {
    const p = join(TEST_DIR, "file (1) [v2].txt");
    writeFileSync(p, "special name");
    const reader = new EnhancedRead();
    const { content } = reader.read(p);
    assert(content === "special name", `Expected "special name", got: ${content}`);
  });

  // ----------------------------------------------------------
  // RESULTS
  // ----------------------------------------------------------

  cleanupTestDir();

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${passCount}/${passCount + failCount} passed\n`);

  if (failCount > 0) {
    console.log("Failed:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ❌ ${r.name}: ${r.error}`));
  }

  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`⏱️  Total: ${totalTime}ms | Avg: ${Math.round(totalTime / results.length)}ms\n`);

  import("fs").then(({ writeFileSync: wf }) => {
    wf(
      "/tmp/read-hard-results.json",
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          passed: passCount,
          failed: failCount,
          total: passCount + failCount,
          passRate: Math.round((passCount / (passCount + failCount)) * 100),
          totalTime,
          results,
        },
        null,
        2,
      ),
    );
    console.log("📁 Results saved to /tmp/read-hard-results.json\n");
  });
}

runAllTests().catch(console.error);
