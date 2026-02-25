/**
 * Native Module System for OpenClaw
 *
 * Provides a unified interface for native modules with automatic fallback
 * to pure JavaScript/TypeScript implementations when native modules are unavailable.
 */

/**
 * Base interface for all native module implementations
 */
export interface NativeModule<T extends Record<string, unknown>> {
  /** Module name identifier */
  name: string;
  /** Whether this is using native implementation or fallback */
  isNative: boolean;
  /** Implementation object */
  implementation: T;
  /** Error message if native module failed to load */
  loadError?: string;
}

/**
 * Configuration for native module loading
 */
export interface NativeModuleConfig {
  /** Module name */
  name: string;
  /** Path to native .node file (if available) */
  nativePath?: string;
  /** Fallback implementation factory */
  fallbackFactory: () => Promise<Record<string, unknown>>;
  /** Native implementation factory (if available) */
  nativeFactory?: () => Promise<Record<string, unknown>>;
  /** Whether to prefer native over fallback */
  preferNative?: boolean;
  /** Timeout for native module loading in ms */
  loadTimeout?: number;
}

/**
 * Result of attempting to load a native module
 */
export interface LoadResult<T extends Record<string, unknown>> {
  /** Loaded module */
  module: NativeModule<T> | null;
  /** Whether native implementation was loaded */
  isNative: boolean;
  /** Error if loading failed completely */
  error?: string;
}

/**
 * Ripgrep search options
 */
export interface RipgrepOptions {
  /** Pattern to search for */
  pattern: string;
  /** Directory to search in */
  path: string;
  /** File glob pattern (e.g., "*.ts") */
  glob?: string;
  /** Ignore glob pattern */
  ignore?: string;
  /** Case insensitive search */
  caseInsensitive?: boolean;
  /** Include line numbers */
  lineNumbers?: boolean;
  /** Include file names only */
  filesWithMatches?: boolean;
  /** Max depth of directory traversal */
  maxDepth?: number;
  /** Max results to return */
  maxResults?: number;
  /** Context lines before match */
  beforeContext?: number;
  /** Context lines after match */
  afterContext?: number;
}

/**
 * Single ripgrep match result
 */
export interface RipgrepMatch {
  /** File path */
  path: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Matched text */
  text: string;
  /** Submatches within the line */
  submatches?: Array<{
    start: number;
    end: number;
  }>;
}

/**
 * Ripgrep search results
 */
export interface RipgrepResult {
  /** All matches */
  matches: RipgrepMatch[];
  /** Files searched */
  filesSearched: number;
  /** Total matches found */
  totalMatches: number;
  /** Whether search was truncated due to maxResults */
  truncated: boolean;
  /** Time taken in milliseconds */
  elapsedMs: number;
}

/**
 * Image processing options
 */
export interface ImageProcessOptions {
  /** Input image buffer or path */
  input: Buffer | string;
  /** Output format (optional) */
  format?: "png" | "jpeg" | "webp" | "gif" | "avif";
  /** Resize width */
  width?: number;
  /** Resize height */
  height?: number;
  /** Resize fit mode */
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  /** Quality for lossy formats (1-100) */
  quality?: number;
  /** Extract region (left, top, width, height) */
  extract?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  /** Rotate image (degrees) */
  rotate?: number;
  /** Flip vertically */
  flip?: boolean;
  /** Flip horizontally */
  flop?: boolean;
  /** Blur radius (0.3 - 1000) */
  blur?: number;
  /** Grayscale conversion */
  grayscale?: boolean;
  /** Output path (if string input, writes to this path) */
  outputPath?: string;
}

/**
 * Image processing result
 */
export interface ImageProcessResult {
  /** Processed image buffer */
  buffer: Buffer;
  /** Output format */
  format: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** File size in bytes */
  size: number;
  /** Processing time in milliseconds */
  elapsedMs: number;
  /** Metadata from sharp */
  metadata?: {
    format?: string;
    size?: number;
    width?: number;
    height?: number;
    space?: string;
    channels?: number;
    hasAlpha?: boolean;
  };
}

/**
 * File index entry
 */
export interface FileIndexEntry {
  /** Absolute file path */
  path: string;
  /** File name */
  name: string;
  /** File extension */
  extension: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  mtime: number;
  /** Whether it's a directory */
  isDirectory: boolean;
  /** Fuzzy search score (higher is better) */
  score?: number;
}

/**
 * File index build options
 */
export interface FileIndexBuildOptions {
  /** Root directory to index */
  root: string;
  /** Include glob patterns */
  include?: string[];
  /** Exclude glob patterns */
  exclude?: string[];
  /** Max depth of directory traversal */
  maxDepth?: number;
  /** Max file size to include (bytes) */
  maxFileSize?: number;
  /** Include hidden files */
  includeHidden?: boolean;
  /** Follow symlinks */
  followSymlinks?: boolean;
}

/**
 * File index search options
 */
export interface FileIndexSearchOptions {
  /** Query string for fuzzy search */
  query: string;
  /** Max results to return */
  maxResults?: number;
  /** Minimum score threshold (0-1) */
  minScore?: number;
  /** Filter by file extension */
  extension?: string;
  /** Filter by file type (file|directory) */
  type?: "file" | "directory";
}

/**
 * File index search result
 */
export interface FileIndexSearchResult {
  /** Matching entries */
  entries: FileIndexEntry[];
  /** Total matches before limiting */
  totalMatches: number;
  /** Search time in milliseconds */
  elapsedMs: number;
  /** Index size (number of files) */
  indexSize: number;
}

/**
 * Syntax highlighting options
 */
export interface HighlightOptions {
  /** Source code to highlight */
  code: string;
  /** Language identifier (e.g., "typescript", "python") */
  language: string;
  /** Theme name (e.g., "github-dark", "one-dark") */
  theme?: string;
  /** Include line numbers */
  lineNumbers?: boolean;
  /** Starting line number */
  lineStart?: number;
  /** Output format */
  format?: "html" | "ansi" | "terminal";
  /** Wrap long lines */
  wrap?: boolean;
}

/**
 * Diff highlighting options
 */
export interface DiffHighlightOptions {
  /** Unified diff text */
  diff: string;
  /** Language for syntax highlighting */
  language?: string;
  /** Theme name */
  theme?: string;
  /** Output format */
  format?: "html" | "ansi" | "terminal";
  /** Show line numbers */
  lineNumbers?: boolean;
  /** Highlight only changed lines */
  highlightChanges?: boolean;
}

/**
 * Highlighted output
 */
export interface HighlightResult {
  /** Highlighted code */
  code: string;
  /** Language detected/used */
  language: string;
  /** Theme used */
  theme: string;
  /** Output format */
  format: string;
  /** Processing time in milliseconds */
  elapsedMs: number;
}

/**
 * Native module registry for tracking loaded modules
 */
export interface NativeModuleRegistry {
  /** Get loaded module by name */
  get<T extends Record<string, unknown>>(name: string): NativeModule<T> | undefined;
  /** Check if module is loaded */
  has(name: string): boolean;
  /** Get all loaded module names */
  keys(): string[];
  /** Get module statistics */
  stats(): {
    total: number;
    native: number;
    fallback: number;
  };
}
