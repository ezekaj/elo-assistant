/**
 * LSP (Language Server Protocol) Integration
 * 
 * This module provides LSP support for OpenClaw, enabling code intelligence
 * features like go-to-definition, find references, hover, and diagnostics.
 * 
 * @example
 * ```typescript
 * import { LspServerManager, createLspTool } from "./lsp";
 * 
 * // Create LSP tool for agent
 * const lspTool = createLspTool(workspaceRoot);
 * 
 * // Register LSP server
 * const manager = getLspServerManager(workspaceRoot);
 * manager.registerServer("typescript", {
 *   command: "typescript-language-server",
 *   args: ["--stdio"],
 *   extensionToLanguage: {
 *     ".ts": "typescript",
 *     ".tsx": "typescriptreact",
 *   },
 * });
 * 
 * // Start server
 * await manager.startServer("typescript");
 * 
 * // Go to definition
 * const definition = await manager.goToDefinition("src/file.ts", { line: 10, character: 5 });
 * ```
 * 
 * @module lsp
 */

// ============================================================================
// TYPES
// ============================================================================

export * from "./types.js";

// ============================================================================
// CONFIG
// ============================================================================

export {
  lspServerConfigSchema,
  lspServersPluginSchema,
  lspPluginConfigSchema,
  lspSettingsSchema,
  DEFAULT_LSP_SETTINGS,
  LSP_SERVER_PRESETS,
  getLspServerForExtension,
  getLanguageId,
  supportsMethod,
  type LspServerConfig,
  type LspServersPluginConfig,
  type LspPluginConfig,
  type LspSettings,
} from "./config-types.js";

// ============================================================================
// SERVER MANAGER
// ============================================================================

export {
  LspServerManager,
  getLspServerManager,
  resetLspServerManager,
  type LspServerState,
  type LspServerInstance,
} from "./server-manager.js";

// ============================================================================
// DIAGNOSTICS
// ============================================================================

export {
  DiagnosticsManager,
  getDiagnosticsManager,
  resetDiagnosticsManager,
  severityToString,
  formatDiagnostics,
  formatAllDiagnostics,
  type DiagnosticAttachment,
} from "./diagnostics.js";

// ============================================================================
// TOOL
// ============================================================================

export {
  createLspTool,
  lspToolSchema,
  resetLspServerManager as resetLspTool,
} from "../agents/tools/lsp-tool.js";
