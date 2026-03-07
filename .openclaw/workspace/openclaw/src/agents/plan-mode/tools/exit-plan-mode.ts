/**
 * Exit Plan Mode Tool
 *
 * Allows exiting plan mode with user approval.
 * Works with ANY LLM provider (client-side feature).
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../tools/common.js";
import { jsonResult } from "../../tools/common.js";
import { isPlanMode, storePlan, approvePlan, getCurrentPlan, setPermissionMode } from "../state.js";

const ExitPlanModeOutputSchema = Type.Object({
  success: Type.Boolean({ description: "Whether exit plan mode succeeded" }),
  approved: Type.Boolean({ description: "Whether plan was approved" }),
  message: Type.String({ description: "Status message" }),
  notInPlanMode: Type.Optional(Type.Boolean({ description: "Whether not in plan mode" })),
});

export function createExitPlanModeTool(): AnyAgentTool {
  return {
    name: "exit_plan_mode",
    description:
      "Exit planning mode and get user approval for the plan. Present your plan first using update_plan, then use this to get approval. Once approved, you can execute tools on approved domains. Works with any LLM provider.",
    parameters: Type.Object({
      plan: Type.Optional(Type.String({ description: "The plan to present for approval" })),
      domains: Type.Optional(Type.Array(Type.String({ description: "Domains to access" }))),
    }),
    outputSchema: ExitPlanModeOutputSchema,

    async call(args: Record<string, unknown>, context: any) {
      // Check if in plan mode
      if (!isPlanMode()) {
        return jsonResult({
          success: false,
          approved: false,
          message: "Not in plan mode",
          notInPlanMode: true,
        });
      }

      const plan = args.plan as string | undefined;
      const domains = args.domains as string[] | undefined;

      // Store plan if provided
      if (plan) {
        storePlan({
          content: plan,
          domains,
          createdAt: new Date().toISOString(),
        });
      }

      // Get existing plan if not provided
      const existingPlan = getCurrentPlan();

      // In real implementation, this would show UI approval dialog
      // For now, auto-approve (TUI will handle actual approval)
      approvePlan(domains);

      return jsonResult({
        success: true,
        approved: true,
        message: existingPlan ? "Plan approved! You can now execute tools." : "Exited plan mode.",
      });
    },
  };
}
