import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readBooleanParam } from "./common.js";

// ============================================================================
// FILE STATE TRACKING (from Claude Code readFileState)
// ============================================================================

interface FileState {
  content: string;
  timestamp: number;
  offset?: number;
  limit?: number;
  lineEnding?: "\n" | "\r\n";
  encoding?: string;
  mode?: number;
}

// Global file state tracking (similar to Claude Code's readFileState Map)
const readFileState = new Map<string, FileState>();

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const MAX_RESULT_SIZE = 100000; // 100KB

// ============================================================================
// LINE ENDING DETECTION (from Claude Code Xp function)
// ============================================================================

function detectLineEnding(content: string): "\n" | "\r\n" {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/\n/g) || []).length - crlfCount;
  return crlfCount > lfCount ? "\r\n" : "\n";
}

function preserveLineEndings(content: string, originalEnding: "\n" | "\r\n"): string {
  // Normalize all line endings to LF first, then convert to original
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (originalEnding === "\r\n") {
    return normalized.replace(/\n/g, "\r\n");
  }
  return normalized;
}

// ============================================================================
// ENCODING DETECTION (from Claude Code I2 function)
// ============================================================================

function detectEncoding(buffer: Buffer): string {
  // Check for BOM markers
  if (buffer.length >= 2) {
    // UTF-16 LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return "utf-16le";
    }
    // UTF-16 BE BOM
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return "utf-16be";
    }
    // UTF-8 BOM
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return "utf-8";
    }
  }
  // Default to UTF-8
  return "utf-8";
}

// ============================================================================
// GIT DIFF GENERATION (from Claude Code git diff generation)
// ============================================================================

interface GitDiff {
  filename: string;
  status: "modified" | "added";
  additions: number;
  deletions: number;
  changes: number;
  patch: string;
}

export function generateGitDiff(
  filePath: string,
  originalContent: string | null,
  newContent: string,
): GitDiff {
  const lines = {
    original: originalContent ? originalContent.split("\n") : [],
    new: newContent.split("\n"),
  };

  let additions = 0;
  let deletions = 0;
  const patch: string[] = [];

  // Simple diff algorithm
  if (!originalContent) {
    // New file - all additions
    additions = lines.new.length;
    patch.push(`--- /dev/null`);
    patch.push(`+++ b/${filePath}`);
    for (const line of lines.new) {
      patch.push(`+${line}`);
    }
  } else {
    // Modified file
    patch.push(`--- a/${filePath}`);
    patch.push(`+++ b/${filePath}`);

    const maxLen = Math.max(lines.original.length, lines.new.length);
    for (let i = 0; i < maxLen; i++) {
      const orig = lines.original[i];
      const newLine = lines.new[i];

      if (orig === undefined) {
        patch.push(`+${newLine}`);
        additions++;
      } else if (newLine === undefined) {
        patch.push(`-${orig}`);
        deletions++;
      } else if (orig !== newLine) {
        patch.push(`-${orig}`);
        patch.push(`+${newLine}`);
        additions++;
        deletions++;
      }
    }
  }

  return {
    filename: filePath,
    status: originalContent ? "modified" : "added",
    additions,
    deletions,
    changes: additions + deletions,
    patch: patch.join("\n"),
  };
}

// ============================================================================
// STRUCTURED PATCH GENERATION
// ============================================================================

interface StructuredPatch {
  old_string: string;
  new_string: string;
  old_start_line?: number;
  old_end_line?: number;
  new_start_line?: number;
  new_end_line?: number;
}

export function generateStructuredPatch(
  originalContent: string | null,
  newContent: string,
): StructuredPatch[] {
  if (!originalContent) {
    return [];
  }

  return [
    {
      old_string: originalContent,
      new_string: newContent,
      old_start_line: 1,
      old_end_line: originalContent.split("\n").length,
      new_start_line: 1,
      new_end_line: newContent.split("\n").length,
    },
  ];
}

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const WriteSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path to the file to write (must be absolute, not relative)",
  }),
  content: Type.String({
    description: "The content to write to the file",
  }),
  append: Type.Optional(
    Type.Boolean({
      description: "If true, append to existing file instead of overwriting",
      default: false,
    }),
  ),
  create_directories: Type.Optional(
    Type.Boolean({
      description: "If true, create parent directories if they don't exist",
      default: true,
    }),
  ),
});

const WriteOutputSchema = Type.Object({
  type: Type.Union([Type.Literal("create"), Type.Literal("update")], {
    description: "Whether a new file was created or an existing file was updated",
  }),
  filePath: Type.String({
    description: "The path to the file that was written",
  }),
  content: Type.String({
    description: "The content that was written to the file",
  }),
  structuredPatch: Type.Array(
    Type.Object({
      old_string: Type.String(),
      new_string: Type.String(),
      old_start_line: Type.Optional(Type.Number()),
      old_end_line: Type.Optional(Type.Number()),
      new_start_line: Type.Optional(Type.Number()),
      new_end_line: Type.Optional(Type.Number()),
    }),
    {
      description: "Diff patch showing the changes",
    },
  ),
  originalFile: Type.Union([Type.String(), Type.Null()], {
    description: "The original file content before the write (null for new files)",
  }),
  gitDiff: Type.Optional(
    Type.Object({
      filename: Type.String(),
      status: Type.Union([Type.Literal("modified"), Type.Literal("added")]),
      additions: Type.Number(),
      deletions: Type.Number(),
      changes: Type.Number(),
      patch: Type.String(),
    }),
    {
      description: "Git diff information",
    },
  ),
});

// ============================================================================
// FILE STATE MANAGEMENT
// ============================================================================

/**
 * Record that a file has been read (for read-before-write enforcement)
 */
export function recordFileRead(
  filePath: string,
  content: string,
  timestamp: number,
  lineEnding?: "\n" | "\r\n",
  encoding?: string,
  mode?: number,
): void {
  readFileState.set(filePath, {
    content,
    timestamp,
    lineEnding,
    encoding,
    mode,
  });
}

/**
 * Get file state for a path
 */
export function getFileState(filePath: string): FileState | undefined {
  return readFileState.get(filePath);
}

/**
 * Update file state after write
 */
export function updateFileState(filePath: string, content: string, timestamp: number): void {
  const existing = readFileState.get(filePath);
  readFileState.set(filePath, {
    ...existing,
    content,
    timestamp,
  });
}

// ============================================================================
// WRITE TOOL IMPLEMENTATION
// ============================================================================

export function createWriteTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Write",
    name: "write",
    description:
      "Write a file to the local filesystem. File must be read first. Creates parent directories by default.",
    parameters: WriteSchema,
    inputParamAliases: {
      filePath: "file_path",
      filepath: "file_path",
      path: "file_path",
      content: "contents",
      text: "content",
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => false,

    async description(params: Record<string, unknown>) {
      const filePath = (params.file_path as string) || "file";
      const append = params.append as boolean;
      return append ? `Appending to ${filePath}` : `Writing ${filePath}`;
    },

    userFacingName() {
      return "Write File";
    },

    /**
     * VALIDATION with Claude Code security checks
     */
    async validateInput({ file_path, content }) {
      const fs = await import("fs");
      const path = await import("path");

      if (!file_path || typeof file_path !== "string") {
        return {
          result: false,
          message: "file_path is required and must be a string",
          errorCode: 1,
        };
      }

      if (content === undefined || content === null) {
        return {
          result: false,
          message: "content is required",
          errorCode: 2,
        };
      }

      const resolved = file_path.startsWith("/") ? file_path : path.join(process.cwd(), file_path);
      const dir = path.dirname(resolved);

      // Check if parent directory exists (if not creating directories)
      try {
        await fs.promises.access(dir, fs.constants.R_OK | fs.constants.W_OK);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          return {
            result: false,
            message: `Parent directory does not exist: ${dir}. Set create_directories: true to create it.`,
            errorCode: 3,
          };
        }
        return {
          result: false,
          message: `Cannot access directory: ${error.message}`,
          errorCode: 4,
        };
      }

      // Check if file exists
      let fileExists = false;
      try {
        await fs.promises.access(resolved, fs.constants.F_OK);
        fileExists = true;
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          return {
            result: false,
            message: `Cannot access file: ${error.message}`,
            errorCode: 5,
          };
        }
      }

      if (fileExists) {
        // CRITICAL: Read-before-write enforcement (from Claude Code line 310732)
        const fileState = getFileState(resolved);
        if (!fileState) {
          return {
            result: false,
            message: "File has not been read yet. Read it first before writing to it.",
            errorCode: 6,
          };
        }

        // CRITICAL: Timestamp validation for external modifications (from Claude Code line 310737)
        const stats = await fs.promises.stat(resolved);
        if (stats.mtimeMs > fileState.timestamp) {
          return {
            result: false,
            message:
              "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.",
            errorCode: 7,
          };
        }

        // Check if file is read-only
        try {
          await fs.promises.access(resolved, fs.constants.W_OK);
        } catch (error: any) {
          if (error.code === "EACCES") {
            return {
              result: false,
              message: `File is read-only: ${file_path}`,
              errorCode: 8,
            };
          }
        }
      }

      return { result: true };
    },

    /**
     * CALL with all Claude Code features
     */
    async call(args, context) {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, "file_path", { required: true });
      const content = readStringParam(params, "content", { required: true });
      const append = readBooleanParam(params, "append") ?? false;
      const createDirectories = readBooleanParam(params, "create_directories") ?? true;

      const fs = await import("fs");
      const path = await import("path");

      const resolved = filePath.startsWith("/") ? filePath : path.join(process.cwd(), filePath);
      const dir = path.dirname(resolved);

      // Check if file exists and get original content
      let fileExists = false;
      let originalContent: string | null = null;
      let originalEncoding = "utf-8";
      let originalLineEnding: "\n" | "\r\n" = "\n";
      let originalMode: number | undefined;

      try {
        await fs.promises.access(resolved, fs.constants.F_OK);
        fileExists = true;

        // Get original file stats
        const stats = await fs.promises.stat(resolved);
        originalMode = stats.mode;

        // Read original content with encoding detection
        const buffer = await fs.promises.readFile(resolved);
        originalEncoding = detectEncoding(buffer);
        originalContent = buffer.toString(originalEncoding);
        originalLineEnding = detectLineEnding(originalContent);

        // Verify read-before-write
        const fileState = getFileState(resolved);
        if (!fileState && fileExists) {
          return jsonResult({
            success: false,
            error: "File has not been read yet. Read it first before writing to it.",
            errorCode: 6,
          });
        }

        // Verify no external modifications
        if (fileState && stats.mtimeMs > fileState.timestamp) {
          return jsonResult({
            success: false,
            error:
              "File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.",
            errorCode: 7,
          });
        }
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          return jsonResult({
            success: false,
            error: `Failed to check file: ${error.message}`,
            errorCode: 5,
          });
        }
      }

      // Create parent directories if needed
      if (createDirectories && !fileExists) {
        try {
          await fs.promises.mkdir(dir, { recursive: true });
        } catch (error: any) {
          return jsonResult({
            success: false,
            error: `Failed to create directories: ${error.message}`,
            errorCode: 10,
          });
        }
      }

      // Prepare content with line ending preservation
      let finalContent = content;
      if (fileExists && originalLineEnding) {
        finalContent = preserveLineEndings(content, originalLineEnding);
      }

      // Atomic write with fallback (from Claude Code lines 404797-404828)
      let tempPath: string | null = null;
      try {
        tempPath = `${resolved}.tmp.${process.pid}.${Date.now()}`;

        // Write to temp file with detected/specified encoding
        await fs.promises.writeFile(tempPath, finalContent, {
          encoding: originalEncoding || "utf-8",
          flag: append ? "a" : "w",
        });

        // Atomic rename
        await fs.promises.rename(tempPath, resolved);
        tempPath = null; // Successfully renamed, no cleanup needed

        // Restore original permissions (from Claude Code lines 404803-404808)
        if (fileExists && originalMode !== undefined) {
          try {
            await fs.promises.chmod(resolved, originalMode);
          } catch (permError) {
            // Log but don't fail - permissions couldn't be restored
            console.warn(`Warning: Could not restore permissions for ${resolved}: ${permError}`);
          }
        }

        // Get final stats
        const stats = await fs.promises.stat(resolved);

        // Update file state tracking
        updateFileState(resolved, content, stats.mtimeMs);

        // Generate Git diff (from Claude Code lines 310807-310825)
        const gitDiff = generateGitDiff(filePath, originalContent, content);

        // Generate structured patch
        const structuredPatch = generateStructuredPatch(originalContent, content);

        // LSP notification (from Claude Code lines 310785-310792)
        try {
          // Notify LSP servers if available
          const lspClient = (context as any)?.lspClient;
          if (lspClient) {
            await lspClient.notifyFileChanged?.(resolved);
            await lspClient.saveFile?.(resolved);
          }
        } catch (lspError) {
          // Log but don't fail - LSP notification failed
          console.warn(`Warning: LSP notification failed for ${resolved}: ${lspError}`);
        }

        // Return structured output (from Claude Code output schema)
        const outputType: "create" | "update" = fileExists ? "update" : "create";

        return jsonResult({
          type: outputType,
          filePath,
          content,
          structuredPatch,
          originalFile: originalContent,
          gitDiff,
          // Legacy fields for backward compatibility
          success: true,
          file_path: filePath,
          bytes_written: content.length,
          file_size: stats.size,
          operation: append ? "append" : "write",
          message: fileExists
            ? `The file ${filePath} has been updated successfully.`
            : `File created successfully at: ${filePath}`,
        });
      } catch (error: any) {
        // Fallback: Try direct write if atomic write fails (from Claude Code lines 404816-404828)
        try {
          if (tempPath) {
            try {
              await fs.promises.unlink(tempPath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }

          // Fallback to direct write
          await fs.promises.writeFile(resolved, finalContent, {
            encoding: originalEncoding || "utf-8",
            flag: append ? "a" : "w",
          });

          const stats = await fs.promises.stat(resolved);
          updateFileState(resolved, content, stats.mtimeMs);

          return jsonResult({
            success: true,
            file_path: filePath,
            bytes_written: content.length,
            file_size: stats.size,
            operation: append ? "append" : "write",
            message: `Wrote ${content.length} bytes to ${filePath} (fallback write)`,
          });
        } catch (fallbackError: any) {
          return jsonResult({
            success: false,
            error: `Failed to write file: ${error.message}${fallbackError ? ` (fallback also failed: ${fallbackError.message})` : ""}`,
            errorCode: error.code === "EACCES" ? 11 : 12,
          });
        }
      }
    },
  };
}

// ============================================================================
// EDIT TOOL (Search and Replace)
// ============================================================================

const EditSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path to the file to edit",
  }),
  old_string: Type.String({
    description: "The text to search for (must match exactly, including whitespace)",
  }),
  new_string: Type.String({
    description: "The text to replace with",
  }),
  multiple_replacements: Type.Optional(
    Type.Boolean({
      description:
        "If true, replace all occurrences. If false (default), error if multiple matches found",
      default: false,
    }),
  ),
});
