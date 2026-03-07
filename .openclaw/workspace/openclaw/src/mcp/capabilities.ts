/**
 * MCP Capability Utilities
 *
 * Provides utility functions for checking and validating MCP capabilities.
 * Matches Claude Code capability handling patterns.
 */

import type { McpCapabilities } from "./client.js";

/**
 * Check if client supports sampling tools capability
 *
 * @param capabilities - Client capabilities to check
 * @returns true if sampling tools are supported
 *
 * @example
 * ```typescript
 * if (supportsSamplingTools(capabilities)) {
 *   // Can use tools during sampling
 * }
 * ```
 */
export function supportsSamplingTools(capabilities: McpCapabilities): boolean {
  return capabilities.sampling?.tools === true;
}

/**
 * Check if client supports sampling createMessage method
 *
 * @param capabilities - Client capabilities to check
 * @returns true if sampling/createMessage is supported
 */
export function supportsSamplingCreateMessage(capabilities: McpCapabilities): boolean {
  return capabilities.sampling?.createMessage === true;
}

/**
 * Check if client supports elicitation
 *
 * @param capabilities - Client capabilities to check
 * @param mode - Optional specific mode ('url' or 'form')
 * @returns true if elicitation is supported (for specific mode if provided)
 *
 * @example
 * ```typescript
 * // Check any elicitation support
 * if (supportsElicitation(capabilities)) { ... }
 *
 * // Check URL elicitation support
 * if (supportsElicitation(capabilities, 'url')) { ... }
 * ```
 */
export function supportsElicitation(capabilities: McpCapabilities, mode?: "url" | "form"): boolean {
  if (!capabilities.elicitation) return false;
  if (!mode) return true;
  return capabilities.elicitation[mode] === true;
}

/**
 * Check if client supports URL elicitation
 *
 * @param capabilities - Client capabilities to check
 * @returns true if URL elicitation is supported
 */
export function supportsUrlElicitation(capabilities: McpCapabilities): boolean {
  return capabilities.elicitation?.url === true;
}

/**
 * Check if client supports form elicitation
 *
 * @param capabilities - Client capabilities to check
 * @returns true if form elicitation is supported
 */
export function supportsFormElicitation(capabilities: McpCapabilities): boolean {
  return capabilities.elicitation?.form === true;
}

/**
 * Check if client supports roots listing
 *
 * @param capabilities - Client capabilities to check
 * @returns true if roots/list is supported
 */
export function supportsRoots(capabilities: McpCapabilities): boolean {
  return capabilities.roots?.list === true;
}

/**
 * Validate capabilities for tool usage
 *
 * @param capabilities - Client capabilities to validate
 * @param requireSampling - Whether sampling tools capability is required
 * @throws Error if required capabilities are missing
 *
 * @example
 * ```typescript
 * // Validate before using tools
 * validateToolCapabilities(capabilities, true);
 * ```
 */
export function validateToolCapabilities(
  capabilities: McpCapabilities,
  requireSampling?: boolean,
): void {
  if (requireSampling && !supportsSamplingTools(capabilities)) {
    throw new Error("Client does not support sampling tools capability.");
  }
}

/**
 * Validate capabilities for elicitation
 *
 * @param capabilities - Client capabilities to validate
 * @param mode - Elicitation mode to validate ('url' or 'form')
 * @throws Error if required capabilities are missing
 */
export function validateElicitationCapabilities(
  capabilities: McpCapabilities,
  mode: "url" | "form",
): void {
  if (!supportsElicitation(capabilities, mode)) {
    throw new Error(`Client does not support ${mode} elicitation.`);
  }
}

/**
 * Get capability summary for logging/debugging
 *
 * @param capabilities - Client capabilities to summarize
 * @returns Human-readable summary of capabilities
 */
export function getCapabilitySummary(capabilities: McpCapabilities): string {
  const parts: string[] = [];

  if (supportsSamplingTools(capabilities)) {
    parts.push("sampling.tools");
  }
  if (supportsSamplingCreateMessage(capabilities)) {
    parts.push("sampling.createMessage");
  }
  if (supportsUrlElicitation(capabilities)) {
    parts.push("elicitation.url");
  }
  if (supportsFormElicitation(capabilities)) {
    parts.push("elicitation.form");
  }
  if (supportsRoots(capabilities)) {
    parts.push("roots.list");
  }

  return parts.length > 0 ? parts.join(", ") : "none";
}
