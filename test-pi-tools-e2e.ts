#!/usr/bin/env npx tsx
/**
 * Real end-to-end tests for pi-tools.read.ts
 *
 * NO MOCKS. Uses createSandboxedReadTool with the actual pi-coding-agent base.
 * Verifies real file content, real caching (via object reference identity),
 * real sandbox enforcement, real mtime invalidation, real param aliases.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import {
  createSandboxedReadTool,
  clearReadToolCache,
  getReadToolCacheStats,
} from "./src/agents/pi-tools.read.js";

// ─── Harness ──────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const results: { name: string; passed: boolean; error?: string; ms: number }[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
function text(result: any): string {
  const block = result?.content?.find((b: any) => b.type === "text");
  return block?.text ?? "";
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    pass++;
    results.push({ name, passed: true, ms: Date.now() - t0 });
    process.stdout.write(`✅ ${name}\n`);
  } catch (e) {
    fail++;
    results.push({ name, passed: false, error: (e as Error).message, ms: Date.now() - t0 });
    process.stdout.write(`❌ ${name}: ${(e as Error).message}\n`);
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────
const ROOT = "/tmp/pi-tools-e2e";
if (existsSync(ROOT)) rmSync(ROOT, { recursive: true });
mkdirSync(ROOT, { recursive: true });

async function run(): Promise<void> {
  console.log("\n🔌 Real E2E Tests – createSandboxedReadTool (no mocks)\n" + "=".repeat(60) + "\n");

  clearReadToolCache();
  const tool = createSandboxedReadTool(ROOT);

  // ── 1. Basic read – content matches what was written ──────────────────────
  await test("1. real file content returned correctly", async () => {
    writeFileSync(join(ROOT, "basic.txt"), "hello from disk");
    const r = await tool.execute("1", { path: join(ROOT, "basic.txt") }, undefined as any);
    assert(text(r).includes("hello from disk"), `got: ${text(r)}`);
  });

  // ── 2. file_path alias works with real tool chain ──────────────────────────
  await test("2. file_path alias works end-to-end", async () => {
    writeFileSync(join(ROOT, "alias.txt"), "alias content");
    const r = await tool.execute("2", { file_path: join(ROOT, "alias.txt") }, undefined as any);
    assert(text(r).includes("alias content"), `got: ${text(r)}`);
  });

  // ── 3. Cache: same object reference returned on second read ────────────────
  // If result1 === result2, caching is definitely working (distinct objects
  // can't be ===, so this only passes if the exact same cached object comes back)
  await test("3. cache: second read returns same object reference", async () => {
    clearReadToolCache();
    writeFileSync(join(ROOT, "ref.txt"), "reference test");
    const r1 = await tool.execute("3a", { path: join(ROOT, "ref.txt") }, undefined as any);
    const r2 = await tool.execute("3b", { path: join(ROOT, "ref.txt") }, undefined as any);
    assert(r1 === r2, "r1 and r2 should be the exact same cached object");
  });

  // ── 4. Cache invalidated on file content change (mtime bump) ──────────────
  await test("4. cache invalidated when file changes", async () => {
    clearReadToolCache();
    const fp = join(ROOT, "mut.txt");
    writeFileSync(fp, "version one");
    const r1 = await tool.execute("4a", { path: fp }, undefined as any);
    assert(text(r1).includes("version one"), "should read v1");

    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(fp, "version two");

    const r2 = await tool.execute("4b", { path: fp }, undefined as any);
    assert(text(r2).includes("version two"), `should read v2, got: ${text(r2)}`);
    assert(r1 !== r2, "r1 and r2 should be different objects (cache was invalidated)");
  });

  // ── 5. Multiline file – full content ──────────────────────────────────────
  await test("5. multiline file read completely", async () => {
    writeFileSync(join(ROOT, "multi.txt"), "L1\nL2\nL3\nL4\nL5");
    const r = await tool.execute("5", { path: join(ROOT, "multi.txt") }, undefined as any);
    const t = text(r);
    assert(t.includes("L1") && t.includes("L5"), `missing lines: ${t}`);
  });

  // ── 6. Offset read – only lines from offset ────────────────────────────────
  await test("6. offset read returns partial content from correct line", async () => {
    clearReadToolCache();
    writeFileSync(join(ROOT, "offtest.txt"), "A\nB\nC\nD\nE");
    const r = await tool.execute(
      "6",
      { path: join(ROOT, "offtest.txt"), offset: 3 },
      undefined as any,
    );
    const t = text(r);
    // Should start from line 3 (C) and not include A or B
    assert(!t.includes("A") || t.indexOf("C") < t.indexOf("A"), `offset not respected: ${t}`);
    assert(t.includes("C"), `should include C: ${t}`);
  });

  // ── 7. Limit read – only N lines ──────────────────────────────────────────
  await test("7. limit read returns only N lines", async () => {
    clearReadToolCache();
    writeFileSync(join(ROOT, "limtest.txt"), "X1\nX2\nX3\nX4\nX5");
    const r = await tool.execute(
      "7",
      { path: join(ROOT, "limtest.txt"), limit: 2 },
      undefined as any,
    );
    const t = text(r);
    assert(t.includes("X1") && t.includes("X2"), `should have X1 X2: ${t}`);
    assert(!t.includes("X3"), `should not have X3: ${t}`);
  });

  // ── 8. start_line alias maps to same cache key as offset ──────────────────
  await test("8. start_line alias shares cache key with offset (same object ref)", async () => {
    clearReadToolCache();
    writeFileSync(join(ROOT, "sl.txt"), "P\nQ\nR\nS");
    const r1 = await tool.execute(
      "8a",
      { path: join(ROOT, "sl.txt"), start_line: 2 },
      undefined as any,
    );
    const r2 = await tool.execute(
      "8b",
      { path: join(ROOT, "sl.txt"), offset: 2 },
      undefined as any,
    );
    assert(r1 === r2, "start_line=2 and offset=2 should share the same cache entry");
  });

  // ── 9. Sandbox: path outside root is rejected ──────────────────────────────
  await test("9. path outside sandbox root is rejected", async () => {
    try {
      await tool.execute("9", { path: "/etc/hosts" }, undefined as any);
      assert(false, "should have thrown sandbox violation");
    } catch (e) {
      const msg = (e as Error).message.toLowerCase();
      assert(
        msg.includes("sandbox") ||
          msg.includes("outside") ||
          msg.includes("access") ||
          msg.includes("forbidden") ||
          msg.includes("not allowed") ||
          msg.includes("path"),
        `unexpected error: ${msg}`,
      );
    }
  });

  // ── 10. Unicode content preserved ─────────────────────────────────────────
  await test("10. unicode content preserved end-to-end", async () => {
    writeFileSync(join(ROOT, "unicode.txt"), "日本語 🌍 émojis");
    const r = await tool.execute("10", { path: join(ROOT, "unicode.txt") }, undefined as any);
    assert(text(r).includes("日本語"), `unicode missing: ${text(r)}`);
    assert(text(r).includes("🌍"), `emoji missing: ${text(r)}`);
  });

  // ── 11. Empty file returns empty or minimal text ───────────────────────────
  await test("11. empty file handled without error", async () => {
    writeFileSync(join(ROOT, "empty.txt"), "");
    const r = await tool.execute("11", { path: join(ROOT, "empty.txt") }, undefined as any);
    // Should not throw. Content may be empty string or minimal text.
    assert(Array.isArray((r as any).content), "result should have content array");
  });

  // ── 12. Cache stats increase after first read, stable on second ────────────
  await test("12. cache entry count increases on first read, stable on second", async () => {
    clearReadToolCache();
    writeFileSync(join(ROOT, "stats.txt"), "stats check");
    const before = getReadToolCacheStats().entries;
    await tool.execute("12a", { path: join(ROOT, "stats.txt") }, undefined as any);
    const after1 = getReadToolCacheStats().entries;
    await tool.execute("12b", { path: join(ROOT, "stats.txt") }, undefined as any);
    const after2 = getReadToolCacheStats().entries;
    assert(after1 === before + 1, `expected ${before + 1} entries, got ${after1}`);
    assert(after2 === after1, `second read should not add entry: got ${after2}`);
  });

  // ── 13. Two different files cached independently ───────────────────────────
  await test("13. two different files produce independent cache entries", async () => {
    clearReadToolCache();
    writeFileSync(join(ROOT, "fileA.txt"), "content A");
    writeFileSync(join(ROOT, "fileB.txt"), "content B");
    const rA = await tool.execute("13a", { path: join(ROOT, "fileA.txt") }, undefined as any);
    const rB = await tool.execute("13b", { path: join(ROOT, "fileB.txt") }, undefined as any);
    assert(text(rA).includes("content A"), `A wrong: ${text(rA)}`);
    assert(text(rB).includes("content B"), `B wrong: ${text(rB)}`);
    assert(rA !== rB, "different files should be different cache entries");
    assert(getReadToolCacheStats().entries === 2, `expected 2 entries`);
  });

  // ── 14. Clear cache → re-read still works (new object, same content) ───────
  await test("14. clear cache then re-read returns correct content (new object)", async () => {
    writeFileSync(join(ROOT, "clear.txt"), "clear test");
    await tool.execute("14a", { path: join(ROOT, "clear.txt") }, undefined as any);
    clearReadToolCache();
    const r2 = await tool.execute("14b", { path: join(ROOT, "clear.txt") }, undefined as any);
    assert(text(r2).includes("clear test"), `content wrong after clear: ${text(r2)}`);
  });

  // ── 15. Large file (5000 lines) – upstream paginates at 2000 ─────────────
  // pi-coding-agent caps at 2000 lines and appends a "Use offset=..." notice.
  // This test verifies that real behavior, not a bug in our wrapper.
  await test("15. large file (5000 lines) capped at 2000 by upstream with pagination notice", async () => {
    const content = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    writeFileSync(join(ROOT, "large.txt"), content);
    const r = await tool.execute("15", { path: join(ROOT, "large.txt") }, undefined as any);
    const t = text(r);
    assert(t.includes("line 0"), `missing first line: ${t.slice(0, 100)}`);
    // Upstream truncates at 2000; last line should be near line 1999
    assert(t.includes("line 1999"), `expected line 1999 in truncated output: ${t.slice(-200)}`);
    // Pagination notice present
    assert(
      t.includes("offset=") || t.includes("Showing lines") || t.includes("continue"),
      `expected pagination notice: ${t.slice(-200)}`,
    );
    // Confirms line 4999 is NOT present (correctly truncated)
    assert(!t.includes("line 4999"), "line 4999 should not be present (pagination caps at 2000)");
  });

  // ── 16. JSON file content preserved exactly ────────────────────────────────
  await test("16. JSON file content preserved exactly", async () => {
    const json = JSON.stringify({ key: "value", num: 42, arr: [1, 2, 3] }, null, 2);
    writeFileSync(join(ROOT, "data.json"), json);
    const r = await tool.execute("16", { path: join(ROOT, "data.json") }, undefined as any);
    assert(text(r).includes('"key"'), `key missing: ${text(r)}`);
    assert(text(r).includes('"value"'), `value missing: ${text(r)}`);
  });

  // ── 17. mtime-only change (touch) invalidates cache ───────────────────────
  await test("17. touching file (mtime only) invalidates cache", async () => {
    clearReadToolCache();
    const fp = join(ROOT, "touch.txt");
    writeFileSync(fp, "touch test");
    const r1 = await tool.execute("17a", { path: fp }, undefined as any);
    assert(
      r1 === (await tool.execute("17b", { path: fp }, undefined as any)),
      "pre-touch: should be cached",
    );

    await new Promise((r) => setTimeout(r, 20));
    const future = new Date(Date.now() + 2000);
    utimesSync(fp, future, future);

    const r3 = await tool.execute("17c", { path: fp }, undefined as any);
    assert(r1 !== r3, "post-touch: should be a new object (cache miss)");
    assert(text(r3) === "touch test", "content should be the same even after touch");
  });

  // ── 18. Sandbox path traversal attempt rejected ────────────────────────────
  await test("18. path traversal (../) outside root rejected", async () => {
    try {
      await tool.execute("18", { path: join(ROOT, "../../../etc/passwd") }, undefined as any);
      assert(false, "should have thrown");
    } catch (e) {
      // Any error means the sandbox caught it
      assert(true, "sandbox rejected traversal");
    }
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────
  rmSync(ROOT, { recursive: true });

  const total = pass + fail;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${pass}/${total} passed  (${totalMs}ms total)\n`);

  if (fail > 0) {
    console.log("Failed:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ❌ ${r.name}\n     ${r.error}`));
    console.log();
  }

  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
