/**
 * LSP Configuration Types
 * 
 * Configuration schema for LSP servers in OpenClaw plugins and settings.
 */

import { z } from "zod";

// ============================================================================
// LSP SERVER CONFIG SCHEMA
// ============================================================================

/**
 * File extension schema - must start with dot
 */
const fileExtensionSchema = z
  .string()
  .min(1)
  .refine((ext) => ext.startsWith("."), {
    message: 'File extensions must start with dot (e.g., ".ts", not "ts")',
  });

/**
 * LSP Server Configuration Schema
 * 
 * @example
 * ```json
 * {
 *   "command": "typescript-language-server",
 *   "args": ["--stdio"],
 *   "extensionToLanguage": {
 *     ".ts": "typescript",
 *     ".tsx": "typescriptreact",
 *     ".js": "javascript",
 *     ".jsx": "javascriptreact"
 *   }
 * }
 * ```
 */
export const lspServerConfigSchema = z.strictObject({
  /** Command to execute the LSP server */
  command: z
    .string()
    .min(1)
    .refine((cmd) => !cmd.includes(" ") || cmd.startsWith("/"), {
      message: "Command should not contain spaces. Use args array for arguments.",
    })
    .describe('Command to execute the LSP server (e.g., "typescript-language-server")'),

  /** Command-line arguments */
  args: z.array(z.string()).optional().describe("Command-line arguments to pass to the server"),

  /** File extension to LSP language ID mapping */
  extensionToLanguage: z
    .record(fileExtensionSchema, z.string())
    .refine((map) => Object.keys(map).length > 0, {
      message: "extensionToLanguage must have at least one mapping",
    })
    .describe("Mapping from file extension to LSP language ID"),

  /** Communication transport mechanism */
  transport: z.enum(["stdio", "socket"]).default("stdio").describe("Communication transport mechanism"),

  /** Environment variables */
  env: z.record(z.string(), z.string()).optional().describe("Environment variables to set when starting the server"),

  /** Initialization options passed during initialize request */
  initializationOptions: z.unknown().optional().describe("Initialization options passed to the server during initialization"),

  /** Settings passed via workspace/didChangeConfiguration */
  settings: z.unknown().optional().describe("Settings passed to the server via workspace/didChangeConfiguration"),

  /** Workspace folder path */
  workspaceFolder: z.string().optional().describe("Workspace folder path to use for the server"),

  /** Startup timeout in milliseconds */
  startupTimeout: z.number().int().positive().optional().default(10000)
    .describe("Maximum time to wait for server startup (milliseconds)"),

  /** Shutdown timeout in milliseconds */
  shutdownTimeout: z.number().int().positive().optional().default(5000)
    .describe("Maximum time to wait for graceful shutdown (milliseconds)"),

  /** Whether to restart on crash */
  restartOnCrash: z.boolean().optional().default(true)
    .describe("Whether to restart the server if it crashes"),

  /** Maximum restart attempts */
  maxRestarts: z.number().int().nonnegative().optional().default(3)
    .describe("Maximum number of restart attempts before giving up"),
});

export type LspServerConfig = z.infer<typeof lspServerConfigSchema>;

// ============================================================================
// LSP PLUGIN CONFIG SCHEMA
// ============================================================================

/**
 * LSP Servers in Plugin Config
 * 
 * Can be:
 * - A path to .lsp.json file
 * - A record of server name -> config
 * - An array of paths or configs
 */
export const lspServersPluginSchema = z.union([
  z.string().describe("Path to .lsp.json configuration file relative to plugin root"),
  z.record(z.string(), lspServerConfigSchema)
    .describe("LSP server configurations keyed by server name"),
  z.array(
    z.union([
      z.string().describe("Path to LSP configuration file"),
      z.record(z.string(), lspServerConfigSchema)
        .describe("Inline LSP server configurations"),
    ])
  ).describe("Array of LSP server configurations (paths or inline definitions)"),
]);

export type LspServersPluginConfig = z.infer<typeof lspServersPluginSchema>;

/**
 * Plugin config with LSP servers
 */
export const lspPluginConfigSchema = z.object({
  lspServers: lspServersPluginSchema.optional(),
});

export type LspPluginConfig = z.infer<typeof lspPluginConfigSchema>;

// ============================================================================
// LSP SETTINGS (USER CONFIG)
// ============================================================================

/**
 * LSP Settings Schema
 * 
 * User-configurable LSP settings in openclaw.config.json
 */
export const lspSettingsSchema = z.object({
  /** Enable/disable LSP integration */
  enabled: z.boolean().default(true).describe("Enable LSP integration"),

  /** Global LSP servers (always available) */
  servers: z.record(z.string(), lspServerConfigSchema).optional()
    .describe("Global LSP server configurations"),

  /** Diagnostics settings */
  diagnostics: z.object({
    enabled: z.boolean().default(true).describe("Enable diagnostic publishing"),
    maxPerFile: z.number().int().positive().default(100)
      .describe("Maximum diagnostics per file"),
    maxTotal: z.number().int().positive().default(500)
      .describe("Maximum total diagnostics"),
    debounceMs: z.number().int().positive().default(300)
      .describe("Debounce time for diagnostic delivery"),
  }).optional().default({}),

  /** Auto-start LSP servers on file open */
  autoStart: z.boolean().default(true)
    .describe("Automatically start LSP servers when opening supported files"),

  /** Log level for LSP communication */
  logLevel: z.enum(["off", "error", "warn", "info", "debug"]).default("warn")
    .describe("Log level for LSP protocol messages"),
});

export type LspSettings = z.infer<typeof lspSettingsSchema>;

// ============================================================================
// DEFAULT LSP SETTINGS
// ============================================================================

export const DEFAULT_LSP_SETTINGS: LspSettings = {
  enabled: true,
  servers: {},
  diagnostics: {
    enabled: true,
    maxPerFile: 100,
    maxTotal: 500,
    debounceMs: 300,
  },
  autoStart: true,
  logLevel: "warn",
};

// ============================================================================
// COMMON LSP SERVER PRESETS
// ============================================================================

/**
 * Pre-configured LSP server configs for common languages
 */
export const LSP_SERVER_PRESETS: Record<string, LspServerConfig> = {
  typescript: {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensionToLanguage: {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
    },
    startupTimeout: 10000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  python: {
    command: "pylsp",
    args: [],
    extensionToLanguage: {
      ".py": "python",
    },
    startupTimeout: 10000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  rust: {
    command: "rust-analyzer",
    args: [],
    extensionToLanguage: {
      ".rs": "rust",
    },
    startupTimeout: 30000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  go: {
    command: "gopls",
    args: [],
    extensionToLanguage: {
      ".go": "go",
    },
    startupTimeout: 15000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  java: {
    command: "jdtls",
    args: [],
    extensionToLanguage: {
      ".java": "java",
    },
    startupTimeout: 30000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  c_cpp: {
    command: "clangd",
    args: [],
    extensionToLanguage: {
      ".c": "c",
      ".cpp": "cpp",
      ".cc": "cpp",
      ".cxx": "cpp",
      ".h": "c",
      ".hpp": "cpp",
    },
    startupTimeout: 15000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  ruby: {
    command: "solargraph",
    args: ["stdio"],
    extensionToLanguage: {
      ".rb": "ruby",
      ".rake": "ruby",
    },
    startupTimeout: 15000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  json: {
    command: "vscode-json-language-server",
    args: ["--stdio"],
    extensionToLanguage: {
      ".json": "json",
      ".jsonc": "jsonc",
    },
    startupTimeout: 5000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  yaml: {
    command: "yaml-language-server",
    args: ["--stdio"],
    extensionToLanguage: {
      ".yaml": "yaml",
      ".yml": "yaml",
    },
    startupTimeout: 5000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  html: {
    command: "vscode-html-language-server",
    args: ["--stdio"],
    extensionToLanguage: {
      ".html": "html",
      ".htm": "html",
    },
    startupTimeout: 5000,
    restartOnCrash: true,
    maxRestarts: 3,
  },

  css: {
    command: "vscode-css-language-server",
    args: ["--stdio"],
    extensionToLanguage: {
      ".css": "css",
      ".scss": "scss",
      ".less": "less",
    },
    startupTimeout: 5000,
    restartOnCrash: true,
    maxRestarts: 3,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get LSP server config for a file extension
 */
export function getLspServerForExtension(
  servers: Record<string, LspServerConfig>,
  extension: string
): { serverName: string; config: LspServerConfig } | null {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  
  for (const [serverName, config] of Object.entries(servers)) {
    if (ext in config.extensionToLanguage) {
      return { serverName, config };
    }
  }
  
  return null;
}

/**
 * Get language ID for a file extension
 */
export function getLanguageId(config: LspServerConfig, extension: string): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return config.extensionToLanguage[ext] || "plaintext";
}

/**
 * Check if an LSP server supports a given method
 */
export function supportsMethod(capabilities: Record<string, unknown>, method: string): boolean {
  const providerMap: Record<string, string> = {
    "textDocument/definition": "definitionProvider",
    "textDocument/references": "referencesProvider",
    "textDocument/hover": "hoverProvider",
    "textDocument/completion": "completionProvider",
    "textDocument/documentSymbol": "documentSymbolProvider",
    "textDocument/implementation": "implementationProvider",
    "textDocument/prepareCallHierarchy": "callHierarchyProvider",
    "workspace/symbol": "workspaceSymbolProvider",
  };
  
  const capability = providerMap[method];
  if (!capability) return false;
  
  const value = capabilities[capability];
  return value !== undefined && value !== false;
}
