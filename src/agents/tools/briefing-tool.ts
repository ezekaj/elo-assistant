/**
 * Briefing Tool
 *
 * Allows agents to read pre-generated daily briefings.
 * The briefings are generated incrementally after each compaction - agent just reads.
 * This saves tokens by avoiding LLM calls to summarize context.
 */

import { Type } from "@sinclair/typebox";
import {
  getDailyBriefingText,
  getRecentBriefingsText,
  loadDailyBriefing,
  getRecentBriefings,
  cleanupOldBriefings,
} from "../compaction-briefing.js";
import { jsonResult, readStringParam, type AnyAgentTool } from "./common.js";

const BriefingToolSchema = Type.Object({
  action: Type.String({ description: "Action: 'today', 'recent', 'details', 'cleanup'" }),
  // For recent action
  days: Type.Optional(
    Type.Number({ description: "Number of days for recent briefings (default: 3)" }),
  ),
  // For details action
  date: Type.Optional(Type.String({ description: "Date in YYYY-MM-DD format" })),
  // For cleanup action
  keepDays: Type.Optional(Type.Number({ description: "Days to keep (default: 30)" })),
});

/**
 * Create the briefing tool for agents
 */
export function createBriefingTool(): AnyAgentTool {
  return {
    name: "briefing",
    label: "Briefing",
    description:
      "Read pre-generated daily briefings that summarize session compactions. Use 'today' to get today's briefing, 'recent' for last few days, 'details' for structured data, or 'cleanup' to remove old briefings. Briefings are generated automatically - just read them to save tokens.",
    parameters: BriefingToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = readStringParam(params, "action") || "today";

      switch (action) {
        case "today": {
          // Simple text briefing for today - agent just reads this
          const text = getDailyBriefingText();
          return jsonResult({
            success: true,
            briefing: text,
            date: new Date().toISOString().split("T")[0],
          });
        }

        case "recent": {
          // Combined text for recent days
          const days = (params.days as number) || 3;
          const text = getRecentBriefingsText(days);
          return jsonResult({
            success: true,
            briefing: text,
            days,
          });
        }

        case "details": {
          // Structured data for a specific date
          const date = readStringParam(params, "date");
          const briefing = loadDailyBriefing(undefined, date || undefined);

          return jsonResult({
            success: true,
            date: briefing.date,
            totalCompactions: briefing.totalCompactions,
            totalTokensSaved: briefing.totalTokensSaved,
            sessions: briefing.sessions,
            narrative: briefing.narrative,
          });
        }

        case "history": {
          // List recent briefings with basic stats
          const days = (params.days as number) || 7;
          const briefings = getRecentBriefings(days);

          return jsonResult({
            success: true,
            briefings: briefings.map((b) => ({
              date: b.date,
              compactions: b.totalCompactions,
              tokensSaved: b.totalTokensSaved,
              sessions: b.sessions.length,
            })),
            count: briefings.length,
          });
        }

        case "cleanup": {
          // Remove old briefings
          const keepDays = (params.keepDays as number) || 30;
          const deleted = cleanupOldBriefings(keepDays);

          return jsonResult({
            success: true,
            deleted,
            message: `Removed ${deleted} briefing files older than ${keepDays} days`,
          });
        }

        default:
          return jsonResult({
            success: false,
            error: `Unknown action: ${action}. Use 'today', 'recent', 'details', 'history', or 'cleanup'.`,
          });
      }
    },
  };
}
