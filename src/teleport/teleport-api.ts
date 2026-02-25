/**
 * Session Teleport API Client
 *
 * Provides API client for fetching remote sessions.
 * Matches Claude Code's sessions API integration.
 */

import type { SessionAPIResponse, SessionMessage } from "./types.js";

/**
 * Teleport API client interface
 */
export interface TeleportAPIClient {
  /** Fetch session metadata */
  fetchSession(sessionId: string): Promise<SessionAPIResponse>;
  /** Fetch session messages/logs */
  fetchSessionLogs(sessionId: string): Promise<SessionMessage[]>;
}

/**
 * Create teleport API client
 */
export function createTeleportAPIClient(apiKey?: string): TeleportAPIClient {
  const baseUrl = process.env.OPENCLAW_TELEPORT_API_URL || "https://api.openclaw.dev";
  const token = apiKey || process.env.OPENCLAW_API_KEY;

  return {
    async fetchSession(sessionId: string): Promise<SessionAPIResponse> {
      const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Session not found: ${sessionId}`);
        }
        if (response.status === 401) {
          throw new Error("Authentication required. Set OPENCLAW_API_KEY environment variable.");
        }
        throw new Error(`Failed to fetch session: ${response.statusText}`);
      }

      return response.json() as Promise<SessionAPIResponse>;
    },

    async fetchSessionLogs(sessionId: string): Promise<SessionMessage[]> {
      const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}/logs`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Session logs not found: ${sessionId}`);
        }
        if (response.status === 401) {
          throw new Error("Authentication required. Set OPENCLAW_API_KEY environment variable.");
        }
        throw new Error(`Failed to fetch session logs: ${response.statusText}`);
      }

      const data = await response.json();
      return data.messages || [];
    },
  };
}

/**
 * Default API client instance
 */
let defaultClient: TeleportAPIClient | null = null;

/**
 * Get default API client
 */
export function getDefaultAPIClient(): TeleportAPIClient {
  if (!defaultClient) {
    defaultClient = createTeleportAPIClient();
  }
  return defaultClient;
}

/**
 * Reset default API client (for testing)
 */
export function resetDefaultAPIClient(): void {
  defaultClient = null;
}
