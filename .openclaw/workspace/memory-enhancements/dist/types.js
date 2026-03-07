/**
 * OpenClaw Memory Enhancements - Type Definitions
 */
// ============================================================================
// Error Types
// ============================================================================
export class MemoryEnhancementError extends Error {
    code;
    cause;
    constructor(message, code, cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = "MemoryEnhancementError";
    }
}
export class HybridSearchError extends MemoryEnhancementError {
    constructor(message, cause) {
        super(message, "HYBRID_SEARCH_ERROR", cause);
        this.name = "HybridSearchError";
    }
}
export class RerankError extends MemoryEnhancementError {
    constructor(message, cause) {
        super(message, "RERANK_ERROR", cause);
        this.name = "RerankError";
    }
}
export class AutoIndexError extends MemoryEnhancementError {
    constructor(message, cause) {
        super(message, "AUTO_INDEX_ERROR", cause);
        this.name = "AutoIndexError";
    }
}
//# sourceMappingURL=types.js.map