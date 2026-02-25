/**
 * Image Tool using Native Image Processor Module
 *
 * Provides image processing capabilities using Sharp with fallback.
 * Integrates with OpenClaw's tool system.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonResult, imageResultFromFile } from "../../tools/common.js";
import {
  processImage,
  resizeImage,
  convertImage,
  getImageProcessorModule,
} from "../image-processor/index.js";

/**
 * Create image tool using native image processor module
 */
export function createImageTool(): AgentTool {
  return {
    name: "image",
    description: "Process images: resize, convert, crop, rotate, and apply effects",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["process", "resize", "convert", "metadata"],
          description: "Action to perform on the image",
        },
        input: {
          type: "string",
          description: "Path to input image file",
        },
        output: {
          type: "string",
          description: "Path to output image file (optional, defaults to temp file)",
        },
        width: {
          type: "number",
          description: "Output width in pixels",
        },
        height: {
          type: "number",
          description: "Output height in pixels",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp", "gif", "avif"],
          description: "Output format",
        },
        quality: {
          type: "number",
          description: "Quality for lossy formats (1-100)",
          minimum: 1,
          maximum: 100,
        },
        fit: {
          type: "string",
          enum: ["cover", "contain", "fill", "inside", "outside"],
          description: "Resize fit mode",
          default: "cover",
        },
        rotate: {
          type: "number",
          description: "Rotation angle in degrees",
        },
        flip: {
          type: "boolean",
          description: "Flip vertically",
          default: false,
        },
        flop: {
          type: "boolean",
          description: "Flip horizontally",
          default: false,
        },
        blur: {
          type: "number",
          description: "Blur radius (0.3 - 1000)",
          minimum: 0.3,
          maximum: 1000,
        },
        grayscale: {
          type: "boolean",
          description: "Convert to grayscale",
          default: false,
        },
      },
      required: ["action", "input"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const module = await getImageProcessorModule();

        if (!module.isAvailable()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No image processor available. Install sharp (@npmjs/sharp) or canvas (@napi-rs/canvas).",
              },
            ],
          };
        }

        const action = params.action as string;
        const input = params.input as string;
        const output = params.output as string;

        if (!input) {
          return {
            content: [
              {
                type: "text",
                text: "Error: input path is required",
              },
            ],
          };
        }

        let result;

        switch (action) {
          case "resize": {
            result = await resizeImage({
              input,
              width: params.width as number | undefined,
              height: params.height as number | undefined,
              fit: (params.fit as string) ?? "cover",
              output: output || generateOutputPath(input, params.format as string),
            });
            break;
          }

          case "convert": {
            const format = params.format as string;
            if (!format) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: format is required for convert action",
                  },
                ],
              };
            }
            result = await convertImage({
              input,
              format: format as "png" | "jpeg" | "webp" | "gif" | "avif",
              quality: params.quality as number | undefined,
              output: output || generateOutputPath(input, format),
            });
            break;
          }

          case "metadata": {
            const metadata = await module.metadata(input);
            return jsonResult({
              format: metadata.format,
              width: metadata.width,
              height: metadata.height,
              size: metadata.size,
              space: metadata.space,
              channels: metadata.channels,
              hasAlpha: metadata.hasAlpha,
            });
          }

          case "process":
          default: {
            result = await processImage({
              input,
              width: params.width as number | undefined,
              height: params.height as number | undefined,
              fit: params.fit as string | undefined,
              format: params.format as string | undefined,
              quality: params.quality as number | undefined,
              rotate: params.rotate as number | undefined,
              flip: Boolean(params.flip),
              flop: Boolean(params.flop),
              blur: params.blur as number | undefined,
              grayscale: Boolean(params.grayscale),
              outputPath: output || generateOutputPath(input, params.format as string),
            });
            break;
          }
        }

        return jsonResult({
          output: result.format,
          width: result.width,
          height: result.height,
          size: result.size,
          format: result.format,
          elapsedMs: result.elapsedMs,
          metadata: result.metadata,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error processing image: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Generate output path for processed image
 */
function generateOutputPath(input: string, format?: string): string {
  const ext = format ? `.${format}` : ".png";
  const basename = input.split("/").pop()?.split("\\").pop() ?? "output";
  const name = basename.replace(/\.[^.]+$/, "");
  return join(tmpdir(), `${name}_processed${ext}`);
}

/**
 * Create image analyze tool (for AI model analysis)
 */
export function createImageAnalyzeTool(): AgentTool {
  return {
    name: "image_analyze",
    description: "Analyze an image and return its metadata and a base64 representation",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the image file to analyze",
        },
      },
      required: ["path"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const path = params.path as string;

        if (!path) {
          return {
            content: [
              {
                type: "text",
                text: "Error: path is required",
              },
            ],
          };
        }

        const module = await getImageProcessorModule();
        const metadata = await module.metadata(path);
        const buffer = await readFile(path);

        return await imageResultFromFile({
          label: "image",
          path,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing image: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Image tool instance
 */
export const imageTool: AgentTool = createImageTool();

/**
 * Image analyze tool instance
 */
export const imageAnalyzeTool: AgentTool = createImageAnalyzeTool();
