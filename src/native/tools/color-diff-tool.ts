/**
 * Color Diff Tool using Native Color Diff Module
 *
 * Provides syntax highlighting and colored diff output.
 * Integrates with OpenClaw's tool system.
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { HighlightOptions, DiffHighlightOptions } from "../types.js";
import { jsonResult } from "../../tools/common.js";
import {
  highlightCode as highlightCodeFn,
  highlightDiff as highlightDiffFn,
  getColorDiffModule,
} from "../color-diff/index.js";

/**
 * Create syntax highlight tool
 */
export function createHighlightTool(): AgentTool {
  return {
    name: "highlight",
    description: "Apply syntax highlighting to source code",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "Source code to highlight",
        },
        language: {
          type: "string",
          description: "Programming language (e.g., 'typescript', 'python', 'rust')",
        },
        format: {
          type: "string",
          enum: ["terminal", "html", "ansi"],
          description: "Output format",
          default: "terminal",
        },
        lineNumbers: {
          type: "boolean",
          description: "Include line numbers",
          default: false,
        },
        theme: {
          type: "string",
          description: "Color theme name",
        },
      },
      required: ["code"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const module = await getColorDiffModule();

        if (!module.isAvailable()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No syntax highlighter available. Install highlight.js.",
              },
            ],
          };
        }

        const code = params.code as string;
        const language = (params.language as string) ?? "plaintext";
        const format = (params.format as string) ?? "terminal";
        const lineNumbers = Boolean(params.lineNumbers);
        const theme = params.theme as string | undefined;

        if (!code) {
          return {
            content: [
              {
                type: "text",
                text: "Error: code is required",
              },
            ],
          };
        }

        const options: HighlightOptions = {
          code,
          language,
          format: format as "html" | "ansi" | "terminal",
          lineNumbers,
          theme,
        };

        const result = await highlightCodeFn(options);

        return jsonResult({
          highlighted: result.code,
          language: result.language,
          theme: result.theme,
          format: result.format,
          elapsedMs: result.elapsedMs,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error highlighting code: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Create diff highlight tool
 */
export function createDiffHighlightTool(): AgentTool {
  return {
    name: "highlight_diff",
    description: "Apply syntax highlighting to a unified diff with colored changes",
    inputSchema: {
      type: "object",
      properties: {
        diff: {
          type: "string",
          description: "Unified diff text to highlight",
        },
        language: {
          type: "string",
          description: "Programming language for syntax highlighting the changes",
        },
        format: {
          type: "string",
          enum: ["terminal", "html", "ansi"],
          description: "Output format",
          default: "terminal",
        },
        lineNumbers: {
          type: "boolean",
          description: "Include line numbers",
          default: false,
        },
      },
      required: ["diff"],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const module = await getColorDiffModule();

        if (!module.isAvailable()) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No diff highlighter available. Install highlight.js.",
              },
            ],
          };
        }

        const diff = params.diff as string;
        const language = (params.language as string) ?? "plaintext";
        const format = (params.format as string) ?? "terminal";
        const lineNumbers = Boolean(params.lineNumbers);

        if (!diff) {
          return {
            content: [
              {
                type: "text",
                text: "Error: diff is required",
              },
            ],
          };
        }

        const options: DiffHighlightOptions = {
          diff,
          language,
          format: format as "html" | "ansi" | "terminal",
          lineNumbers,
        };

        const result = await highlightDiffFn(options);

        return jsonResult({
          highlighted: result.code,
          language: result.language,
          format: result.format,
          elapsedMs: result.elapsedMs,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error highlighting diff: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Create language detection tool
 */
export function createDetectLanguageTool(): AgentTool {
  return {
    name: "detect_language",
    description: "Detect programming language from filename or code content",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Filename to detect language from",
        },
        code: {
          type: "string",
          description: "Code content to analyze (optional)",
        },
      },
      required: [],
    },
    execute: async (params: Record<string, unknown>) => {
      try {
        const module = await getColorDiffModule();
        const filename = params.filename as string | undefined;
        const code = params.code as string | undefined;

        if (!filename && !code) {
          return {
            content: [
              {
                type: "text",
                text: "Error: either filename or code is required",
              },
            ],
          };
        }

        let language: string | null = null;

        if (filename) {
          language = await module.detectLanguage(filename);
        }

        return jsonResult({
          language: language ?? "plaintext",
          filename,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error detecting language: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Create list languages tool
 */
export function createListLanguagesTool(): AgentTool {
  return {
    name: "list_languages",
    description: "List all available syntax highlighting languages",
    inputSchema: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      try {
        const module = await getColorDiffModule();
        const languages = await module.listLanguages();

        return jsonResult({
          languages: languages.sort(),
          count: languages.length,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Error listing languages: ${errorMsg}`,
            },
          ],
        };
      }
    },
  };
}

/**
 * Highlight tool instance
 */
export const highlightTool: AgentTool = createHighlightTool();

/**
 * Diff highlight tool instance
 */
export const diffHighlightTool: AgentTool = createDiffHighlightTool();

/**
 * Language detection tool instance
 */
export const detectLanguageTool: AgentTool = createDetectLanguageTool();

/**
 * List languages tool instance
 */
export const listLanguagesTool: AgentTool = createListLanguagesTool();
