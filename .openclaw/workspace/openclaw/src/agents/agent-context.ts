/**
 * Agent Context
 *
 * Context passed to agent commands for execution context
 */

export interface AgentContext {
  /** Session key if available */
  sessionKey?: string;
  
  /** Agent ID */
  agentId?: string;
  
  /** Channel for responses */
  channel?: string;
  
  /** User ID */
  userId?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create a minimal agent context
 */
export function createAgentContext(partial?: Partial<AgentContext>): AgentContext {
  return {
    sessionKey: partial?.sessionKey,
    agentId: partial?.agentId,
    channel: partial?.channel,
    userId: partial?.userId,
    metadata: partial?.metadata,
  };
}
