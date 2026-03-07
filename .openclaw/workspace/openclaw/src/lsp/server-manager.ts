/**
 * LSP Server Manager
 * 
 * Manages LSP server processes lifecycle, communication, and state.
 */

import { spawn, ChildProcess } from "node:child_process";
import path from "node:path";
import { URL, pathToFileURL } from "node:url";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  InitializeParams,
  InitializeResult,
  Position,
  TextDocumentIdentifier,
  ReferenceParams,
  Hover,
  Location,
  DocumentSymbol,
  SymbolInformation,
  Definition,
  Implementation,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  CompletionList,
  PublishDiagnosticsParams,
} from "./types.js";
import type { LspServerConfig } from "./config-types.js";

const log = createSubsystemLogger("lsp");

// ============================================================================
// LSP MESSAGE CONNECTION (SIMPLIFIED JSON-RPC)
// ============================================================================

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Simplified JSON-RPC message connection over stdio
 */
class MessageConnection {
  private messageId = 0;
  private pendingRequests = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private notificationHandlers = new Map<string, (params: unknown) => void>();
  private buffer = "";
  private isClosed = false;

  constructor(
    private stdout: NodeJS.ReadableStream,
    private stdin: NodeJS.WritableStream
  ) {
    this.startReading();
  }

  private startReading(): void {
    this.stdout.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });
  }

  private processBuffer(): void {
    while (true) {
      // Look for Content-Length header
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      const messageStr = this.buffer.slice(messageStart, messageEnd);
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(messageStr) as JsonRpcMessage;
        this.handleMessage(message);
      } catch (err) {
        log.error(`Failed to parse LSP message: ${err}`);
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined) {
      // Response to a request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Notification
      const handler = this.notificationHandlers.get(message.method);
      if (handler) {
        handler(message.params);
      }
    }
  }

  async sendRequest<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.isClosed) {
      throw new Error("Connection is closed");
    }

    const id = ++this.messageId;
    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });

      const content = JSON.stringify(message);
      const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
      
      this.stdin.write(header + content, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  sendNotification(method: string, params?: unknown): void {
    if (this.isClosed) return;

    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.stdin.write(header + content);
  }

  onNotification(method: string, handler: (params: unknown) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  onClose(callback: () => void): void {
    this.stdout.on("close", callback);
  }

  close(): void {
    this.isClosed = true;
  }
}

// ============================================================================
// LSP SERVER INSTANCE
// ============================================================================

export type LspServerState = "stopped" | "starting" | "running" | "crashed";

export interface LspServerInstance {
  name: string;
  config: LspServerConfig;
  state: LspServerState;
  process?: ChildProcess;
  connection?: MessageConnection;
  capabilities?: InitializeResult["capabilities"];
  rootUri?: string;
  restartCount: number;
}

// ============================================================================
// LSP SERVER MANAGER
// ============================================================================

export class LspServerManager {
  private servers = new Map<string, LspServerInstance>();
  private openFiles = new Map<string, string>(); // uri -> serverName
  private diagnosticHandler?: (params: PublishDiagnosticsParams) => void;

  constructor(
    private workspaceRoot: string,
    private clientInfo: { name: string; version?: string } = { name: "OpenClaw", version: "1.0.0" }
  ) {}

  /**
   * Register an LSP server configuration
   */
  registerServer(name: string, config: LspServerConfig): void {
    if (this.servers.has(name)) {
      log.warn(`LSP server "${name}" already registered, replacing`);
    }
    
    this.servers.set(name, {
      name,
      config,
      state: "stopped",
      restartCount: 0,
    });
    
    log.info(`Registered LSP server: ${name}`);
  }

  /**
   * Get all registered servers
   */
  getServers(): Map<string, LspServerInstance> {
    return this.servers;
  }

  /**
   * Get server for a file
   */
  getServerForFile(filePath: string): LspServerInstance | undefined {
    const ext = path.extname(filePath).toLowerCase();
    
    for (const server of this.servers.values()) {
      if (ext in server.config.extensionToLanguage) {
        return server;
      }
    }
    
    return undefined;
  }

  /**
   * Start an LSP server
   */
  async startServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) {
      throw new Error(`LSP server "${name}" not registered`);
    }

    if (server.state === "running") {
      log.debug(`LSP server "${name}" already running`);
      return;
    }

    server.state = "starting";
    log.info(`Starting LSP server: ${name}`);

    try {
      // Spawn the LSP server process
      server.process = spawn(server.config.command, server.config.args || [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: server.config.env 
          ? { ...process.env, ...server.config.env }
          : process.env,
        cwd: server.config.workspaceFolder || this.workspaceRoot,
        windowsHide: true,
      });

      if (!server.process.stdout || !server.process.stdin) {
        throw new Error("LSP server process stdio not available");
      }

      // Handle stderr
      server.process.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          log.debug(`[LSP ${name}] ${msg}`);
        }
      });

      // Handle process exit
      server.process.on("exit", (code, signal) => {
        if (code !== 0 && code !== null && server.state === "running") {
          log.error(`LSP server "${name}" crashed with exit code ${code}`);
          server.state = "crashed";
          
          // Auto-restart
          if (server.config.restartOnCrash && server.restartCount < (server.config.maxRestarts || 3)) {
            server.restartCount++;
            log.info(`Restarting LSP server "${name}" (attempt ${server.restartCount})`);
            setTimeout(() => this.startServer(name), 1000);
          }
        }
      });

      server.process.on("error", (err) => {
        log.error(`LSP server "${name}" error: ${err.message}`);
        server.state = "crashed";
      });

      // Create message connection
      server.connection = new MessageConnection(
        server.process.stdout,
        server.process.stdin
      );

      // Handle diagnostics
      server.connection.onNotification("textDocument/publishDiagnostics", (params) => {
        if (this.diagnosticHandler) {
          this.diagnosticHandler(params as PublishDiagnosticsParams);
        }
      });

      server.connection.onClose(() => {
        log.info(`LSP server "${name}" connection closed`);
        server.state = "stopped";
      });

      // Initialize the server
      const initParams: InitializeParams = {
        processId: process.pid,
        clientInfo: this.clientInfo,
        rootUri: pathToFileURL(this.workspaceRoot).href,
        capabilities: {
          textDocument: {
            completion: { dynamicRegistration: false },
            hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
            definition: { dynamicRegistration: false },
            references: { dynamicRegistration: false },
            documentSymbol: { dynamicRegistration: false },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
              versionSupport: true,
            },
          },
          workspace: {
            workspaceFolders: true,
            configuration: false,
            symbol: { dynamicRegistration: false },
          },
        },
        workspaceFolders: [
          {
            uri: pathToFileURL(this.workspaceRoot).href,
            name: path.basename(this.workspaceRoot),
          },
        ],
      };

      if (server.config.initializationOptions) {
        initParams.initializationOptions = server.config.initializationOptions;
      }

      // Send initialize request with timeout
      const timeout = server.config.startupTimeout || 10000;
      const result = await Promise.race([
        server.connection.sendRequest<InitializeResult>("initialize", initParams),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`LSP server startup timeout (${timeout}ms)`)), timeout)
        ),
      ]);

      server.capabilities = result.capabilities;
      server.rootUri = initParams.rootUri;
      server.state = "running";
      server.restartCount = 0;

      // Send initialized notification
      server.connection.sendNotification("initialized", {});

      log.info(`LSP server "${name}" initialized successfully`);
      log.debug(`LSP server "${name}" capabilities: ${JSON.stringify(result.capabilities)}`);

    } catch (err) {
      server.state = "crashed";
      const error = err as Error;
      log.error(`Failed to start LSP server "${name}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop an LSP server
   */
  async stopServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return;

    if (server.state !== "running" || !server.connection || !server.process) {
      server.state = "stopped";
      return;
    }

    log.info(`Stopping LSP server: ${name}`);

    try {
      // Send shutdown request
      await server.connection.sendRequest("shutdown", undefined);
      
      // Send exit notification
      server.connection.sendNotification("exit", undefined);
      
      // Close connection
      server.connection.close();
      
      // Wait for process to exit
      const timeout = server.config.shutdownTimeout || 5000;
      await Promise.race([
        new Promise<void>((resolve) => {
          server.process!.on("exit", () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, timeout)),
      ]);
      
      // Force kill if still running
      if (server.process.kill(0)) {
        server.process.kill("SIGTERM");
      }

    } catch (err) {
      log.warn(`Error stopping LSP server "${name}": ${(err as Error).message}`);
    } finally {
      server.state = "stopped";
      server.connection = undefined;
      server.process = undefined;
    }
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    const stops = Array.from(this.servers.keys()).map((name) => this.stopServer(name));
    await Promise.all(stops);
  }

  /**
   * Set diagnostic handler
   */
  onDiagnostics(handler: (params: PublishDiagnosticsParams) => void): void {
    this.diagnosticHandler = handler;
  }

  // ==========================================================================
  // FILE SYNCHRONIZATION
  // ==========================================================================

  /**
   * Notify server that a file was opened
   */
  async didOpen(filePath: string, content: string): Promise<void> {
    const server = this.getServerForFile(filePath);
    if (!server || server.state !== "running" || !server.connection) {
      return;
    }

    const uri = pathToFileURL(path.resolve(filePath)).href;
    
    // Check if already open
    if (this.openFiles.get(uri) === server.name) {
      log.debug(`File already open, skipping didOpen for ${filePath}`);
      return;
    }

    const languageId = server.config.extensionToLanguage[path.extname(filePath).toLowerCase()] || "plaintext";

    try {
      server.connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content,
        },
      });

      this.openFiles.set(uri, server.name);
      log.debug(`Sent didOpen for ${filePath} (languageId: ${languageId})`);
    } catch (err) {
      log.error(`Failed to send didOpen for ${filePath}: ${(err as Error).message}`);
    }
  }

  /**
   * Notify server that a file changed
   */
  async didChange(filePath: string, content: string): Promise<void> {
    const server = this.getServerForFile(filePath);
    if (!server || server.state !== "running" || !server.connection) {
      return this.didOpen(filePath, content);
    }

    const uri = pathToFileURL(path.resolve(filePath)).href;
    
    // If file isn't open, open it first
    if (this.openFiles.get(uri) !== server.name) {
      return this.didOpen(filePath, content);
    }

    try {
      server.connection.sendNotification("textDocument/didChange", {
        textDocument: {
          uri,
          version: Date.now(),
        },
        contentChanges: [{ text: content }],
      });

      log.debug(`Sent didChange for ${filePath}`);
    } catch (err) {
      log.error(`Failed to send didChange for ${filePath}: ${(err as Error).message}`);
    }
  }

  /**
   * Notify server that a file was saved
   */
  async didSave(filePath: string): Promise<void> {
    const server = this.getServerForFile(filePath);
    if (!server || server.state !== "running" || !server.connection) {
      return;
    }

    const uri = pathToFileURL(path.resolve(filePath)).href;

    try {
      server.connection.sendNotification("textDocument/didSave", {
        textDocument: { uri },
      });

      log.debug(`Sent didSave for ${filePath}`);
    } catch (err) {
      log.error(`Failed to send didSave for ${filePath}: ${(err as Error).message}`);
    }
  }

  /**
   * Notify server that a file was closed
   */
  async didClose(filePath: string): Promise<void> {
    const server = this.getServerForFile(filePath);
    if (!server || server.state !== "running" || !server.connection) {
      return;
    }

    const uri = pathToFileURL(path.resolve(filePath)).href;

    try {
      server.connection.sendNotification("textDocument/didClose", {
        textDocument: { uri },
      });

      this.openFiles.delete(uri);
      log.debug(`Sent didClose for ${filePath}`);
    } catch (err) {
      log.error(`Failed to send didClose for ${filePath}: ${(err as Error).message}`);
    }
  }

  // ==========================================================================
  // LSP REQUESTS
  // ==========================================================================

  /**
   * Go to definition
   */
  async goToDefinition(filePath: string, position: Position): Promise<Definition | null> {
    return this.sendRequest(filePath, "textDocument/definition", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line: position.line - 1, character: position.character - 1 },
    });
  }

  /**
   * Find references
   */
  async findReferences(
    filePath: string,
    position: Position,
    includeDeclaration = true
  ): Promise<Location[] | null> {
    return this.sendRequest(filePath, "textDocument/references", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line: position.line - 1, character: position.character - 1 },
      context: { includeDeclaration },
    });
  }

  /**
   * Get hover info
   */
  async hover(filePath: string, position: Position): Promise<Hover | null> {
    return this.sendRequest(filePath, "textDocument/hover", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line: position.line - 1, character: position.character - 1 },
    });
  }

  /**
   * Get document symbols
   */
  async documentSymbol(filePath: string): Promise<DocumentSymbol[] | SymbolInformation[] | null> {
    return this.sendRequest(filePath, "textDocument/documentSymbol", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
    });
  }

  /**
   * Go to implementation
   */
  async goToImplementation(filePath: string, position: Position): Promise<Implementation | null> {
    return this.sendRequest(filePath, "textDocument/implementation", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line: position.line - 1, character: position.character - 1 },
    });
  }

  /**
   * Get completions
   */
  async completion(filePath: string, position: Position): Promise<CompletionList | null> {
    return this.sendRequest(filePath, "textDocument/completion", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line: position.line - 1, character: position.character - 1 },
    });
  }

  /**
   * Prepare call hierarchy
   */
  async prepareCallHierarchy(
    filePath: string,
    position: Position
  ): Promise<CallHierarchyItem[] | null> {
    return this.sendRequest(filePath, "textDocument/prepareCallHierarchy", {
      textDocument: { uri: pathToFileURL(path.resolve(filePath)).href },
      position: { line: position.line - 1, character: position.character - 1 },
    });
  }

  /**
   * Get incoming calls
   */
  async incomingCalls(item: CallHierarchyItem): Promise<CallHierarchyIncomingCall[] | null> {
    const server = this.getServerForFile(this.uriToPath(item.uri));
    if (!server || server.state !== "running" || !server.connection) {
      return null;
    }
    return server.connection.sendRequest("callHierarchy/incomingCalls", { item });
  }

  /**
   * Get outgoing calls
   */
  async outgoingCalls(item: CallHierarchyItem): Promise<CallHierarchyOutgoingCall[] | null> {
    const server = this.getServerForFile(this.uriToPath(item.uri));
    if (!server || server.state !== "running" || !server.connection) {
      return null;
    }
    return server.connection.sendRequest("callHierarchy/outgoingCalls", { item });
  }

  /**
   * Generic request helper
   */
  private async sendRequest<T>(
    filePath: string,
    method: string,
    params: unknown
  ): Promise<T | null> {
    const server = this.getServerForFile(filePath);
    if (!server) {
      log.debug(`No LSP server for file ${filePath}`);
      return null;
    }

    if (server.state !== "running" || !server.connection) {
      // Try to start the server
      try {
        await this.startServer(server.name);
      } catch (err) {
        log.error(`Failed to start LSP server for ${filePath}: ${(err as Error).message}`);
        return null;
      }
    }

    if (!server.connection) {
      return null;
    }

    try {
      return await server.connection.sendRequest<T>(method, params);
    } catch (err) {
      log.error(`LSP request failed for ${filePath}, method '${method}': ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Convert file URI to path
   */
  private uriToPath(uri: string): string {
    let path = uri.replace(/^file:\/\//, "");
    if (/^\/[A-Za-z]:/.test(path)) {
      path = path.slice(1);
    }
    try {
      path = decodeURIComponent(path);
    } catch {
      // ignore
    }
    return path;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let defaultManager: LspServerManager | null = null;

/**
 * Get or create the default LSP server manager
 */
export function getLspServerManager(workspaceRoot?: string): LspServerManager {
  if (!defaultManager && workspaceRoot) {
    defaultManager = new LspServerManager(workspaceRoot);
  }
  if (!defaultManager) {
    throw new Error("LSP server manager not initialized. Call getLspServerManager(workspaceRoot) first.");
  }
  return defaultManager;
}

/**
 * Reset the default manager (for testing)
 */
export function resetLspServerManager(): void {
  defaultManager = null;
}
