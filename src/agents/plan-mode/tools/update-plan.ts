/**
 * Update Plan Tool
 *
 * Allows storing a plan for user approval.
 * Works with ANY LLM provider (client-side feature).
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../tools/common.js";
import { jsonResult } from "../../tools/common.js";
import { storePlan, isPlanMode } from "../state.js";

const UpdatePlanOutputSchema = Type.Object({
  success: Type.Boolean({ description: "Whether plan update succeeded" }),
  planStored: Type.Boolean({ description: "Whether plan was stored" }),
  message: Type.Optional(Type.String({ description: "Status message" })),
  notInPlanMode: Type.Optional(Type.Boolean({ description: "Whether not in plan mode" })),
});

export function createUpdatePlanTool(): AnyAgentTool {
  return {
    name: "update_plan",
    description:
      "Present a plan to the user for approval before taking actions. The user will see the domains you intend to visit and your approach. Once approved, you can proceed with actions on the approved domains without additional permission prompts. Works with any LLM provider.",
    parameters: Type.Object({
      plan: Type.String({ description: "The plan to present" }),
      domains: Type.Optional(
        Type.Array(
          Type.String({
            description:
              'List of domains you will visit (e.g., ["github.com", "stackoverflow.com"])',
          }),
        ),
      ),
      actions: Type.Optional(Type.Array(Type.String({ description: "Actions to take" }))),
      risks: Type.Optional(Type.Array(Type.String({ description: "Identified risks" }))),
    }),
    outputSchema: UpdatePlanOutputSchema,

    async call(args: Record<string, unknown>, context: any) {
      // Check if in plan mode
      if (!isPlanMode()) {
        return jsonResult({
          success: false,
          planStored: false,
          message: "Not in plan mode. Use enter_plan_mode first.",
          notInPlanMode: true,
        });
      }

      const plan = {
        content: args.plan as string,
        domains: args.domains as string[] | undefined,
        actions: args.actions as string[] | undefined,
        risks: args.risks as string[] | undefined,
        createdAt: new Date().toISOString(),
      };

      // Store plan for approval
      storePlan(plan);

      return jsonResult({
        success: true,
        planStored: true,
        message: "Plan stored. Use exit_plan_mode to get user approval.",
      });
    },
  };
}
