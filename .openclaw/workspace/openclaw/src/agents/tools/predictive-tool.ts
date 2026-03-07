/**
 * Predictive Tool
 * Exposes PredictiveEngine capabilities to the agent
 */

import { Type } from "@sinclair/typebox";
import {
  checkPredictions,
  updatePredictiveContext,
  recordPredictionFeedback,
  getPredictionStats,
  publishEvent,
  getToolInsights,
  getEventMesh,
} from "../predictive-integration.js";
import {
  getPredictiveService,
  isPredictiveServiceRunning,
} from "../predictive-service.js";
import { jsonResult, readStringParam, type AnyAgentTool } from "./common.js";

const PredictiveToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("check"),
    Type.Literal("update"),
    Type.Literal("feedback"),
    Type.Literal("stats"),
    Type.Literal("publish"),
    Type.Literal("insights"),
    Type.Literal("history"),
    Type.Literal("patterns"),
    Type.Literal("deliveries"),
    Type.Literal("status"),
  ]),
  // For update action
  events: Type.Optional(Type.Record(Type.String(), Type.Any())),
  recentActivity: Type.Optional(
    Type.Array(
      Type.Object({
        type: Type.String(),
        timestamp: Type.Optional(Type.Number()),
        data: Type.Optional(Type.Any()),
      }),
    ),
  ),
  // For feedback action
  predictionId: Type.Optional(Type.String()),
  accepted: Type.Optional(Type.Boolean()),
  feedback: Type.Optional(Type.String()),
  // For publish action
  eventType: Type.Optional(Type.String()),
  eventData: Type.Optional(Type.Any()),
  // For insights/history/deliveries
  days: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number()),
});

type PredictiveToolOptions = {
  agentSessionKey?: string;
};

export function createPredictiveTool(options?: PredictiveToolOptions): AnyAgentTool {
  return {
    name: "predictive",
    label: "Predictive",
    description: `Check for proactive predictions, update context, record feedback, or get analytics.

ACTIONS:
- check: See if there are any proactive suggestions based on current context
- update: Update prediction context with new events or activity
- feedback: Record user feedback on a prediction
- stats: Get prediction statistics
- publish: Publish an event to the event mesh
- insights: Get tool usage insights
- history: Get event mesh history
- patterns: List learned patterns (from predictive service)
- deliveries: Get delivery history
- status: Get predictive service status

Use 'check' to see if there are any proactive suggestions based on current context.`,
    parameters: PredictiveToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = readStringParam(params, "action") as string;

      switch (action) {
        case "check": {
          const predictions = await checkPredictions();
          return jsonResult({
            success: true,
            predictions,
            count: predictions.length,
          });
        }

        case "update": {
          const events = params.events as Record<string, unknown> | undefined;
          const recentActivity = params.recentActivity as
            | Array<{ type: string; timestamp?: number; data?: unknown }>
            | undefined;

          if (events || recentActivity) {
            const eventData = events ? new Map(Object.entries(events)) : undefined;
            updatePredictiveContext({
              events: eventData,
              recentActivity: recentActivity?.map((a) => ({
                type: a.type,
                timestamp: a.timestamp || Date.now(),
                data: a.data,
              })),
            });
          }

          return jsonResult({
            success: true,
            message: "Context updated",
          });
        }

        case "feedback": {
          const predictionId = readStringParam(params, "predictionId");
          const accepted = params.accepted as boolean | undefined;
          const feedbackText = readStringParam(params, "feedback");

          if (!predictionId) {
            return jsonResult({
              success: false,
              error: "predictionId required",
            });
          }

          recordPredictionFeedback(predictionId, accepted ?? true, feedbackText);
          return jsonResult({
            success: true,
            message: "Feedback recorded",
          });
        }

        case "stats": {
          const stats = getPredictionStats();
          return jsonResult({
            success: true,
            stats: stats || { error: "Predictive engine not initialized" },
          });
        }

        case "publish": {
          const eventType = readStringParam(params, "eventType");
          const eventData = params.eventData;

          if (!eventType) {
            return jsonResult({
              success: false,
              error: "eventType required",
            });
          }

          const eventId = await publishEvent(eventType, eventData);
          return jsonResult({
            success: !!eventId,
            eventId,
          });
        }

        case "insights": {
          const days = (params.days as number) || 7;
          const start = Date.now() - days * 24 * 60 * 60 * 1000;
          const insights = getToolInsights({ start });

          return jsonResult({
            success: true,
            insights: insights || { error: "Tool analytics not initialized" },
          });
        }

        case "history": {
          const mesh = getEventMesh();
          if (!mesh) {
            return jsonResult({
              success: false,
              error: "Event mesh not initialized",
            });
          }

          const history = mesh.getHistory(undefined, 50);
          return jsonResult({
            success: true,
            events: history.map((e) => ({
              id: e.id,
              type: e.type,
              source: e.source,
              timestamp: e.timestamp,
            })),
            count: history.length,
          });
        }

        case "patterns": {
          const service = getPredictiveService();
          if (!service) {
            return jsonResult({
              success: false,
              error: "Predictive service not running",
            });
          }

          const patterns = service.getPatterns();
          const limit =
            typeof params.limit === "number"
              ? Math.min(100, Math.max(1, params.limit))
              : 20;

          return jsonResult({
            success: true,
            patterns: patterns.slice(0, limit),
            count: patterns.length,
            running: isPredictiveServiceRunning(),
          });
        }

        case "deliveries": {
          const service = getPredictiveService();
          if (!service) {
            return jsonResult({
              success: false,
              error: "Predictive service not running",
            });
          }

          const limit =
            typeof params.limit === "number"
              ? Math.min(100, Math.max(1, params.limit))
              : 20;

          const history = service.getDeliveryHistory(limit);

          return jsonResult({
            success: true,
            deliveries: history,
            count: history.length,
            running: isPredictiveServiceRunning(),
          });
        }

        case "status": {
          const service = getPredictiveService();
          if (!service) {
            return jsonResult({
              success: false,
              error: "Predictive service not initialized",
              running: false,
            });
          }

          const status = service.getStatus();

          return jsonResult({
            success: true,
            status,
            running: isPredictiveServiceRunning(),
          });
        }

        default:
          return jsonResult({
            success: false,
            error: `Unknown action: ${action}`,
          });
      }
    },
  };
}
