import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam, readNumberParam } from "./common.js";
// Import file state tracking from write.ts for read-before-write enforcement
import { recordFileRead } from "./write.js";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const MAX_LINES_DEFAULT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_RESULT_SIZE = 100000; // 100KB
const PDF_MAX_PAGES = 20;
const IMAGE_MAX_SIZE_BYTES = 1024 * 1024; // 1MB for images
const IMAGE_RESIZE_MAX_WIDTH = 800;
const IMAGE_RESIZE_MAX_HEIGHT = 800;
const IMAGE_RESIZE_QUALITY = 80;

// ============================================================================
// BINARY FILE DETECTION (from Claude Code CI8)
// ============================================================================

const BINARY_EXTENSIONS = new Set([
  // Audio formats
  "mp3",
  "wav",
  "flac",
  "ogg",
  "aac",
  "m4a",
  "wma",
  "aiff",
  "opus",
  // Video formats
  "mp4",
  "avi",
  "mov",
  "wmv",
  "flv",
  "mkv",
  "webm",
  "m4v",
  "mpeg",
  "mpg",
  "3gp",
  // Archive formats
  "zip",
  "rar",
  "tar",
  "gz",
  "bz2",
  "7z",
  "xz",
  "z",
  "tgz",
  "iso",
  "jar",
  "war",
  // Executable formats
  "exe",
  "dll",
  "so",
  "dylib",
  "app",
  "msi",
  "deb",
  "rpm",
  "bin",
  "cmd",
  "bat",
  "sh",
  // Database formats
  "db",
  "sqlite",
  "sqlite3",
  "mdb",
  "idx",
  "pdb",
  "frm",
  "myd",
  "myi",
  // Office documents
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "odg",
  "odf",
  // Font formats
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "pfa",
  "pfb",
  // Design files
  "psd",
  "ai",
  "eps",
  "sketch",
  "fig",
  "xd",
  "indd",
  "cdr",
  // 3D formats
  "blend",
  "obj",
  "3ds",
  "max",
  "ma",
  "mb",
  "fbx",
  "stl",
  "ply",
  // Compiled code
  "class",
  "pyc",
  "pyo",
  "pyd",
  "rlib",
  "o",
  "a",
  "lib",
  // Image formats that shouldn't be read as text
  "bmp",
  "tiff",
  "tif",
  "ico",
  "raw",
  "cr2",
  "nef",
  "arw",
  // Other binaries
  "swf",
  "fla",
  "dat",
  "rom",
  "nes",
  "gba",
  "sav",
  // System files
  "sys",
  "drv",
  "vmdk",
  "vdi",
  "qcow2",
]);

// Known text-based formats that might look binary but are safe
const KNOWN_TEXT_FORMATS = new Set([
  "svg",
  "xml",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "md",
  "rst",
  "txt",
  "rtf",
  "html",
  "htm",
  "xhtml",
  "css",
  "scss",
  "sass",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "rb",
  "php",
  "swift",
  "kt",
  "kts",
  "scala",
  "r",
  "R",
  "sql",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "cmd",
  "bat",
  "vim",
  "emacs",
  "lua",
  "pl",
  "pm",
  "t",
  "spec",
  "test",
  "feature",
  "graphql",
  "gql",
  "proto",
  "thrift",
]);

// ============================================================================
// DEVICE FILE DETECTION (from Claude Code BI8/DI8)
// ============================================================================

const DEVICE_FILES = new Set([
  "/dev/zero",
  "/dev/random",
  "/dev/urandom",
  "/dev/full",
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
  "/dev/console",
  "/dev/ptmx",
  "/dev/null",
  "/dev/fd/0",
  "/dev/fd/1",
  "/dev/fd/2",
  "/dev/sda",
  "/dev/sdb",
  "/dev/sdc",
  "/dev/nvme",
  "/dev/mem",
  "/dev/kmem",
  "/dev/port",
]);

function isDeviceFile(filePath: string): boolean {
  // Unix device files
  if (DEVICE_FILES.has(filePath) || filePath.startsWith("/dev/")) {
    return true;
  }
  // Windows device paths
  if (filePath.startsWith("\\\\.\\") || filePath.startsWith("//./")) {
    return true;
  }
  // Linux block devices
  if (/^\/dev\/(sd|nvme|hd|vd)[a-z]/.test(filePath)) {
    return true;
  }
  return false;
}

// ============================================================================
// IMAGE SUPPORT
// ============================================================================

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tiff",
  "tif",
]);

const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
};

// ============================================================================
// FILE TYPE DETECTION
// ============================================================================

const PDF_EXTENSION = "pdf";
const NOTEBOOK_EXTENSION = "ipynb";

function isBinaryFile(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext) && !KNOWN_TEXT_FORMATS.has(ext);
}

function isImageFile(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext);
}

function isPdfFile(ext: string): boolean {
  return ext === PDF_EXTENSION;
}

function isNotebookFile(ext: string): boolean {
  return ext === NOTEBOOK_EXTENSION;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLineWithNumber(line: string, lineNumber: number): string {
  return `${lineNumber.toString().padStart(4, " ")} | ${line}`;
}

function truncateLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) return line;
  return line.substring(0, maxLength) + "... [truncated]";
}

function parsePageRange(pages: string): { firstPage: number; lastPage: number } | null {
  const match = pages.match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return null;

  const firstPage = parseInt(match[1], 10);
  const lastPage = match[2] ? parseInt(match[2], 10) : firstPage;

  if (firstPage < 1 || lastPage < firstPage) return null;
  if (lastPage - firstPage + 1 > PDF_MAX_PAGES) return null;

  return { firstPage, lastPage };
}

// ============================================================================
// SYMLINK RESOLUTION (from Claude Code HI8)
// ============================================================================

async function resolveSymlinks(filePath: string): Promise<string | null> {
  const fs = await import("fs");
  try {
    return await fs.promises.realpath(filePath);
  } catch {
    return null;
  }
}

// ============================================================================
// TYPO SUGGESTIONS (from Claude Code mPR/He)
// ============================================================================

async function findSimilarFiles(filePath: string, cwd: string): Promise<string | null> {
  const fs = await import("fs");
  const path = await import("path");

  const dir = path.dirname(filePath);
  const basename = path.basename(filePath).toLowerCase();

  try {
    const files = await fs.promises.readdir(dir);

    // Simple fuzzy matching - find files with similar names
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const file of files) {
      const lowerFile = file.toLowerCase();
      let score = 0;

      // Exact substring match
      if (lowerFile.includes(basename) || basename.includes(lowerFile)) {
        score = 100;
      }
      // Same extension
      else if (path.extname(file) === path.extname(filePath)) {
        score = 50;
      }
      // Levenshtein-like similarity (simple version)
      else {
        const commonPrefix = basename.split("").filter((c, i) => lowerFile[i] === c).length;
        score = commonPrefix * 10;
      }

      if (score > bestScore && score >= 30) {
        bestScore = score;
        bestMatch = file;
      }
    }

    if (bestMatch) {
      return path.join(dir, bestMatch);
    }
  } catch {
    return null;
  }

  return null;
}

// ============================================================================
// FILE READING FUNCTIONS
// ============================================================================

async function readFileContent(
  filePath: string,
  offset: number,
  limit: number,
  maxLineLength: number,
): Promise<{
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
}> {
  const fs = await import("fs");
  const content = await fs.promises.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const totalLines = lines.length;

  const startIndex = offset - 1;
  const endIndex = Math.min(startIndex + limit, totalLines);
  const selectedLines = lines.slice(startIndex, endIndex);

  let truncated = false;
  const formattedLines = selectedLines.map((line, i) => {
    const truncatedLine = truncateLine(line, maxLineLength);
    if (truncatedLine.length < line.length) truncated = true;
    return formatLineWithNumber(truncatedLine, offset + i);
  });

  return {
    content: formattedLines.join("\n"),
    totalLines,
    startLine: offset,
    endLine: endIndex,
    truncated,
  };
}

async function readImageFile(filePath: string): Promise<{
  type: "image";
  base64: string;
  mediaType: string;
  size: number;
  dimensions?: {
    originalSize: number;
  };
}> {
  const fs = await import("fs");
  const buffer = await fs.promises.readFile(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  return {
    type: "image",
    base64: buffer.toString("base64"),
    mediaType: MEDIA_TYPES[ext] || "application/octet-stream",
    size: buffer.length,
    dimensions: {
      originalSize: buffer.length,
    },
  };
}

async function readNotebook(filePath: string): Promise<{
  type: "notebook";
  cells: Array<{
    cell_type: string;
    source: string;
    outputs?: any[];
    execution_count?: number;
  }>;
  size: number;
}> {
  const fs = await import("fs");
  const content = await fs.promises.readFile(filePath, "utf-8");
  const notebook = JSON.parse(content);

  const cells = notebook.cells.map((cell: any) => ({
    cell_type: cell.cell_type,
    source: Array.isArray(cell.source) ? cell.source.join("") : cell.source,
    outputs: cell.outputs,
    execution_count: cell.execution_count,
  }));

  const stats = await fs.promises.stat(filePath);

  return {
    type: "notebook",
    cells,
    size: stats.size,
  };
}

async function readPdf(
  filePath: string,
  pages?: string,
): Promise<{
  type: "pdf" | "parts";
  file: {
    filePath: string;
    originalSize: number;
    text?: string;
    numpages?: number;
    count?: number;
    message?: string;
  };
}> {
  const fs = await import("fs");
  const stats = await fs.promises.stat(filePath);

  // If pages specified, try to extract specific pages
  if (pages) {
    const range = parsePageRange(pages);
    if (!range) {
      throw new Error(
        `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20".`,
      );
    }

    // Try to use pdf-parse for text extraction from specific pages
    try {
      const pdfParse = await import("pdf-parse");
      const pdfBuffer = await fs.promises.readFile(filePath);
      const data = await pdfParse.default(pdfBuffer, {
        pagerender: (page: any) => {
          // Only render pages in range
          const pageNum = page.pageNumber;
          if (pageNum < range.firstPage || pageNum > range.lastPage) {
            return "";
          }
          return page.getTextContent().then((content: any) => {
            return content.items.map((item: any) => item.str).join(" ");
          });
        },
      });

      return {
        type: "pdf",
        file: {
          filePath,
          originalSize: stats.size,
          text: data.text,
          numpages: range.lastPage - range.firstPage + 1,
          count: range.lastPage - range.firstPage + 1,
        },
      };
    } catch (error: any) {
      // pdf-parse not available or failed
      return {
        type: "pdf",
        file: {
          filePath,
          originalSize: stats.size,
          message: `PDF page extraction requires pdf-parse package. Install with: npm install pdf-parse. Error: ${error.message}`,
        },
      };
    }
  }

  // No pages specified - read entire PDF as text
  try {
    const pdfParse = await import("pdf-parse");
    const pdfBuffer = await fs.promises.readFile(filePath);
    const data = await pdfParse.default(pdfBuffer);

    return {
      type: "pdf",
      file: {
        filePath,
        originalSize: stats.size,
        text: data.text,
        numpages: data.numpages,
      },
    };
  } catch (error: any) {
    // pdf-parse not available
    return {
      type: "pdf",
      file: {
        filePath,
        originalSize: stats.size,
        message:
          "PDF text extraction requires pdf-parse package. Install with: npm install pdf-parse. Alternatively, use pages parameter to extract specific pages as images (requires poppler-utils: apt install poppler-utils or brew install poppler).",
      },
    };
  }
}

// ============================================================================
// MAIN READ TOOL
// ============================================================================

const ReadSchema = Type.Object({
  file_path: Type.String({
    description: "Absolute path to the file to read",
  }),
  offset: Type.Optional(
    Type.Number({
      description: "Line number to start reading from (1-indexed, default: 1)",
      default: 1,
      minimum: 1,
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Maximum number of lines to read (default: 2000)",
      default: 2000,
      minimum: 1,
    }),
  ),
  pages: Type.Optional(
    Type.String({
      description:
        'For PDF files: page range like "1-5", "3", or "10-20" (1-indexed, max 20 pages)',
    }),
  ),
});

export function createReadTool(config?: OpenClawConfig): AnyAgentTool {
  return {
    label: "Read",
    name: "read",
    description:
      "Read a file from the local filesystem. Supports text files, images, PDFs, and Jupyter notebooks.",
    parameters: ReadSchema,
    inputParamAliases: {
      filePath: "file_path",
      filepath: "file_path",
      path: "file_path",
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async description(params: Record<string, unknown>) {
      const filePath = (params.file_path as string) || "file";
      return `Reading ${filePath}`;
    },

    userFacingName() {
      return "Read File";
    },

    async validateInput({ file_path, pages }) {
      const fs = await import("fs");
      const path = await import("path");

      // Check for device files FIRST (security critical)
      if (isDeviceFile(file_path)) {
        return {
          result: false,
          message: `Cannot read '${file_path}': this device file would block or produce infinite output.`,
          errorCode: 9,
        };
      }

      // Validate pages parameter for PDFs
      if (pages !== undefined) {
        const parsed = parsePageRange(String(pages));
        if (!parsed) {
          return {
            result: false,
            message: `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed, max ${PDF_MAX_PAGES} pages.`,
            errorCode: 7,
          };
        }
      }

      // Resolve path
      const resolved = file_path.startsWith("/") ? file_path : path.join(process.cwd(), file_path);

      // Check if file exists
      try {
        await fs.promises.access(resolved, fs.constants.R_OK);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          // Try to find similar files for typo suggestions
          const similar = await findSimilarFiles(file_path, process.cwd());
          let message = `File does not exist: ${file_path}.`;
          if (similar) {
            message += ` Did you mean ${similar}?`;
          }
          return {
            result: false,
            message,
            errorCode: 1,
          };
        }
        return {
          result: false,
          message: `Cannot read file: ${error.message}`,
          errorCode: 2,
        };
      }

      // Check file extension for binary files
      const ext = path.extname(resolved).slice(1).toLowerCase();

      if (isBinaryFile(ext)) {
        return {
          result: false,
          message: `This tool cannot read binary files. The file appears to be a binary ${ext} file. Please use appropriate tools for binary file analysis.`,
          errorCode: 4,
        };
      }

      // Check file size
      const stats = await fs.promises.stat(resolved);
      const maxSize = isImageFile(ext) ? IMAGE_MAX_SIZE_BYTES : MAX_RESULT_SIZE * 10;

      if (stats.size > maxSize) {
        return {
          result: false,
          message: `File too large: ${formatFileSize(stats.size)}. Maximum size is ${formatFileSize(maxSize)}.`,
          errorCode: 3,
        };
      }

      return { result: true };
    },

    async call(args, context) {
      const params = args as Record<string, unknown>;
      const filePath = readStringParam(params, "file_path", { required: true });
      const offset = readNumberParam(params, "offset") || 1;
      const limit = readNumberParam(params, "limit") || MAX_LINES_DEFAULT;
      const pages = readStringParam(params, "pages");

      const fs = await import("fs");
      const path = await import("path");

      const resolved = filePath.startsWith("/") ? filePath : path.join(process.cwd(), filePath);
      const ext = path.extname(resolved).slice(1).toLowerCase();

      try {
        // Handle image files
        if (isImageFile(ext)) {
          const image = await readImageFile(resolved);
          return jsonResult({
            type: "image",
            file: {
              filePath,
              type: image.mediaType,
              base64: image.base64,
              originalSize: image.size,
              dimensions: image.dimensions,
            },
          });
        }

        // Handle PDF files
        if (isPdfFile(ext)) {
          const pdf = await readPdf(resolved, pages || undefined);
          return jsonResult(pdf);
        }

        // Handle Jupyter notebooks
        if (isNotebookFile(ext)) {
          const notebook = await readNotebook(resolved);
          const stats = await fs.promises.stat(resolved);
          // Record file state for write validation
          recordFileRead(resolved, JSON.stringify(notebook.cells, null, 2), stats.mtimeMs);
          return jsonResult({
            type: "notebook",
            file: {
              filePath,
              cells: notebook.cells,
              originalSize: notebook.size,
            },
          });
        }

        // Handle text files
        const result = await readFileContent(resolved, offset, limit, MAX_LINE_LENGTH);
        const stats = await fs.promises.stat(resolved);

        // Record file state for write validation (CRITICAL for read-before-write)
        recordFileRead(resolved, result.content, stats.mtimeMs, detectLineEnding(result.content));

        // Check if result exceeds size limit
        if (result.content.length > MAX_RESULT_SIZE) {
          const truncated = result.content.substring(0, MAX_RESULT_SIZE);
          return jsonResult({
            type: "text",
            file: {
              filePath,
              content: truncated + "\n\n[... content truncated due to size ...]",
              totalLines: result.totalLines,
              startLine: result.startLine,
              endLine: result.endLine,
              originalSize: stats.size,
              truncated: true,
            },
          });
        }

        return jsonResult({
          type: "text",
          file: {
            filePath,
            content: result.content,
            totalLines: result.totalLines,
            startLine: result.startLine,
            endLine: result.endLine,
            originalSize: stats.size,
            truncated: result.truncated,
          },
        });
      } catch (error: any) {
        // Handle ENOENT with symlink resolution and typo suggestions
        if (error.code === "ENOENT") {
          // Try resolving symlinks
          const resolvedPath = await resolveSymlinks(filePath);
          if (resolvedPath && resolvedPath !== filePath) {
            // Retry with resolved path
            return this.call({ ...args, file_path: resolvedPath }, context);
          }

          // Find similar files for suggestions
          const similar = await findSimilarFiles(filePath, process.cwd());
          let message = `File does not exist: ${filePath}.`;
          if (similar) {
            message += ` Did you mean ${similar}?`;
          }
          throw new Error(message);
        }
        throw error;
      }
    },
  };
}
