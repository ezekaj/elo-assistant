/**
 * Native Module Tools Tests
 *
 * Tests for the native module-based OpenClaw tools.
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createGrepTool,
  createRglobTool,
  createFileSearchTool,
  createFileIndexTool,
  createHighlightTool,
  createDiffHighlightTool,
} from "./tools/index.js";

describe("Native Module Tools", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = join(tmpdir(), `openclaw-tools-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files
    writeFileSync(join(testDir, "test1.txt"), "hello world\nfoo bar");
    writeFileSync(join(testDir, "test2.txt"), "hello again\nbaz qux");
    mkdirSync(join(testDir, "src"), { recursive: true });
    writeFileSync(join(testDir, "src", "index.ts"), "export const hello = 'world';");
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("grep tool", () => {
    it("should create tool with correct schema", () => {
      const tool = createGrepTool();
      expect(tool.name).toBe("grep");
      expect(tool.inputSchema).toHaveProperty("type", "object");
      expect(tool.inputSchema.properties).toHaveProperty("pattern");
      expect(tool.inputSchema.properties).toHaveProperty("path");
      expect(tool.inputSchema.required).toContain("pattern");
      expect(tool.inputSchema.required).toContain("path");
    });

    it("should search for pattern", async () => {
      const tool = createGrepTool();
      const result = await tool.execute({
        pattern: "hello",
        path: testDir,
      });

      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
    });

    it("should handle missing pattern", async () => {
      const tool = createGrepTool();
      const result = await tool.execute({
        pattern: "",
        path: testDir,
      });

      expect(result.content[0].text).toContain("Error");
    });
  });

  describe("rglob tool", () => {
    it("should create tool with correct schema", () => {
      const tool = createRglobTool();
      expect(tool.name).toBe("rglob");
      expect(tool.inputSchema.properties).toHaveProperty("pattern");
      expect(tool.inputSchema.required).toContain("pattern");
    });

    it("should find files by glob pattern", async () => {
      const tool = createRglobTool();
      const result = await tool.execute({
        pattern: "*.txt",
        path: testDir,
      });

      expect(result).toHaveProperty("content");
    });
  });

  describe("file_search tool", () => {
    it("should create tool with correct schema", () => {
      const tool = createFileSearchTool();
      expect(tool.name).toBe("file_search");
      expect(tool.inputSchema.properties).toHaveProperty("query");
      expect(tool.inputSchema.required).toContain("query");
    });

    it("should search for files", async () => {
      const tool = createFileSearchTool();
      const result = await tool.execute({
        query: "test",
        path: testDir,
      });

      expect(result).toHaveProperty("content");
    });
  });

  describe("file_index tool", () => {
    it("should create tool with correct schema", () => {
      const tool = createFileIndexTool();
      expect(tool.name).toBe("file_index");
    });

    it("should build index", async () => {
      const tool = createFileIndexTool();
      const result = await tool.execute({
        path: testDir,
      });

      expect(result).toHaveProperty("content");
    });
  });

  describe("highlight tool", () => {
    it("should create tool with correct schema", () => {
      const tool = createHighlightTool();
      expect(tool.name).toBe("highlight");
      expect(tool.inputSchema.properties).toHaveProperty("code");
      expect(tool.inputSchema.properties).toHaveProperty("language");
      expect(tool.inputSchema.required).toContain("code");
    });

    it("should highlight code", async () => {
      const tool = createHighlightTool();
      const result = await tool.execute({
        code: "const x = 1;",
        language: "javascript",
      });

      expect(result).toHaveProperty("content");
    });
  });

  describe("highlight_diff tool", () => {
    it("should create tool with correct schema", () => {
      const tool = createDiffHighlightTool();
      expect(tool.name).toBe("highlight_diff");
      expect(tool.inputSchema.properties).toHaveProperty("diff");
      expect(tool.inputSchema.required).toContain("diff");
    });

    it("should highlight diff", async () => {
      const tool = createDiffHighlightTool();
      const result = await tool.execute({
        diff: "+added\n-removed",
      });

      expect(result).toHaveProperty("content");
    });
  });
});
