import type { EvolutionConfig } from './types.js';
import { EvolutionService } from './evolution-service.js';

let evolutionServiceInstance: EvolutionService | null = null;

export interface EvolutionServiceConfig {
  openclawDir: string;
  selfEvolvingDir?: string;
  config?: Partial<EvolutionConfig>;
}

/**
 * Initialize the evolution service
 */
export function initEvolutionService(config: EvolutionServiceConfig): EvolutionService {
  if (evolutionServiceInstance) {
    return evolutionServiceInstance;
  }

  evolutionServiceInstance = new EvolutionService({
    openclawDir: config.openclawDir,
    selfEvolvingDir: config.selfEvolvingDir,
    evolutionConfig: config.config
  });

  return evolutionServiceInstance;
}

/**
 * Get the evolution service instance
 */
export function getEvolutionService(): EvolutionService | null {
  return evolutionServiceInstance;
}

/**
 * Check if evolution service is running
 */
export function isEvolutionServiceRunning(): boolean {
  return evolutionServiceInstance !== null;
}

/**
 * Reset evolution service (for tests)
 */
export function resetEvolutionService(): void {
  evolutionServiceInstance = null;
}
