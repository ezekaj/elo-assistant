/**
 * Enhanced Read Tool
 *
 * Improvements over base read tool:
 * 1. Read caching (LRU cache for repeated reads)
 * 2. Path risk classification
 * 3. Read metrics/statistics
 * 4. Parallel read support
 * 5. Smart encoding detection
 */

import { createHash } from "node:crypto";
import { existsSync, statSync, readFileSync } from "node:fs";
import os from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";

// =============================================================================
// TYPES
// =============================================================================

export type PathRiskLevel = "safe" | "sensitive" | "blocked";

export interface PathRiskClassification {
  level: PathRiskLevel;
  reasons: string[];
  allowed: boolean;
}

export interface ReadMetrics {
  path: string;
  sizeBytes: number;
  readTimeMs: number;
  fromCache: boolean;
  truncated: boolean;
  encoding: string;
}

export interface CacheEntry {
  content: string;
  hash: string;
  timestamp: number;
  sizeBytes: number;
  accessCount: number;
}

export interface ReadEnhancedConfig {
  cacheEnabled?: boolean;
  cacheMaxSize?: number; // Max entries
  cacheMaxBytes?: number; // Max total cache size
  cacheTTLMs?: number; // Time to live
  blockSensitive?: boolean; // Block sensitive paths
  metricsEnabled?: boolean;
}

// =============================================================================
// PATH RISK CLASSIFICATION
// =============================================================================

const BLOCKED_PATHS = [
  /\/etc\/shadow/,
  /\/etc\/passwd/,
  /\.ssh\/id_/,
  /\.aws\/credentials/,
  /\.env$/,
  /\.npmrc$/,
  /\.netrc$/,
  /\.docker\/config\.json/,
  /\.kube\/config/,
  /\.gnupg\//,
  /private[_-]?key/i,
  /secret[_-]?key/i,
];

const SENSITIVE_PATHS = [
  /\.git\/config/,
  /\.gitconfig/,
  /package-lock\.json/,
  /yarn\.lock/,
  /node_modules\//,
  /\.history\//,
  /\.bash_history/,
  /\.zsh_history/,
];

export function classifyPathRisk(filePath: string): PathRiskClassification {
  const normalized = filePath.toLowerCase();
  const reasons: string[] = [];

  // Check blocked patterns
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(normalized)) {
      reasons.push(`matches blocked pattern: ${pattern.source}`);
      return { level: "blocked", reasons, allowed: false };
    }
  }

  // Check sensitive patterns
  for (const pattern of SENSITIVE_PATHS) {
    if (pattern.test(normalized)) {
      reasons.push(`matches sensitive pattern: ${pattern.source}`);
      return { level: "sensitive", reasons, allowed: true };
    }
  }

  return { level: "safe", reasons: ["no sensitive patterns detected"], allowed: true };
}

// =============================================================================
// LRU CACHE
// =============================================================================

class ReadCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private maxBytes: number;
  private ttlMs: number;
  private currentBytes = 0;

  constructor(config: { maxSize?: number; maxBytes?: number; ttlMs?: number } = {}) {
    this.maxSize = config.maxSize || 100;
    this.maxBytes = config.maxBytes || 50 * 1024 * 1024; // 50MB
    this.ttlMs = config.ttlMs || 60000; // 1 minute
  }

  private hashPath(filePath: string): string {
    return createHash("md5").update(filePath).digest("hex");
  }

  private isStale(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.ttlMs;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey);
      if (entry) {
        this.currentBytes -= entry.sizeBytes;
      }
      this.cache.delete(oldestKey);
    }
  }

  get(filePath: string, mtime?: number): CacheEntry | null {
    const key = this.hashPath(filePath);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (this.isStale(entry)) {
      this.cache.delete(key);
      this.currentBytes -= entry.sizeBytes;
      return null;
    }

    // Check if file modified (allow 100ms tolerance for filesystem)
    if (mtime && entry.timestamp < mtime - 100) {
      this.cache.delete(key);
      this.currentBytes -= entry.sizeBytes;
      return null;
    }

    // Update access count and move to end (LRU)
    entry.accessCount++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  set(filePath: string, content: string): void {
    const key = this.hashPath(filePath);
    const sizeBytes = Buffer.byteLength(content, "utf8");

    // Evict if needed
    while (this.cache.size >= this.maxSize || this.currentBytes + sizeBytes > this.maxBytes) {
      if (this.cache.size === 0) break;
      this.evictOldest();
    }

    // Don't cache if single item exceeds max
    if (sizeBytes > this.maxBytes) return;

    const entry: CacheEntry = {
      content,
      hash: createHash("sha256").update(content).digest("hex").slice(0, 16),
      timestamp: Date.now(),
      sizeBytes,
      accessCount: 1,
    };

    this.cache.set(key, entry);
    this.currentBytes += sizeBytes;
  }

  clear(): void {
    this.cache.clear();
    this.currentBytes = 0;
  }

  stats(): { entries: number; bytes: number; maxBytes: number } {
    return {
      entries: this.cache.size,
      bytes: this.currentBytes,
      maxBytes: this.maxBytes,
    };
  }
}

// =============================================================================
// ENCODING DETECTION
// =============================================================================

function detectEncoding(buffer: Buffer): string {
  // Check for BOM
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf-8-bom";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return "utf-16-le";
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return "utf-16-be";
  }

  // Check for binary content
  let nullCount = 0;
  let highByteCount = 0;
  const checkLength = Math.min(buffer.length, 8192);

  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) nullCount++;
    if (buffer[i] > 127) highByteCount++;
  }

  if (nullCount > checkLength * 0.01) {
    return "binary";
  }

  // Likely UTF-8 if high bytes present in valid patterns
  if (highByteCount > 0) {
    return "utf-8";
  }

  return "ascii";
}

// =============================================================================
// ENHANCED READ
// =============================================================================

export class EnhancedRead {
  private cache: ReadCache;
  private config: Required<ReadEnhancedConfig>;
  private metrics: ReadMetrics[] = [];

  constructor(config: ReadEnhancedConfig = {}) {
    this.config = {
      cacheEnabled: config.cacheEnabled ?? true,
      cacheMaxSize: config.cacheMaxSize ?? 100,
      cacheMaxBytes: config.cacheMaxBytes ?? 50 * 1024 * 1024,
      cacheTTLMs: config.cacheTTLMs ?? 60000,
      blockSensitive: config.blockSensitive ?? false,
      metricsEnabled: config.metricsEnabled ?? true,
    };

    this.cache = new ReadCache({
      maxSize: this.config.cacheMaxSize,
      maxBytes: this.config.cacheMaxBytes,
      ttlMs: this.config.cacheTTLMs,
    });
  }

  /**
   * Read a file with caching and risk classification
   */
  read(
    filePath: string,
    options: { offset?: number; limit?: number; skipCache?: boolean } = {},
  ): { content: string; metrics: ReadMetrics; risk: PathRiskClassification } {
    const startTime = Date.now();

    // Risk classification
    const risk = classifyPathRisk(filePath);
    if (risk.level === "blocked" && this.config.blockSensitive) {
      throw new Error(`Read blocked: ${risk.reasons.join(", ")}`);
    }

    // Resolve path
    const absolutePath = this.resolvePath(filePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = statSync(absolutePath);
    const mtime = stat.mtimeMs;

    // Check cache
    let content: string;
    let fromCache = false;

    if (this.config.cacheEnabled && !options.skipCache) {
      const cached = this.cache.get(absolutePath, mtime);
      if (cached) {
        content = cached.content;
        fromCache = true;
      }
    }

    // Read file if not cached
    if (!fromCache) {
      const buffer = readFileSync(absolutePath);
      const encoding = detectEncoding(buffer);

      if (encoding === "binary") {
        throw new Error(`Cannot read binary file: ${filePath}`);
      }

      content = buffer.toString("utf8");

      // Cache it
      if (this.config.cacheEnabled) {
        this.cache.set(absolutePath, content);
      }
    }

    // Apply offset/limit
    let lines = content!.split("\n");
    const totalLines = lines.length;

    if (options.offset && options.offset > 1) {
      const startLine = Math.max(0, options.offset - 1);
      if (startLine >= lines.length) {
        throw new Error(`Offset ${options.offset} is beyond end of file (${lines.length} lines)`);
      }
      lines = lines.slice(startLine);
    }

    if (options.limit !== undefined) {
      if (options.limit <= 0) {
        lines = [];
      } else {
        lines = lines.slice(0, options.limit);
      }
    }

    const result = lines.join("\n");
    const truncated = lines.length < totalLines;

    // Record metrics
    const metrics: ReadMetrics = {
      path: filePath,
      sizeBytes: stat.size,
      readTimeMs: Date.now() - startTime,
      fromCache,
      truncated,
      encoding: detectEncoding(Buffer.from(result)),
    };

    if (this.config.metricsEnabled) {
      this.metrics.push(metrics);
      // Keep last 1000 metrics
      if (this.metrics.length > 1000) {
        this.metrics = this.metrics.slice(-1000);
      }
    }

    return { content: result, metrics, risk };
  }

  /**
   * Read multiple files in parallel
   */
  async readMany(
    paths: string[],
    options: { offset?: number; limit?: number } = {},
  ): Promise<Array<{ path: string; content?: string; error?: string; metrics?: ReadMetrics }>> {
    const results = await Promise.all(
      paths.map(async (path) => {
        try {
          const { content, metrics } = this.read(path, options);
          return { path, content, metrics };
        } catch (e) {
          return { path, error: (e as Error).message };
        }
      }),
    );
    return results;
  }

  /**
   * Resolve path with home directory expansion
   */
  private resolvePath(filePath: string): string {
    let p = filePath;

    // Expand ~
    if (p === "~") {
      return os.homedir();
    }
    if (p.startsWith("~/")) {
      p = join(os.homedir(), p.slice(2));
    }

    // Make absolute
    if (!isAbsolute(p)) {
      p = resolve(process.cwd(), p);
    }

    return p;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; bytes: number; maxBytes: number } {
    return this.cache.stats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get read metrics
   */
  getMetrics(): ReadMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalReads: number;
    cacheHits: number;
    cacheHitRate: number;
    avgReadTimeMs: number;
    totalBytesRead: number;
  } {
    const total = this.metrics.length;
    const cacheHits = this.metrics.filter((m) => m.fromCache).length;
    const avgTime = total > 0 ? this.metrics.reduce((sum, m) => sum + m.readTimeMs, 0) / total : 0;
    const totalBytes = this.metrics.reduce((sum, m) => sum + m.sizeBytes, 0);

    return {
      totalReads: total,
      cacheHits,
      cacheHitRate: total > 0 ? Math.round((cacheHits / total) * 100) : 0,
      avgReadTimeMs: Math.round(avgTime * 100) / 100,
      totalBytesRead: totalBytes,
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default EnhancedRead;
