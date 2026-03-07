/**
 * Plugin Hooks System
 *
 * Comprehensive hooks system matching Claude Code's functionality:
 * - 18 event types for lifecycle coverage
 * - 4 hook types (command, prompt, agent, HTTP)
 * - 4 matcher types for precise targeting
 * - Full JSON output schema validation
 *
 * @module hooks
 */

// Types
export * from "./types.js";

// Matchers
export {
  matchesHookContext,
  getMatchingHooks,
  parseMatcher,
  validateMatcher,
  formatMatcher,
} from "./matchers.js";

// Output Schema
export { validateHookOutput, formatValidationErrors } from "./output-schema.js";

// Command Hook
export {
  executeCommandHook,
  buildHookEnv,
  formatHookCommand,
  type CommandHookResult,
} from "./command-hook.js";

// Executor
export {
  HookExecutor,
  globalHookExecutor,
  initializeHooks,
  type HookExecutionResult,
} from "./executor.js";

// Configuration
export { loadHooksFromConfig, saveHooksToConfig, deleteHooksFromConfig } from "./config.js";
