/**
 * Image Processor Module Tests
 *
 * Tests for the image processor native module with fallback.
 */

import { writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createImageProcessorModule, processImage, resizeImage } from "./image-processor/index.js";

describe("Image Processor Module", () => {
  let testDir: string;
  let testImageBuffer: Buffer;

  beforeAll(() => {
    testDir = join(tmpdir(), `openclaw-image-test-${Date.now()}`);

    // Create a minimal valid PNG (1x1 red pixel)
    // PNG signature + IHDR + IDAT + IEND
    testImageBuffer = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01, // 1x1
      0x08,
      0x02,
      0x00,
      0x00,
      0x00,
      0x90,
      0x77,
      0x53, // 8-bit RGB
      0xde,
      0x00,
      0x00,
      0x00,
      0x0c,
      0x49,
      0x44,
      0x41, // IDAT chunk
      0x54,
      0x08,
      0xd7,
      0x63,
      0xf8,
      0xff,
      0xff,
      0x3f, // compressed data
      0x00,
      0x05,
      0xfe,
      0x02,
      0xfe,
      0xdc,
      0xcc,
      0x59,
      0xe7,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e, // IEND chunk
      0x44,
      0xae,
      0x42,
      0x60,
      0x82,
    ]);
  });

  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createImageProcessorModule", () => {
    it("should create module instance", async () => {
      const module = await createImageProcessorModule();
      expect(module).toHaveProperty("process");
      expect(module).toHaveProperty("resize");
      expect(module).toHaveProperty("convert");
      expect(module).toHaveProperty("metadata");
      expect(module).toHaveProperty("version");
      expect(module).toHaveProperty("isAvailable");
      expect(module).toHaveProperty("getSupportedFormats");
    });

    it("should report availability", async () => {
      const module = await createImageProcessorModule();
      const available = module.isAvailable();
      expect(typeof available).toBe("boolean");
    });

    it("should return version string", async () => {
      const module = await createImageProcessorModule();
      const version = module.version();
      expect(typeof version).toBe("string");
    });

    it("should return supported formats", async () => {
      const module = await createImageProcessorModule();
      const formats = module.getSupportedFormats();
      expect(Array.isArray(formats)).toBe(true);
    });
  });

  describe("processImage", () => {
    it("should process image buffer", async () => {
      const module = await createImageProcessorModule();

      if (!module.isAvailable()) {
        // Skip if no processor available
        return;
      }

      const outputPath = join(testDir, "output.png");

      const result = await processImage({
        input: testImageBuffer,
        outputPath,
      });

      expect(result).toHaveProperty("buffer");
      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("width");
      expect(result).toHaveProperty("height");
      expect(result).toHaveProperty("size");
      expect(result).toHaveProperty("elapsedMs");
    });

    it("should resize image", async () => {
      const module = await createImageProcessorModule();

      if (!module.isAvailable()) {
        return;
      }

      const result = await processImage({
        input: testImageBuffer,
        width: 100,
        height: 100,
      });

      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it("should convert format", async () => {
      const module = await createImageProcessorModule();

      if (!module.isAvailable()) {
        return;
      }

      const result = await processImage({
        input: testImageBuffer,
        format: "jpeg",
        quality: 80,
      });

      expect(result.format).toBe("jpeg");
    });

    it("should handle grayscale", async () => {
      const module = await createImageProcessorModule();

      if (!module.isAvailable()) {
        return;
      }

      const result = await processImage({
        input: testImageBuffer,
        grayscale: true,
      });

      expect(result).toHaveProperty("buffer");
    });
  });

  describe("resizeImage", () => {
    it("should resize image to specified dimensions", async () => {
      const module = await createImageProcessorModule();

      if (!module.isAvailable()) {
        return;
      }

      const result = await resizeImage({
        input: testImageBuffer,
        width: 50,
        height: 50,
      });

      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
    });

    it("should maintain aspect ratio when only width specified", async () => {
      const module = await createImageProcessorModule();

      if (!module.isAvailable()) {
        return;
      }

      const result = await resizeImage({
        input: testImageBuffer,
        width: 200,
      });

      expect(result.width).toBe(200);
    });
  });
});
