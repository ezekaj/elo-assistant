/**
 * OpenClaw Memory Enhancements - Auto-Index File Watcher
 *
 * Watches configured directories for file changes and triggers automatic indexing.
 * Uses chokidar for cross-platform file watching with debouncing.
 */
import { watch } from "chokidar";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { DEFAULT_AUTO_INDEX_CONFIG, resolveUserPath } from "./config.js";
// ============================================================================
// AutoIndexer Class
// ============================================================================
export class AutoIndexer {
    config;
    watcher = null;
    pendingChanges = new Map();
    fileHashes = new Map();
    indexCallback = null;
    eventHandlers = new Set();
    stats = {
        filesWatched: 0,
        filesIndexed: 0,
        pendingChanges: 0,
    };
    isRunning = false;
    constructor(config = {}) {
        this.config = { ...DEFAULT_AUTO_INDEX_CONFIG, ...config };
    }
    // ==========================================================================
    // Lifecycle Methods
    // ==========================================================================
    /**
     * Start watching configured directories
     */
    async start(callback) {
        if (this.isRunning) {
            console.warn("AutoIndexer already running");
            return;
        }
        if (!this.config.enabled) {
            console.log("AutoIndexer disabled in configuration");
            return;
        }
        this.indexCallback = callback;
        // Resolve watch paths
        const watchPaths = this.config.watchPaths.map((p) => resolveUserPath(p));
        // Initialize chokidar watcher
        this.watcher = watch(watchPaths, {
            ignored: this.config.ignorePatterns,
            persistent: true,
            ignoreInitial: false, // Process existing files on startup
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100,
            },
            followSymlinks: false,
            depth: 10, // Reasonable depth limit
        });
        // Set up event handlers
        this.watcher
            .on("add", (path) => this.handleFileEvent("add", path))
            .on("change", (path) => this.handleFileEvent("change", path))
            .on("unlink", (path) => this.handleFileEvent("unlink", path))
            .on("ready", () => this.handleReady())
            .on("error", (error) => this.handleError(error));
        this.isRunning = true;
        console.log(`AutoIndexer started, watching: ${watchPaths.join(", ")}`);
    }
    /**
     * Stop watching and clean up
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        // Clear pending timeouts
        for (const pending of this.pendingChanges.values()) {
            clearTimeout(pending.timeoutId);
        }
        this.pendingChanges.clear();
        // Close watcher
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        this.isRunning = false;
        console.log("AutoIndexer stopped");
    }
    /**
     * Check if indexer is running
     */
    isActive() {
        return this.isRunning;
    }
    // ==========================================================================
    // Event Handlers
    // ==========================================================================
    /**
     * Handle file system events
     */
    handleFileEvent(type, path) {
        // Filter by extension
        if (!this.isIndexableFile(path)) {
            return;
        }
        const change = {
            type,
            path: resolve(path),
            timestamp: Date.now(),
        };
        // Emit to event handlers
        for (const handler of this.eventHandlers) {
            try {
                handler(change);
            }
            catch (error) {
                console.error(`Event handler error: ${error}`);
            }
        }
        // Debounce and queue for indexing
        this.queueChange(change);
    }
    /**
     * Handle watcher ready event
     */
    handleReady() {
        const watched = this.watcher?.getWatched() || {};
        let fileCount = 0;
        for (const dir of Object.keys(watched)) {
            fileCount += watched[dir].length;
        }
        this.stats.filesWatched = fileCount;
        console.log(`AutoIndexer ready, watching ${fileCount} files`);
    }
    /**
     * Handle watcher errors
     */
    handleError(error) {
        console.error(`AutoIndexer error: ${error.message}`);
    }
    // ==========================================================================
    // Change Processing
    // ==========================================================================
    /**
     * Check if a file should be indexed
     */
    isIndexableFile(path) {
        const ext = extname(path).toLowerCase();
        return this.config.extensions.includes(ext);
    }
    /**
     * Queue a change with debouncing
     */
    queueChange(change) {
        const existing = this.pendingChanges.get(change.path);
        // Clear existing timeout
        if (existing) {
            clearTimeout(existing.timeoutId);
        }
        // Determine final change type
        let finalType = change.type;
        if (existing) {
            // If we had an add followed by change, keep as add
            if (existing.type === "add" && change.type === "change") {
                finalType = "add";
            }
            // If we had add/change followed by unlink, it's unlink
            if (change.type === "unlink") {
                finalType = "unlink";
            }
        }
        // Set debounce timeout
        const timeoutId = setTimeout(() => this.processChange(change.path), this.config.debounceMs);
        this.pendingChanges.set(change.path, {
            type: finalType,
            path: change.path,
            timestamp: change.timestamp,
            timeoutId,
        });
        this.stats.pendingChanges = this.pendingChanges.size;
    }
    /**
     * Process a debounced change
     */
    async processChange(path) {
        const pending = this.pendingChanges.get(path);
        if (!pending)
            return;
        this.pendingChanges.delete(path);
        this.stats.pendingChanges = this.pendingChanges.size;
        // Check if file should be processed
        if (pending.type !== "unlink") {
            const shouldProcess = await this.shouldProcessFile(path);
            if (!shouldProcess) {
                return;
            }
        }
        // Process the change
        if (this.indexCallback) {
            try {
                await this.indexCallback([
                    {
                        type: pending.type,
                        path: pending.path,
                        timestamp: pending.timestamp,
                    },
                ]);
                this.stats.filesIndexed++;
                this.stats.lastSyncTime = Date.now();
            }
            catch (error) {
                console.error(`Index callback error for ${path}: ${error}`);
            }
        }
    }
    /**
     * Check if a file should be processed (size, hash change)
     */
    async shouldProcessFile(path) {
        try {
            const stats = await stat(path);
            // Check file size
            if (stats.size > this.config.maxFileSizeBytes) {
                console.log(`Skipping ${path}: exceeds max size`);
                return false;
            }
            // Calculate content hash
            const content = await readFile(path, "utf-8");
            const hash = createHash("md5").update(content).digest("hex");
            // Check if content changed
            const existing = this.fileHashes.get(path);
            if (existing && existing.hash === hash) {
                return false; // No actual change
            }
            // Update hash cache
            this.fileHashes.set(path, {
                hash,
                size: stats.size,
                mtime: stats.mtimeMs,
            });
            return true;
        }
        catch (error) {
            // File might not exist or be readable
            return false;
        }
    }
    // ==========================================================================
    // Batch Operations
    // ==========================================================================
    /**
     * Force re-index of all watched files
     */
    async reindexAll() {
        if (!this.watcher || !this.indexCallback) {
            return 0;
        }
        const watched = this.watcher.getWatched();
        const changes = [];
        for (const [dir, files] of Object.entries(watched)) {
            for (const file of files) {
                const fullPath = resolve(dir, file);
                if (this.isIndexableFile(fullPath)) {
                    changes.push({
                        type: "change",
                        path: fullPath,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        if (changes.length > 0) {
            await this.indexCallback(changes);
            this.stats.filesIndexed += changes.length;
            this.stats.lastSyncTime = Date.now();
        }
        return changes.length;
    }
    /**
     * Process any pending changes immediately
     */
    async flush() {
        const pendingPaths = Array.from(this.pendingChanges.keys());
        // Clear all timeouts
        for (const pending of this.pendingChanges.values()) {
            clearTimeout(pending.timeoutId);
        }
        // Process all pending
        for (const path of pendingPaths) {
            await this.processChange(path);
        }
        return pendingPaths.length;
    }
    // ==========================================================================
    // Event Subscriptions
    // ==========================================================================
    /**
     * Subscribe to file change events
     */
    onFileChange(handler) {
        this.eventHandlers.add(handler);
        return () => this.eventHandlers.delete(handler);
    }
    // ==========================================================================
    // Statistics
    // ==========================================================================
    /**
     * Get current indexer statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Get list of watched directories
     */
    getWatchedPaths() {
        if (!this.watcher)
            return [];
        const watched = this.watcher.getWatched();
        return Object.keys(watched);
    }
    /**
     * Get list of files pending indexing
     */
    getPendingFiles() {
        return Array.from(this.pendingChanges.keys());
    }
    // ==========================================================================
    // Configuration
    // ==========================================================================
    /**
     * Update configuration (requires restart)
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Add a watch path (requires restart)
     */
    addWatchPath(path) {
        const resolved = resolveUserPath(path);
        if (!this.config.watchPaths.includes(resolved)) {
            this.config.watchPaths.push(resolved);
        }
    }
    /**
     * Remove a watch path (requires restart)
     */
    removeWatchPath(path) {
        const resolved = resolveUserPath(path);
        const index = this.config.watchPaths.indexOf(resolved);
        if (index !== -1) {
            this.config.watchPaths.splice(index, 1);
        }
    }
}
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Create and start an auto-indexer
 */
export async function createAutoIndexer(callback, config) {
    const indexer = new AutoIndexer(config);
    await indexer.start(callback);
    return indexer;
}
/**
 * Compute file hash for change detection
 */
export async function computeFileHash(path) {
    const content = await readFile(path, "utf-8");
    return createHash("md5").update(content).digest("hex");
}
/**
 * Check if a path matches any ignore pattern
 */
export function matchesIgnorePattern(path, patterns) {
    // Simple glob matching (would use minimatch in production)
    for (const pattern of patterns) {
        // Convert glob to regex (simplified)
        const regexPattern = pattern
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*")
            .replace(/\?/g, ".");
        const regex = new RegExp(regexPattern);
        if (regex.test(path)) {
            return true;
        }
    }
    return false;
}
/**
 * Get relative path from watch root
 */
export function getRelativePath(filePath, watchPaths) {
    for (const watchPath of watchPaths) {
        const resolved = resolveUserPath(watchPath);
        if (filePath.startsWith(resolved)) {
            return relative(resolved, filePath);
        }
    }
    return filePath;
}
//# sourceMappingURL=auto-index.js.map