/**
 * Session Utilities for Agents
 *
 * Shared utility functions for extracting agent information from session keys.
 */

/**
 * Extract agent ID from session key
 * Session key format: prefix:agentId:sessionId (e.g., "agent:main:main")
 */
export function extractAgentIdFromSessionKey(sessionKey: string): string {
  const parts = sessionKey.split(":");
  if (parts.length > 2 && parts[1]) {
    return parts[1]; // The agent ID is the second part
  }
  if (parts.length > 1 && parts[0]) {
    return parts[0]; // Fallback for legacy format
  }
  return "default";
}
