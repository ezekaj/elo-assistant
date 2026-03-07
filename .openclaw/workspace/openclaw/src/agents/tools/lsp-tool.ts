/**
 * LSP Tool
 * 
 * Agent tool for LSP operations: definition, references, hover, symbols, etc.
 */

import { Type } from "@sinclair/typebox";
import path from "node:path";
import { jsonResult, type AnyAgentTool } from "./common.js";
import { getLspServerManager, resetLspServerManager } from "../../lsp/server-manager.js";
import type { Position, Location, DocumentSymbol, SymbolInformation } from "../../lsp/types.js";

// ============================================================================
// LSP TOOL SCHEMA
// ============================================================================

const LspOperationSchema = Type.Union([
  Type.Literal("goToDefinition"),
  Type.Literal("findReferences"),
  Type.Literal("hover"),
  Type.Literal("documentSymbol"),
  Type.Literal("workspaceSymbol"),
  Type.Literal("goToImplementation"),
  Type.Literal("prepareCallHierarchy"),
  Type.Literal("incomingCalls"),
  Type.Literal("outgoingCalls"),
  Type.Literal("completion"),
  Type.Literal("registerServer"),
  Type.Literal("listServers"),
  Type.Literal("startServer"),
  Type.Literal("stopServer"),
]);

const LspPositionSchema = Type.Object({
  line: Type.Number({ description: "Line number (1-indexed)", minimum: 1 }),
  character: Type.Number({ description: "Character offset (1-indexed)", minimum: 1 }),
});

const LspToolSchema = Type.Object({
  operation: LspOperationSchema,
  filePath: Type.Optional(Type.String({ description: "File path (absolute or relative to workspace)" })),
  position: Type.Optional(LspPositionSchema),
  query: Type.Optional(Type.String({ description: "Query string (for workspaceSymbol)" })),
  serverName: Type.Optional(Type.String({ description: "LSP server name" })),
  serverConfig: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  callHierarchyItem: Type.Optional(Type.Unknown()),
});

// ============================================================================
// LSP TOOL IMPLEMENTATION
// ============================================================================

export function createLspTool(workspaceRoot: string): AnyAgentTool {
  const resolvedWorkspaceRoot = workspaceRoot || process.cwd();

  // Implementation extracted to avoid 'this' context issues
  async function callImpl(params: Record<string, unknown>) {
    const operation = params.operation as string;
    const filePath = params.filePath as string | undefined;
    const position = params.position as Position | undefined;
    const query = params.query as string | undefined;
    const serverName = params.serverName as string | undefined;
    const serverConfig = params.serverConfig as Record<string, unknown> | undefined;
    const callHierarchyItem = params.callHierarchyItem;

    try {
      const manager = getLspServerManager(resolvedWorkspaceRoot);

      switch (operation) {
        case "registerServer": {
          if (!serverName || !serverConfig) {
            return jsonResult({
              success: false,
              error: "serverName and serverConfig are required for registerServer",
            });
          }

          // Note: In a real implementation, you'd import and validate with lspServerConfigSchema
          // For now, just register with minimal validation
          try {
            manager.registerServer(serverName, serverConfig as any);
            return jsonResult({
              success: true,
              output: `Registered LSP server: ${serverName}`,
            });
          } catch (err) {
            return jsonResult({
              success: false,
              error: `Failed to register server: ${(err as Error).message}`,
            });
          }
        }

        case "listServers": {
          const servers = Array.from(manager.getServers().entries()).map(([name, instance]) => ({
            name,
            state: instance.state,
            extensions: Object.keys(instance.config.extensionToLanguage),
          }));

          return jsonResult({
            success: true,
            output: servers.length > 0
              ? `Registered LSP servers:\n${servers.map((s) => 
                  `- ${s.name}: ${s.state} (${s.extensions.join(", ")})`
                ).join("\n")}`
              : "No LSP servers registered",
            servers,
          });
        }

        case "startServer": {
          if (!serverName) {
            return jsonResult({
              success: false,
              error: "serverName is required for startServer",
            });
          }

          try {
            await manager.startServer(serverName);
            return jsonResult({
              success: true,
              output: `Started LSP server: ${serverName}`,
            });
          } catch (err) {
            return jsonResult({
              success: false,
              error: `Failed to start server: ${(err as Error).message}`,
            });
          }
        }

        case "stopServer": {
          if (!serverName) {
            return jsonResult({
              success: false,
              error: "serverName is required for stopServer",
            });
          }

          try {
            await manager.stopServer(serverName);
            return jsonResult({
              success: true,
              output: `Stopped LSP server: ${serverName}`,
            });
          } catch (err) {
            return jsonResult({
              success: false,
              error: `Failed to stop server: ${(err as Error).message}`,
            });
          }
        }

        case "goToDefinition": {
          if (!filePath || !position) {
            return jsonResult({
              success: false,
              error: "filePath and position are required for goToDefinition",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.goToDefinition(resolvedPath, position);

          if (!result) {
            return jsonResult({ success: true, output: "No definition found" });
          }

          const locations = Array.isArray(result) ? result : [result];
          return jsonResult({
            success: true,
            output: formatLocations(locations, "Definition"),
            locations,
          });
        }

        case "findReferences": {
          if (!filePath || !position) {
            return jsonResult({
              success: false,
              error: "filePath and position are required for findReferences",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.findReferences(resolvedPath, position);

          if (!result || result.length === 0) {
            return jsonResult({ success: true, output: "No references found" });
          }

          return jsonResult({
            success: true,
            output: formatLocations(result, "References"),
            references: result,
          });
        }

        case "hover": {
          if (!filePath || !position) {
            return jsonResult({
              success: false,
              error: "filePath and position are required for hover",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.hover(resolvedPath, position);

          if (!result) {
            return jsonResult({ success: true, output: "No hover information available" });
          }

          const content = formatHoverContent(result.contents);
          return jsonResult({
            success: true,
            output: content,
            hover: result,
          });
        }

        case "documentSymbol": {
          if (!filePath) {
            return jsonResult({
              success: false,
              error: "filePath is required for documentSymbol",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.documentSymbol(resolvedPath);

          if (!result || result.length === 0) {
            return jsonResult({ success: true, output: "No symbols found in document" });
          }

          const formatted = formatSymbols(result);
          return jsonResult({
            success: true,
            output: `Document symbols:\n${formatted}`,
            symbols: result,
          });
        }

        case "workspaceSymbol": {
          // This requires an active server connection
          const servers = manager.getServers();
          const firstServer = servers.values().next().value;
          
          if (!firstServer?.connection) {
            return jsonResult({
              success: false,
              error: "No active LSP server connection. Start a server first.",
            });
          }

          const result = await firstServer.connection.sendRequest<SymbolInformation[]>(
            "workspace/symbol",
            { query: query || "" }
          );

          if (!result || result.length === 0) {
            return jsonResult({ success: true, output: "No symbols found" });
          }

          return jsonResult({
            success: true,
            output: `Workspace symbols:\n${result.map((s) => 
              `- ${s.name} (${symbolKindToString(s.kind)}) - ${uriToPath(s.location.uri)}`
            ).join("\n")}`,
            symbols: result,
          });
        }

        case "goToImplementation": {
          if (!filePath || !position) {
            return jsonResult({
              success: false,
              error: "filePath and position are required for goToImplementation",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.goToImplementation(resolvedPath, position);

          if (!result) {
            return jsonResult({ success: true, output: "No implementations found" });
          }

          const locations = Array.isArray(result) ? result : [result];
          return jsonResult({
            success: true,
            output: formatLocations(locations, "Implementations"),
            locations,
          });
        }

        case "prepareCallHierarchy": {
          if (!filePath || !position) {
            return jsonResult({
              success: false,
              error: "filePath and position are required for prepareCallHierarchy",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.prepareCallHierarchy(resolvedPath, position);

          if (!result || result.length === 0) {
            return jsonResult({ success: true, output: "No call hierarchy available at this position" });
          }

          return jsonResult({
            success: true,
            output: `Call hierarchy items:\n${result.map((item, i) =>
              `${i + 1}. ${item.name} (${symbolKindToString(item.kind)})\n   ${uriToPath(item.uri)}:${item.selectionRange.start.line + 1}`
            ).join("\n")}`,
            items: result,
          });
        }

        case "incomingCalls": {
          if (!callHierarchyItem) {
            return jsonResult({
              success: false,
              error: "callHierarchyItem is required for incomingCalls",
            });
          }

          const result = await manager.incomingCalls(callHierarchyItem as any);

          if (!result || result.length === 0) {
            return jsonResult({ success: true, output: "No incoming calls" });
          }

          return jsonResult({
            success: true,
            output: `Callers:\n${result.map((call, i) =>
              `${i + 1}. ${call.from.name}\n   ${uriToPath(call.from.uri)}:${call.from.selectionRange.start.line + 1}`
            ).join("\n")}`,
            calls: result,
          });
        }

        case "outgoingCalls": {
          if (!callHierarchyItem) {
            return jsonResult({
              success: false,
              error: "callHierarchyItem is required for outgoingCalls",
            });
          }

          const result = await manager.outgoingCalls(callHierarchyItem as any);

          if (!result || result.length === 0) {
            return jsonResult({ success: true, output: "No outgoing calls" });
          }

          return jsonResult({
            success: true,
            output: `Callees:\n${result.map((call, i) =>
              `${i + 1}. ${call.to.name}\n   ${uriToPath(call.to.uri)}:${call.to.selectionRange.start.line + 1}`
            ).join("\n")}`,
            calls: result,
          });
        }

        case "completion": {
          if (!filePath || !position) {
            return jsonResult({
              success: false,
              error: "filePath and position are required for completion",
            });
          }

          const resolvedPath = resolveFilePath(filePath, resolvedWorkspaceRoot);
          const result = await manager.completion(resolvedPath, position);

          if (!result || result.items.length === 0) {
            return jsonResult({ success: true, output: "No completions available" });
          }

          const items = result.items.slice(0, 20); // Limit to 20 items
          return jsonResult({
            success: true,
            output: `Completions:\n${items.map((item, i) =>
              `${i + 1}. ${item.label}${item.detail ? ` - ${item.detail}` : ""}`
            ).join("\n")}${result.items.length > 20 ? `\n... and ${result.items.length - 20} more` : ""}`,
            completions: result,
          });
        }

        default:
          return jsonResult({
            success: false,
            error: `Unknown operation: ${operation}`,
          });
      }
    } catch (err) {
      const error = err as Error;
      return jsonResult({
        success: false,
        error: `LSP error: ${error.message}`,
      });
    }
  }

  return {
    label: "LSP",
    name: "LSP",
    description: `Language Server Protocol (LSP) tool for code intelligence.

Operations:
- goToDefinition: Navigate to the definition of a symbol
- findReferences: Find all references to a symbol
- hover: Get type information and documentation at a position
- documentSymbol: List all symbols in a document
- workspaceSymbol: Search symbols across the workspace
- goToImplementation: Navigate to implementations of an interface
- prepareCallHierarchy: Get call hierarchy for a function/method
- incomingCalls: Get callers of a function (use after prepareCallHierarchy)
- outgoingCalls: Get callees of a function (use after prepareCallHierarchy)
- completion: Get code completions at a position
- registerServer: Register a new LSP server configuration
- listServers: List all registered LSP servers
- startServer: Manually start an LSP server
- stopServer: Stop an LSP server

Common LSP servers:
- TypeScript: typescript-language-server --stdio
- Python: pylsp
- Rust: rust-analyzer
- Go: gopls
- C/C++: clangd

File positions are 1-indexed (line 1, character 1 = start of file).`,
    parameters: LspToolSchema,
    isReadOnly: () => true,
    isConcurrencySafe: () => false, // LSP servers may have state

    async description(params: Record<string, unknown>) {
      const operation = params.operation as string;
      const filePath = params.filePath as string | undefined;
      return `LSP ${operation}${filePath ? ` on ${filePath}` : ""}`;
    },

    userFacingName() {
      return "LSP";
    },

    async validateInput(params: Record<string, unknown>) {
      const operation = params.operation;
      if (!operation || typeof operation !== "string") {
        return {
          result: false,
          message: "operation is required and must be a string",
          errorCode: 1,
        };
      }

      const validOps = [
        "goToDefinition", "findReferences", "hover", "documentSymbol",
        "workspaceSymbol", "goToImplementation", "prepareCallHierarchy",
        "incomingCalls", "outgoingCalls", "completion",
        "registerServer", "listServers", "startServer", "stopServer",
      ];

      if (!validOps.includes(operation)) {
        return {
          result: false,
          message: `Invalid operation. Must be one of: ${validOps.join(", ")}`,
          errorCode: 2,
        };
      }

      return { result: true };
    },

    async call(params: Record<string, unknown>, context: any) {
      return callImpl(params);
    },

    async execute(toolCallId: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown) {
      const args = params as Record<string, unknown>;
      const result = await callImpl(args);
      
      return {
        tool_use_id: toolCallId,
        type: "tool_result",
        content: typeof result.content === "string" 
          ? result.content 
          : JSON.stringify(result.content, null, 2),
      };
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function resolveFilePath(filePath: string, workspaceRoot: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(workspaceRoot, filePath);
}

function uriToPath(uri: string): string {
  let p = uri.replace(/^file:\/\//, "");
  if (/^\/[A-Za-z]:/.test(p)) {
    p = p.slice(1);
  }
  try {
    p = decodeURIComponent(p);
  } catch {
    // ignore
  }
  return p;
}

function formatLocations(locations: Location[], title: string): string {
  return `${title}:\n${locations.map((loc, i) => {
    const p = uriToPath(loc.uri);
    return `${i + 1}. ${p}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`;
  }).join("\n")}`;
}

function formatHoverContent(contents: unknown): string {
  if (typeof contents === "string") {
    return contents;
  }

  if (typeof contents === "object" && contents !== null) {
    const obj = contents as any;
    if (obj.kind === "markdown" || obj.kind === "plaintext") {
      return obj.value;
    }
    if (obj.language && obj.value) {
      return `\`\`\`${obj.language}\n${obj.value}\n\`\`\``;
    }
    if (Array.isArray(contents)) {
      return (contents as any[]).map(formatHoverContent).join("\n\n");
    }
  }

  return String(contents);
}

function formatSymbols(symbols: DocumentSymbol[] | SymbolInformation[]): string {
  if (symbols.length === 0) return "";

  // Check if DocumentSymbol (has children)
  if ("children" in symbols[0]) {
    return formatDocumentSymbols(symbols as DocumentSymbol[], 0);
  }

  // SymbolInformation
  return (symbols as SymbolInformation[])
    .map((s) => `- ${s.name} (${symbolKindToString(s.kind)})`)
    .join("\n");
}

function formatDocumentSymbols(symbols: DocumentSymbol[], indent: number): string {
  const prefix = "  ".repeat(indent);
  return symbols
    .map((s) => {
      const line = `${prefix}- ${s.name} (${symbolKindToString(s.kind)})${s.detail ? ` - ${s.detail}` : ""}`;
      const children = s.children && s.children.length > 0
        ? "\n" + formatDocumentSymbols(s.children, indent + 1)
        : "";
      return line + children;
    })
    .join("\n");
}

function symbolKindToString(kind: number): string {
  const kinds: Record<number, string> = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
  };
  return kinds[kind] || "Unknown";
}

// ============================================================================
// EXPORTS
// ============================================================================

export { resetLspServerManager };
