/**
 * OpenClaw Memory Enhancements - Temporal Weighting
 *
 * Applies exponential decay scoring based on document age to boost recent memories.
 */

import type { SearchResult, TemporalConfig, DecayProfile, DecayParams } from "./types.js";
import { DEFAULT_TEMPORAL_CONFIG } from "./config.js";

// ============================================================================
// Decay Profile Parameters
// ============================================================================

/**
 * Decay profile parameters
 *
 * Half-life formula: λ = ln(2) / halfLifeDays
 */
const DECAY_PROFILES: Record<DecayProfile, DecayParams> = {
  aggressive: {
    halfLifeDays: 7,
    lambda: Math.LN2 / 7, // ≈ 0.099
  },
  moderate: {
    halfLifeDays: 30,
    lambda: Math.LN2 / 30, // ≈ 0.023
  },
  gentle: {
    halfLifeDays: 90,
    lambda: Math.LN2 / 90, // ≈ 0.0077
  },
  none: {
    halfLifeDays: Infinity,
    lambda: 0,
  },
};

// ============================================================================
// Decay Calculation
// ============================================================================

/**
 * Get decay parameters for a configuration
 */
export function getDecayParams(config: TemporalConfig): DecayParams {
  if (config.customHalfLifeDays !== undefined && config.customHalfLifeDays > 0) {
    return {
      halfLifeDays: config.customHalfLifeDays,
      lambda: Math.LN2 / config.customHalfLifeDays,
    };
  }

  return DECAY_PROFILES[config.decayProfile];
}

/**
 * Calculate the age of a document in days
 *
 * @param documentTimestamp - Document timestamp (Unix timestamp in ms)
 * @param referenceDate - Reference date for age calculation (default: now)
 * @returns Age in days (fractional)
 */
export function calculateAgeDays(
  documentTimestamp: number,
  referenceDate?: Date
): number {
  const now = referenceDate?.getTime() ?? Date.now();
  const ageMs = now - documentTimestamp;

  // Clamp to non-negative (future dates get age 0)
  const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));

  return ageDays;
}

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
export function calculateDecayFactor(
  ageDays: number,
  lambda: number,
  minWeight: number
): number {
  if (lambda === 0) {
    // No decay (none profile)
    return 1.0;
  }

  // Exponential decay with floor
  const decayRange = 1.0 - minWeight;
  const exponentialDecay = Math.exp(-lambda * ageDays);
  const decayFactor = decayRange * exponentialDecay + minWeight;

  return decayFactor;
}

/**
 * Calculate temporal weight for a single document
 *
 * @param documentTimestamp - Document updated_at timestamp
 * @param config - Temporal weighting configuration
 * @returns Weight factor between minWeight and 1.0
 */
export function calculateTemporalWeight(
  documentTimestamp: number,
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): number {
  if (!config.enabled) {
    return 1.0;
  }

  const { lambda } = getDecayParams(config);
  const ageDays = calculateAgeDays(documentTimestamp, config.referenceDate);

  return calculateDecayFactor(ageDays, lambda, config.minWeight);
}

// ============================================================================
// Temporal Scoring Application
// ============================================================================

/**
 * Apply temporal weighting to search results
 *
 * Modifies the score of each result by multiplying with the temporal weight.
 *
 * @param results - Search results to weight
 * @param config - Temporal configuration
 * @returns Results with temporal weighting applied
 */
export function applyTemporalWeighting(
  results: SearchResult[],
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): SearchResult[] {
  if (!config.enabled) {
    return results;
  }

  return results.map((result) => {
    // Use updated_at as the primary timestamp
    const timestamp = result.updatedAt;
    const temporalWeight = calculateTemporalWeight(timestamp, config);

    return {
      ...result,
      score: result.score * temporalWeight,
      temporalScore: temporalWeight,
    };
  });
}

/**
 * Apply temporal weighting and re-sort results
 *
 * After applying weights, results are re-sorted by adjusted score.
 *
 * @param results - Search results to weight and sort
 * @param config - Temporal configuration
 * @returns Weighted and sorted results
 */
export function applyTemporalWeightingAndSort(
  results: SearchResult[],
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): SearchResult[] {
  const weighted = applyTemporalWeighting(results, config);
  return weighted.sort((a, b) => b.score - a.score);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get human-readable description of decay profile
 */
export function describeDecayProfile(profile: DecayProfile): string {
  const params = DECAY_PROFILES[profile];

  switch (profile) {
    case "aggressive":
      return `Aggressive decay: 50% weight after ${params.halfLifeDays} days`;
    case "moderate":
      return `Moderate decay: 50% weight after ${params.halfLifeDays} days`;
    case "gentle":
      return `Gentle decay: 50% weight after ${params.halfLifeDays} days`;
    case "none":
      return "No decay: all documents weighted equally";
    default:
      return "Unknown decay profile";
  }
}

/**
 * Calculate what the weight will be at a given age
 *
 * Useful for understanding the decay curve.
 */
export function calculateWeightAtAge(
  ageDays: number,
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): number {
  if (!config.enabled) {
    return 1.0;
  }

  const { lambda } = getDecayParams(config);
  return calculateDecayFactor(ageDays, lambda, config.minWeight);
}

/**
 * Generate a decay curve sample for visualization
 *
 * Returns weight values at various age points.
 */
export function generateDecayCurve(
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG,
  maxDays: number = 365
): Array<{ days: number; weight: number }> {
  const points: Array<{ days: number; weight: number }> = [];
  const { lambda } = getDecayParams(config);

  // Sample at key points
  const sampleDays = [
    0, 1, 3, 7, 14, 30, 60, 90, 180, 365,
  ].filter((d) => d <= maxDays);

  for (const days of sampleDays) {
    const weight = config.enabled
      ? calculateDecayFactor(days, lambda, config.minWeight)
      : 1.0;

    points.push({ days, weight });
  }

  return points;
}

/**
 * Estimate the age at which weight reaches a target value
 *
 * Useful for understanding "when will this document lose relevance?"
 */
export function estimateAgeAtWeight(
  targetWeight: number,
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): number | null {
  if (!config.enabled) {
    return null; // Weight never changes
  }

  if (targetWeight >= 1.0) {
    return 0; // Full weight is immediate
  }

  if (targetWeight <= config.minWeight) {
    return Infinity; // Never reaches below minWeight
  }

  const { lambda } = getDecayParams(config);

  if (lambda === 0) {
    return null; // No decay
  }

  // Solve for age: targetWeight = (1 - minWeight) * e^(-λ * age) + minWeight
  // age = -ln((targetWeight - minWeight) / (1 - minWeight)) / λ
  const decayRange = 1.0 - config.minWeight;
  const normalizedTarget = (targetWeight - config.minWeight) / decayRange;

  if (normalizedTarget <= 0) {
    return Infinity;
  }

  const ageDays = -Math.log(normalizedTarget) / lambda;
  return ageDays;
}

/**
 * Create a temporal config with custom half-life
 */
export function createCustomTemporalConfig(
  halfLifeDays: number,
  minWeight: number = 0.3
): TemporalConfig {
  return {
    enabled: true,
    decayProfile: "moderate", // Ignored when customHalfLifeDays is set
    customHalfLifeDays: halfLifeDays,
    minWeight,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Pre-compute temporal weights for a batch of timestamps
 *
 * More efficient when processing many documents.
 */
export function batchCalculateWeights(
  timestamps: number[],
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): Map<number, number> {
  const weights = new Map<number, number>();

  if (!config.enabled) {
    for (const ts of timestamps) {
      weights.set(ts, 1.0);
    }
    return weights;
  }

  const { lambda } = getDecayParams(config);
  const now = config.referenceDate?.getTime() ?? Date.now();

  for (const ts of timestamps) {
    const ageMs = now - ts;
    const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));
    const weight = calculateDecayFactor(ageDays, lambda, config.minWeight);
    weights.set(ts, weight);
  }

  return weights;
}

/**
 * Get statistics about temporal distribution of results
 */
export function getTemporalStats(
  results: SearchResult[],
  config: TemporalConfig = DEFAULT_TEMPORAL_CONFIG
): {
  oldestDays: number;
  newestDays: number;
  averageAgeDays: number;
  medianAgeDays: number;
  weightRange: { min: number; max: number };
} {
  if (results.length === 0) {
    return {
      oldestDays: 0,
      newestDays: 0,
      averageAgeDays: 0,
      medianAgeDays: 0,
      weightRange: { min: 1, max: 1 },
    };
  }

  const now = config.referenceDate?.getTime() ?? Date.now();
  const ages = results.map((r) => {
    const ageMs = now - r.updatedAt;
    return Math.max(0, ageMs / (1000 * 60 * 60 * 24));
  });

  ages.sort((a, b) => a - b);

  const weights = results.map((r) => calculateTemporalWeight(r.updatedAt, config));

  return {
    oldestDays: ages[ages.length - 1],
    newestDays: ages[0],
    averageAgeDays: ages.reduce((a, b) => a + b, 0) / ages.length,
    medianAgeDays: ages[Math.floor(ages.length / 2)],
    weightRange: {
      min: Math.min(...weights),
      max: Math.max(...weights),
    },
  };
}
