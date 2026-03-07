/**
 * OpenClaw Memory Enhancements - Auto-Index File Watcher
 *
 * Watches configured directories for file changes and triggers automatic indexing.
 * Uses chokidar for cross-platform file watching with debouncing.
 */
import type { AutoIndexConfig, FileChange, AutoIndexStats, AutoIndexEventHandler } from "./types.js";
type IndexCallback = (changes: FileChange[]) => Promise<void>;
export declare class AutoIndexer {
    private config;
    private watcher;
    private pendingChanges;
    private fileHashes;
    private indexCallback;
    private eventHandlers;
    private stats;
    private isRunning;
    constructor(config?: Partial<AutoIndexConfig>);
    /**
     * Start watching configured directories
     */
    start(callback: IndexCallback): Promise<void>;
    /**
     * Stop watching and clean up
     */
    stop(): Promise<void>;
    /**
     * Check if indexer is running
     */
    isActive(): boolean;
    /**
     * Handle file system events
     */
    private handleFileEvent;
    /**
     * Handle watcher ready event
     */
    private handleReady;
    /**
     * Handle watcher errors
     */
    private handleError;
    /**
     * Check if a file should be indexed
     */
    private isIndexableFile;
    /**
     * Queue a change with debouncing
     */
    private queueChange;
    /**
     * Process a debounced change
     */
    private processChange;
    /**
     * Check if a file should be processed (size, hash change)
     */
    private shouldProcessFile;
    /**
     * Force re-index of all watched files
     */
    reindexAll(): Promise<number>;
    /**
     * Process any pending changes immediately
     */
    flush(): Promise<number>;
    /**
     * Subscribe to file change events
     */
    onFileChange(handler: AutoIndexEventHandler): () => void;
    /**
     * Get current indexer statistics
     */
    getStats(): AutoIndexStats;
    /**
     * Get list of watched directories
     */
    getWatchedPaths(): string[];
    /**
     * Get list of files pending indexing
     */
    getPendingFiles(): string[];
    /**
     * Update configuration (requires restart)
     */
    updateConfig(config: Partial<AutoIndexConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): AutoIndexConfig;
    /**
     * Add a watch path (requires restart)
     */
    addWatchPath(path: string): void;
    /**
     * Remove a watch path (requires restart)
     */
    removeWatchPath(path: string): void;
}
/**
 * Create and start an auto-indexer
 */
export declare function createAutoIndexer(callback: IndexCallback, config?: Partial<AutoIndexConfig>): Promise<AutoIndexer>;
/**
 * Compute file hash for change detection
 */
export declare function computeFileHash(path: string): Promise<string>;
/**
 * Check if a path matches any ignore pattern
 */
export declare function matchesIgnorePattern(path: string, patterns: string[]): boolean;
/**
 * Get relative path from watch root
 */
export declare function getRelativePath(filePath: string, watchPaths: string[]): string;
export {};
//# sourceMappingURL=auto-index.d.ts.map