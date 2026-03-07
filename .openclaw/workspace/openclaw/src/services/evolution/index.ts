export { EvolutionService } from './evolution-service.js';
export {
  initEvolutionService,
  getEvolutionService,
  isEvolutionServiceRunning,
  resetEvolutionService
} from './instance.js';
export type {
  CodePatch,
  CodeChange,
  TestResult,
  BenchmarkResult,
  ComparisonResult,
  ExperimentResult,
  EvolutionEntry,
  BehaviorAnalysis,
  EvolutionStatus,
  EvolutionConfig
} from './types.js';
