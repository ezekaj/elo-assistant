/**
 * Predictive Engine Dashboard Endpoint
 * Serves prediction data for Web UI
 */

import type { Request, Response } from "express";
import {
  checkPredictions,
  getPredictionStats,
  getRecentDeliveries,
} from "../../agents/predictive-integration.js";
import {
  isPredictiveServiceRunning,
  getPredictiveService,
} from "../../agents/predictive-service.js";

/**
 * GET /api/predictive/dashboard
 * Returns dashboard data for predictive engine
 */
export async function handlePredictiveDashboard(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const running = isPredictiveServiceRunning();
    
    if (!running) {
      res.json({
        status: "disabled",
        message: "Predictive engine not running",
        data: null,
      });
      return;
    }
    
    const service = getPredictiveService();
    if (!service) {
      res.status(500).json({ error: "Service not available" });
      return;
    }
    
    const stats = getPredictionStats();
    const predictions = await checkPredictions();
    const deliveries = getRecentDeliveries(20);
    const config = service.getConfig();
    const engine = service.getEngine();
    const patterns = engine ? engine.getPatterns().slice(0, 50) : [];
    
    res.json({
      status: "running",
      config: {
        autoDeliver: config.autoDeliver.enabled,
        maxPerDay: config.autoDeliver.maxPerDay,
        quietHours: config.autoDeliver.quietHours,
        minConfidence: config.autoDeliver.minConfidence,
      },
      stats: {
        totalEvents: stats?.totalEvents ?? 0,
        patternCount: stats?.patternCount ?? 0,
        todayPredictions: stats?.todayPredictions ?? 0,
        todayDeliveries: stats?.todayDeliveries ?? 0,
        accuracy: stats?.accuracy ?? 0,
      },
      predictions: predictions.slice(0, 10).map(p => ({
        action: p.action,
        category: p.category,
        priority: p.priority,
        confidence: Math.round(p.confidence * 100),
        message: p.message,
        timestamp: p.timestamp,
      })),
      recentDeliveries: deliveries.map(d => ({
        action: d.action,
        message: d.message,
        timestamp: d.timestamp,
        accepted: d.accepted,
      })),
      topPatterns: patterns
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 20)
        .map(p => ({
          name: p.pattern,
          type: p.category,
          confidence: Math.round(p.confidence * 100),
          occurrences: p.frequency,
          lastSeen: p.lastOccurrence,
        })),
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * POST /api/predictive/feedback
 * Record user feedback on prediction
 */
export async function handlePredictiveFeedback(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { predictionId, accepted, feedback } = req.body;
    
    if (!predictionId) {
      res.status(400).json({ error: "predictionId required" });
      return;
    }
    
    const service = getPredictiveService();
    if (!service) {
      res.status(500).json({ error: "Service not available" });
      return;
    }
    
    service.recordFeedback(predictionId, accepted, feedback);
    
    res.json({
      success: true,
      message: "Feedback recorded",
    });
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(500).json({
      error: "Failed to record feedback",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * GET /api/predictive/patterns
 * Get learned patterns
 */
export async function handleGetPatterns(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string || "50", 10);
    const type = req.query.type as string;
    
    const service = getPredictiveService();
    if (!service) {
      res.status(500).json({ error: "Service not available" });
      return;
    }
    
    let patterns = service.getEngine().getPatterns();
    
    if (type) {
      patterns = patterns.filter(p => p.type === type);
    }
    
    res.json({
      patterns: patterns
        .slice(0, limit)
        .map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          confidence: Math.round(p.confidence * 100),
          occurrences: p.occurrences,
          lastSeen: p.lastSeen,
          metadata: p.metadata,
        })),
      total: patterns.length,
    });
  } catch (error) {
    console.error("Patterns error:", error);
    res.status(500).json({
      error: "Failed to fetch patterns",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
