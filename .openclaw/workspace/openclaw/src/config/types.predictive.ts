/**
 * Predictive Engine Configuration Types
 */

import { Type, type Static } from "@sinclair/typebox";

/**
 * Auto-delivery configuration
 */
export const AutoDeliverConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),
  maxPerDay: Type.Optional(Type.Number({ minimum: 1, maximum: 20, default: 3 })),
  channels: Type.Optional(Type.Array(Type.String(), { default: ["signal", "webchat"] })),
  quietHours: Type.Optional(
    Type.Object({
      start: Type.Number({ minimum: 0, maximum: 23, default: 22 }),
      end: Type.Number({ minimum: 0, maximum: 23, default: 8 }),
    })
  ),
  minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.8 })),
});

/**
 * Schedule configuration
 */
export const PredictiveScheduleSchema = Type.Object({
  checkIntervalMs: Type.Optional(Type.Number({ minimum: 60000, default: 1800000 })),
  patternLearningEnabled: Type.Optional(Type.Boolean({ default: true })),
  consolidationIntervalMs: Type.Optional(Type.Number({ minimum: 60000, default: 3600000 })),
});

/**
 * Category toggles
 */
export const PredictiveCategoriesSchema = Type.Object({
  calendar: Type.Optional(Type.Boolean({ default: true })),
  email: Type.Optional(Type.Boolean({ default: true })),
  task: Type.Optional(Type.Boolean({ default: true })),
  workflow: Type.Optional(Type.Boolean({ default: true })),
  communication: Type.Optional(Type.Boolean({ default: false })),
  context: Type.Optional(Type.Boolean({ default: true })),
});

/**
 * Neuro-memory configuration
 */
export const PredictiveNeuroMemorySchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: false })),
  agentPath: Type.Optional(Type.String()),
});

/**
 * Learning configuration
 */
export const PredictiveLearningSchema = Type.Object({
  autoLearn: Type.Optional(Type.Boolean({ default: true })),
  retentionDays: Type.Optional(Type.Number({ minimum: 7, maximum: 365, default: 90 })),
  minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.5 })),
});

/**
 * Full predictive configuration
 */
export const PredictiveConfigSchema = Type.Object({
  enabled: Type.Optional(Type.Boolean({ default: true })),
  autoDeliver: Type.Optional(AutoDeliverConfigSchema),
  schedule: Type.Optional(PredictiveScheduleSchema),
  categories: Type.Optional(PredictiveCategoriesSchema),
  neuroMemory: Type.Optional(PredictiveNeuroMemorySchema),
  learning: Type.Optional(PredictiveLearningSchema),
});

export type PredictiveConfig = Static<typeof PredictiveConfigSchema>;
export type AutoDeliverConfig = Static<typeof AutoDeliverConfigSchema>;
export type PredictiveSchedule = Static<typeof PredictiveScheduleSchema>;
export type PredictiveCategories = Static<typeof PredictiveCategoriesSchema>;
export type PredictiveNeuroMemory = Static<typeof PredictiveNeuroMemorySchema>;
export type PredictiveLearning = Static<typeof PredictiveLearningSchema>;

/**
 * Default predictive configuration
 */
export const DEFAULT_PREDICTIVE_CONFIG: PredictiveConfig = {
  enabled: true,
  autoDeliver: {
    enabled: true,
    maxPerDay: 3,
    channels: ["signal", "webchat"],
    quietHours: { start: 22, end: 8 },
    minConfidence: 0.8,
  },
  schedule: {
    checkIntervalMs: 1800000, // 30 minutes
    patternLearningEnabled: true,
    consolidationIntervalMs: 3600000, // 1 hour
  },
  categories: {
    calendar: true,
    email: true,
    task: true,
    workflow: true,
    communication: false,
    context: true,
  },
  neuroMemory: {
    enabled: false,
  },
  learning: {
    autoLearn: true,
    retentionDays: 90,
    minConfidence: 0.5,
  },
};

/**
 * Merge user config with defaults
 */
export function mergePredictiveConfig(userConfig?: Partial<PredictiveConfig>): PredictiveConfig {
  if (!userConfig) return DEFAULT_PREDICTIVE_CONFIG;

  return {
    enabled: userConfig.enabled ?? DEFAULT_PREDICTIVE_CONFIG.enabled,
    autoDeliver: {
      ...DEFAULT_PREDICTIVE_CONFIG.autoDeliver,
      ...userConfig.autoDeliver,
    },
    schedule: {
      ...DEFAULT_PREDICTIVE_CONFIG.schedule,
      ...userConfig.schedule,
    },
    categories: {
      ...DEFAULT_PREDICTIVE_CONFIG.categories,
      ...userConfig.categories,
    },
    neuroMemory: {
      ...DEFAULT_PREDICTIVE_CONFIG.neuroMemory,
      ...userConfig.neuroMemory,
    },
    learning: {
      ...DEFAULT_PREDICTIVE_CONFIG.learning,
      ...userConfig.learning,
    },
  };
}
