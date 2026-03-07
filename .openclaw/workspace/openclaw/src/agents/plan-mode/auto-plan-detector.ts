/**
 * Automatic Plan Detection
 *
 * Detects when user requests planning and automatically enters Plan Mode.
 * Works with ANY LLM provider (client-side feature).
 */

/**
 * Keywords that indicate user wants a plan
 */
const PLAN_KEYWORDS = [
  // Direct plan requests
  "make a plan",
  "create a plan",
  "make plan",
  "create plan",
  "plan this",
  "plan out",
  "planning",

  // Deep plan requests
  "deep plan",
  "detailed plan",
  "thorough plan",
  "comprehensive plan",
  "full plan",
  "complete plan",

  // Strategy requests
  "strategy",
  "approach",
  "roadmap",
  "steps",
  "step by step",
  "break down",
  "analyze first",

  // Exploration requests
  "explore",
  "investigate",
  "research first",
  "look into",
  "check first",
];

/**
 * Deep plan keywords (more thorough planning)
 */
const DEEP_PLAN_KEYWORDS = [
  "deep plan",
  "detailed plan",
  "thorough plan",
  "comprehensive plan",
  "full plan",
  "complete plan",
  "exhaustive plan",
  "in-depth",
];

/**
 * Check if user message requests planning
 */
export function isPlanRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return PLAN_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Check if user requests deep planning
 */
export function isDeepPlanRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return DEEP_PLAN_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Get plan type from message
 */
export function getPlanType(message: string): "none" | "plan" | "deep_plan" {
  if (isDeepPlanRequest(message)) {
    return "deep_plan";
  }
  if (isPlanRequest(message)) {
    return "plan";
  }
  return "none";
}

/**
 * Extract plan context from message
 */
export function extractPlanContext(message: string): string {
  // Remove common plan request phrases
  let context = message.toLowerCase();

  const phrasesToRemove = [
    "make a plan",
    "create a plan",
    "make plan",
    "create plan",
    "plan this",
    "plan out",
    "deep plan",
    "detailed plan",
    "thorough plan",
    "for me",
    "please",
    "can you",
    "could you",
  ];

  for (const phrase of phrasesToRemove) {
    context = context.replace(phrase, "");
  }

  return context.trim();
}
