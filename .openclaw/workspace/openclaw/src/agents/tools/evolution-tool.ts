/**
 * Evolution Tool
 * Exposes EvolutionService capabilities to the agent
 */

import { Type } from "@sinclair/typebox";
import {
  getEvolutionService,
  isEvolutionServiceRunning,
} from "../../services/evolution/instance.js";
import { jsonResult, readStringParam, type AnyAgentTool } from "./common.js";

const EvolutionToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("status"),
    Type.Literal("run"),
    Type.Literal("history"),
    Type.Literal("apply"),
    Type.Literal("config"),
  ]),
  // For history action
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  // For apply action
  proposalId: Type.Optional(Type.String()),
  // For config action
  enabled: Type.Optional(Type.Boolean()),
  autoApply: Type.Optional(Type.Boolean()),
  requireTests: Type.Optional(Type.Boolean()),
  minAccuracy: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

type EvolutionToolOptions = {
  agentSessionKey?: string;
};

/**
 * Create evolution tool
 */
export function createEvolutionTool(options?: EvolutionToolOptions): AnyAgentTool {
  return {
    name: "evolution",
    label: "Evolution",
    description: `Control the self-improving code evolution system.

ACTIONS:
- status: Get evolution service status and health
- run: Trigger a full evolution cycle (analyze, generate, test)
- history: View recent evolution history and proposals
- apply: Manually apply a pending proposal by ID
- config: Get/update evolution configuration

SAFETY:
- Auto-apply is OFF by default - proposals require manual approval
- All proposals are logged with timestamps and confidence scores
- Failed applications are rolled back automatically

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
    parameters: EvolutionToolSchema,
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = readStringParam(params, "action", { required: true });

      if (!isEvolutionServiceRunning()) {
        return jsonResult({
          success: false,
          error: "Evolution service not initialized",
          running: false,
          hint: "The evolution service requires the openclaw-self-evolving repo at ../openclaw-self-evolving",
        });
      }

      const service = getEvolutionService()!;

      switch (action) {
        case "status": {
          try {
            const status = await service.getStatus();
            return jsonResult({
              success: true,
              status,
            });
          } catch (error: any) {
            return jsonResult({
              success: false,
              error: error.message,
            });
          }
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
          try {
            const limit = (params.limit as number) || 20;
            const history = await service.getHistory(limit);
            return jsonResult({
              success: true,
              history,
              count: history.length,
            });
          } catch (error: any) {
            return jsonResult({
              success: false,
              error: error.message,
            });
          }
        }

        case "apply": {
          const proposalId = readStringParam(params, "proposalId", { required: true });
          if (!proposalId) {
            return jsonResult({
              success: false,
              error: "proposalId is required for apply action",
            });
          }

          try {
            const history = await service.getHistory(100);
            const entry = history.find(e => e.proposal.id === proposalId);

            if (!entry) {
              return jsonResult({
                success: false,
                error: "Proposal not found",
                hint: "Use action=history to list available proposals",
              });
            }

            if (entry.applied) {
              return jsonResult({
                success: false,
                error: "Proposal already applied",
              });
            }

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
          try {
            // Update config if parameters provided
            if (
              params.enabled !== undefined ||
              params.autoApply !== undefined ||
              params.requireTests !== undefined ||
              params.minAccuracy !== undefined
            ) {
              const updates: Record<string, unknown> = {};
              if (params.enabled !== undefined) updates.enabled = params.enabled;
              if (params.autoApply !== undefined) updates.autoApply = params.autoApply;
              if (params.requireTests !== undefined) updates.requireTests = params.requireTests;
              if (params.minAccuracy !== undefined) updates.minAccuracy = params.minAccuracy;

              service.updateConfig(updates);
            }

            const config = service.getConfig();
            return jsonResult({
              success: true,
              config,
            });
          } catch (error: any) {
            return jsonResult({
              success: false,
              error: error.message,
            });
          }
        }

        default:
          return jsonResult({
            success: false,
            error: `Unknown action: ${action}`,
            validActions: ["status", "run", "history", "apply", "config"],
          });
      }
    },
  };
}
