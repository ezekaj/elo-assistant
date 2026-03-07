/**
 * OpenClaw Memory Enhancements - Cross-Encoder Reranking
 *
 * Two-stage retrieval: fast hybrid search followed by precise cross-encoder reranking.
 * Supports LM Studio local inference, Cohere API, and custom providers.
 */

import type {
  SearchResult,
  RerankConfig,
  RerankRequest,
  RerankResponse,
  RerankProvider,
  RerankError,
} from "./types.js";
import { DEFAULT_RERANK_CONFIG } from "./config.js";

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for reranking operations */
const DEFAULT_TIMEOUT_MS = 30000;

/** Default LM Studio endpoint */
const DEFAULT_LM_STUDIO_ENDPOINT = "http://127.0.0.1:1234/v1";

/** Rerank scoring prompt for LLM-based reranking */
const RERANK_PROMPT = `Rate the relevance of the following passage to the query on a scale of 0 to 10.
Only respond with a single number between 0 and 10, nothing else.

Query: {query}

Passage: {passage}

Score (0-10):`;

/** Batch rerank prompt for multiple passages */
const BATCH_RERANK_PROMPT = `Rate the relevance of each passage to the query on a scale of 0 to 10.
Respond with one number per line, in order, nothing else.

Query: {query}

{passages}

Scores (one per line, 0-10):`;

// ============================================================================
// Rerank Cache
// ============================================================================

interface CacheEntry {
  score: number;
  model: string;
  timestamp: number;
}

/** Simple in-memory cache for rerank scores */
const rerankCache = new Map<string, CacheEntry>();

/** Cache TTL in milliseconds (1 hour) */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Generate cache key for a query-passage pair
 */
function getCacheKey(query: string, passageId: string, model: string): string {
  return `${model}:${query.slice(0, 100)}:${passageId}`;
}

/**
 * Get cached score if available and not expired
 */
function getCachedScore(
  query: string,
  passageId: string,
  model: string
): number | null {
  const key = getCacheKey(query, passageId, model);
  const entry = rerankCache.get(key);

  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    rerankCache.delete(key);
    return null;
  }

  return entry.score;
}

/**
 * Cache a rerank score
 */
function setCachedScore(
  query: string,
  passageId: string,
  model: string,
  score: number
): void {
  const key = getCacheKey(query, passageId, model);
  rerankCache.set(key, {
    score,
    model,
    timestamp: Date.now(),
  });
}

/**
 * Clear expired cache entries
 */
export function cleanupCache(): number {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of rerankCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      rerankCache.delete(key);
      removed++;
    }
  }

  return removed;
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
  rerankCache.clear();
}

// ============================================================================
// LLM-Based Reranking (LM Studio)
// ============================================================================

/**
 * Rerank using LM Studio chat completion API
 */
async function rerankWithLLM(
  query: string,
  passages: string[],
  config: RerankConfig
): Promise<RerankResponse> {
  const endpoint = config.apiEndpoint || DEFAULT_LM_STUDIO_ENDPOINT;
  const model = config.model || "qwen2.5-coder-1.5b-instruct";
  const timeout = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  const scores: number[] = [];

  // Score each passage individually for reliability
  for (const passage of passages) {
    const prompt = RERANK_PROMPT
      .replace("{query}", query)
      .replace("{passage}", passage.slice(0, 2000)); // Truncate long passages

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`LLM rerank error: ${response.status}`);
        scores.push(0);
        continue;
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const scoreText = data.choices[0]?.message?.content?.trim() || "0";
      const score = parseFloat(scoreText);

      // Normalize to 0-1 range
      const normalizedScore = isNaN(score) ? 0 : Math.min(1, Math.max(0, score / 10));
      scores.push(normalizedScore);
    } catch (error) {
      console.error(`LLM rerank error for passage: ${error}`);
      scores.push(0);
    }
  }

  return {
    scores,
    model,
    cached: false,
  };
}

/**
 * Batch rerank using LM Studio (more efficient for many passages)
 */
async function batchRerankWithLLM(
  query: string,
  passages: string[],
  config: RerankConfig
): Promise<RerankResponse> {
  const endpoint = config.apiEndpoint || DEFAULT_LM_STUDIO_ENDPOINT;
  const model = config.model || "qwen2.5-coder-1.5b-instruct";
  const timeout = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Format passages with numbers
  const formattedPassages = passages
    .map((p, i) => `[${i + 1}] ${p.slice(0, 500)}`)
    .join("\n\n");

  const prompt = BATCH_RERANK_PROMPT
    .replace("{query}", query)
    .replace("{passages}", formattedPassages);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: passages.length * 5,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content?.trim() || "";
    const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);

    const scores = lines.map((line) => {
      const score = parseFloat(line);
      return isNaN(score) ? 0 : Math.min(1, Math.max(0, score / 10));
    });

    // Pad with zeros if not enough scores returned
    while (scores.length < passages.length) {
      scores.push(0);
    }

    return {
      scores: scores.slice(0, passages.length),
      model,
      cached: false,
    };
  } catch (error) {
    // Fallback to individual scoring
    console.error(`Batch rerank failed, falling back to individual: ${error}`);
    return rerankWithLLM(query, passages, config);
  }
}

// ============================================================================
// Cohere Reranking
// ============================================================================

/**
 * Rerank using Cohere Rerank API
 */
async function rerankWithCohere(
  query: string,
  passages: string[],
  config: RerankConfig
): Promise<RerankResponse> {
  if (!config.apiKey) {
    throw new Error("Cohere API key required for reranking");
  }

  const endpoint = config.apiEndpoint || "https://api.cohere.ai/v1/rerank";
  const model = config.model || "rerank-english-v3.0";
  const timeout = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        query,
        documents: passages,
        top_n: passages.length,
        return_documents: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    // Build scores array in original order
    const scores = new Array<number>(passages.length).fill(0);
    for (const result of data.results) {
      scores[result.index] = result.relevance_score;
    }

    return {
      scores,
      model,
      cached: false,
    };
  } catch (error) {
    console.error(`Cohere rerank error: ${error}`);
    // Return zeros on failure
    return {
      scores: new Array(passages.length).fill(0),
      model,
      cached: false,
    };
  }
}

// ============================================================================
// Local Cross-Encoder (Sentence Transformers)
// ============================================================================

/**
 * Placeholder for local cross-encoder reranking
 * Would require a Python service or ONNX runtime
 */
async function rerankWithLocal(
  _query: string,
  passages: string[],
  _config: RerankConfig
): Promise<RerankResponse> {
  // This would need a local cross-encoder service
  // For now, return uniform scores
  console.warn("Local cross-encoder not implemented, returning uniform scores");

  return {
    scores: new Array(passages.length).fill(0.5),
    model: "local-placeholder",
    cached: false,
  };
}

// ============================================================================
// Main Reranking Functions
// ============================================================================

/**
 * Get the appropriate reranking function for the provider
 */
function getRerankFunction(
  provider: RerankProvider
): (query: string, passages: string[], config: RerankConfig) => Promise<RerankResponse> {
  switch (provider) {
    case "llm":
      return rerankWithLLM;
    case "cohere":
      return rerankWithCohere;
    case "local":
      return rerankWithLocal;
    default:
      return rerankWithLLM;
  }
}

/**
 * Rerank search results using the configured provider
 *
 * @param query - Search query
 * @param results - Search results to rerank
 * @param config - Reranking configuration
 * @returns Reranked search results sorted by rerank score
 */
export async function rerank(
  query: string,
  results: SearchResult[],
  config: RerankConfig = DEFAULT_RERANK_CONFIG
): Promise<SearchResult[]> {
  if (!config.enabled || results.length === 0) {
    return results;
  }

  // Limit to candidate count
  const candidates = results.slice(0, config.candidateCount);
  const model = config.model || "unknown";

  // Check cache for all candidates
  const cachedScores: (number | null)[] = candidates.map((r) =>
    getCachedScore(query, r.id, model)
  );

  const allCached = cachedScores.every((s) => s !== null);

  let rerankScores: number[];

  if (allCached) {
    // All scores cached
    rerankScores = cachedScores as number[];
  } else {
    // Need to compute scores
    const passages = candidates.map((r) => r.text);
    const rerankFn = getRerankFunction(config.provider);

    try {
      const response = await rerankFn(query, passages, config);
      rerankScores = response.scores;

      // Cache the new scores
      for (let i = 0; i < candidates.length; i++) {
        setCachedScore(query, candidates[i].id, model, rerankScores[i]);
      }
    } catch (error) {
      console.error(`Reranking failed: ${error}`);
      // Return original results on failure
      return results.slice(0, config.finalCount);
    }
  }

  // Combine with original scores and sort
  const reranked = candidates.map((result, i) => ({
    ...result,
    rerankScore: rerankScores[i],
    // Optionally blend with original score
    // score: result.score * 0.3 + rerankScores[i] * 0.7,
  }));

  // Sort by rerank score
  reranked.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));

  // Filter by minimum score if configured
  let filtered = reranked;
  if (config.minScore !== undefined) {
    filtered = reranked.filter((r) => (r.rerankScore || 0) >= config.minScore!);
  }

  // Return top N
  return filtered.slice(0, config.finalCount);
}

/**
 * Rerank with score blending
 *
 * Combines the original hybrid search score with the rerank score.
 *
 * @param query - Search query
 * @param results - Search results to rerank
 * @param config - Reranking configuration
 * @param originalWeight - Weight for original score (0-1)
 * @param rerankWeight - Weight for rerank score (0-1)
 */
export async function rerankWithBlending(
  query: string,
  results: SearchResult[],
  config: RerankConfig = DEFAULT_RERANK_CONFIG,
  originalWeight: number = 0.3,
  rerankWeight: number = 0.7
): Promise<SearchResult[]> {
  const reranked = await rerank(query, results, { ...config, finalCount: results.length });

  // Blend scores
  const blended = reranked.map((result) => {
    const originalScore = result.score || 0;
    const rerankScore = result.rerankScore || 0;
    const blendedScore = originalWeight * originalScore + rerankWeight * rerankScore;

    return {
      ...result,
      score: blendedScore,
    };
  });

  // Re-sort by blended score
  blended.sort((a, b) => b.score - a.score);

  return blended.slice(0, config.finalCount);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the reranking service is available
 */
export async function checkRerankService(
  config: RerankConfig = DEFAULT_RERANK_CONFIG
): Promise<boolean> {
  try {
    const testQuery = "test query";
    const testPassages = ["test passage"];
    const rerankFn = getRerankFunction(config.provider);

    const response = await rerankFn(testQuery, testPassages, {
      ...config,
      timeoutMs: 5000,
    });

    return response.scores.length > 0;
  } catch {
    return false;
  }
}

/**
 * Get reranking statistics
 */
export function getRerankStats(): {
  cacheSize: number;
  cacheHitRate: number;
} {
  // Note: actual hit rate tracking would require additional instrumentation
  return {
    cacheSize: rerankCache.size,
    cacheHitRate: 0, // Placeholder
  };
}

/**
 * Create a rerank config for a specific provider
 */
export function createRerankConfig(
  provider: RerankProvider,
  options?: Partial<RerankConfig>
): RerankConfig {
  const defaults: Record<RerankProvider, Partial<RerankConfig>> = {
    llm: {
      apiEndpoint: DEFAULT_LM_STUDIO_ENDPOINT,
      model: "qwen2.5-coder-1.5b-instruct",
    },
    cohere: {
      apiEndpoint: "https://api.cohere.ai/v1/rerank",
      model: "rerank-english-v3.0",
    },
    local: {
      model: "cross-encoder/ms-marco-MiniLM-L-6-v2",
    },
  };

  return {
    ...DEFAULT_RERANK_CONFIG,
    provider,
    ...defaults[provider],
    ...options,
  };
}

/**
 * Score a single query-passage pair
 *
 * Useful for debugging or one-off scoring.
 */
export async function scorePassage(
  query: string,
  passage: string,
  config: RerankConfig = DEFAULT_RERANK_CONFIG
): Promise<number> {
  const response = await rerank(
    query,
    [
      {
        id: "test",
        path: "",
        source: "",
        text: passage,
        startLine: 0,
        endLine: 0,
        score: 0,
        updatedAt: Date.now(),
      },
    ],
    { ...config, candidateCount: 1, finalCount: 1 }
  );

  return response[0]?.rerankScore || 0;
}
