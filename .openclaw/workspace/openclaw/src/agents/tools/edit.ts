import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readBooleanParam } from "./common.js";
// Import file state tracking and write tool for integration
import {
  recordFileRead,
  getFileState,
  updateFileState,
  generateGitDiff,
  generateStructuredPatch,
} from "./write.js";

// ============================================================================
// SMART QUOTE HANDLING (from Claude Code)
// ============================================================================

// Smart quote characters (Unicode escape sequences)
const SMART_QUOTES: Record<string, string> = {
  "\u201C": '"', // U+201C LEFT DOUBLE QUOTATION MARK
  "\u201D": '"', // U+201D RIGHT DOUBLE QUOTATION MARK
  "\u2018": "'", // U+2018 LEFT SINGLE QUOTATION MARK
  "\u2019": "'", // U+2019 RIGHT SINGLE QUOTATION MARK
  "\u2013": "-", // U+2013 EN DASH
  "\u2014": "-", // U+2014 EM DASH
  "\u2026": "...", // U+2026 HORIZONTAL ELLIPSIS
};

// Quote-like characters that need special handling
const SMART_DOUBLE_QUOTES = ["\u201C", "\u201D"];
const SMART_SINGLE_QUOTES = ["\u2018", "\u2019"];

/**
 * Normalize smart quotes to regular ASCII quotes
 */
function normalizeQuotes(str: string): string {
  return str.replace(
    /[\u201C\u201D\u2018\u2019\u2013\u2014\u2026]/g,
    (match) => SMART_QUOTES[match] || match,
  );
}

/**
 * Check if character is whitespace or punctuation that allows quote insertion
 */
function isQuoteBoundaryChar(char: string): boolean {
  return (
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === "(" ||
    char === "[" ||
    char === "{" ||
    char === '"' ||
    char === "'"
  );
}

/**
 * Handle smart double quotes in search string
 */
function normalizeSmartDoubleQuotes(str: string): string {
  let result = "";
  let inWord = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";
    const nextChar = i < str.length - 1 ? str[i + 1] : "";

    if (char === "\u201C" || char === "\u201D") {
      // Determine if this is an opening or closing quote
      const isOpening = isQuoteBoundaryChar(prevChar) && !isQuoteBoundaryChar(nextChar);
      result += isOpening ? "\u201C" : "\u201D";
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Handle smart single quotes/apostrophes in search string
 */
function normalizeSmartSingleQuotes(str: string): string {
  let result = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : "";
    const nextChar = i < str.length - 1 ? str[i + 1] : "";

    if (char === "\u2018" || char === "\u2019") {
      // Check if this is an apostrophe (between letters) or a quote
      const isPrevLetter = /\p{L}/u.test(prevChar);
      const isNextLetter = /\p{L}/u.test(nextChar);

      if (isPrevLetter && isNextLetter) {
        // This is an apostrophe within a word (e.g., "don't")
        result += "\u2019";
      } else {
        // This is a quotation mark
        result += "\u2018";
      }
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Find string in content with smart quote normalization
 * Returns the actual matched substring from content (preserving original quotes)
 */
function findStringWithQuoteNormalization(content: string, searchString: string): string | null {
  // Try exact match first (fast path)
  if (content.includes(searchString)) {
    return searchString;
  }

  // Try with normalized quotes in both content and search
  const normalizedSearch = normalizeQuotes(searchString);
  const normalizedContent = normalizeQuotes(content);

  if (normalizedContent.includes(normalizedSearch)) {
    // Find position in normalized content
    const normalizedIndex = normalizedContent.indexOf(normalizedSearch);

    // Return the original substring from content at that position
    return content.substring(normalizedIndex, normalizedIndex + searchString.length);
  }

  // Try with smart double quote handling
  const doubleQuoteNormalizedSearch = normalizeSmartDoubleQuotes(searchString);
  if (doubleQuoteNormalizedSearch !== searchString) {
    if (content.includes(doubleQuoteNormalizedSearch)) {
      return doubleQuoteNormalizedSearch;
    }
  }

  // Try with smart single quote handling
  const singleQuoteNormalizedSearch = normalizeSmartSingleQuotes(searchString);
  if (singleQuoteNormalizedSearch !== searchString) {
    if (content.includes(singleQuoteNormalizedSearch)) {
      return singleQuoteNormalizedSearch;
    }
  }

  return null;
}

// ============================================================================
// LINE ENDING HANDLING (from Claude Code)
// ============================================================================

/**
 * Detect the line ending style used in content
 */
function detectLineEnding(content: string): "\n" | "\r\n" {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/\n/g) || []).length - crlfCount;
  return crlfCount > lfCount ? "\r\n" : "\n";
}

/**
 * Preserve original line endings when applying edits
 */
function preserveLineEndings(content: string, originalEnding: "\n" | "\r\n"): string {
  // Normalize all line endings to LF first
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Convert to original line ending if needed
  if (originalEnding === "\r\n") {
    return normalized.replace(/\n/g, "\r\n");
  }

  return normalized;
}

// ============================================================================
// ENCODING DETECTION (from Claude Code)
// ============================================================================

/**
 * Detect file encoding from buffer (checks for BOM markers)
 */
function detectEncoding(buffer: Buffer): string {
  if (buffer.length >= 2) {
    // UTF-16 LE BOM (FF FE)
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return "utf-16le";
    }
    // UTF-16 BE BOM (FE FF)
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return "utf-16be";
    }
    // UTF-8 BOM (EF BB BF)
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return "utf-8";
    }
  }
  // Default to UTF-8
  return "utf-8";
}

// ============================================================================
// EDIT OPERATIONS
// ============================================================================

interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface EditResult {
  success: boolean;
  error?: string;
  error_code?: string | number;
  filePath?: string;
  edits?: EditOperation[];
  originalFile?: string | null;
  updatedFile?: string;
  structuredPatch?: Array<{
    old_string: string;
    new_string: string;
    old_start_line?: number;
    old_end_line?: number;
    new_start_line?: number;
    new_end_line?: number;
  }>;
  gitDiff?: {
    filename: string;
    status: "modified" | "added";
    additions: number;
    deletions: number;
    changes: number;
    patch: string;
  };
  userModified?: boolean;
  replaceAll?: boolean;
  // Legacy fields for backward compatibility
  file_path?: string;
  oldString?: string;
  newString?: string;
  message?: string;
}

// ============================================================================
// ERROR CODES (matching Claude Code)
// ============================================================================

const EDIT_ERROR_CODES = {
  NO_CHANGES: 1, // old_string === new_string
  PERMISSION_DENIED: 2, // File in denied directory
  FILE_EXISTS: 3, // Cannot create (already exists)
  FILE_NOT_FOUND: 4, // File doesn't exist
  NOTEBOOK_FILE: 5, // Use NotebookEdit for .ipynb
  NOT_READ: 6, // File not read yet
  FILE_MODIFIED: 7, // File modified externally
  STRING_NOT_FOUND: 8, // old_string not in file
  MULTIPLE_OCCURRENCES: 9, // Multiple matches, replace_all=false
  EDIT_CONFLICT: 10, // Overlapping edits
  INVALID_SEQUENCE: 11, // Invalid edit sequence
  ENCODING_FAILED: 12, // Encoding detection failed
  LINE_ENDING_FAILED: 13, // Line ending preservation failed
  LSP_FAILED: 14, // LSP notification failed
  GIT_DIFF_FAILED: 15, // Git diff generation failed
} as const;

// ============================================================================
// STRING MATCHING WITH QUOTE NORMALIZATION
// ============================================================================

/**
 * Find and replace string with smart quote handling
 */
function applyEditWithQuoteNormalization(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): { success: boolean; content?: string; error?: string } {
  // Find the actual string in content (with quote normalization)
  const matchedString = findStringWithQuoteNormalization(content, oldString);

  if (!matchedString) {
    return {
      success: false,
      error: `String not found in file: "${oldString.substring(0, 100)}${oldString.length > 100 ? "..." : ""}"`,
    };
  }

  // Count occurrences
  const occurrences = content.split(matchedString).length - 1;

  if (occurrences === 0) {
    return {
      success: false,
      error: "String not found in file",
    };
  }

  if (occurrences > 1 && !replaceAll) {
    return {
      success: false,
      error: `Found ${occurrences} occurrences. Use replace_all: true to replace all, or make old_string more specific.`,
    };
  }

  // Apply replacement
  const newContent = replaceAll
    ? content.split(matchedString).join(newString)
    : content.replace(matchedString, newString);

  return {
    success: true,
    content: newContent,
  };
}

/**
 * Apply multiple edits sequentially with conflict detection
 */
function applyMultipleEdits(
  content: string,
  edits: EditOperation[],
): { success: boolean; content?: string; error?: string } {
  let currentContent = content;
  const appliedEdits: string[] = [];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];

    // Check for edit conflicts (new_string containing old_string of subsequent edits)
    for (let j = i + 1; j < edits.length; j++) {
      if (appliedEdits.includes(edit.new_string) && edit.new_string.includes(edits[j].old_string)) {
        return {
          success: false,
          error: `Edit conflict: Edit ${i + 1} creates content that conflicts with edit ${j + 1}`,
        };
      }
    }

    const result = applyEditWithQuoteNormalization(
      currentContent,
      edit.old_string,
      edit.new_string,
      edit.replace_all ?? false,
    );

    if (!result.success) {
      return result;
    }

    currentContent = result.content!;
    appliedEdits.push(edit.new_string);
  }

  return {
    success: true,
    content: currentContent,
  };
}

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const SingleEditSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path to the file to edit (must be absolute, not relative)",
  }),
  old_string: Type.String({
    description:
      "The text to search for (must match exactly, including whitespace). Smart quotes are automatically normalized.",
  }),
  new_string: Type.String({
    description: "The text to replace with",
  }),
  replace_all: Type.Optional(
    Type.Boolean({
      description: "Replace all occurrences of old_string (default false)",
      default: false,
    }),
  ),
});

const MultiEditSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path to the file to edit (must be absolute, not relative)",
  }),
  edits: Type.Array(
    Type.Object({
      old_string: Type.String({
        description: "The text to search for",
      }),
      new_string: Type.String({
        description: "The text to replace with",
      }),
      replace_all: Type.Optional(
        Type.Boolean({
          description: "Replace all occurrences (default false)",
          default: false,
        }),
      ),
    }),
    {
      description: "Array of edits to apply sequentially",
    },
  ),
});

// Union schema supporting both single edit and multi-edit
const EditSchema = Type.Union([SingleEditSchema, MultiEditSchema]);

const EditOutputSchema = Type.Object({
  type: Type.Union([Type.Literal("create"), Type.Literal("update")], {
    description: "Whether a new file was created or an existing file was updated",
  }),
  filePath: Type.String({
    description: "The path to the file that was edited",
  }),
  oldString: Type.Optional(
    Type.String({
      description: "The original string that was replaced (single edit mode)",
    }),
  ),
  newString: Type.Optional(
    Type.String({
      description: "The new string that replaced the old (single edit mode)",
    }),
  ),
  edits: Type.Optional(
    Type.Array(
      Type.Object({
        old_string: Type.String(),
        new_string: Type.String(),
        replace_all: Type.Optional(Type.Boolean()),
      }),
    ),
    {
      description: "Array of edits that were applied (multi-edit mode)",
    },
  ),
  originalFile: Type.Union([Type.String(), Type.Null()], {
    description: "The original file content before the edit",
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
  userModified: Type.Optional(
    Type.Boolean({
      description: "Whether the user modified the proposed changes",
    }),
  ),
  replaceAll: Type.Optional(
    Type.Boolean({
      description: "Whether all occurrences were replaced",
    }),
  ),
});

// ============================================================================
// EDIT TOOL IMPLEMENTATION
// ============================================================================

export function createEditTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Edit",
    name: "edit",
    description:
      "Edit a file by searching for text and replacing it. Supports smart quote normalization, multiple edits, and preserves line endings and encoding. File must be read first.",
    parameters: EditSchema,
    inputParamAliases: {
      filePath: "file_path",
      filepath: "file_path",
      path: "file_path",
      oldString: "old_string",
      newString: "new_string",
      search: "old_string",
      replace: "new_string",
      replacement: "new_string",
      edits: "edits",
    },
    isReadOnly: () => false,
    isConcurrencySafe: () => false,

    async description(params: Record<string, unknown>) {
      const filePath = (params as any).file_path || "file";
      const edits = (params as any).edits;
      const editCount = edits ? edits.length : 1;
      return `Editing ${filePath} (${editCount} edit${editCount > 1 ? "s" : ""})`;
    },

    userFacingName() {
      return "Edit File";
    },

    /**
     * VALIDATION with all Claude Code security checks
     */
    async validateInput(params: Record<string, unknown>) {
      const fs = await import("fs");
      const path = await import("path");

      // Determine if single edit or multi-edit
      const isMultiEdit = params.edits && Array.isArray(params.edits);
      const edits: EditOperation[] = isMultiEdit
        ? (params.edits as EditOperation[])
        : [
            {
              old_string: params.old_string as string,
              new_string: params.new_string as string,
              replace_all: (params.replace_all as boolean) ?? false,
            },
          ];

      const filePath = params.file_path as string;

      // Validate basic parameters
      if (!filePath || typeof filePath !== "string") {
        return {
          result: false,
          message: "file_path is required and must be a string",
          errorCode: EDIT_ERROR_CODES.NOT_READ,
        };
      }

      // Validate edits
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];

        if (!edit.old_string || typeof edit.old_string !== "string") {
          return {
            result: false,
            message: `Edit ${i + 1}: old_string is required`,
            errorCode: EDIT_ERROR_CODES.INVALID_SEQUENCE,
          };
        }

        if (edit.new_string === undefined || edit.new_string === null) {
          return {
            result: false,
            message: `Edit ${i + 1}: new_string is required`,
            errorCode: EDIT_ERROR_CODES.INVALID_SEQUENCE,
          };
        }

        // Check for no-op edits
        if (edit.old_string === edit.new_string) {
          return {
            result: false,
            message: `Edit ${i + 1}: No changes to make: old_string and new_string are exactly the same.`,
            errorCode: EDIT_ERROR_CODES.NO_CHANGES,
          };
        }
      }

      const resolved = path.resolve(filePath);

      // Check if file is a notebook
      if (resolved.endsWith(".ipynb")) {
        return {
          result: false,
          message: "File is a Jupyter Notebook. Use the NotebookEdit tool to edit this file.",
          errorCode: EDIT_ERROR_CODES.NOTEBOOK_FILE,
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
            errorCode: EDIT_ERROR_CODES.FILE_NOT_FOUND,
          };
        }
      }

      if (!fileExists) {
        // Special case: creating new file with empty old_string
        if (edits.length === 1 && edits[0].old_string === "") {
          return { result: true };
        }

        return {
          result: false,
          message: `File does not exist: ${filePath}`,
          errorCode: EDIT_ERROR_CODES.FILE_NOT_FOUND,
        };
      }

      // Check read-before-edit
      const fileState = getFileState(resolved);
      if (!fileState) {
        return {
          result: false,
          message: "File has not been read yet. Read it first before editing.",
          errorCode: EDIT_ERROR_CODES.NOT_READ,
          meta: {
            isFilePathAbsolute: String(path.isAbsolute(filePath)),
          },
        };
      }

      // Check for external modifications
      const stats = await fs.promises.stat(resolved);
      if (stats.mtimeMs > fileState.timestamp) {
        // Check if content actually changed (tolerate timestamp changes)
        const currentContent = await fs.promises.readFile(resolved, "utf-8");
        if (currentContent !== fileState.content) {
          return {
            result: false,
            message:
              "File has been modified since read, either by the user or by a linter. Read it again before attempting to edit.",
            errorCode: EDIT_ERROR_CODES.FILE_MODIFIED,
          };
        }
      }

      // Verify strings can be found (with quote normalization)
      const originalContent = fileState.content;
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        const matchedString = findStringWithQuoteNormalization(originalContent, edit.old_string);

        if (!matchedString) {
          return {
            result: false,
            message: `Edit ${i + 1}: String to replace not found in file.\nString: ${edit.old_string.substring(0, 200)}${edit.old_string.length > 200 ? "..." : ""}`,
            errorCode: EDIT_ERROR_CODES.STRING_NOT_FOUND,
            meta: {
              isFilePathAbsolute: String(path.isAbsolute(filePath)),
              editIndex: i,
            },
          };
        }

        // Check for multiple occurrences
        const occurrences = originalContent.split(matchedString).length - 1;
        if (occurrences > 1 && !(edit.replace_all ?? false)) {
          return {
            result: false,
            message: `Edit ${i + 1}: Found ${occurrences} occurrences of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${edit.old_string.substring(0, 200)}${edit.old_string.length > 200 ? "..." : ""}`,
            errorCode: EDIT_ERROR_CODES.MULTIPLE_OCCURRENCES,
            meta: {
              isFilePathAbsolute: String(path.isAbsolute(filePath)),
              actualOldString: matchedString,
              occurrences,
            },
          };
        }
      }

      return {
        result: true,
        meta: {
          actualOldStrings: edits.map((e) =>
            findStringWithQuoteNormalization(originalContent, e.old_string),
          ),
        },
      };
    },

    /**
     * CALL with all Claude Code features
     */
    async call(params: Record<string, unknown>, context: any) {
      const fs = await import("fs");
      const path = await import("path");

      // Determine if single edit or multi-edit
      const isMultiEdit = params.edits && Array.isArray(params.edits);
      const edits: EditOperation[] = isMultiEdit
        ? (params.edits as EditOperation[])
        : [
            {
              old_string: params.old_string as string,
              new_string: params.new_string as string,
              replace_all: (params.replace_all as boolean) ?? false,
            },
          ];

      const filePath = params.file_path as string;
      const resolved = path.resolve(filePath);

      // Get file state (must have been read first)
      const fileState = getFileState(resolved);
      if (!fileState) {
        return jsonResult({
          success: false,
          error: "File has not been read yet. Read it first before editing.",
          errorCode: EDIT_ERROR_CODES.NOT_READ,
        });
      }

      // Check for external modifications
      const stats = await fs.promises.stat(resolved);
      if (stats.mtimeMs > fileState.timestamp) {
        const currentContent = await fs.promises.readFile(resolved, "utf-8");
        if (currentContent !== fileState.content) {
          return jsonResult({
            success: false,
            error:
              "File has been modified since read, either by the user or by a linter. Read it again before attempting to edit.",
            errorCode: EDIT_ERROR_CODES.FILE_MODIFIED,
          });
        }
      }

      const originalContent = fileState.content;
      const originalEncoding = fileState.encoding || "utf-8";
      const originalLineEnding = fileState.lineEnding || detectLineEnding(originalContent);

      // Apply all edits with quote normalization
      const editResult = applyMultipleEdits(originalContent, edits);

      if (!editResult.success) {
        return jsonResult({
          success: false,
          error: editResult.error,
          errorCode: editResult.error?.includes("conflict")
            ? EDIT_ERROR_CODES.EDIT_CONFLICT
            : EDIT_ERROR_CODES.STRING_NOT_FOUND,
        });
      }

      let newContent = editResult.content!;

      // Preserve line endings
      try {
        newContent = preserveLineEndings(newContent, originalLineEnding);
      } catch (lineEndingError) {
        console.warn("Line ending preservation failed:", lineEndingError);
        // Continue without line ending preservation
      }

      // Write the edited content using write tool's atomic write
      try {
        const tempPath = `${resolved}.tmp.${process.pid}.${Date.now()}`;

        await fs.promises.writeFile(tempPath, newContent, {
          encoding: originalEncoding,
        });

        await fs.promises.rename(tempPath, resolved);

        // Restore permissions if file existed
        if (fileState.mode !== undefined) {
          try {
            await fs.promises.chmod(resolved, fileState.mode);
          } catch (permError) {
            console.warn("Could not restore permissions:", permError);
          }
        }

        // Update file state
        const newStats = await fs.promises.stat(resolved);
        updateFileState(resolved, newContent, newStats.mtimeMs);

        // Generate Git diff
        let gitDiff;
        try {
          gitDiff = generateGitDiff(filePath, originalContent, newContent);
        } catch (gitError) {
          console.warn("Git diff generation failed:", gitError);
        }

        // Generate structured patch
        const structuredPatch = generateStructuredPatch(originalContent, newContent);

        // LSP notification
        try {
          const lspClient = context?.lspClient;
          if (lspClient) {
            await lspClient.notifyFileChanged?.(resolved);
            await lspClient.saveFile?.(resolved);
          }
        } catch (lspError) {
          console.warn("LSP notification failed:", lspError);
        }

        // Build output
        const output: EditResult = {
          type: "update",
          filePath,
          originalFile: originalContent,
          structuredPatch,
          userModified: false,
          replaceAll: edits.some((e) => e.replace_all),
          // Legacy fields for backward compatibility
          file_path: filePath,
          message: `The file ${filePath} has been updated successfully.`,
        };

        if (isMultiEdit) {
          output.edits = edits;
        } else {
          output.oldString = edits[0].old_string;
          output.newString = edits[0].new_string;
        }

        if (gitDiff) {
          output.gitDiff = gitDiff;
        }

        return jsonResult(output);
      } catch (writeError: any) {
        return jsonResult({
          success: false,
          error: `Failed to write edited file: ${writeError.message}`,
          errorCode: EDIT_ERROR_CODES.LSP_FAILED,
        });
      }
    },
  };
}

// ============================================================================
// EXPORT HELPER FUNCTIONS FOR TESTING
// ============================================================================

export {
  normalizeQuotes,
  detectLineEnding,
  preserveLineEndings,
  detectEncoding,
  findStringWithQuoteNormalization,
  applyEditWithQuoteNormalization,
  applyMultipleEdits,
  EDIT_ERROR_CODES,
};
