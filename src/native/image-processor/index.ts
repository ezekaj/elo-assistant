/**
 * Image Processor Module for OpenClaw
 *
 * Provides image processing using Sharp with automatic fallback
 * to Canvas API when Sharp is unavailable.
 */

import type { ImageProcessOptions, ImageProcessResult } from "../types.js";
import type { ImageProcessorModule } from "./types.js";
import { logInfo } from "../../logger.js";
import {
  isCanvasAvailable,
  getSupportedFormats as getCanvasFormats,
  processImageFallback,
  getMetadataFallback,
  getVersion as getCanvasVersion,
} from "./fallback.js";
import {
  isSharpAvailable,
  getSupportedFormats as getSharpFormats,
  processImage as processWithSharp,
  resizeImage as resizeWithSharp,
  convertImage as convertWithSharp,
  getMetadata as getMetadataSharp,
  getVersion as getSharpVersion,
} from "./processor.js";

let cachedModule: ImageProcessorModule | null = null;

/**
 * Create image processor module with sharp/canvas detection
 */
export async function createImageProcessorModule(): Promise<ImageProcessorModule> {
  if (cachedModule) {
    return cachedModule;
  }

  const sharpAvailable = await isSharpAvailable();
  const canvasAvailable = await isCanvasAvailable();

  const module: ImageProcessorModule = {
    async process(options: ImageProcessOptions): Promise<ImageProcessResult> {
      if (sharpAvailable) {
        return await processWithSharp(options);
      }

      if (canvasAvailable) {
        return await processImageFallback(options);
      }

      throw new Error(
        "No image processor available. Install sharp (@npmjs/sharp) or canvas (@napi-rs/canvas).",
      );
    },

    async resize(options: {
      input: Buffer | string;
      width?: number;
      height?: number;
      fit?: "cover" | "contain" | "fill" | "inside" | "outside";
      output?: string;
    }): Promise<ImageProcessResult> {
      if (sharpAvailable) {
        return await resizeWithSharp(options);
      }

      if (canvasAvailable) {
        return await processImageFallback({
          input: options.input,
          width: options.width,
          height: options.height,
          fit: options.fit,
          outputPath: options.output,
        });
      }

      throw new Error("No image processor available for resize");
    },

    async convert(options: {
      input: Buffer | string;
      format: "png" | "jpeg" | "webp" | "gif" | "avif";
      quality?: number;
      output?: string;
    }): Promise<ImageProcessResult> {
      if (sharpAvailable) {
        return await convertWithSharp(options);
      }

      if (canvasAvailable) {
        // Canvas only supports png and jpeg
        if (options.format !== "png" && options.format !== "jpeg") {
          throw new Error(`Canvas fallback only supports png and jpeg, not ${options.format}`);
        }
        return await processImageFallback({
          input: options.input,
          format: options.format,
          quality: options.quality,
          outputPath: options.output,
        });
      }

      throw new Error("No image processor available for conversion");
    },

    async metadata(input: Buffer | string) {
      if (sharpAvailable) {
        return await getMetadataSharp(input);
      }

      if (canvasAvailable) {
        return await getMetadataFallback(input);
      }

      throw new Error("No image processor available for metadata");
    },

    version(): string {
      if (sharpAvailable) {
        return `sharp ${getSharpVersion()}`;
      }

      if (canvasAvailable) {
        return `canvas ${getCanvasVersion()}`;
      }

      return "unavailable";
    },

    isAvailable(): boolean {
      return sharpAvailable || canvasAvailable;
    },

    getSupportedFormats(): string[] {
      if (sharpAvailable) {
        return getSharpFormats();
      }

      if (canvasAvailable) {
        return getCanvasFormats();
      }

      return [];
    },
  };

  cachedModule = module;

  const primary = sharpAvailable ? "sharp" : canvasAvailable ? "canvas" : "none";
  logInfo(`[ImageProcessor] Module initialized (primary: ${primary})`);

  return module;
}

/**
 * Get or create the image processor module instance
 */
export async function getImageProcessorModule(): Promise<ImageProcessorModule> {
  if (!cachedModule) {
    cachedModule = await createImageProcessorModule();
  }
  return cachedModule;
}

/**
 * Convenience function: process an image
 */
export async function processImage(options: ImageProcessOptions): Promise<ImageProcessResult> {
  const module = await getImageProcessorModule();
  return await module.process(options);
}

/**
 * Convenience function: resize an image
 */
export async function resizeImage(options: {
  input: Buffer | string;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  output?: string;
}): Promise<ImageProcessResult> {
  const module = await getImageProcessorModule();
  return await module.resize(options);
}

/**
 * Convenience function: convert image format
 */
export async function convertImage(options: {
  input: Buffer | string;
  format: "png" | "jpeg" | "webp" | "gif" | "avif";
  quality?: number;
  output?: string;
}): Promise<ImageProcessResult> {
  const module = await getImageProcessorModule();
  return await module.convert(options);
}

/**
 * Module instance (lazy loaded)
 */
export const imageProcessorModule: Promise<ImageProcessorModule> = createImageProcessorModule();
