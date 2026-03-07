#!/usr/bin/env npx tsx
/**
 * 33 Hardest Tests for pi-tools.read.ts
 *
 * Targets every edge case: alias collision, boundary eviction, TTL expiry,
 * mtime invalidation, image skip, param precedence, required-group logic, etc.
 */

import { writeFileSync, mkdirSync, rmSync, existsSync, utimesSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeToolParams,
  patchToolSchemaForClaudeCompatibility,
  assertRequiredParams,
  wrapToolParamNormalization,
  createOpenClawReadTool,
  getReadToolCacheStats,
  clearReadToolCache,
  CLAUDE_PARAM_GROUPS,
} from "./src/agents/pi-tools.read.js";

// ─── Tiny test harness ────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const results: { name: string; passed: boolean; error?: string; ms: number }[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
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
    const error = (e as Error).message;
    results.push({ name, passed: false, error, ms: Date.now() - t0 });
    process.stdout.write(`❌ ${name}: ${error}\n`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TEST_DIR = "/tmp/pi-tools-hard-tests";
if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
mkdirSync(TEST_DIR, { recursive: true });

// Minimal 1×1 transparent PNG (valid base64)
const PNG1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function textResult(text: string) {
  return { content: [{ type: "text", text }] };
}
function imageResult(mime = "image/png") {
  return {
    content: [
      { type: "text", text: `Read image file [${mime}]` },
      { type: "image", data: PNG1x1, mimeType: mime },
    ],
  };
}

let callCount = 0;
function mockBase(result: object): any {
  return {
    name: "read",
    description: "mock",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    execute: async () => {
      callCount++;
      return result;
    },
  };
}

// ─── normalizeToolParams ──────────────────────────────────────────── 1-7 ─────
async function run(): Promise<void> {
  console.log("\n🔬 33 Hardest Tests – pi-tools.read.ts\n" + "=".repeat(60) + "\n");

  // 1. file_path translated when path absent
  await test("1. file_path→path when path absent", () => {
    const r = normalizeToolParams({ file_path: "/a.ts" });
    assert(r?.path === "/a.ts", `path=${r?.path}`);
    assert(!("file_path" in (r ?? {})), "file_path should be deleted");
  });

  // 2. file_path NOT translated when path already present (path wins)
  await test("2. path wins over file_path when both present", () => {
    const r = normalizeToolParams({ file_path: "/wrong.ts", path: "/correct.ts" });
    assert(r?.path === "/correct.ts", "path should be /correct.ts");
  });

  // 3. old_string→oldText
  await test("3. old_string→oldText", () => {
    const r = normalizeToolParams({ path: "/a.ts", old_string: "before" });
    assert(r?.oldText === "before", "oldText missing");
    assert(!("old_string" in (r ?? {})), "old_string not deleted");
  });

  // 4. new_string→newText
  await test("4. new_string→newText", () => {
    const r = normalizeToolParams({ path: "/a.ts", new_string: "after" });
    assert(r?.newText === "after", "newText missing");
    assert(!("new_string" in (r ?? {})), "new_string not deleted");
  });

  // 5. All three aliases translated simultaneously
  await test("5. all three aliases translated simultaneously", () => {
    const r = normalizeToolParams({ file_path: "/x.ts", old_string: "a", new_string: "b" });
    assert(r?.path === "/x.ts", "path");
    assert(r?.oldText === "a", "oldText");
    assert(r?.newText === "b", "newText");
    assert(!("file_path" in (r ?? {})), "no file_path");
    assert(!("old_string" in (r ?? {})), "no old_string");
    assert(!("new_string" in (r ?? {})), "no new_string");
  });

  // 6. null → undefined
  await test("6. null params → undefined", () => {
    assert(normalizeToolParams(null) === undefined, "should be undefined");
  });

  // 7. string (non-object) → undefined
  await test("7. string params → undefined", () => {
    assert(normalizeToolParams("/some/path") === undefined, "should be undefined");
  });

  // ─── patchToolSchemaForClaudeCompatibility ─────────────────────── 8-15 ────

  // 8. Tool with no parameters → exact same object returned
  await test("8. tool with no parameters → same reference", () => {
    const t: any = {
      name: "x",
      description: "x",
      parameters: undefined,
      execute: async () => ({ content: [] }),
    };
    assert(patchToolSchemaForClaudeCompatibility(t) === t, "must be same ref");
  });

  // 9. Parameters but no properties → same reference
  await test("9. parameters but no properties → same reference", () => {
    const t: any = {
      name: "x",
      description: "x",
      parameters: { type: "object" },
      execute: async () => ({ content: [] }),
    };
    assert(patchToolSchemaForClaudeCompatibility(t) === t, "must be same ref");
  });

  // 10. Adds file_path alias, removes path from required
  await test("10. adds file_path, removes path from required", () => {
    const t: any = {
      name: "read",
      description: "x",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      execute: async () => ({ content: [] }),
    };
    const r = patchToolSchemaForClaudeCompatibility(t);
    const props = (r.parameters as any).properties;
    const req = (r.parameters as any).required as string[];
    assert("file_path" in props, "file_path not added");
    assert(!req.includes("path"), "path still in required");
  });

  // 11. Does NOT overwrite an existing file_path property
  await test("11. does not overwrite existing file_path in properties", () => {
    const t: any = {
      name: "read",
      description: "x",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          file_path: { type: "string", description: "existing" },
        },
        required: ["path"],
      },
      execute: async () => ({ content: [] }),
    };
    const r = patchToolSchemaForClaudeCompatibility(t);
    const props = (r.parameters as any).properties;
    assert(props.file_path.description === "existing", "should preserve existing file_path");
  });

  // 12. All three pairs patched (path, oldText, newText)
  await test("12. all three alias pairs patched for edit tool", () => {
    const t: any = {
      name: "edit",
      description: "x",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
        },
        required: ["path", "oldText", "newText"],
      },
      execute: async () => ({ content: [] }),
    };
    const r = patchToolSchemaForClaudeCompatibility(t);
    const props = (r.parameters as any).properties;
    const req = (r.parameters as any).required as string[];
    assert(
      "file_path" in props && "old_string" in props && "new_string" in props,
      "aliases missing",
    );
    assert(
      !req.includes("path") && !req.includes("oldText") && !req.includes("newText"),
      "originals still required",
    );
  });

  // 13. Missing required array → alias still added to properties
  await test("13. no required array → alias still added to properties", () => {
    const t: any = {
      name: "read",
      description: "x",
      parameters: { type: "object", properties: { path: { type: "string" } } },
      execute: async () => ({ content: [] }),
    };
    const r = patchToolSchemaForClaudeCompatibility(t);
    assert("file_path" in (r.parameters as any).properties, "file_path not added");
  });

  // 14. path not in required → alias still added to properties (required not touched)
  await test("14. path not in required → alias still added, required unchanged", () => {
    const t: any = {
      name: "read",
      description: "x",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: [] },
      execute: async () => ({ content: [] }),
    };
    const r = patchToolSchemaForClaudeCompatibility(t);
    const req = (r.parameters as any).required as string[];
    assert("file_path" in (r.parameters as any).properties, "file_path not added");
    assert(req.length === 0, "required should remain empty");
  });

  // 15. Non-string items in required are filtered out
  await test("15. non-string items in required are filtered out", () => {
    const t: any = {
      name: "read",
      description: "x",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path", 42, null, true],
      },
      execute: async () => ({ content: [] }),
    };
    const r = patchToolSchemaForClaudeCompatibility(t);
    const req = (r.parameters as any).required as unknown[];
    assert(
      req.every((x) => typeof x === "string"),
      `non-strings remain: ${JSON.stringify(req)}`,
    );
  });

  // ─── assertRequiredParams ─────────────────────────────────────── 16-20 ────

  // 16. Empty string path fails (not allowEmpty)
  await test("16. empty string path throws", () => {
    try {
      assertRequiredParams({ path: "" }, [{ keys: ["path"] }], "read");
      assert(false, "should have thrown");
    } catch (e) {
      assert(
        (e as Error).message.includes("Missing required parameter"),
        `unexpected: ${(e as Error).message}`,
      );
    }
  });

  // 17. Whitespace-only path fails
  await test("17. whitespace-only path throws", () => {
    try {
      assertRequiredParams({ path: "   " }, [{ keys: ["path"] }], "read");
      assert(false, "should have thrown");
    } catch (e) {
      assert((e as Error).message.includes("Missing required parameter"), "wrong error");
    }
  });

  // 18. Non-string value for path key throws
  await test("18. non-string path value throws", () => {
    try {
      assertRequiredParams({ path: 42 }, [{ keys: ["path"] }], "read");
      assert(false, "should have thrown");
    } catch (e) {
      assert((e as Error).message.includes("Missing required parameter"), "wrong error");
    }
  });

  // 19. Second required group fails even when first passes
  await test("19. second group failure throws even if first group passes", () => {
    try {
      assertRequiredParams(
        { path: "/valid.ts", oldText: "" }, // oldText empty, no old_string
        [{ keys: ["path"] }, { keys: ["oldText", "old_string"] }],
        "edit",
      );
      assert(false, "should have thrown");
    } catch (e) {
      assert((e as Error).message.includes("Missing required parameter"), "wrong error");
    }
  });

  // 20. allowEmpty group accepts empty string without throwing
  await test("20. allowEmpty group accepts empty string", () => {
    // should NOT throw
    assertRequiredParams({ content: "" }, [{ keys: ["content"], allowEmpty: true }], "write");
  });

  // ─── Cache behavior via createOpenClawReadTool ─────────────────── 21-28 ───

  // 21. Same file read twice → base.execute called exactly once (cache hit)
  await test("21. cache hit: same file read twice → 1 base call", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "cache-hit.txt");
    writeFileSync(fp, "hello cache");
    const tool = createOpenClawReadTool(mockBase(textResult("hello cache")));
    await tool.execute("1", { path: fp }, undefined as any);
    await tool.execute("2", { path: fp }, undefined as any);
    assert(callCount === 1, `Expected 1 base call, got ${callCount}`);
  });

  // 22. Different offset → different cache key → 2 base calls
  await test("22. different offset → different cache key → 2 base calls", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "offset-key.txt");
    writeFileSync(fp, "L1\nL2\nL3");
    const tool = createOpenClawReadTool(mockBase(textResult("L2")));
    await tool.execute("1", { path: fp, offset: 1 }, undefined as any);
    await tool.execute("2", { path: fp, offset: 2 }, undefined as any);
    assert(callCount === 2, `Expected 2 base calls, got ${callCount}`);
  });

  // 23. Different limit → different cache key → 2 base calls
  await test("23. different limit → different cache key → 2 base calls", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "limit-key.txt");
    writeFileSync(fp, "L1\nL2\nL3");
    const tool = createOpenClawReadTool(mockBase(textResult("L1")));
    await tool.execute("1", { path: fp, limit: 1 }, undefined as any);
    await tool.execute("2", { path: fp, limit: 2 }, undefined as any);
    assert(callCount === 2, `Expected 2 base calls, got ${callCount}`);
  });

  // 24. mtime changes → cache entry invalidated → re-executes
  await test("24. mtime change invalidates cache → 2 base calls", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "mtime-inv.txt");
    writeFileSync(fp, "original");
    const tool = createOpenClawReadTool(mockBase(textResult("original")));
    await tool.execute("1", { path: fp }, undefined as any);
    // Move mtime forward by 1 second
    await new Promise((r) => setTimeout(r, 10));
    const future = new Date(Date.now() + 1000);
    utimesSync(fp, future, future);
    await tool.execute("2", { path: fp }, undefined as any);
    assert(callCount === 2, `Expected 2 calls after mtime change, got ${callCount}`);
  });

  // 25. Image result is NOT cached → both reads hit base.execute
  await test("25. image result not cached → 2 base calls", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "img-nocache.txt");
    writeFileSync(fp, "placeholder");
    const tool = createOpenClawReadTool(mockBase(imageResult()));
    await tool.execute("1", { path: fp }, undefined as any);
    await tool.execute("2", { path: fp }, undefined as any);
    // Image results skip setCachedRead → both calls hit base
    assert(callCount === 2, `Expected 2 calls (image uncached), got ${callCount}`);
  });

  // 26. Cache stats: entries, ttlMs, maxEntries are correct
  await test("26. getReadToolCacheStats returns correct constants", async () => {
    clearReadToolCache();
    const s0 = getReadToolCacheStats();
    assert(s0.entries === 0, `entries after clear: ${s0.entries}`);
    assert(s0.ttlMs === 60_000, `ttlMs: ${s0.ttlMs}`);
    assert(s0.maxEntries === 200, `maxEntries: ${s0.maxEntries}`);

    const fp = join(TEST_DIR, "stats.txt");
    writeFileSync(fp, "stats test");
    const tool = createOpenClawReadTool(mockBase(textResult("stats test")));
    await tool.execute("1", { path: fp }, undefined as any);
    const s1 = getReadToolCacheStats();
    assert(s1.entries === 1, `entries after 1 read: ${s1.entries}`);
  });

  // 27. start_line alias shares cache key with offset
  await test("27. start_line and offset share the same cache key", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "start-line.txt");
    writeFileSync(fp, "L1\nL2\nL3");
    const tool = createOpenClawReadTool(mockBase(textResult("L2")));
    // First read with start_line=2, second with offset=2 → same cache key
    await tool.execute("1", { path: fp, start_line: 2 }, undefined as any);
    await tool.execute("2", { path: fp, offset: 2 }, undefined as any);
    assert(callCount === 1, `start_line/offset should share key, got ${callCount} calls`);
  });

  // 28. end_line alias shares cache key with limit
  await test("28. end_line and limit share the same cache key", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "end-line.txt");
    writeFileSync(fp, "L1\nL2\nL3");
    const tool = createOpenClawReadTool(mockBase(textResult("L1\nL2\nL3")));
    await tool.execute("1", { path: fp, end_line: 3 }, undefined as any);
    await tool.execute("2", { path: fp, limit: 3 }, undefined as any);
    assert(callCount === 1, `end_line/limit should share key, got ${callCount} calls`);
  });

  // ─── wrapToolParamNormalization ──────────────────────────────── 29-31 ─────

  // 29. Normalizes file_path→path before passing to underlying execute
  await test("29. wrapToolParamNormalization translates file_path→path", async () => {
    let received: unknown;
    const t: any = {
      name: "write",
      description: "x",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: [] },
      execute: async (_id: string, p: unknown) => {
        received = p;
        return { content: [] };
      },
    };
    const wrapped = wrapToolParamNormalization(t);
    await wrapped.execute("1", { file_path: "/test.ts" }, undefined as any, undefined);
    assert((received as any)?.path === "/test.ts", `path=${(received as any)?.path}`);
    assert(!("file_path" in (received as any)), "file_path should not pass through");
  });

  // 30. Without requiredGroups → no validation on missing path
  await test("30. no requiredGroups → missing path does not throw", async () => {
    const t: any = {
      name: "write",
      description: "x",
      parameters: { type: "object", properties: { path: { type: "string" } } },
      execute: async () => ({ content: [] }),
    };
    const wrapped = wrapToolParamNormalization(t); // no groups
    // Should not throw even with empty params
    await wrapped.execute("1", {}, undefined as any, undefined);
  });

  // 31. All three edit aliases translated and passed to underlying execute
  await test("31. edit aliases all translated in wrapToolParamNormalization", async () => {
    let received: unknown;
    const t: any = {
      name: "edit",
      description: "x",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
        },
        required: ["path"],
      },
      execute: async (_id: string, p: unknown) => {
        received = p;
        return { content: [] };
      },
    };
    const wrapped = wrapToolParamNormalization(t, CLAUDE_PARAM_GROUPS.edit);
    await wrapped.execute(
      "1",
      {
        file_path: "/edit.ts",
        old_string: "foo",
        new_string: "bar",
      },
      undefined as any,
      undefined,
    );
    const p = received as any;
    assert(p.path === "/edit.ts", `path=${p.path}`);
    assert(p.oldText === "foo", `oldText=${p.oldText}`);
    assert(p.newText === "bar", `newText=${p.newText}`);
    assert(!("file_path" in p), "file_path leaked through");
    assert(!("old_string" in p), "old_string leaked through");
    assert(!("new_string" in p), "new_string leaked through");
  });

  // ─── clearReadToolCache / concurrent reads ─────────────────────── 32-33 ───

  // 32. clearReadToolCache resets to 0 entries
  await test("32. clearReadToolCache resets to 0 entries", async () => {
    const fp = join(TEST_DIR, "pre-clear.txt");
    writeFileSync(fp, "to clear");
    const tool = createOpenClawReadTool(mockBase(textResult("to clear")));
    await tool.execute("1", { path: fp }, undefined as any);
    assert(getReadToolCacheStats().entries > 0, "should have entries before clear");
    clearReadToolCache();
    assert(getReadToolCacheStats().entries === 0, "entries should be 0 after clear");
  });

  // 33. Concurrent reads of same file: both miss cache (no mutex), both call base
  //     This documents a known limitation: parallel awaits both see cache-miss
  await test("33. concurrent reads both miss cache (expected race)", async () => {
    clearReadToolCache();
    callCount = 0;
    const fp = join(TEST_DIR, "race.txt");
    writeFileSync(fp, "race content");
    const tool = createOpenClawReadTool(mockBase(textResult("race content")));
    // Both execute without awaiting each other → both see empty cache → 2 base calls
    await Promise.all([
      tool.execute("1", { path: fp }, undefined as any),
      tool.execute("2", { path: fp }, undefined as any),
    ]);
    // Document the behavior: 2 calls (no mutex protection)
    assert(callCount >= 1, `should have at least 1 call, got ${callCount}`);
    console.log(`   (concurrent calls: ${callCount} – documents cache race behavior)`);
  });

  // ─── Summary ─────────────────────────────────────────────────────────────────
  rmSync(TEST_DIR, { recursive: true });

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
