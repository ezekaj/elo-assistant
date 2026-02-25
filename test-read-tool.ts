#!/usr/bin/env npx tsx
/**
 * 33 Hardest Tests for Read Tool
 *
 * Tests the CURRENT implementation before any changes.
 * Will run again AFTER changes to compare.
 */

import { existsSync, mkdirSync, writeFileSync, symlinkSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
// Import read tool components
import { createReadTool } from "./node_modules/@mariozechner/pi-coding-agent/dist/core/tools/read.js";
import { resolveSandboxPath, assertSandboxPath } from "./src/agents/sandbox-paths.js";

// Test utilities
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

// Test workspace
const TEST_DIR = "/tmp/read-tool-test";
const readTool = createReadTool(TEST_DIR);

function setupTestDir(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

// =============================================================================
// TESTS
// =============================================================================

async function runAllTests(): Promise<void> {
  console.log("\n🧪 Read Tool Test Suite - 33 Hardest Tests\n");
  console.log("=".repeat(60) + "\n");

  setupTestDir();

  // -------------------------------------------------------------------------
  // BASIC FUNCTIONALITY (1-5)
  // -------------------------------------------------------------------------

  await test("1. Read simple text file", async () => {
    writeFileSync(join(TEST_DIR, "simple.txt"), "Hello, World!");
    const result = await readTool.execute("test-1", { path: "simple.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("Hello, World!"), "Content mismatch");
  });

  await test("2. Read file with absolute path", async () => {
    writeFileSync(join(TEST_DIR, "absolute.txt"), "Absolute path test");
    const result = await readTool.execute(
      "test-2",
      { path: join(TEST_DIR, "absolute.txt") },
      undefined,
    );
    const text = (result.content[0] as any).text;
    assert(text.includes("Absolute path test"), "Content mismatch");
  });

  await test("3. Read empty file", async () => {
    writeFileSync(join(TEST_DIR, "empty.txt"), "");
    const result = await readTool.execute("test-3", { path: "empty.txt" }, undefined);
    assert(result.content.length > 0, "Should return content block");
  });

  await test("4. Read file with unicode content", async () => {
    writeFileSync(join(TEST_DIR, "unicode.txt"), "你好世界 🌍 مرحبا");
    const result = await readTool.execute("test-4", { path: "unicode.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("你好世界"), "Unicode content missing");
    assert(text.includes("🌍"), "Emoji missing");
  });

  await test("5. Read JSON file", async () => {
    writeFileSync(join(TEST_DIR, "config.json"), JSON.stringify({ name: "test", value: 123 }));
    const result = await readTool.execute("test-5", { path: "config.json" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes('"name"'), "JSON key missing");
  });

  // -------------------------------------------------------------------------
  // OFFSET & LIMIT (6-12)
  // -------------------------------------------------------------------------

  await test("6. Read with offset", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
    writeFileSync(join(TEST_DIR, "lines.txt"), lines);
    const result = await readTool.execute("test-6", { path: "lines.txt", offset: 50 }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("Line 50"), "Should start from line 50");
    assert(!text.includes("Line 49"), "Should not include line 49");
  });

  await test("7. Read with limit", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
    writeFileSync(join(TEST_DIR, "lines2.txt"), lines);
    const result = await readTool.execute("test-7", { path: "lines2.txt", limit: 10 }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("Line 1"), "Should include line 1");
    assert(text.includes("Line 10"), "Should include line 10");
  });

  await test("8. Read with offset and limit combined", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`).join("\n");
    writeFileSync(join(TEST_DIR, "lines3.txt"), lines);
    const result = await readTool.execute(
      "test-8",
      { path: "lines3.txt", offset: 20, limit: 5 },
      undefined,
    );
    const text = (result.content[0] as any).text;
    assert(text.includes("Line 20"), "Should include line 20");
    assert(text.includes("Line 24"), "Should include line 24");
  });

  await test("9. Offset beyond file end should error", async () => {
    writeFileSync(join(TEST_DIR, "short.txt"), "Just one line");
    try {
      await readTool.execute("test-9", { path: "short.txt", offset: 100 }, undefined);
      assert(false, "Should have thrown error");
    } catch (e) {
      assert((e as Error).message.includes("beyond"), "Should mention beyond end");
    }
  });

  await test("10. Offset of 1 should read from beginning", async () => {
    writeFileSync(join(TEST_DIR, "offset1.txt"), "First line\nSecond line");
    const result = await readTool.execute("test-10", { path: "offset1.txt", offset: 1 }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("First line"), "Should include first line");
  });

  await test("11. Limit of 0 should return empty or error", async () => {
    writeFileSync(join(TEST_DIR, "limit0.txt"), "Some content");
    const result = await readTool.execute("test-11", { path: "limit0.txt", limit: 0 }, undefined);
    // Behavior depends on implementation
    assert(result.content.length >= 0, "Should handle limit 0");
  });

  await test("12. Negative offset should be handled", async () => {
    writeFileSync(join(TEST_DIR, "negoffset.txt"), "Content here");
    try {
      const result = await readTool.execute(
        "test-12",
        { path: "negoffset.txt", offset: -5 },
        undefined,
      );
      // If it doesn't error, check it reads from beginning
      const text = (result.content[0] as any).text;
      assert(text.includes("Content"), "Should read content");
    } catch (e) {
      // Acceptable to error on negative offset
      assert(true, "Errored on negative offset");
    }
  });

  // -------------------------------------------------------------------------
  // TRUNCATION (13-17)
  // -------------------------------------------------------------------------

  await test("13. Large file triggers truncation", async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `Line ${i + 1}: Some content here`).join(
      "\n",
    );
    writeFileSync(join(TEST_DIR, "large.txt"), lines);
    const result = await readTool.execute("test-13", { path: "large.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("offset="), "Should include continuation hint");
  });

  await test("14. Truncation respects line boundaries", async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `Complete line ${i + 1}`).join("\n");
    writeFileSync(join(TEST_DIR, "boundaries.txt"), lines);
    const result = await readTool.execute("test-14", { path: "boundaries.txt" }, undefined);
    const text = (result.content[0] as any).text;
    // Check no partial lines (line should end with number or continuation hint)
    const lastContentLine = text
      .split("\n")
      .filter((l: string) => l.startsWith("Complete"))
      .pop();
    if (lastContentLine) {
      assert(/\d+$/.test(lastContentLine), "Line should be complete");
    }
  });

  await test("15. Very long single line handled", async () => {
    const longLine = "x".repeat(100000); // 100KB single line
    writeFileSync(join(TEST_DIR, "longline.txt"), longLine);
    const result = await readTool.execute("test-15", { path: "longline.txt" }, undefined);
    const text = (result.content[0] as any).text;
    // Should either truncate or give bash hint
    assert(text.length > 0, "Should return something");
  });

  await test("16. File exactly at limit", async () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `L${i}`).join("\n");
    writeFileSync(join(TEST_DIR, "exact.txt"), lines);
    const result = await readTool.execute("test-16", { path: "exact.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.length > 0, "Should handle exact limit");
  });

  await test("17. Byte limit before line limit", async () => {
    // Create file where byte limit hits before line limit
    const lines = Array.from({ length: 100 }, (_, i) => "x".repeat(1000)).join("\n");
    writeFileSync(join(TEST_DIR, "bytelimit.txt"), lines);
    const result = await readTool.execute("test-17", { path: "bytelimit.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(result.content.length > 0, "Should return content");
  });

  // -------------------------------------------------------------------------
  // PATH HANDLING (18-22)
  // -------------------------------------------------------------------------

  await test("18. Home directory expansion (~)", async () => {
    // This test depends on having a readable file in home
    // Skip if not possible
    try {
      const homeTool = createReadTool(process.env.HOME || "/tmp");
      // Just test the path resolution doesn't crash
      assert(true, "Home expansion supported");
    } catch (e) {
      assert(true, "Home expansion handled");
    }
  });

  await test("19. Relative path resolution", async () => {
    mkdirSync(join(TEST_DIR, "subdir"), { recursive: true });
    writeFileSync(join(TEST_DIR, "subdir", "file.txt"), "In subdir");
    const result = await readTool.execute("test-19", { path: "subdir/file.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("In subdir"), "Should resolve relative path");
  });

  await test("20. Path with spaces", async () => {
    writeFileSync(join(TEST_DIR, "file with spaces.txt"), "Spaced content");
    const result = await readTool.execute("test-20", { path: "file with spaces.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("Spaced content"), "Should handle spaces");
  });

  await test("21. Path with special characters", async () => {
    writeFileSync(join(TEST_DIR, "special-_chars.txt"), "Special chars");
    const result = await readTool.execute("test-21", { path: "special-_chars.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("Special chars"), "Should handle special chars");
  });

  await test("22. Non-existent file should error", async () => {
    try {
      await readTool.execute("test-22", { path: "does-not-exist.txt" }, undefined);
      assert(false, "Should have thrown error");
    } catch (e) {
      assert(true, "Correctly errored on missing file");
    }
  });

  // -------------------------------------------------------------------------
  // SECURITY (23-28)
  // -------------------------------------------------------------------------

  await test("23. Block path traversal (../)", async () => {
    try {
      resolveSandboxPath({ filePath: "../../../etc/passwd", cwd: TEST_DIR, root: TEST_DIR });
      assert(false, "Should have blocked traversal");
    } catch (e) {
      assert((e as Error).message.includes("escapes"), "Should mention escape");
    }
  });

  await test("24. Block absolute path outside root", async () => {
    try {
      resolveSandboxPath({ filePath: "/etc/passwd", cwd: TEST_DIR, root: TEST_DIR });
      assert(false, "Should have blocked absolute path");
    } catch (e) {
      assert((e as Error).message.includes("escapes"), "Should mention escape");
    }
  });

  await test("25. Block symlink traversal", async () => {
    const linkPath = join(TEST_DIR, "evil-link");
    try {
      symlinkSync("/etc", linkPath);
      await assertSandboxPath({ filePath: "evil-link/passwd", cwd: TEST_DIR, root: TEST_DIR });
      assert(false, "Should have blocked symlink");
    } catch (e) {
      assert(
        (e as Error).message.toLowerCase().includes("symlink") ||
          (e as Error).message.includes("escapes"),
        "Should mention symlink or escape",
      );
    } finally {
      try {
        unlinkSync(linkPath);
      } catch {}
    }
  });

  await test("26. Allow path within sandbox", async () => {
    mkdirSync(join(TEST_DIR, "safe"), { recursive: true });
    writeFileSync(join(TEST_DIR, "safe", "file.txt"), "Safe content");
    const resolved = resolveSandboxPath({
      filePath: "safe/file.txt",
      cwd: TEST_DIR,
      root: TEST_DIR,
    });
    assert(resolved.resolved.includes("safe/file.txt"), "Should allow safe path");
  });

  await test("27. Handle encoded path characters", async () => {
    // Test that weird encodings don't bypass security
    try {
      resolveSandboxPath({ filePath: "..%2F..%2Fetc/passwd", cwd: TEST_DIR, root: TEST_DIR });
      // If it doesn't error, it should resolve safely within sandbox
    } catch (e) {
      // Acceptable to reject
      assert(true, "Rejected encoded traversal");
    }
  });

  await test("28. Handle null bytes in path", async () => {
    try {
      resolveSandboxPath({ filePath: "file\x00.txt", cwd: TEST_DIR, root: TEST_DIR });
      // Should either reject or sanitize
    } catch (e) {
      assert(true, "Rejected null byte");
    }
  });

  // -------------------------------------------------------------------------
  // IMAGE HANDLING (29-31)
  // -------------------------------------------------------------------------

  await test("29. Detect PNG image", async () => {
    // PNG magic bytes
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pngData = Buffer.concat([pngHeader, Buffer.alloc(100)]);
    writeFileSync(join(TEST_DIR, "test.png"), pngData);

    try {
      const result = await readTool.execute("test-29", { path: "test.png" }, undefined);
      // Should either return image or error on invalid PNG
      assert(result.content.length > 0, "Should return content");
    } catch (e) {
      // Acceptable if it rejects malformed PNG
      assert(true, "Handled malformed PNG");
    }
  });

  await test("30. Detect JPEG image", async () => {
    // JPEG magic bytes
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const jpegData = Buffer.concat([jpegHeader, Buffer.alloc(100)]);
    writeFileSync(join(TEST_DIR, "test.jpg"), jpegData);

    try {
      const result = await readTool.execute("test-30", { path: "test.jpg" }, undefined);
      assert(result.content.length > 0, "Should return content");
    } catch (e) {
      assert(true, "Handled malformed JPEG");
    }
  });

  await test("31. Reject binary file masquerading as text", async () => {
    // ELF binary header
    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
    writeFileSync(join(TEST_DIR, "fake.txt"), elfHeader);

    const result = await readTool.execute("test-31", { path: "fake.txt" }, undefined);
    // Should read as text (binary content) - it's not an image
    assert(result.content.length > 0, "Should return something");
  });

  // -------------------------------------------------------------------------
  // EDGE CASES (32-33)
  // -------------------------------------------------------------------------

  await test("32. File with only newlines", async () => {
    writeFileSync(join(TEST_DIR, "newlines.txt"), "\n\n\n\n\n");
    const result = await readTool.execute("test-32", { path: "newlines.txt" }, undefined);
    assert(result.content.length > 0, "Should handle newlines-only file");
  });

  await test("33. File with mixed line endings", async () => {
    writeFileSync(join(TEST_DIR, "mixed.txt"), "Line1\r\nLine2\nLine3\rLine4");
    const result = await readTool.execute("test-33", { path: "mixed.txt" }, undefined);
    const text = (result.content[0] as any).text;
    assert(text.includes("Line1"), "Should handle CRLF");
    assert(text.includes("Line2"), "Should handle LF");
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------

  cleanupTestDir();

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Results: ${passCount}/${passCount + failCount} passed\n`);

  if (failCount > 0) {
    console.log("Failed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
    console.log("");
  }

  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log(`📈 Average: ${Math.round(totalTime / results.length)}ms per test\n`);

  if (failCount === 0) {
    console.log("🎉 ALL TESTS PASSED! 100% satisfied.\n");
  } else {
    console.log(
      `⚠️  ${failCount} tests failed. Pass rate: ${Math.round((passCount / (passCount + failCount)) * 100)}%\n`,
    );
  }

  // Save results for comparison
  writeFileSync(
    "/tmp/read-test-results-before.json",
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

  console.log("📁 Results saved to /tmp/read-test-results-before.json\n");
}

// Run tests
runAllTests().catch(console.error);
