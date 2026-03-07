import { describe, it, expect, beforeEach } from 'vitest';
import { EvolutionService } from './evolution-service.js';
import { resetEvolutionService } from './instance.js';

describe('EvolutionService', () => {
  beforeEach(() => {
    resetEvolutionService();
  });

  it('should create service instance', () => {
    const service = new EvolutionService({
      openclawDir: '/tmp/test-openclaw'
    });

    expect(service).toBeDefined();
  });

  it('should get status', async () => {
    const service = new EvolutionService({
      openclawDir: '/tmp/test-openclaw'
    });

    const status = await service.getStatus();

    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('lastRun');
    expect(status).toHaveProperty('totalRuns');
  });

  it('should get config', () => {
    const service = new EvolutionService({
      openclawDir: '/tmp/test-openclaw',
      evolutionConfig: {
        autoApply: true
      }
    });

    const config = service.getConfig();

    expect(config.autoApply).toBe(true);
    expect(config.enabled).toBe(true);
  });

  it('should update config', () => {
    const service = new EvolutionService({
      openclawDir: '/tmp/test-openclaw'
    });

    service.updateConfig({ autoApply: true });
    const config = service.getConfig();

    expect(config.autoApply).toBe(true);
  });
});
