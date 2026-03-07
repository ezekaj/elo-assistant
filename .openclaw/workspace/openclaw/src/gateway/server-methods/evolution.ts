import type { GatewayRequestHandlers } from './types.js';
import { getEvolutionService, isEvolutionServiceRunning } from '../../services/evolution/instance.js';

export const evolutionHandlers: GatewayRequestHandlers = {
  /**
   * Get evolution service status
   */
  'evolution.status': async () => {
    if (!isEvolutionServiceRunning()) {
      return {
        enabled: false,
        error: 'Evolution service not configured'
      };
    }

    const service = getEvolutionService()!;
    return await service.getStatus();
  },

  /**
   * Run evolution cycle
   */
  'evolution.run': async () => {
    if (!isEvolutionServiceRunning()) {
      return {
        success: false,
        error: 'Evolution service not configured'
      };
    }

    const service = getEvolutionService()!;

    try {
      const result = await service.runEvolution();
      return {
        success: true,
        ...result
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Get evolution history
   */
  'evolution.history': async (payload: { limit?: number }) => {
    if (!isEvolutionServiceRunning()) {
      return [];
    }

    const service = getEvolutionService()!;
    const limit = payload.limit || 20;
    return await service.getHistory(limit);
  },

  /**
   * Get evolution config
   */
  'evolution.config.get': async () => {
    if (!isEvolutionServiceRunning()) {
      return { enabled: false };
    }

    const service = getEvolutionService()!;
    return service.getConfig();
  },

  /**
   * Update evolution config
   */
  'evolution.config.update': async (payload: Partial<{
    enabled: boolean;
    schedule: string | null;
    autoApply: boolean;
    requireTests: boolean;
    minAccuracy: number;
  }>) => {
    if (!isEvolutionServiceRunning()) {
      return {
        success: false,
        error: 'Evolution service not configured'
      };
    }

    const service = getEvolutionService()!;
    service.updateConfig(payload);
    return {
      success: true,
      config: service.getConfig()
    };
  },

  /**
   * Manually apply a proposal
   */
  'evolution.proposal.apply': async (payload: { proposalId: string }) => {
    if (!isEvolutionServiceRunning()) {
      return {
        success: false,
        error: 'Evolution service not configured'
      };
    }

    const service = getEvolutionService()!;

    // Get proposal from history
    const history = await service.getHistory(100);
    const entry = history.find(e => e.proposal.id === payload.proposalId);

    if (!entry) {
      return {
        success: false,
        error: 'Proposal not found'
      };
    }

    if (entry.applied) {
      return {
        success: false,
        error: 'Proposal already applied'
      };
    }

    try {
      await service.applyProposal(entry.proposal, entry.result);
      return {
        success: true,
        message: 'Proposal applied successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
