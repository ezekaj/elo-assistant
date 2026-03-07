/**
 * PTY Session Export
 *
 * Unified export utility for PTY session data with:
 *
 * 1. Privacy-protected replay data
 * 2. Attestation chain for integrity verification
 * 3. Security audit trail
 * 4. Anomaly detection summary
 *
 * Use this module to generate compliance-ready session exports.
 */

import type { AdaptiveSecurityManager } from "./pty-adaptive.js";
import type { PtyAnomalyDetector, AnomalyScore } from "./pty-anomaly.js";
import type { SessionAttestation, AttestedEntry } from "./pty-attestation.js";
import type { ReplayEntry, PtyReplayBuffer } from "./pty-replay.js";
import type { FilterStats } from "./pty-security.js";
import {
  PtyPrivacyProtector,
  createBalancedPrivacyProtector,
  type PrivateEntry,
} from "./pty-privacy.js";

export interface SessionExportOptions {
  /** Include raw replay data (before privacy protection) */
  includeRawReplay: boolean;
  /** Include privacy-protected replay data */
  includePrivateReplay: boolean;
  /** Include attestation chain */
  includeAttestation: boolean;
  /** Include security filter stats */
  includeSecurityStats: boolean;
  /** Include anomaly detection summary */
  includeAnomalySummary: boolean;
  /** Include adaptive security history */
  includeSecurityHistory: boolean;
  /** Privacy epsilon (lower = more private) */
  privacyEpsilon: number;
}

export interface SessionExport {
  /** Session metadata */
  metadata: {
    sessionId: string;
    exportedAt: number;
    exportVersion: string;
    options: SessionExportOptions;
  };

  /** Replay data (if included) */
  replay?: {
    raw?: ReplayEntry[];
    private?: PrivateEntry[];
    stats: {
      entryCount: number;
      totalBytes: number;
      sessionDurationMs: number;
      entriesByType: Record<string, number>;
    };
  };

  /** Attestation chain (if included) */
  attestation?: {
    sessionId: string;
    publicKey?: string;
    merkleRoot: string;
    entryCount: number;
    chain?: AttestedEntry[];
  };

  /** Security filter stats (if included) */
  security?: {
    filter: FilterStats;
    anomaly?: {
      totalAnalyzed: number;
      alertsGenerated: number;
      alertRate: number;
      recentCommands: string[];
    };
  };

  /** Adaptive security history (if included) */
  adaptiveHistory?: Array<{
    level: number;
    timestamp: number;
    reason: string;
  }>;

  /** Privacy protection summary */
  privacy: {
    enabled: boolean;
    epsilon: number;
    entriesRedacted: number;
    averageNoiseAdded: number;
    privacyBudgetUsed: number;
  };

  /** Integrity verification */
  integrity: {
    checksumAlgorithm: string;
    checksum: string;
  };
}

const DEFAULT_OPTIONS: SessionExportOptions = {
  includeRawReplay: false, // Don't include raw by default (privacy)
  includePrivateReplay: true,
  includeAttestation: true,
  includeSecurityStats: true,
  includeAnomalySummary: true,
  includeSecurityHistory: true,
  privacyEpsilon: 1.0,
};

/**
 * Export a PTY session with privacy protection
 */
export function exportSession(
  sessionId: string,
  components: {
    replayBuffer?: PtyReplayBuffer;
    attestation?: SessionAttestation;
    anomalyDetector?: PtyAnomalyDetector;
    adaptiveManager?: AdaptiveSecurityManager;
    securityFilterStats?: FilterStats;
  },
  options: Partial<SessionExportOptions> = {},
): SessionExport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const exportedAt = Date.now();

  // Initialize privacy protector
  const privacyProtector = new PtyPrivacyProtector({
    epsilon: opts.privacyEpsilon,
  });

  // Build export object
  const sessionExport: SessionExport = {
    metadata: {
      sessionId,
      exportedAt,
      exportVersion: "1.0.0",
      options: opts,
    },
    privacy: {
      enabled: opts.includePrivateReplay,
      epsilon: opts.privacyEpsilon,
      entriesRedacted: 0,
      averageNoiseAdded: 0,
      privacyBudgetUsed: 0,
    },
    integrity: {
      checksumAlgorithm: "sha256",
      checksum: "", // Computed at end
    },
  };

  // Export replay data
  if (components.replayBuffer) {
    const replayStats = components.replayBuffer.getStats();
    const allEntries = components.replayBuffer.getAll();

    sessionExport.replay = {
      stats: {
        entryCount: replayStats.entryCount,
        totalBytes: replayStats.totalBytes,
        sessionDurationMs: replayStats.sessionDurationMs,
        entriesByType: replayStats.entriesByType,
      },
    };

    if (opts.includeRawReplay) {
      sessionExport.replay.raw = allEntries;
    }

    if (opts.includePrivateReplay) {
      // Convert ReplayEntry to format expected by privacy protector
      const entriesForPrivacy = allEntries.map((entry, index) => ({
        sequence: index,
        timestamp: entry.timestamp,
        type: entry.type,
        data: entry.data,
      }));

      sessionExport.replay.private = privacyProtector.protectForExport(entriesForPrivacy);

      // Update privacy stats
      const privacyStats = privacyProtector.getStats();
      sessionExport.privacy.entriesRedacted = privacyStats.entriesRedacted;
      sessionExport.privacy.averageNoiseAdded = privacyStats.averageNoiseAdded;
      sessionExport.privacy.privacyBudgetUsed = privacyStats.privacyBudgetUsed;
    }
  }

  // Export attestation
  if (opts.includeAttestation && components.attestation) {
    const chain = components.attestation.exportChain();
    sessionExport.attestation = {
      sessionId: chain.sessionId,
      publicKey: chain.publicKey,
      merkleRoot: chain.merkleRoot,
      entryCount: chain.entryCount,
    };
  }

  // Export security stats
  if (opts.includeSecurityStats) {
    sessionExport.security = {
      filter: components.securityFilterStats || {
        inputLength: 0,
        outputLength: 0,
        totalSequencesProcessed: 0,
        sequencesBlocked: 0,
        sequencesByType: {},
      },
    };

    if (opts.includeAnomalySummary && components.anomalyDetector) {
      sessionExport.security.anomaly = components.anomalyDetector.getStats();
    }
  }

  // Export adaptive security history
  if (opts.includeSecurityHistory && components.adaptiveManager) {
    sessionExport.adaptiveHistory = components.adaptiveManager.getLevelHistory();
  }

  // Compute integrity checksum
  sessionExport.integrity.checksum = computeChecksum(sessionExport);

  return sessionExport;
}

/**
 * Compute SHA-256 checksum of export data
 */
function computeChecksum(data: SessionExport): string {
  // Create a deterministic string representation
  const { integrity, ...dataWithoutChecksum } = data;
  const serialized = JSON.stringify(dataWithoutChecksum, Object.keys(dataWithoutChecksum).sort());

  // Use Node.js crypto
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Verify export integrity
 */
export function verifyExportIntegrity(sessionExport: SessionExport): boolean {
  const expectedChecksum = computeChecksum(sessionExport);
  return sessionExport.integrity.checksum === expectedChecksum;
}

/**
 * Export session for compliance (minimal data, maximum privacy)
 */
export function exportForCompliance(
  sessionId: string,
  components: Parameters<typeof exportSession>[1],
): SessionExport {
  return exportSession(sessionId, components, {
    includeRawReplay: false,
    includePrivateReplay: true,
    includeAttestation: true,
    includeSecurityStats: true,
    includeAnomalySummary: true,
    includeSecurityHistory: true,
    privacyEpsilon: 0.5, // Strong privacy
  });
}

/**
 * Export session for debugging (full data, minimal privacy)
 */
export function exportForDebugging(
  sessionId: string,
  components: Parameters<typeof exportSession>[1],
): SessionExport {
  return exportSession(sessionId, components, {
    includeRawReplay: true,
    includePrivateReplay: false,
    includeAttestation: true,
    includeSecurityStats: true,
    includeAnomalySummary: true,
    includeSecurityHistory: true,
    privacyEpsilon: 10.0, // Minimal privacy (for internal debugging only)
  });
}

/**
 * Get session summary (no sensitive data)
 */
export function getSessionSummary(
  sessionId: string,
  components: Parameters<typeof exportSession>[1],
): {
  sessionId: string;
  durationMs: number;
  commandCount: number;
  securityLevel: number;
  anomalyCount: number;
  sequencesBlocked: number;
} {
  return {
    sessionId,
    durationMs: components.replayBuffer?.getStats().sessionDurationMs ?? 0,
    commandCount: components.replayBuffer?.getStats().entriesByType["stdin"] ?? 0,
    securityLevel: components.adaptiveManager?.getLevel() ?? 5,
    anomalyCount: components.anomalyDetector?.getStats().alertsGenerated ?? 0,
    sequencesBlocked: components.securityFilterStats?.sequencesBlocked ?? 0,
  };
}
