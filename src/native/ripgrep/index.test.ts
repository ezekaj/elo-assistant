/**
 * Ripgrep Module Tests
 *
 * Tests for the ripgrep native module with fallback.
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { createRipgrepModule, search, searchFiles } from "./ripgrep/index.js";

describe("Ripgrep Module", () => {
  let testDir: string;

  beforeAll(() => {
    // Create test directory with sample files
    testDir = join(tmpdir(), `openclaw-ripgrep-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files
    writeFileSync(join(testDir, "test1.txt"), "hello world\nfoo bar\nhello again");
    writeFileSync(join(testDir, "test2.txt"), "foo baz\nhello test");
    writeFileSync(join(testDir, "test.js"), "const hello = 'world';\nconsole.log(hello);");
  });

  afterAll(() => {
    // Cleanup
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createRipgrepModule", () => {
    it("should create module instance", async () => {
      const module = await createRipgrepModule();
      expect(module).toHaveProperty("search");
      expect(module).toHaveProperty("searchFiles");
      expect(module).toHaveProperty("version");
      expect(module).toHaveProperty("isAvailable");
      expect(module).toHaveProperty("getBinaryPath");
    });

    it("should report availability status", async () => {
      const module = await createRipgrepModule();
      const available = await module.isAvailable();
      // Should be true if either native or binary is available
      expect(typeof available).toBe("boolean");
    });

    it("should return version string", async () => {
      const module = await createRipgrepModule();
      const version = module.version();
      expect(typeof version).toBe("string");
      expect(version.length).toBeGreaterThan(0);
    });
  });

  describe("search", () => {
    it("should find matches for pattern", async () => {
      const result = await search({
        pattern: "hello",
        path: testDir,
      });

      expect(result).toHaveProperty("matches");
      expect(result).toHaveProperty("filesSearched");
      expect(result).toHaveProperty("totalMatches");
      expect(result).toHaveProperty("elapsedMs");
      expect(result.matches.length).toBeGreaterThan(0);

      // All matches should contain "hello"
      for (const match of result.matches) {
        expect(match.text.toLowerCase()).toContain("hello");
      }
    });

    it("should respect caseInsensitive option", async () => {
      const result = await search({
        pattern: "HELLO",
        path: testDir,
        caseInsensitive: true,
      });

      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it("should respect maxResults option", async () => {
      const result = await search({
        pattern: "hello",
        path: testDir,
        maxResults: 2,
      });

      expect(result.matches.length).toBeLessThanOrEqual(2);
      expect(result.truncated).toBe(result.totalMatches > 2);
    });

    it("should respect glob pattern", async () => {
      const result = await search({
        pattern: "hello",
        path: testDir,
        glob: "*.txt",
      });

      // Should only find matches in .txt files
      for (const match of result.matches) {
        expect(match.path).toMatch(/\.txt$/);
      }
    });

    it("should return empty results for non-matching pattern", async () => {
      const result = await search({
        pattern: "xyznonexistent123",
        path: testDir,
      });

      expect(result.matches.length).toBe(0);
      expect(result.totalMatches).toBe(0);
    });

    it("should handle invalid path gracefully", async () => {
      const result = await search({
        pattern: "test",
        path: "/nonexistent/path/12345",
      });

      expect(result.matches.length).toBe(0);
    });
  });

  describe("searchFiles", () => {
    it("should return files with matches", async () => {
      const files = await searchFiles({
        pattern: "hello",
        path: testDir,
      });

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);

      // All should be .txt or .js files
      for (const file of files) {
        expect(file).toMatch(/\.(txt|js)$/);
      }
    });

    it("should respect glob pattern", async () => {
      const files = await searchFiles({
        pattern: "foo",
        path: testDir,
        glob: "*.txt",
      });

      for (const file of files) {
        expect(file).toMatch(/\.txt$/);
      }
    });
  });
});
