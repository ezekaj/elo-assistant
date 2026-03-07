/**
 * Image Processor Fallback Implementation
 *
 * Uses Canvas API (@napi-rs/canvas) when Sharp is unavailable.
 * Provides basic image processing capabilities.
 */

import type { ImageProcessOptions, ImageProcessResult } from "../types.js";
import { logInfo, logWarn } from "../../logger.js";

let canvasModule: typeof import("@napi-rs/canvas") | null = null;
let canvasAvailable: boolean | undefined;

/**
 * Try to load canvas module using dynamic import
 */
async function loadCanvas(): Promise<typeof import("@napi-rs/canvas") | null> {
  if (canvasModule !== null) {
    return canvasModule;
  }

  try {
    const canvas = await import("@napi-rs/canvas");
    canvasModule = canvas.default || canvas;
    canvasAvailable = true;
    logInfo("[ImageProcessor] Canvas loaded successfully");
    return canvasModule;
  } catch (err) {
    canvasModule = null;
    canvasAvailable = false;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[ImageProcessor] Canvas not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Check if canvas is available
 */
export async function isCanvasAvailable(): Promise<boolean> {
  if (canvasAvailable !== undefined) {
    return canvasAvailable;
  }
  return (await loadCanvas()) !== null;
}

/**
 * Get supported formats for canvas fallback
 */
export function getSupportedFormats(): string[] {
  if (!canvasModule) {
    return ["png", "jpeg"];
  }
  return ["png", "jpeg"];
}

/**
 * Process image using canvas fallback
 */
export async function processImageFallback(
  options: ImageProcessOptions,
): Promise<ImageProcessResult> {
  const canvasLib = await loadCanvas();
  if (!canvasLib) {
    throw new Error("Canvas not available");
  }

  const startTime = Date.now();

  // Load image
  const img = new canvasLib.Image();
  img.src = options.input;

  // Create canvas
  const width = options.resize?.width || img.width;
  const height = options.resize?.height || img.height;

  const canvas = new canvasLib.Canvas(width, height);
  const ctx = canvas.getContext("2d");

  // Apply transformations
  if (options.resize) {
    ctx.drawImage(img, 0, 0, width, height);
  } else {
    ctx.drawImage(img, 0, 0);
  }

  // Apply effects
  if (options.rotate !== undefined) {
    // Canvas rotation would need to be done before drawing
    // This is a simplified implementation
  }

  if (options.grayscale) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Get buffer
  const format = options.format || "png";
  let buffer: Buffer;

  if (format === "jpeg") {
    buffer = canvas.toBuffer("image/jpeg", options.quality ? options.quality / 100 : 0.8);
  } else {
    buffer = canvas.toBuffer("image/png");
  }

  return {
    buffer,
    format,
    size: buffer.length,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Get image metadata using canvas
 */
export async function getMetadataFallback(input: Buffer | string) {
  const canvas = await loadCanvas();
  if (!canvas) {
    throw new Error("Canvas not available");
  }

  const img = new canvas.Image();
  img.src = input;

  return {
    width: img.width,
    height: img.height,
    format: "unknown",
    size: img.src?.length || 0,
  };
}

/**
 * Get canvas version
 */
export async function getVersion(): Promise<string> {
  try {
    const pkg = await import("@napi-rs/canvas/package.json");
    return pkg.default.version || "unknown";
  } catch {
    return "unknown";
  }
}
