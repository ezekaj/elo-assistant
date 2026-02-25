/**
 * Image Processor Module Types
 */

import type { ImageProcessOptions, ImageProcessResult } from "../types.js";

/**
 * Native image processor module interface (N-API bindings)
 */
export interface ImageProcessorNative {
  /**
   * Process an image with various operations
   */
  process(options: ImageProcessOptions): Promise<ImageProcessResult>;
  /**
   * Get image metadata
   */
  metadata(input: Buffer | string): Promise<{
    format: string;
    width: number;
    height: number;
    size: number;
    space?: string;
    channels?: number;
    hasAlpha?: boolean;
  }>;
  /**
   * Get library version
   */
  version(): string;
}

/**
 * Image processor module interface (unified)
 */
export interface ImageProcessorModule {
  /**
   * Process an image with various operations
   */
  process(options: ImageProcessOptions): Promise<ImageProcessResult>;
  /**
   * Resize an image
   */
  resize(options: {
    input: Buffer | string;
    width?: number;
    height?: number;
    fit?: "cover" | "contain" | "fill" | "inside" | "outside";
    output?: string;
  }): Promise<ImageProcessResult>;
  /**
   * Convert image format
   */
  convert(options: {
    input: Buffer | string;
    format: "png" | "jpeg" | "webp" | "gif" | "avif";
    quality?: number;
    output?: string;
  }): Promise<ImageProcessResult>;
  /**
   * Get image metadata
   */
  metadata(input: Buffer | string): Promise<{
    format: string;
    width: number;
    height: number;
    size: number;
    space?: string;
    channels?: number;
    hasAlpha?: boolean;
  }>;
  /**
   * Get library version
   */
  version(): string;
  /**
   * Check if sharp is available
   */
  isAvailable(): boolean;
  /**
   * Get supported formats
   */
  getSupportedFormats(): string[];
}
