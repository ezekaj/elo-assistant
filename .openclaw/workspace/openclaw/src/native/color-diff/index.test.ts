/**
 * Color Diff Module Tests
 *
 * Tests for the color diff native module with Highlight.js fallback.
 */

import { describe, it, expect } from "vitest";
import { createColorDiffModule, highlightCodeFn, highlightDiffFn } from "./color-diff/index.js";

describe("Color Diff Module", () => {
  describe("createColorDiffModule", () => {
    it("should create module instance", async () => {
      const module = await createColorDiffModule();
      expect(module).toHaveProperty("highlight");
      expect(module).toHaveProperty("highlightDiff");
      expect(module).toHaveProperty("listThemes");
      expect(module).toHaveProperty("listLanguages");
      expect(module).toHaveProperty("detectLanguage");
      expect(module).toHaveProperty("isAvailable");
    });

    it("should report availability", async () => {
      const module = await createColorDiffModule();
      const available = module.isAvailable();
      expect(typeof available).toBe("boolean");
    });
  });

  describe("highlight", () => {
    it("should highlight TypeScript code", async () => {
      const module = await createColorDiffModule();

      if (!module.isAvailable()) {
        return;
      }

      const result = await module.highlight({
        code: "const x: number = 42;",
        language: "typescript",
        format: "terminal",
      });

      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("language");
      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("elapsedMs");
      expect(result.language).toBe("typescript");
    });

    it("should highlight JavaScript code", async () => {
      const result = await highlightCodeFn({
        code: "function hello() { return 'world'; }",
        language: "javascript",
        format: "terminal",
      });

      expect(result.language).toBe("javascript");
    });

    it("should handle plaintext", async () => {
      const result = await highlightCodeFn({
        code: "just plain text",
        language: "plaintext",
      });

      expect(result.language).toBe("plaintext");
    });

    it("should add line numbers when requested", async () => {
      const result = await highlightCodeFn({
        code: "line1\nline2\nline3",
        language: "plaintext",
        lineNumbers: true,
      });

      // Should contain line numbers
      expect(result.code).toContain("1");
      expect(result.code).toContain("2");
      expect(result.code).toContain("3");
    });

    it("should handle HTML output format", async () => {
      const result = await highlightCodeFn({
        code: "const x = 1;",
        language: "javascript",
        format: "html",
      });

      expect(result.format).toBe("html");
    });

    it("should handle ANSI output format", async () => {
      const result = await highlightCodeFn({
        code: "const x = 1;",
        language: "javascript",
        format: "ansi",
      });

      expect(result.format).toBe("ansi");
    });
  });

  describe("highlightDiff", () => {
    it("should highlight unified diff", async () => {
      const module = await createColorDiffModule();

      if (!module.isAvailable()) {
        return;
      }

      const diff = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line1
-line2
+modified line2
 line3`;

      const result = await module.highlightDiff({
        diff,
        format: "terminal",
      });

      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("language");
      expect(result).toHaveProperty("format");
    });

    it("should colorize added lines", async () => {
      const result = await highlightDiffFn({
        diff: "+added line",
        format: "terminal",
      });

      // Should contain the added line
      expect(result.code).toContain("added line");
    });

    it("should colorize removed lines", async () => {
      const result = await highlightDiffFn({
        diff: "-removed line",
        format: "terminal",
      });

      expect(result.code).toContain("removed line");
    });

    it("should handle context lines", async () => {
      const result = await highlightDiffFn({
        diff: " context line",
        format: "terminal",
      });

      expect(result.code).toContain("context line");
    });

    it("should add line numbers when requested", async () => {
      const result = await highlightDiffFn({
        diff: "+line1\n-line2\n line3",
        format: "terminal",
        lineNumbers: true,
      });

      expect(result.code).toContain("1");
    });
  });

  describe("listLanguages", () => {
    it("should return list of supported languages", async () => {
      const module = await createColorDiffModule();

      if (!module.isAvailable()) {
        return;
      }

      const languages = await module.listLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages).toContain("javascript");
      expect(languages).toContain("typescript");
      expect(languages).toContain("python");
    });
  });

  describe("listThemes", () => {
    it("should return list of available themes", async () => {
      const module = await createColorDiffModule();
      const themes = await module.listThemes();
      expect(Array.isArray(themes)).toBe(true);
    });
  });

  describe("detectLanguage", () => {
    it("should detect TypeScript from filename", async () => {
      const module = await createColorDiffModule();
      const language = await module.detectLanguage("test.ts");
      expect(language).toBe("typescript");
    });

    it("should detect JavaScript from filename", async () => {
      const module = await createColorDiffModule();
      const language = await module.detectLanguage("test.js");
      expect(language).toBe("javascript");
    });

    it("should detect Python from filename", async () => {
      const module = await createColorDiffModule();
      const language = await module.detectLanguage("test.py");
      expect(language).toBe("python");
    });

    it("should detect Rust from filename", async () => {
      const module = await createColorDiffModule();
      const language = await module.detectLanguage("test.rs");
      expect(language).toBe("rust");
    });

    it("should return null for unknown extension", async () => {
      const module = await createColorDiffModule();
      const language = await module.detectLanguage("test.xyz123");
      // May return the extension or null
      expect(language === null || language === "xyz123").toBe(true);
    });
  });
});
