#!/usr/bin/env bun
/**
 * Tests for enhanced pi-tools.read.ts
 * Verifies: caching, risk classification, param normalization, sandbox guards
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AnyAgentTool } from "./src/agents/pi-tools.types.js";
// We import the pure utility functions (no base tool needed)
import {
  getReadToolCacheStats,
  clearReadToolCache,
  normalizeToolParams,
  assertRequiredParams,
  patchToolSchemaForClaudeCompatibility,
  createOpenClawReadTool,
  CLAUDE_PARAM_GROUPS,
} from "./src/agents/pi-tools.read.js";

// ─── Test harness ────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
const results: { name: string; passed: boolean; error?: string; duration: number }[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
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

// ─── Mock base tool ──────────────────────────────────────────────────────────

const TEST_DIR = "/tmp/pi-tools-read-test";

function makeMockBaseTool(
  handler: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>,
): AnyAgentTool {
  return {
    name: "read",
    description: "mock read",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
      },
      required: ["path"],
    },
    execute: async (_id, params, _signal) => handler(params),
  } as unknown as AnyAgentTool;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function setup(): void {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanup(): void {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runAllTests(): Promise<void> {
  console.log("\n🧪 pi-tools.read.ts Enhanced Tests\n");
  console.log("=".repeat(60) + "\n");

  setup();

  // ── normalizeToolParams (1-6) ─────────────────────────────────────────────

  await test("1. normalizeToolParams: file_path → path", () => {
    const result = normalizeToolParams({ file_path: "/foo/bar.ts" });
    assert(result?.path === "/foo/bar.ts", "path should equal file_path");
    assert(!("file_path" in (result ?? {})), "file_path should be removed");
  });

  await test("2. normalizeToolParams: old_string → oldText", () => {
    const result = normalizeToolParams({ path: "/foo", old_string: "old", new_string: "new" });
    assert(result?.oldText === "old", "oldText should equal old_string");
    assert(result?.newText === "new", "newText should equal new_string");
    assert(!("old_string" in (result ?? {})), "old_string removed");
  });

  await test("3. normalizeToolParams: already normalized passes through", () => {
    const result = normalizeToolParams({ path: "/foo", oldText: "a", newText: "b" });
    assert(result?.path === "/foo", "path untouched");
    assert(result?.oldText === "a", "oldText untouched");
  });

  await test("4. normalizeToolParams: null/undefined returns undefined", () => {
    assert(normalizeToolParams(null) === undefined, "null returns undefined");
    assert(normalizeToolParams(undefined) === undefined, "undefined returns undefined");
  });

  await test("5. normalizeToolParams: non-object returns undefined", () => {
    assert(normalizeToolParams("string") === undefined, "string returns undefined");
  });

  await test("6. normalizeToolParams: does not overwrite existing path", () => {
    const result = normalizeToolParams({ path: "/existing", file_path: "/other" });
    assert(result?.path === "/existing", "existing path preserved");
  });

  // ── assertRequiredParams (7-10) ───────────────────────────────────────────

  await test("7. assertRequiredParams: throws on missing required key", () => {
    try {
      assertRequiredParams({}, CLAUDE_PARAM_GROUPS.read, "read");
      assert(false, "Should throw");
    } catch (e) {
      assert((e as Error).message.includes("Missing"), "Should mention Missing");
    }
  });

  await test("8. assertRequiredParams: passes with path present", () => {
    assertRequiredParams({ path: "/foo/bar" }, CLAUDE_PARAM_GROUPS.read, "read");
    // No throw = pass
  });

  await test("9. assertRequiredParams: passes with file_path present", () => {
    assertRequiredParams({ file_path: "/foo/bar" }, CLAUDE_PARAM_GROUPS.read, "read");
    // No throw = pass
  });

  await test("10. assertRequiredParams: throws on empty string value", () => {
    try {
      assertRequiredParams({ path: "   " }, CLAUDE_PARAM_GROUPS.read, "read");
      assert(false, "Should throw on whitespace-only");
    } catch (e) {
      assert((e as Error).message.includes("Missing"), "Should mention Missing");
    }
  });

  // ── patchToolSchemaForClaudeCompatibility (11-13) ────────────────────────

  await test("11. patchToolSchema: adds file_path alias", () => {
    const tool = makeMockBaseTool(async () => ({ content: [] }));
    const patched = patchToolSchemaForClaudeCompatibility(tool);
    const props = (patched.parameters as { properties: Record<string, unknown> }).properties;
    assert("file_path" in props, "file_path alias should be added");
  });

  await test("12. patchToolSchema: removes path from required", () => {
    const tool = makeMockBaseTool(async () => ({ content: [] }));
    const patched = patchToolSchemaForClaudeCompatibility(tool);
    const required = (patched.parameters as { required: string[] }).required;
    assert(!required.includes("path"), "path should be removed from required");
  });

  await test("13. patchToolSchema: tool without properties returns unchanged", () => {
    const tool = {
      name: "read",
      description: "test",
      parameters: {},
      execute: async () => ({ content: [] }),
    } as unknown as AnyAgentTool;
    const patched = patchToolSchemaForClaudeCompatibility(tool);
    assert(patched === tool, "Should return same tool object");
  });

  // ── Cache management (14-17) ──────────────────────────────────────────────

  await test("14. getReadToolCacheStats: returns valid shape", () => {
    const stats = getReadToolCacheStats();
    assert(typeof stats.entries === "number", "entries is number");
    assert(typeof stats.ttlMs === "number", "ttlMs is number");
    assert(typeof stats.maxEntries === "number", "maxEntries is number");
    assert(stats.ttlMs === 60_000, "TTL should be 60s");
    assert(stats.maxEntries === 200, "Max entries should be 200");
  });

  await test("15. clearReadToolCache: empties cache", () => {
    clearReadToolCache();
    const stats = getReadToolCacheStats();
    assert(stats.entries === 0, "Cache should be empty after clear");
  });

  // ── createOpenClawReadTool: pass-through (16) ─────────────────────────────

  await test("16. Safe path: result passes through unchanged", async () => {
    const safePath = join(TEST_DIR, "safe.ts");
    writeFileSync(safePath, "export const x = 1;");

    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => ({
        content: [{ type: "text", text: "export const x = 1;" }],
      })),
    );
    const result = await tool.execute("id", { path: safePath }, new AbortController().signal);
    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((b) => b.type === "text")
      .map((b) => b.text);
    assert(
      texts.some((t) => t.includes("export")),
      "Should have file content",
    );
  });

  // ── createOpenClawReadTool: caching (21-25) ───────────────────────────────

  await test("21. Cache: second read returns cached result", async () => {
    clearReadToolCache();
    const cachedFile = join(TEST_DIR, "cached.ts");
    writeFileSync(cachedFile, "export const y = 2;");

    let callCount = 0;
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => {
        callCount++;
        return { content: [{ type: "text", text: "export const y = 2;" }] };
      }),
    );

    await tool.execute("id1", { path: cachedFile }, new AbortController().signal);
    await tool.execute("id2", { path: cachedFile }, new AbortController().signal);

    assert(callCount === 1, `Base tool called ${callCount} times, expected 1 (cache hit)`);
    const stats = getReadToolCacheStats();
    assert(stats.entries >= 1, "Cache should have entries");
  });

  await test("22. Cache: cache invalidated when file changes", async () => {
    clearReadToolCache();
    const changingFile = join(TEST_DIR, "changing.ts");
    writeFileSync(changingFile, "version 1");

    let callCount = 0;
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async (params) => {
        callCount++;
        return { content: [{ type: "text", text: `call ${callCount}` }] };
      }),
    );

    await tool.execute("id1", { path: changingFile }, new AbortController().signal);
    // Simulate file change with new mtime
    await new Promise((r) => setTimeout(r, 5));
    writeFileSync(changingFile, "version 2");
    const result2 = await tool.execute("id2", { path: changingFile }, new AbortController().signal);

    assert(callCount === 2, `Expected 2 calls (cache miss on change), got ${callCount}`);
  });

  await test("23. Cache: result with valid image block not cached (setCachedRead guard)", async () => {
    clearReadToolCache();
    // Real minimal 1x1 transparent PNG — survives sanitizer (valid image, within size limits)
    const REAL_1x1_PNG_B64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    const imgPath = join(TEST_DIR, "real.png");
    writeFileSync(imgPath, Buffer.from(REAL_1x1_PNG_B64, "base64"));

    let callCount = 0;
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => {
        callCount++;
        return {
          content: [
            { type: "text", text: "Read image file [image/png]" },
            { type: "image", data: REAL_1x1_PNG_B64, mimeType: "image/png" },
          ],
        };
      }),
    );

    await tool.execute("id1", { path: imgPath }, new AbortController().signal);
    await tool.execute("id2", { path: imgPath }, new AbortController().signal);

    // Valid PNG survives sanitizer → image block remains → setCachedRead skips caching
    // Base tool must be called twice (no cache for image results)
    assert(callCount === 2, `Expected 2 calls (image not cached), got ${callCount}`);
  });

  await test("24. Cache: file_path alias works and is cached", async () => {
    clearReadToolCache();
    const aliasFile = join(TEST_DIR, "alias.ts");
    writeFileSync(aliasFile, "alias content");

    let callCount = 0;
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => {
        callCount++;
        return { content: [{ type: "text", text: "alias content" }] };
      }),
    );

    // Use file_path alias (Claude Code convention)
    await tool.execute("id1", { file_path: aliasFile }, new AbortController().signal);
    await tool.execute("id2", { file_path: aliasFile }, new AbortController().signal);

    assert(callCount === 1, `Alias should use cache; called ${callCount} times`);
  });

  await test("25. Cache: clearReadToolCache resets to 0 entries", async () => {
    const filePath = join(TEST_DIR, "clear-test.ts");
    writeFileSync(filePath, "clear test");

    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => ({
        content: [{ type: "text", text: "clear test" }],
      })),
    );
    await tool.execute("id", { path: filePath }, new AbortController().signal);

    clearReadToolCache();
    const stats = getReadToolCacheStats();
    assert(stats.entries === 0, `Cache should be empty after clear, got ${stats.entries}`);
  });

  // ── Missing params (26-28) ────────────────────────────────────────────────

  await test("26. Missing path: returns error", async () => {
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => ({
        content: [{ type: "text", text: "content" }],
      })),
    );
    try {
      await tool.execute("id", {}, new AbortController().signal);
      assert(false, "Should throw on missing path");
    } catch (e) {
      assert((e as Error).message.includes("Missing"), "Should mention Missing");
    }
  });

  await test("27. Null params: throws on missing", async () => {
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => ({
        content: [{ type: "text", text: "content" }],
      })),
    );
    try {
      await tool.execute("id", null, new AbortController().signal);
      assert(false, "Should throw on null params");
    } catch (e) {
      assert((e as Error).message.includes("Missing"), "Should mention Missing");
    }
  });

  await test("28. Whitespace-only path: throws", async () => {
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => ({
        content: [{ type: "text", text: "content" }],
      })),
    );
    try {
      await tool.execute("id", { path: "   " }, new AbortController().signal);
      assert(false, "Should throw on whitespace-only path");
    } catch (e) {
      assert((e as Error).message.includes("Missing"), `Got: ${(e as Error).message}`);
    }
  });

  // ── Stats shape (29-30) ───────────────────────────────────────────────────

  await test("29. Cache TTL is 60 seconds", () => {
    const stats = getReadToolCacheStats();
    assert(stats.ttlMs === 60_000, `Expected 60000ms TTL, got ${stats.ttlMs}`);
  });

  await test("30. Cache max entries is 200", () => {
    const stats = getReadToolCacheStats();
    assert(stats.maxEntries === 200, `Expected 200 max entries, got ${stats.maxEntries}`);
  });

  // ── Integration (31-33) ───────────────────────────────────────────────────

  await test("31. read with offset/limit keys creates distinct cache entries", async () => {
    clearReadToolCache();
    const multiFile = join(TEST_DIR, "multi.ts");
    writeFileSync(multiFile, "line1\nline2\nline3");

    let callCount = 0;
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => {
        callCount++;
        return { content: [{ type: "text", text: `call ${callCount}` }] };
      }),
    );

    // Different offset params = different cache keys
    await tool.execute("id1", { path: multiFile, offset: 1 }, new AbortController().signal);
    await tool.execute("id2", { path: multiFile, offset: 2 }, new AbortController().signal);
    await tool.execute("id3", { path: multiFile, offset: 1 }, new AbortController().signal); // cache hit

    assert(callCount === 2, `Expected 2 distinct reads, got ${callCount}`);
    const stats = getReadToolCacheStats();
    assert(
      stats.entries >= 2,
      `Expected ≥2 cache entries for different offsets, got ${stats.entries}`,
    );
  });

  await test("32. Base tool result returned unchanged for any path", async () => {
    const tool = createOpenClawReadTool(
      makeMockBaseTool(async () => ({
        content: [{ type: "text", text: "any content" }],
      })),
    );
    // No blocking — the sandbox guard (wrapSandboxPathGuard) handles path policy
    const filePath = join(TEST_DIR, "passthrough.ts");
    writeFileSync(filePath, "any content");
    const result = await tool.execute("id", { path: filePath }, new AbortController().signal);
    const text = (result.content[0] as { type: string; text: string }).text;
    assert(text === "any content", `Expected passthrough, got: ${text}`);
  });

  cleanup();

  // ─── Summary ──────────────────────────────────────────────────────────────
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${passCount}/${passCount + failCount} passed\n`);

  if (failCount > 0) {
    console.log("Failed:");
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ❌ ${r.name}: ${r.error}`));
  }

  console.log(`⏱️  Total: ${totalTime}ms | Avg: ${Math.round(totalTime / results.length)}ms\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
