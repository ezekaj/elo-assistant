/**
 * Predictive engine gateway handlers
 */

import type { GatewayRequestHandlers, GatewayRequestHandlerOptions } from "./types.js";
import {
  checkPredictions,
  getPredictionStats,
  getRecentDeliveries,
} from "../../agents/predictive-integration.js";
import {
  getPredictiveService,
  isPredictiveServiceRunning,
} from "../../agents/predictive-service.js";

export const predictiveHandlers: GatewayRequestHandlers = {
  /**
   * Get predictive engine status
   */
  "predictive.status": async (opts: GatewayRequestHandlerOptions) => {
    const running = isPredictiveServiceRunning();
    
    if (!running) {
      opts.respond(true, {
        status: "disabled",
        message: "Predictive engine not running",
      });
      return;
    }
    
    const service = getPredictiveService();
    if (!service) {
      opts.respond(true, {
        status: "error",
        message: "Service not available",
      });
      return;
    }
    
    const stats = getPredictionStats();
    const config = service.getConfig();
    
    opts.respond(true, {
      status: "running",
      config: {
        autoDeliver: config.autoDeliver.enabled,
        maxPerDay: config.autoDeliver.maxPerDay,
        quietHours: config.autoDeliver.quietHours,
        minConfidence: config.autoDeliver.minConfidence,
      },
      stats,
    });
  },

  /**
   * Check current predictions
   */
  "predictive.check": async (opts: GatewayRequestHandlerOptions) => {
    const predictions = await checkPredictions();
    
    opts.respond(true, {
      predictions: predictions.slice(0, 10),
      count: predictions.length,
    });
  },

  /**
   * Get learned patterns
   */
  "predictive.patterns": async (opts: GatewayRequestHandlerOptions) => {
    const params = opts.params;
    const service = getPredictiveService();
    if (!service) {
      opts.respond(true, { patterns: [], error: "Service not running" });
      return;
    }
    
    const limit = typeof params?.limit === "number" ? Math.min(100, params.limit) : 50;
    const type = params?.type as string | undefined;
    
    let patterns = service.getPatterns();
    
    if (type) {
      patterns = patterns.filter(p => p.category === type);
    }
    
    opts.respond(true, {
      patterns: patterns.slice(0, limit).map(p => ({
        id: p.id,
        name: p.pattern,
        type: p.category,
        confidence: Math.round(p.confidence * 100),
        occurrences: p.frequency,
        lastSeen: p.lastOccurrence,
      })),
      total: patterns.length,
    });
  },

  /**
   * Get prediction history
   */
  "predictive.history": async (opts: GatewayRequestHandlerOptions) => {
    const params = opts.params;
    const limit = typeof params?.limit === "number" ? Math.min(100, params.limit) : 20;
    const deliveries = getRecentDeliveries(limit);
    
    opts.respond(true, {
      deliveries,
      count: deliveries.length,
    });
  },

  /**
   * Get detailed statistics
   */
  "predictive.stats": async (opts: GatewayRequestHandlerOptions) => {
    const stats = getPredictionStats();
    opts.respond(true, stats);
  },

  /**
   * Record feedback on a prediction
   */
  "predictive.feedback": async (opts: GatewayRequestHandlerOptions) => {
    const params = opts.params;
    const service = getPredictiveService();
    if (!service) {
      opts.respond(true, { success: false, error: "Service not running" });
      return;
    }
    
    const predictionId = params?.predictionId as string;
    const accepted = params?.accepted as boolean | undefined;
    const feedback = params?.feedback as string | undefined;
    
    if (!predictionId) {
      opts.respond(true, { success: false, error: "predictionId required" });
      return;
    }
    
    service.recordFeedback(predictionId, accepted ?? true, feedback);
    
    opts.respond(true, { success: true });
  },

  /**
   * Enable/disable auto-delivery
   */
  "predictive.setAutoDeliver": async (opts: GatewayRequestHandlerOptions) => {
    const params = opts.params;
    const service = getPredictiveService();
    if (!service) {
      opts.respond(true, { success: false, error: "Service not running" });
      return;
    }
    
    const enabled = params?.enabled as boolean;
    
    if (enabled) {
      service.enableAutoDelivery();
    } else {
      service.disableAutoDelivery();
    }
    
    opts.respond(true, { success: true, autoDeliver: enabled });
  },
};
