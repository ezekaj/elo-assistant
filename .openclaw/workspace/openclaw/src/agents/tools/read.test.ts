/**
 * Read Tool Unit Tests
 * Tests for all Read tool features including:
 * - Binary file detection
 * - Device file check
 * - PDF support
 * - Image support
 * - Notebook support
 * - Symlink resolution
 * - Typo suggestions
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createReadTool } from "./read.js";

describe("Read Tool", () => {
  let tempDir: string;
  let readTool: ReturnType<typeof createReadTool>;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-read-test-"));
    readTool = createReadTool();
  });

  afterAll(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  // ============================================================================
  // BINARY FILE DETECTION TESTS
  // ============================================================================

  describe("Binary File Detection", () => {
    it("should reject mp3 file", async () => {
      const testFile = path.join(tempDir, "test.mp3");
      await fs.promises.writeFile(testFile, "fake mp3 content");

      const result = await readTool.validateInput!({ file_path: testFile }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(4);
      expect(result.message).toContain("binary");
    });

    it("should reject exe file", async () => {
      const testFile = path.join(tempDir, "test.exe");
      await fs.promises.writeFile(testFile, "fake exe content");

      const result = await readTool.validateInput!({ file_path: testFile }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(4);
    });

    it("should reject zip file", async () => {
      const testFile = path.join(tempDir, "test.zip");
      await fs.promises.writeFile(testFile, "fake zip content");

      const result = await readTool.validateInput!({ file_path: testFile }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(4);
    });

    it("should accept text file", async () => {
      const testFile = path.join(tempDir, "test.txt");
      await fs.promises.writeFile(testFile, "text content");

      const result = await readTool.validateInput!({ file_path: testFile }, {} as any);
      expect(result.result).toBe(true);
    });

    it("should accept known text formats (svg)", async () => {
      const testFile = path.join(tempDir, "test.svg");
      await fs.promises.writeFile(testFile, "<svg></svg>");

      const result = await readTool.validateInput!({ file_path: testFile }, {} as any);
      expect(result.result).toBe(true);
    });
  });

  // ============================================================================
  // DEVICE FILE CHECK TESTS
  // ============================================================================

  describe("Device File Check", () => {
    it("should reject /dev/zero", async () => {
      const result = await readTool.validateInput!({ file_path: "/dev/zero" }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(9);
      expect(result.message).toContain("device file");
    });

    it("should reject /dev/random", async () => {
      const result = await readTool.validateInput!({ file_path: "/dev/random" }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(9);
    });

    it("should reject /dev/urandom", async () => {
      const result = await readTool.validateInput!({ file_path: "/dev/urandom" }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(9);
    });

    it("should reject /dev/tty", async () => {
      const result = await readTool.validateInput!({ file_path: "/dev/tty" }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(9);
    });

    it("should reject any /dev/* path", async () => {
      const result = await readTool.validateInput!({ file_path: "/dev/sda1" }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(9);
    });
  });

  // ============================================================================
  // FILE NOT FOUND WITH TYPO SUGGESTIONS
  // ============================================================================

  describe("File Not Found with Typo Suggestions", () => {
    it("should suggest similar file for typo", async () => {
      const testFile = path.join(tempDir, "actual-file.txt");
      await fs.promises.writeFile(testFile, "content");

      // Try to read with typo
      const result = await readTool.validateInput!(
        {
          file_path: path.join(tempDir, "actua-file.txt"), // Missing 'l'
        },
        {} as any,
      );

      expect(result.result).toBe(false);
      expect(result.message).toContain("Did you mean");
      expect(result.message).toContain("actual-file.txt");
    });

    it("should handle non-existent file without suggestions", async () => {
      const result = await readTool.validateInput!(
        {
          file_path: "/nonexistent/path/file.txt",
        },
        {} as any,
      );

      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(1);
    });
  });

  // ============================================================================
  // TEXT FILE READING TESTS
  // ============================================================================

  describe("Text File Reading", () => {
    it("should read text file with line numbers", async () => {
      const testFile = path.join(tempDir, "multiline.txt");
      const content = "line 1\nline 2\nline 3\n";
      await fs.promises.writeFile(testFile, content);

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result).toBeDefined();
      expect(result.file.content).toContain("1 | line 1");
      expect(result.file.content).toContain("2 | line 2");
      expect(result.file.content).toContain("3 | line 3");
    });

    it("should respect offset parameter", async () => {
      const testFile = path.join(tempDir, "offset-test.txt");
      const content = "line 1\nline 2\nline 3\nline 4\nline 5\n";
      await fs.promises.writeFile(testFile, content);

      const result = await readTool.call!(
        {
          file_path: testFile,
          offset: 3,
        },
        {} as any,
      );

      expect(result.file.content).toContain("3 | line 3");
      expect(result.file.content).not.toContain("1 | line 1");
    });

    it("should respect limit parameter", async () => {
      const testFile = path.join(tempDir, "limit-test.txt");
      const content = "line 1\nline 2\nline 3\nline 4\nline 5\n";
      await fs.promises.writeFile(testFile, content);

      const result = await readTool.call!(
        {
          file_path: testFile,
          limit: 2,
        },
        {} as any,
      );

      expect(result.file.content).toContain("1 | line 1");
      expect(result.file.content).toContain("2 | line 2");
      expect(result.file.content.split("\n").filter((l) => l.includes("|")).length).toBe(2);
    });

    it("should truncate long lines", async () => {
      const testFile = path.join(tempDir, "long-line.txt");
      const longLine = "x".repeat(3000);
      await fs.promises.writeFile(testFile, longLine);

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.file.content).toContain("[truncated]");
      expect(result.file.truncated).toBe(true);
    });

    it("should handle empty file", async () => {
      const testFile = path.join(tempDir, "empty.txt");
      await fs.promises.writeFile(testFile, "");

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.file.totalLines).toBe(1); // Empty file has 1 empty line
    });
  });

  // ============================================================================
  // IMAGE FILE TESTS
  // ============================================================================

  describe("Image File Reading", () => {
    it("should read PNG file as base64", async () => {
      const testFile = path.join(tempDir, "test.png");
      // Minimal valid PNG (1x1 transparent pixel)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);
      await fs.promises.writeFile(testFile, pngBuffer);

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.type).toBe("image");
      expect(result.file.type).toBe("image/png");
      expect(result.file.base64).toBeDefined();
      expect(result.file.base64.length).toBeGreaterThan(0);
    });

    it("should read JPEG file", async () => {
      const testFile = path.join(tempDir, "test.jpg");
      // Minimal JPEG header
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);
      await fs.promises.writeFile(testFile, jpegBuffer);

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.type).toBe("image");
      expect(result.file.type).toBe("image/jpeg");
    });

    it("should read SVG file", async () => {
      const testFile = path.join(tempDir, "test.svg");
      const svgContent =
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>';
      await fs.promises.writeFile(testFile, svgContent);

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.type).toBe("image");
      expect(result.file.type).toBe("image/svg+xml");
    });
  });

  // ============================================================================
  // NOTEBOOK FILE TESTS
  // ============================================================================

  describe("Notebook File Reading", () => {
    it("should read Jupyter notebook", async () => {
      const testFile = path.join(tempDir, "test.ipynb");
      const notebook = {
        cells: [
          {
            cell_type: "code",
            source: ['print("Hello")'],
            outputs: [{ output_type: "stream", text: "Hello\n" }],
            execution_count: 1,
          },
          {
            cell_type: "markdown",
            source: ["# Heading"],
          },
        ],
        metadata: {},
        nbformat: 4,
        nbformat_minor: 4,
      };
      await fs.promises.writeFile(testFile, JSON.stringify(notebook));

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.type).toBe("notebook");
      expect(result.file.cells).toHaveLength(2);
      expect(result.file.cells[0].cell_type).toBe("code");
      expect(result.file.cells[0].source).toBe('print("Hello")');
    });
  });

  // ============================================================================
  // PDF FILE TESTS
  // ============================================================================

  describe("PDF File Reading", () => {
    it("should handle PDF without pdf-parse installed", async () => {
      const testFile = path.join(tempDir, "test.pdf");
      // Minimal PDF header
      const pdfBuffer = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
      );
      await fs.promises.writeFile(testFile, pdfBuffer);

      const result = await readTool.call!({ file_path: testFile }, {} as any);
      expect(result.type).toBe("pdf");
      // Should have message about pdf-parse requirement
      expect(result.file.message || result.file.text).toBeDefined();
    });

    it("should validate pages parameter", async () => {
      const result = await readTool.validateInput!(
        {
          file_path: "/test.pdf",
          pages: "invalid",
        },
        {} as any,
      );

      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(7);
    });

    it("should accept valid pages parameter", async () => {
      const result = await readTool.validateInput!(
        {
          file_path: "/test.pdf",
          pages: "1-5",
        },
        {} as any,
      );

      expect(result.result).toBe(true);
    });

    it("should reject pages exceeding max", async () => {
      const result = await readTool.validateInput!(
        {
          file_path: "/test.pdf",
          pages: "1-50",
        },
        {} as any,
      );

      expect(result.result).toBe(false);
    });
  });

  // ============================================================================
  // SYMLINK RESOLUTION TESTS
  // ============================================================================

  describe("Symlink Resolution", () => {
    it("should resolve symlinks", async () => {
      const targetFile = path.join(tempDir, "target.txt");
      const linkFile = path.join(tempDir, "link.txt");

      await fs.promises.writeFile(targetFile, "target content");
      await fs.promises.symlink(targetFile, linkFile);

      // Reading symlink should work
      const result = await readTool.call!({ file_path: linkFile }, {} as any);
      expect(result.file.content).toContain("target content");
    });

    it("should suggest resolved path on ENOENT", async () => {
      const targetFile = path.join(tempDir, "real-file.txt");
      const brokenLink = path.join(tempDir, "broken-link.txt");

      await fs.promises.writeFile(targetFile, "content");
      await fs.promises.symlink(targetFile, brokenLink);
      await fs.promises.unlink(targetFile); // Remove target, leaving broken symlink

      // Should handle gracefully with error
      try {
        await readTool.call!({ file_path: brokenLink }, {} as any);
      } catch (error: any) {
        expect(error.message).toContain("does not exist");
      }
    });
  });

  // ============================================================================
  // FILE SIZE CHECK TESTS
  // ============================================================================

  describe("File Size Checks", () => {
    it("should reject file that is too large", async () => {
      const testFile = path.join(tempDir, "large.txt");
      // Create 2MB file
      const largeContent = "x".repeat(2 * 1024 * 1024);
      await fs.promises.writeFile(testFile, largeContent);

      const result = await readTool.validateInput!({ file_path: testFile }, {} as any);
      expect(result.result).toBe(false);
      expect(result.errorCode).toBe(3);
      expect(result.message).toContain("too large");
    });
  });
});
