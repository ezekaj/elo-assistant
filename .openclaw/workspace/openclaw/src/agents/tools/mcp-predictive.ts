/**
 * MCP Tool for External Prediction Triggers
 *
 * Allows external systems (iOS Shortcuts, IFTTT, Zapier, etc.) to:
 * - Trigger prediction checks
 * - Query prediction status
 * - Record feedback
 * - Update context
 */

import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import {
  getPredictiveService,
  isPredictiveServiceRunning,
} from "../predictive-service.js";
import { updatePredictiveContext } from "../predictive-integration.js";

const McpPredictiveActionSchema = Type.Union([
  Type.Literal("check"),
  Type.Literal("stats"),
  Type.Literal("trigger"),
  Type.Literal("feedback"),
  Type.Literal("patterns"),
  Type.Literal("history"),
]);

const McpPredictiveSchema = Type.Object({
  action: McpPredictiveActionSchema,
  category: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  predictionId: Type.Optional(Type.String()),
  accepted: Type.Optional(Type.Boolean()),
  feedback: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
});

/**
 * Create MCP predictive tool
 */
export function createMcpPredictiveTool(): AnyAgentTool {
  return {
    name: "mcp_predictive",
    label: "MCP Predictive",
    description: `External trigger for predictive engine (MCP integration).

ACTIONS:
- check: Run prediction check and return current predictions
- stats: Get predictive service statistics
- trigger: External trigger with optional category/context (e.g., iOS location change)
- feedback: Record user feedback on a prediction (accepted/rejected)
- patterns: List learned patterns
- history: Get delivery history

Use this tool when:
- External system needs to trigger prediction check (location change, time trigger)
- iOS Shortcut wants to get predictions
- IFTTT/Zapier integration needs predictive data
- External system records feedback

Examples:
- iOS location change → trigger with category="location" context="arrived_home"
- Scheduled task → check to get predictions
- User dismisses notification → feedback with accepted=false`,
    parameters: McpPredictiveSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = readStringParam(params, "action", { required: true });
      const service = getPredictiveService();

      if (!service) {
        return jsonResult({
          success: false,
          error: "Predictive service not initialized",
          running: false,
        });
      }

      switch (action) {
        case "check": {
          const predictions = await service.getPredictions();
          return jsonResult({
            success: true,
            predictions,
            count: predictions.length,
            running: isPredictiveServiceRunning(),
          });
        }

        case "stats": {
          const status = service.getStatus();
          return jsonResult({
            success: true,
            status,
            running: isPredictiveServiceRunning(),
          });
        }

        case "trigger": {
          const category = readStringParam(params, "category");
          const context = readStringParam(params, "context");

          // Update context with trigger
          if (category || context) {
            updatePredictiveContext({
              recentActivity: [
                {
                  type: "external_trigger",
                  timestamp: Date.now(),
                  data: { category, context },
                },
              ],
            });
          }

          // Run immediate prediction check
          const predictions = await service.getPredictions(context);

          return jsonResult({
            success: true,
            predictions,
            triggered: true,
            category,
            context,
            running: isPredictiveServiceRunning(),
          });
        }

        case "feedback": {
          const predictionId = readStringParam(params, "predictionId", { required: true });
          const accepted =
            typeof params.accepted === "boolean" ? params.accepted : undefined;
          const feedback = readStringParam(params, "feedback");

          if (accepted === undefined) {
            return jsonResult({
              success: false,
              error: "accepted parameter required for feedback",
            });
          }

          service.recordFeedback(predictionId, accepted, feedback);

          return jsonResult({
            success: true,
            recorded: true,
            predictionId,
            accepted,
            feedback,
          });
        }

        case "patterns": {
          const patterns = service.getPatterns();
          return jsonResult({
            success: true,
            patterns,
            count: patterns.length,
            running: isPredictiveServiceRunning(),
          });
        }

        case "history": {
          const limit =
            typeof params.limit === "number"
              ? Math.min(100, Math.max(1, params.limit))
              : 20;
          const history = service.getDeliveryHistory(limit);
          return jsonResult({
            success: true,
            history,
            count: history.length,
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
