/**
 * Capability Check Helper
 *
 * Provides centralized capability checking utilities for OpenClaw.
 * Used to verify client/server capabilities before feature usage.
 */

import type { McpCapabilities } from "../mcp/client.js";

/**
 * Check if client supports sampling tools capability
 *
 * @param capabilities - Client capabilities to check
 * @returns true if sampling tools are supported
 */
export function supportsSamplingTools(capabilities?: McpCapabilities): boolean {
  return capabilities?.sampling?.tools === true;
}

/**
 * Check if client supports URL elicitation
 *
 * @param capabilities - Client capabilities to check
 * @returns true if URL elicitation is supported
 */
export function supportsUrlElicitation(capabilities?: McpCapabilities): boolean {
  return capabilities?.elicitation?.url === true;
}

/**
 * Check if client supports form elicitation
 *
 * @param capabilities - Client capabilities to check
 * @returns true if form elicitation is supported
 */
export function supportsFormElicitation(capabilities?: McpCapabilities): boolean {
  return capabilities?.elicitation?.form === true;
}

/**
 * Check if client supports roots listing
 *
 * @param capabilities - Client capabilities to check
 * @returns true if roots listing is supported
 */
export function supportsRoots(capabilities?: McpCapabilities): boolean {
  return capabilities?.roots?.list === true;
}

/**
 * Validate capabilities for tool usage
 *
 * @param capabilities - Client capabilities to validate
 * @param requireSampling - Whether sampling tools capability is required
 * @throws Error if required capabilities are missing
 */
export function validateCapabilities(
  capabilities?: McpCapabilities,
  options: {
    requireSampling?: boolean;
    requireUrlElicitation?: boolean;
    requireFormElicitation?: boolean;
    requireRoots?: boolean;
  } = {},
): void {
  const {
    requireSampling = false,
    requireUrlElicitation = false,
    requireFormElicitation = false,
    requireRoots = false,
  } = options;

  if (requireSampling && !supportsSamplingTools(capabilities)) {
    throw new Error("Client does not support sampling tools capability.");
  }

  if (requireUrlElicitation && !supportsUrlElicitation(capabilities)) {
    throw new Error("Client does not support URL elicitation.");
  }

  if (requireFormElicitation && !supportsFormElicitation(capabilities)) {
    throw new Error("Client does not support form elicitation.");
  }

  if (requireRoots && !supportsRoots(capabilities)) {
    throw new Error("Client does not support roots listing capability.");
  }
}

/**
 * Get capability summary for logging/debugging
 *
 * @param capabilities - Client capabilities to summarize
 * @returns Human-readable summary of capabilities
 */
export function getCapabilitySummary(capabilities?: McpCapabilities): string {
  if (!capabilities) {
    return "none";
  }

  const parts: string[] = [];

  if (supportsSamplingTools(capabilities)) {
    parts.push("sampling.tools");
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
