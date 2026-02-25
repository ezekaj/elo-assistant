/**
 * Enter Plan Mode Tool
 *
 * Allows entering plan mode where write tools are blocked.
 * Works with ANY LLM provider (client-side feature).
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../../tools/common.js";
import { jsonResult } from "../../tools/common.js";
import { setPermissionMode, isPlanMode, getPermissionMode } from "../state.js";

const EnterPlanModeOutputSchema = Type.Object({
  success: Type.Boolean({ description: "Whether entering plan mode succeeded" }),
  mode: Type.String({ description: "Current permission mode" }),
  message: Type.String({ description: "Status message" }),
  alreadyInPlanMode: Type.Optional(Type.Boolean({ description: "Whether already in plan mode" })),
});

export function createEnterPlanModeTool(): AnyAgentTool {
  return {
    name: "enter_plan_mode",
    description:
      "Enter planning mode for exploring and creating plans. In plan mode, you can analyze and explore but cannot execute write tools (edit, write, bash, etc.). Use exit_plan_mode when ready for approval. Works with any LLM provider.",
    parameters: Type.Object({}),
    outputSchema: EnterPlanModeOutputSchema,

    async call(args: Record<string, unknown>, context: any) {
      // Check if already in plan mode
      if (isPlanMode()) {
        return jsonResult({
          success: false,
          mode: "plan",
          message: "Already in plan mode",
          alreadyInPlanMode: true,
        });
      }

      // Enter plan mode
      setPermissionMode("plan");

      return jsonResult({
        success: true,
        mode: "plan",
        message:
          "Entered plan mode. You can now explore and create plans without executing tools. Use exit_plan_mode when ready for approval.",
      });
    },
  };
}
