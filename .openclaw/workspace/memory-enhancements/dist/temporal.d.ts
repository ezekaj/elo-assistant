/**
 * OpenClaw Memory Enhancements - Temporal Weighting
 *
 * Applies exponential decay scoring based on document age to boost recent memories.
 */
import type { SearchResult, TemporalConfig, DecayProfile, DecayParams } from "./types.js";
/**
 * Get decay parameters for a configuration
 */
export declare function getDecayParams(config: TemporalConfig): DecayParams;
/**
 * Calculate the age of a document in days
 *
 * @param documentTimestamp - Document timestamp (Unix timestamp in ms)
 * @param referenceDate - Reference date for age calculation (default: now)
 * @returns Age in days (fractional)
 */
export declare function calculateAgeDays(documentTimestamp: number, referenceDate?: Date): number;
/**
 * Calculate decay factor using exponential decay formula
 *
 * decay_factor = (1 - minWeight) * e^(-λ * age_days) + minWeight
 *
 * @param ageDays - Document age in days
 * @param lambda - Decay rate
 * @param minWeight - Minimum weight floor (prevents total decay)
 * @returns Decay factor between minWeight and 1.0
 */
export declare function calculateDecayFactor(ageDays: number, lambda: number, minWeight: number): number;
/**
 * Calculate temporal weight for a single document
 *
 * @param documentTimestamp - Document updated_at timestamp
 * @param config - Temporal weighting configuration
 * @returns Weight factor between minWeight and 1.0
 */
export declare function calculateTemporalWeight(documentTimestamp: number, config?: TemporalConfig): number;
/**
 * Apply temporal weighting to search results
 *
 * Modifies the score of each result by multiplying with the temporal weight.
 *
 * @param results - Search results to weight
 * @param config - Temporal configuration
 * @returns Results with temporal weighting applied
 */
export declare function applyTemporalWeighting(results: SearchResult[], config?: TemporalConfig): SearchResult[];
/**
 * Apply temporal weighting and re-sort results
 *
 * After applying weights, results are re-sorted by adjusted score.
 *
 * @param results - Search results to weight and sort
 * @param config - Temporal configuration
 * @returns Weighted and sorted results
 */
export declare function applyTemporalWeightingAndSort(results: SearchResult[], config?: TemporalConfig): SearchResult[];
/**
 * Get human-readable description of decay profile
 */
export declare function describeDecayProfile(profile: DecayProfile): string;
/**
 * Calculate what the weight will be at a given age
 *
 * Useful for understanding the decay curve.
 */
export declare function calculateWeightAtAge(ageDays: number, config?: TemporalConfig): number;
/**
 * Generate a decay curve sample for visualization
 *
 * Returns weight values at various age points.
 */
export declare function generateDecayCurve(config?: TemporalConfig, maxDays?: number): Array<{
    days: number;
    weight: number;
}>;
/**
 * Estimate the age at which weight reaches a target value
 *
 * Useful for understanding "when will this document lose relevance?"
 */
export declare function estimateAgeAtWeight(targetWeight: number, config?: TemporalConfig): number | null;
/**
 * Create a temporal config with custom half-life
 */
export declare function createCustomTemporalConfig(halfLifeDays: number, minWeight?: number): TemporalConfig;
/**
 * Pre-compute temporal weights for a batch of timestamps
 *
 * More efficient when processing many documents.
 */
export declare function batchCalculateWeights(timestamps: number[], config?: TemporalConfig): Map<number, number>;
/**
 * Get statistics about temporal distribution of results
 */
export declare function getTemporalStats(results: SearchResult[], config?: TemporalConfig): {
    oldestDays: number;
    newestDays: number;
    averageAgeDays: number;
    medianAgeDays: number;
    weightRange: {
        min: number;
        max: number;
    };
};
//# sourceMappingURL=temporal.d.ts.map