/**
 * MCP Capability Errors
 *
 * Custom error types for MCP capability validation.
 * Matches Claude Code error handling patterns.
 */

/**
 * Error thrown when sampling tools capability is missing
 *
 * This error is thrown when a tool operation is attempted but the client
 * does not support the sampling tools capability.
 *
 * @example
 * ```typescript
 * try {
 *   await client.callTool('grep', { pattern: 'TODO' });
 * } catch (error) {
 *   if (error instanceof SamplingCapabilityError) {
 *     console.error('Tools not supported:', error.message);
 *   }
 * }
 * ```
 */
export class SamplingCapabilityError extends Error {
  constructor() {
    super("Client does not support sampling tools capability.");
    this.name = "SamplingCapabilityError";
  }
}

/**
 * Error thrown when elicitation capability is missing
 *
 * This error is thrown when elicitation is attempted but the client
 * does not support the requested elicitation mode.
 */
export class ElicitationCapabilityError extends Error {
  constructor(mode: "url" | "form") {
    super(`Client does not support ${mode} elicitation.`);
    this.name = "ElicitationCapabilityError";
  }
}

/**
 * Error thrown when URL elicitation capability is missing
 */
export class UrlElicitationError extends ElicitationCapabilityError {
  constructor() {
    super("url");
    this.name = "UrlElicitationError";
  }
}

/**
 * Error thrown when form elicitation capability is missing
 */
export class FormElicitationError extends ElicitationCapabilityError {
  constructor() {
    super("form");
    this.name = "FormElicitationError";
  }
}

/**
 * Error thrown when roots capability is missing
 */
export class RootsCapabilityError extends Error {
  constructor() {
    super("Client does not support roots listing capability.");
    this.name = "RootsCapabilityError";
  }
}

/**
 * Error thrown when server capability is missing
 */
export class ServerCapabilityError extends Error {
  constructor(capability: string) {
    super(`Server does not support ${capability} capability.`);
    this.name = "ServerCapabilityError";
  }
}

/**
 * Error thrown when client and server capabilities are incompatible
 */
export class CapabilityMismatchError extends Error {
  constructor(required: string, available: string) {
    super(`Capability mismatch: requires ${required}, but only ${available} available.`);
    this.name = "CapabilityMismatchError";
  }
}
