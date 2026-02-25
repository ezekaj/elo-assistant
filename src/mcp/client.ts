import { Type } from "@sinclair/typebox";
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { SamplingCapabilityError } from "./errors.js";

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = "2024-11-05";

/**
 * MCP Capabilities - Matches Claude Code capability structure
 *
 * Client Capabilities:
 * - sampling: Can handle tools during model sampling/generation
 * - elicitation: Can handle user input elicitation (URL/form)
 * - roots: Can provide filesystem roots
 *
 * Server Capabilities:
 * - tools: Tool support with list change notifications
 * - resources: Resource support with subscribe and list changes
 * - prompts: Prompt support with list change notifications
 */
export interface McpCapabilities {
  // Server capabilities (what the server supports)
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  // Client capabilities (what the client supports)
  sampling?: {
    tools?: boolean; // Can handle tools during sampling (Line 27381, 27655)
    createMessage?: boolean; // Supports sampling/createMessage method (Line 27466)
  };
  elicitation?: {
    url?: boolean; // Supports URL elicitation (Line 27413)
    form?: boolean; // Supports form elicitation (Line 27417)
  };
  roots?: {
    list?: boolean; // Supports roots/list method
  };
}

// MCP Tool Definition
export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// MCP Tool Result
export interface McpToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
  }>;
  isError?: boolean;
}

// MCP Server Configuration
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
}

// MCP Client Events
export interface McpEvents {
  "server:connected": { name: string; capabilities: McpCapabilities };
  "server:disconnected": { name: string; reason: string };
  "tools:changed": { serverName: string };
  error: { serverName: string; error: Error };
}

class McpServer extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageId = 0;
  private pendingRequests: Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private capabilities: McpCapabilities = {};
  private tools: McpTool[] = [];
  private connected = false;
  private connecting = false;

  constructor(
    public readonly name: string,
    private readonly config: McpServerConfig,
  ) {
    super();
  }

  async initialize(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }

    this.connecting = true;

    try {
      this.process = spawn(this.config.command, this.config.args || [], {
        env: { ...process.env, ...this.config.env },
        cwd: this.config.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Handle stdout
      let buffer = "";
      this.process.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this.handleMessage(message);
            } catch (error) {
              this.emit("error", {
                serverName: this.name,
                error: new Error(`Failed to parse message: ${error}`),
              });
            }
          }
        }
      });

      // Handle stderr (logging)
      this.process.stderr?.on("data", (data: Buffer) => {
        console.error(`[MCP ${this.name}]`, data.toString());
      });

      // Handle process exit
      this.process.on("exit", (code: number | null) => {
        this.connected = false;
        this.connecting = false;
        this.emit("server:disconnected", { name: this.name, reason: `Exited with code ${code}` });

        // Reject all pending requests
        for (const [id, { reject }] of this.pendingRequests.entries()) {
          reject(new Error(`Server exited with code ${code}`));
          this.pendingRequests.delete(id);
        }
      });

      // Handle process error
      this.process.on("error", (error: Error) => {
        this.connected = false;
        this.connecting = false;
        this.emit("error", { serverName: this.name, error });
      });

      // Send initialize request with client capabilities
      // Matches Claude Code capability declaration (Lines 14670, 14687)
      await this.sendRequest("initialize", {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          // Client capabilities - what OpenClaw supports
          sampling: {
            tools: true, // Can handle tools during sampling
            createMessage: true, // Supports sampling/createMessage
          },
          elicitation: {
            url: true, // Supports URL elicitation
            form: true, // Supports form elicitation
          },
          roots: {
            list: true, // Supports roots/list
          },
        },
        clientInfo: {
          name: "OpenClaw",
          version: "1.0.0",
        },
      });

      // Send initialized notification
      await this.sendNotification("notifications/initialized");

      this.connected = true;
      this.connecting = false;

      // Fetch tools
      await this.refreshTools();

      this.emit("server:connected", { name: this.name, capabilities: this.capabilities });
    } catch (error) {
      this.connecting = false;
      throw error;
    }
  }

  private handleMessage(message: any): void {
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      // This is a response to a request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || "Unknown error"));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // This is a request or notification from server
      if (message.method === "notifications/tools/list_changed") {
        this.refreshTools().then(() => {
          this.emit("tools:changed", { serverName: this.name });
        });
      }
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || !this.connected) {
      throw new Error("Server not connected");
    }

    const id = ++this.messageId;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const line = JSON.stringify(message) + "\n";
      this.process?.stdin?.write(line, (error) => {
        if (error) {
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    if (!this.process || !this.connected) {
      throw new Error("Server not connected");
    }

    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    const line = JSON.stringify(message) + "\n";
    return new Promise((resolve, reject) => {
      this.process?.stdin?.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async refreshTools(): Promise<void> {
    const response = (await this.sendRequest("tools/list")) as any;
    this.tools = response.tools || [];
  }

  async listTools(): Promise<McpTool[]> {
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    // Validate sampling tools capability (matches Claude Code Line 27655)
    // Client must support sampling tools to call tools
    if (!this.capabilities.sampling?.tools) {
      throw new SamplingCapabilityError();
    }

    const result = (await this.sendRequest("tools/call", {
      name,
      arguments: args,
    })) as any;
    return result as McpToolResult;
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.connected = false;
  }
}

// Main MCP Client
export class McpClient extends EventEmitter {
  private servers: Map<string, McpServer> = new Map();
  private tools: Map<string, { server: McpServer; tool: McpTool }> = new Map();

  async connectServer(name: string, config: McpServerConfig): Promise<void> {
    if (this.servers.has(name)) {
      throw new Error(`Server already connected: ${name}`);
    }

    const server = new McpServer(name, config);

    server.on("server:connected", (event) => {
      this.emit("server:connected", event);
    });

    server.on("server:disconnected", (event) => {
      this.emit("server:disconnected", event);
      // Remove tools from this server
      for (const [key, value] of this.tools.entries()) {
        if (value.server === server) {
          this.tools.delete(key);
        }
      }
    });

    server.on("tools:changed", async (event) => {
      // Remove old tools from this server
      for (const [key, value] of this.tools.entries()) {
        if (value.server === server) {
          this.tools.delete(key);
        }
      }

      // Add new tools
      const tools = await server.listTools();
      for (const tool of tools) {
        this.tools.set(`${name}/${tool.name}`, { server, tool });
      }

      this.emit("tools:changed", event);
    });

    server.on("error", (event) => {
      this.emit("error", event);
    });

    this.servers.set(name, server);
    await server.initialize();

    // Register tools
    const tools = await server.listTools();
    for (const tool of tools) {
      this.tools.set(`${name}/${tool.name}`, { server, tool });
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (server) {
      await server.disconnect();
      this.servers.delete(name);

      // Remove tools from this server
      for (const [key, value] of this.tools.entries()) {
        if (value.server === server) {
          this.tools.delete(key);
        }
      }
    }
  }

  async callTool(fullName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const [serverName, toolName] = fullName.split("/");
    const entry = this.tools.get(fullName);

    if (!entry) {
      throw new Error(`Tool not found: ${fullName}`);
    }

    return await entry.server.callTool(toolName, args);
  }

  listTools(): Array<{ name: string; description?: string; server: string }> {
    return Array.from(this.tools.entries()).map(([key, value]) => ({
      name: key,
      description: value.tool.description,
      server: value.server.name,
    }));
  }

  getTool(name: string): McpTool | undefined {
    return this.tools.get(name)?.tool;
  }

  getServers(): string[] {
    return Array.from(this.servers.keys());
  }

  async disconnectAll(): Promise<void> {
    for (const server of this.servers.values()) {
      await server.disconnect();
    }
    this.servers.clear();
    this.tools.clear();
  }
}

// Create MCP tool for OpenClaw
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

export function createMcpTool(client: McpClient, toolName: string): AnyAgentTool | null {
  const toolInfo = client.getTool(toolName);
  if (!toolInfo) {
    return null;
  }

  // Convert MCP schema to TypeBox schema
  const schema = Type.Object({
    ...(toolInfo.inputSchema.properties as any),
  });

  return {
    label: `MCP: ${toolInfo.name}`,
    name: `mcp_${toolName.replace(/\//g, "_")}`,
    description: toolInfo.description || `Call MCP tool ${toolName}`,
    parameters: schema,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,

    async call(args) {
      try {
        const result = await client.callTool(toolName, args as Record<string, unknown>);

        // Format result
        const content = result.content
          .map((c) => {
            if (c.type === "text") {
              return c.text;
            } else if (c.type === "image") {
              return `[Image: ${c.mimeType || "unknown"}]`;
            } else if (c.type === "resource") {
              return `[Resource: ${c.resource?.uri}]`;
            }
            return "[Unknown content type]";
          })
          .join("\n");

        return jsonResult({
          content,
          isError: result.isError,
        });
      } catch (error) {
        return jsonResult({
          error: error instanceof Error ? error.message : "Unknown error",
          isError: true,
        });
      }
    },
  };
}

// Create all MCP tools from client
export function createMcpTools(client: McpClient): AnyAgentTool[] {
  const tools: AnyAgentTool[] = [];

  for (const toolName of client.listTools().map((t) => t.name)) {
    const tool = createMcpTool(client, toolName);
    if (tool) {
      tools.push(tool);
    }
  }

  return tools;
}

// Helper to create MCP client from config
export function createMcpClientFromConfig(config: OpenClawMcpConfig): McpClient {
  const client = new McpClient();

  for (const [name, serverConfig] of Object.entries(config.servers || {})) {
    client.connectServer(name, {
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
      cwd: serverConfig.cwd,
      timeout: serverConfig.timeout,
    });
  }

  return client;
}

export interface OpenClawMcpConfig {
  enabled?: boolean;
  servers?: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      timeout?: number;
    }
  >;
}
