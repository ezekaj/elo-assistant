/**
 * Image Processor using Sharp
 *
 * Sharp is already a dependency in OpenClaw. This module provides
 * a unified interface with fallback for when Sharp is unavailable.
 */

import type { ImageProcessOptions, ImageProcessResult } from "../types.js";
import { logInfo, logWarn } from "../../logger.js";

let sharpModule: any | null = null;
let sharpAvailable: boolean | undefined;

/**
 * Try to load sharp module using dynamic import
 */
async function loadSharp(): Promise<any | null> {
  if (sharpModule !== null) {
    return sharpModule;
  }

  try {
    // Sharp is a callable function, not a namespace import
    const sharp = await import("sharp");
    // Sharp exports as default function in ESM
    sharpModule = sharp.default || sharp;
    sharpAvailable = true;
    logInfo("[ImageProcessor] Sharp loaded successfully");
    return sharpModule;
  } catch (err) {
    sharpModule = null;
    sharpAvailable = false;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[ImageProcessor] Sharp not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Check if sharp is available
 */
export async function isSharpAvailable(): Promise<boolean> {
  if (sharpAvailable !== undefined) {
    return sharpAvailable;
  }
  return (await loadSharp()) !== null;
}

/**
 * Get supported formats from sharp
 */
export function getSupportedFormats(): string[] {
  if (!sharpModule) {
    return ["png", "jpeg"];
  }
  // Sharp supports these formats by default
  const formats = ["png", "jpeg", "webp"];
  return formats;
}

/**
 * Process image using sharp
 */
export async function processImage(options: ImageProcessOptions): Promise<ImageProcessResult> {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error("Sharp not available");
  }

  const startTime = Date.now();

  // Sharp is a function that takes input
  let image = sharp(options.input);

  // Apply transformations
  if (options.resize) {
    image = image.resize(options.resize.width, options.resize.height, {
      fit: options.resize.fit || "cover",
      withoutEnlargement: options.resize.withoutEnlargement,
    });
  }

  if (options.rotate !== undefined) {
    image = image.rotate(options.rotate);
  }

  if (options.flip) {
    image = image.flip();
  }

  if (options.flop) {
    image = image.flop();
  }

  if (options.blur !== undefined) {
    image = image.blur(options.blur);
  }

  if (options.grayscale) {
    image = image.grayscale();
  }

  // Apply format-specific options
  const format = options.format || "png";
  switch (format) {
    case "jpeg":
      image = image.jpeg({ quality: options.quality || 80 });
      break;
    case "webp":
      image = image.webp({ quality: options.quality || 80 });
      break;
    case "avif":
      image = image.avif({ quality: options.quality || 80 });
      break;
    case "png":
    default:
      image = image.png({ compressionLevel: options.compressionLevel || 6 });
      break;
  }

  const buffer = await image.toBuffer();

  return {
    buffer,
    format,
    size: buffer.length,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Resize image using sharp
 */
export async function resizeImage(options: {
  input: Buffer | string;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  output?: string;
}): Promise<ImageProcessResult> {
  return processImage({
    input: options.input,
    resize: {
      width: options.width,
      height: options.height,
      fit: options.fit,
    },
  });
}

/**
 * Convert image format using sharp
 */
export async function convertImage(options: {
  input: Buffer | string;
  format: "png" | "jpeg" | "webp" | "gif" | "avif";
  quality?: number;
  output?: string;
}): Promise<ImageProcessResult> {
  return processImage({
    input: options.input,
    format: options.format,
    quality: options.quality,
  });
}

/**
 * Get image metadata using sharp
 */
export async function getMetadata(input: Buffer | string) {
  const sharp = await loadSharp();
  if (!sharp) {
    throw new Error("Sharp not available");
  }

  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || "unknown",
    size: metadata.size || 0,
    space: metadata.space,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
  };
}

/**
 * Get sharp version
 */
export async function getVersion(): Promise<string> {
  try {
    const pkg = await import("sharp/package.json");
    return pkg.default?.version || "unknown";
  } catch {
    return "unknown";
  }
}
