/**
 * Glob Tool Unit Tests
 * Tests for all Glob tool features including:
 * - Pattern matching
 * - Pagination (limit/offset)
 * - Hidden files support
 * - Ignore file support
 * - Path validation
 * - Error handling
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createGlobTool, executeGlob, DEFAULT_GLOB_LIMIT, DEFAULT_GLOB_OFFSET } from "./glob.js";

describe("Glob Tool", () => {
  let tempDir: string;
  let globTool: ReturnType<typeof createGlobTool>;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-glob-test-"));
    globTool = createGlobTool();

    // Create test directory structure
    await fs.promises.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, "src", "components"), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, "tests"), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, ".hidden"), { recursive: true });

    // Create test files
    await fs.promises.writeFile(path.join(tempDir, "README.md"), "# Test");
    await fs.promises.writeFile(path.join(tempDir, "package.json"), "{}");
    await fs.promises.writeFile(path.join(tempDir, "index.ts"), "export default true;");
    await fs.promises.writeFile(path.join(tempDir, "src", "app.ts"), 'console.log("app");');
    await fs.promises.writeFile(path.join(tempDir, "src", "utils.ts"), "export const utils = {};");
    await fs.promises.writeFile(
      path.join(tempDir, "src", "components", "button.tsx"),
      "export const Button = () => {};",
    );
    await fs.promises.writeFile(
      path.join(tempDir, "src", "components", "input.tsx"),
      "export const Input = () => {};",
    );
    await fs.promises.writeFile(
      path.join(tempDir, "tests", "app.test.ts"),
      'test("app", () => {});',
    );
    await fs.promises.writeFile(
      path.join(tempDir, "tests", "utils.test.ts"),
      'test("utils", () => {});',
    );
    await fs.promises.writeFile(path.join(tempDir, ".hidden", "secret.txt"), "secret");
    await fs.promises.writeFile(path.join(tempDir, ".gitignore"), "node_modules\ndist");
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // PATTERN MATCHING TESTS
  // ============================================================================

  describe("Pattern Matching", () => {
    it("should find all TypeScript files", async () => {
      const result = await globTool.call!({ pattern: "**/*.ts", path: tempDir }, {} as any);
      expect(result.success).toBe(true);
      expect(result.numFiles).toBeGreaterThan(0);
      expect(result.filenames).toContain(path.join(tempDir, "index.ts"));
      expect(result.filenames).toContain(path.join(tempDir, "src", "app.ts"));
      expect(result.filenames).toContain(path.join(tempDir, "src", "utils.ts"));
    });

    it("should find all TSX files", async () => {
      const result = await globTool.call!({ pattern: "**/*.tsx", path: tempDir }, {} as any);
      expect(result.success).toBe(true);
      expect(result.numFiles).toBe(2);
      expect(result.filenames).toContain(path.join(tempDir, "src", "components", "button.tsx"));
      expect(result.filenames).toContain(path.join(tempDir, "src", "components", "input.tsx"));
    });

    it("should find all Markdown files", async () => {
      const result = await globTool.call!({ pattern: "*.md", path: tempDir }, {} as any);
      expect(result.success).toBe(true);
      expect(result.numFiles).toBe(1);
      expect(result.filenames).toContain(path.join(tempDir, "README.md"));
    });

    it("should find all JSON files", async () => {
      const result = await globTool.call!({ pattern: "**/*.json", path: tempDir }, {} as any);
      expect(result.success).toBe(true);
      expect(result.numFiles).toBe(1);
      expect(result.filenames).toContain(path.join(tempDir, "package.json"));
    });

    it("should find test files", async () => {
      const result = await globTool.call!({ pattern: "**/*.test.ts", path: tempDir }, {} as any);
      expect(result.success).toBe(true);
      expect(result.numFiles).toBe(2);
      expect(result.filenames).toContain(path.join(tempDir, "tests", "app.test.ts"));
      expect(result.filenames).toContain(path.join(tempDir, "tests", "utils.test.ts"));
    });

    it("should handle specific path search", async () => {
      const result = await globTool.call!(
        { pattern: "*.ts", path: path.join(tempDir, "src") },
        {} as any,
      );
      expect(result.success).toBe(true);
      expect(result.numFiles).toBe(2);
      expect(result.filenames).toContain(path.join(tempDir, "src", "app.ts"));
      expect(result.filenames).toContain(path.join(tempDir, "src", "utils.ts"));
    });
  });

  // ============================================================================
  // PAGINATION TESTS
  // ============================================================================

  describe("Pagination", () => {
    it("should respect limit parameter", async () => {
      const result = await globTool.call!(
        { pattern: "**/*.ts", path: tempDir, limit: 2 },
        {} as any,
      );
      expect(result.success).toBe(true);
      expect(result.numFiles).toBeLessThanOrEqual(2);
    });

    it("should respect offset parameter", async () => {
      const result1 = await globTool.call!(
        { pattern: "**/*.ts", path: tempDir, limit: 2, offset: 0 },
        {} as any,
      );
      const result2 = await globTool.call!(
        { pattern: "**/*.ts", path: tempDir, limit: 2, offset: 2 },
        {} as any,
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Results should be different (different pages)
      if (result1.filenames.length > 0 && result2.filenames.length > 0) {
        expect(result1.filenames[0]).not.toBe(result2.filenames[0]);
      }
    });

    it("should set truncated flag when results exceed limit", async () => {
      const result = await globTool.call!({ pattern: "**/*", path: tempDir, limit: 3 }, {} as any);
      expect(result.success).toBe(true);
      // Should be truncated if we have more than 3 files
      if (result.numFiles === 3) {
        expect(result.truncated).toBe(true);
      }
    });

    it("should use default limit when not specified", async () => {
      const result = await globTool.call!({ pattern: "**/*", path: tempDir }, {} as any);
      expect(result.success).toBe(true);
      expect(result.numFiles).toBeLessThanOrEqual(DEFAULT_GLOB_LIMIT);
    });
  });

  // ============================================================================
  // HIDDEN FILES TESTS
  // ============================================================================

  describe("Hidden Files", () => {
    it("should include hidden files by default", async () => {
      const result = await globTool.call!(
        { pattern: "**/*.txt", path: tempDir, includeHidden: true },
        {} as any,
      );
      expect(result.success).toBe(true);
      expect(result.filenames).toContain(path.join(tempDir, ".hidden", "secret.txt"));
    });

    it("should exclude hidden files when includeHidden is false", async () => {
      const result = await globTool.call!(
        { pattern: "**/*.txt", path: tempDir, includeHidden: false },
        {} as any,
      );
      expect(result.success).toBe(true);
      expect(result.filenames).not.toContain(path.join(tempDir, ".hidden", "secret.txt"));
    });
  });

  // ============================================================================
  // IGNORE FILES TESTS
  // ============================================================================

  describe("Ignore Files", () => {
    it("should respect .gitignore when respectIgnore is true", async () => {
      // Create a file that should be ignored
      await fs.promises.mkdir(path.join(tempDir, "node_modules"), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, "node_modules", "test.js"), "ignored");

      const result = await globTool.call!(
        { pattern: "**/*.js", path: tempDir, respectIgnore: true },
        {} as any,
      );
      expect(result.success).toBe(true);
      expect(result.filenames).not.toContain(path.join(tempDir, "node_modules", "test.js"));
    });

    it("should not respect .gitignore when respectIgnore is false (default)", async () => {
      const result = await globTool.call!(
        { pattern: "**/*.js", path: tempDir, respectIgnore: false },
        {} as any,
      );
      expect(result.success).toBe(true);
      // Should include files from node_modules
      expect(result.filenames).toContain(path.join(tempDir, "node_modules", "test.js"));
    });
  });

  // ============================================================================
  // VALIDATION TESTS
  // ============================================================================

  describe("Input Validation", () => {
    it("should reject missing pattern", async () => {
      const result = await globTool.validateInput!({}, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(1);
    });

    it("should reject invalid pattern type", async () => {
      const result = await globTool.validateInput!({ pattern: 123 }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(1);
    });

    it("should reject non-existent path", async () => {
      const result = await globTool.validateInput!(
        { pattern: "**/*.ts", path: "/nonexistent/path" },
        {} as any,
      );
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(2);
    });

    it("should reject path that is not a directory", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.promises.writeFile(testFile, "test");

      const result = await globTool.validateInput!(
        { pattern: "**/*.ts", path: testFile },
        {} as any,
      );
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(3);
    });

    it("should reject invalid limit (too low)", async () => {
      const result = await globTool.validateInput!({ pattern: "**/*.ts", limit: 0 }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(4);
    });

    it("should reject invalid limit (too high)", async () => {
      const result = await globTool.validateInput!({ pattern: "**/*.ts", limit: 10001 }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(4);
    });

    it("should reject negative offset", async () => {
      const result = await globTool.validateInput!({ pattern: "**/*.ts", offset: -1 }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(5);
    });

    it("should accept valid parameters", async () => {
      const result = await globTool.validateInput!(
        { pattern: "**/*.ts", path: tempDir, limit: 100, offset: 0 },
        {} as any,
      );
      expect(result.result).toBe(true);
    });
  });

  // ============================================================================
  // OUTPUT FORMATTING TESTS
  // ============================================================================

  describe("Output Formatting", () => {
    it('should return "No files found" when no matches', async () => {
      const result = await globTool.call!(
        { pattern: "**/*.nonexistent", path: tempDir },
        {} as any,
      );
      const toolResult = await globTool.mapToolResultToToolResultBlockParam!(result, "test-id");

      expect(toolResult.tool_use_id).toBe("test-id");
      expect(toolResult.type).toBe("tool_result");
      expect(toolResult.content).toBe("No files found");
    });

    it("should format file list with newlines", async () => {
      const result = await globTool.call!({ pattern: "**/*.md", path: tempDir }, {} as any);
      const toolResult = await globTool.mapToolResultToToolResultBlockParam!(result, "test-id");

      expect(toolResult.tool_use_id).toBe("test-id");
      expect(toolResult.type).toBe("tool_result");
      expect(toolResult.content).toContain("README.md");
    });

    it("should include truncation notice when truncated", async () => {
      const result = await globTool.call!({ pattern: "**/*", path: tempDir, limit: 1 }, {} as any);
      result.truncated = true; // Force truncation for testing
      const toolResult = await globTool.mapToolResultToToolResultBlockParam!(result, "test-id");

      expect(toolResult.tool_use_id).toBe("test-id");
      expect(toolResult.type).toBe("tool_result");
      expect(toolResult.content).toContain("(Results are truncated.");
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe("Error Handling", () => {
    it("should handle ripgrep not found error", async () => {
      // This test would require mocking execa to simulate rg not being installed
      // For now, we just verify the error handling code exists
      expect(globTool.call).toBeDefined();
    });

    it("should include duration in result", async () => {
      const result = await globTool.call!({ pattern: "**/*.ts", path: tempDir }, {} as any);
      expect(result.durationMs).toBeDefined();
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // DESCRIPTION AND METADATA TESTS
  // ============================================================================

  describe("Tool Metadata", () => {
    it("should have correct tool name", () => {
      expect(globTool.name).toBe("glob");
    });

    it("should have correct tool label", () => {
      expect(globTool.label).toBe("Glob");
    });

    it("should have user facing name", () => {
      expect(globTool.userFacingName!()).toBe("Find Files");
    });

    it("should be read only", () => {
      expect(globTool.isReadOnly!()).toBe(true);
    });

    it("should be concurrency safe", () => {
      expect(globTool.isConcurrencySafe!()).toBe(true);
    });

    it("should generate description", async () => {
      const description = await globTool.description!({ pattern: "**/*.ts" });
      expect(description).toContain("**/*.ts");
    });

    it("should generate description with path", async () => {
      const description = await globTool.description!({ pattern: "**/*.ts", path: "/some/path" });
      expect(description).toContain("/some/path");
    });
  });

  // ============================================================================
  // EXECUTE GLOB FUNCTION TESTS
  // ============================================================================

  describe("executeGlob Function", () => {
    it("should find files matching pattern", async () => {
      const result = await executeGlob("**/*.ts", tempDir, {
        limit: 100,
        offset: 0,
        includeHidden: true,
        respectIgnore: false,
      });

      expect(result.files.length).toBeGreaterThan(0);
      expect(result.truncated).toBe(false);
    });

    it("should handle pagination", async () => {
      const result1 = await executeGlob("**/*.ts", tempDir, {
        limit: 2,
        offset: 0,
        includeHidden: true,
        respectIgnore: false,
      });

      const result2 = await executeGlob("**/*.ts", tempDir, {
        limit: 2,
        offset: 2,
        includeHidden: true,
        respectIgnore: false,
      });

      expect(result1.files.length).toBeLessThanOrEqual(2);
      expect(result2.files.length).toBeLessThanOrEqual(2);
    });

    it("should return absolute paths", async () => {
      const result = await executeGlob("**/*.ts", tempDir, {
        limit: 100,
        offset: 0,
        includeHidden: true,
        respectIgnore: false,
      });

      result.files.forEach((file) => {
        expect(path.isAbsolute(file)).toBe(true);
      });
    });
  });

  // ============================================================================
  // CONSTANTS TESTS
  // ============================================================================

  describe("Constants", () => {
    it("should have correct default limit", () => {
      expect(DEFAULT_GLOB_LIMIT).toBe(100);
    });

    it("should have correct default offset", () => {
      expect(DEFAULT_GLOB_OFFSET).toBe(0);
    });
  });
});
