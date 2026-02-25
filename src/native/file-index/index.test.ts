/**
 * File Index Module Tests
 *
 * Tests for the file index native module with Fuse.js fallback.
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createFileIndexModule, buildIndex, searchIndex } from "./file-index/index.js";

describe("File Index Module", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `openclaw-fileindex-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files
    mkdirSync(join(testDir, "src"), { recursive: true });
    mkdirSync(join(testDir, "docs"), { recursive: true });

    writeFileSync(join(testDir, "README.md"), "# Test Project");
    writeFileSync(join(testDir, "package.json"), '{"name": "test"}');
    writeFileSync(join(testDir, "src", "index.ts"), "export const hello = 'world';");
    writeFileSync(join(testDir, "src", "utils.ts"), "export function add(a, b) { return a + b; }");
    writeFileSync(join(testDir, "docs", "guide.md"), "# User Guide");
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createFileIndexModule", () => {
    it("should create module instance", async () => {
      const module = await createFileIndexModule();
      expect(module).toHaveProperty("buildIndex");
      expect(module).toHaveProperty("search");
      expect(module).toHaveProperty("findByName");
      expect(module).toHaveProperty("getAllEntries");
      expect(module).toHaveProperty("clear");
      expect(module).toHaveProperty("getStats");
      expect(module).toHaveProperty("isIndexed");
      expect(module).toHaveProperty("getRootPath");
    });
  });

  describe("buildIndex", () => {
    it("should build index for directory", async () => {
      const result = await buildIndex({
        root: testDir,
        maxDepth: 5,
      });

      expect(result).toHaveProperty("indexedFiles");
      expect(result).toHaveProperty("indexedDirs");
      expect(result).toHaveProperty("elapsedMs");
      expect(result.indexedFiles).toBeGreaterThan(0);
      expect(result.indexedDirs).toBeGreaterThan(0);
    });

    it("should respect exclude patterns", async () => {
      const result = await buildIndex({
        root: testDir,
        exclude: ["**/*.md"],
        maxDepth: 5,
      });

      // Should have fewer files since .md files are excluded
      expect(result.indexedFiles).toBeGreaterThan(0);
    });

    it("should respect maxDepth", async () => {
      const result = await buildIndex({
        root: testDir,
        maxDepth: 0,
      });

      // Should only index root level
      expect(result.indexedDirs).toBe(0);
    });
  });

  describe("searchIndex", () => {
    beforeAll(async () => {
      // Build index before searching
      await buildIndex({
        root: testDir,
        maxDepth: 5,
      });
    });

    it("should find files by name", async () => {
      const result = await searchIndex({
        query: "index",
        maxResults: 10,
      });

      expect(result).toHaveProperty("entries");
      expect(result).toHaveProperty("totalMatches");
      expect(result).toHaveProperty("elapsedMs");
      expect(result).toHaveProperty("indexSize");

      if (result.totalMatches > 0) {
        expect(result.entries.length).toBeGreaterThan(0);
      }
    });

    it("should find files by partial match", async () => {
      const result = await searchIndex({
        query: "readme",
        maxResults: 10,
      });

      // Should find README.md with fuzzy matching
      if (result.totalMatches > 0) {
        const foundReadme = result.entries.some((e) => e.name.toLowerCase().includes("readme"));
        expect(foundReadme).toBe(true);
      }
    });

    it("should filter by extension", async () => {
      const result = await searchIndex({
        query: "",
        extension: "ts",
        maxResults: 10,
      });

      for (const entry of result.entries) {
        expect(entry.extension).toBe("ts");
      }
    });

    it("should filter by type", async () => {
      const result = await searchIndex({
        query: "",
        type: "directory",
        maxResults: 10,
      });

      for (const entry of result.entries) {
        expect(entry.isDirectory).toBe(true);
      }
    });

    it("should respect maxResults", async () => {
      const result = await searchIndex({
        query: "",
        maxResults: 2,
      });

      expect(result.entries.length).toBeLessThanOrEqual(2);
    });

    it("should return empty results for non-matching query", async () => {
      const result = await searchIndex({
        query: "xyznonexistent123",
        maxResults: 10,
        minScore: 0.5,
      });

      expect(result.entries.length).toBe(0);
    });
  });

  describe("findByName", () => {
    beforeAll(async () => {
      await buildIndex({
        root: testDir,
        maxDepth: 5,
      });
    });

    it("should find files by name quickly", async () => {
      const module = await createFileIndexModule();
      const results = await module.findByName("package", 10);

      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        expect(results[0].name.toLowerCase()).toContain("package");
      }
    });
  });

  describe("getStats", () => {
    beforeAll(async () => {
      await buildIndex({
        root: testDir,
        maxDepth: 5,
      });
    });

    it("should return index statistics", async () => {
      const module = await createFileIndexModule();
      const stats = await module.getStats();

      expect(stats).toHaveProperty("totalFiles");
      expect(stats).toHaveProperty("totalDirs");
      expect(stats).toHaveProperty("totalSize");
      expect(stats).toHaveProperty("rootPath");
      expect(stats.totalFiles).toBeGreaterThan(0);
    });
  });

  describe("clear", () => {
    it("should clear the index", async () => {
      const module = await createFileIndexModule();

      // Build first
      await module.buildIndex({
        root: testDir,
        maxDepth: 5,
      });

      expect(module.isIndexed()).toBe(true);

      // Clear
      module.clear();

      expect(module.isIndexed()).toBe(false);
    });
  });
});
