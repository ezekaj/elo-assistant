/**
 * MCP Tool for Evolution System Control
 *
 * Allows external systems and agents to:
 * - Run evolution cycles
 * - Check evolution status
 * - View evolution history
 * - Apply/reject proposals
 */

import { Type } from "@sinclair/typebox";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import {
  getEvolutionService,
  isEvolutionServiceRunning,
} from "../../services/evolution/instance.js";

const McpEvolutionActionSchema = Type.Union([
  Type.Literal("status"),
  Type.Literal("run"),
  Type.Literal("history"),
  Type.Literal("apply"),
  Type.Literal("config"),
]);

const McpEvolutionSchema = Type.Object({
  action: McpEvolutionActionSchema,
  proposalId: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  enabled: Type.Optional(Type.Boolean()),
  autoApply: Type.Optional(Type.Boolean()),
});

/**
 * Create MCP evolution tool
 */
export function createMcpEvolutionTool(): AnyAgentTool {
  return {
    name: "mcp_evolution",
    label: "MCP Evolution",
    description: `Control the code evolution system (MCP integration).

ACTIONS:
- status: Get evolution service status and health
- run: Trigger a full evolution cycle (analyze, generate, test)
- history: View recent evolution history and proposals
- apply: Manually apply a pending proposal by ID
- config: Get/update evolution configuration

Use this tool when:
- You want to run a code evolution cycle
- You need to check evolution system health
- You want to review or apply code improvement proposals
- You need to configure evolution behavior

Examples:
- Manual evolution run → action="run"
- Check status → action="status"
- Apply proposal → action="apply" proposalId="exec-retry-limit-123"
- View history → action="history" limit=10
- Enable auto-apply → action="config" autoApply=true`,
    parameters: McpEvolutionSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = readStringParam(params, "action", { required: true });
      const service = getEvolutionService();

      if (!service) {
        return jsonResult({
          success: false,
          error: "Evolution service not initialized",
          running: false,
        });
      }

      switch (action) {
        case "status": {
          const status = await service.getStatus();
          return jsonResult({
            success: true,
            status,
          });
        }

        case "run": {
          try {
            const result = await service.runEvolution();
            return jsonResult({
              success: true,
              result,
              message: `Evolution complete: ${result.improvementsApplied} improvements applied`,
            });
          } catch (error: any) {
            return jsonResult({
              success: false,
              error: error.message,
            });
          }
        }

        case "history": {
          const limit = (params.limit as number) || 20;
          const history = await service.getHistory(limit);
          return jsonResult({
            success: true,
            history,
            count: history.length,
          });
        }

        case "apply": {
          const proposalId = readStringParam(params, "proposalId", { required: true });
          const history = await service.getHistory(100);
          const entry = history.find(e => e.proposal.id === proposalId);

          if (!entry) {
            return jsonResult({
              success: false,
              error: "Proposal not found",
            });
          }

          if (entry.applied) {
            return jsonResult({
              success: false,
              error: "Proposal already applied",
            });
          }

          try {
            await service.applyProposal(entry.proposal, entry.result);
            return jsonResult({
              success: true,
              message: "Proposal applied successfully",
              proposal: entry.proposal,
            });
          } catch (error: any) {
            return jsonResult({
              success: false,
              error: error.message,
            });
          }
        }

        case "config": {
          if (params.enabled !== undefined || params.autoApply !== undefined) {
            const updates: any = {};
            if (params.enabled !== undefined) updates.enabled = params.enabled;
            if (params.autoApply !== undefined) updates.autoApply = params.autoApply;

            service.updateConfig(updates);
          }

          const config = service.getConfig();
          return jsonResult({
            success: true,
            config,
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
