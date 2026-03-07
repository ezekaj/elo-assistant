/**
 * OpenClaw Memory Enhancements - Integration
 *
 * Main integration point connecting all enhancement modules.
 */
import type Database from "better-sqlite3";
import type { EnhancedSearchConfig, SearchResult } from "./types.js";
export interface MemoryEnhancements {
    search(query: string, options?: Partial<SearchOptions>): Promise<SearchResult[]>;
    indexFile(path: string): Promise<void>;
    startIndexer(): void;
    stopIndexer(): void;
    updateConfig(config: Partial<EnhancedSearchConfig>): void;
    getConfig(): EnhancedSearchConfig;
}
export interface SearchOptions {
    limit?: number;
    sources?: string[];
    skipRerank?: boolean;
    skipTemporal?: boolean;
    minScore?: number;
}
export declare class OpenClawMemoryEnhancements implements MemoryEnhancements {
    private db;
    private config;
    private indexer?;
    private getEmbedding;
    constructor(db: Database.Database, getEmbedding: (text: string) => Promise<number[]>, config?: Partial<EnhancedSearchConfig>);
    search(query: string, options?: Partial<SearchOptions>): Promise<SearchResult[]>;
    indexFile(path: string): Promise<void>;
    startIndexer(): void;
    stopIndexer(): void;
    updateConfig(config: Partial<EnhancedSearchConfig>): void;
    getConfig(): EnhancedSearchConfig;
}
export declare function createMemoryEnhancements(db: Database.Database, getEmbedding: (text: string) => Promise<number[]>, config?: Partial<EnhancedSearchConfig>): MemoryEnhancements;
export default OpenClawMemoryEnhancements;
//# sourceMappingURL=integration.d.ts.map