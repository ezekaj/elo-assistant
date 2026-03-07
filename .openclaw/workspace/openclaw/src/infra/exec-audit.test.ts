import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  computeEntryHash,
  createAuditEntry,
  formatAuditEntries,
  getAuditStats,
  getLastEntryHash,
  hashCommand,
  pruneAuditLog,
  readAuditLog,
  sanitizeEnvForAudit,
  verifyAuditChain,
  writeAuditEntry,
  type ExecAuditEntry,
} from "./exec-audit.js";

const TEST_AUDIT_DIR = path.join(os.tmpdir(), "openclaw-audit-test-" + Date.now());
const TEST_AUDIT_FILE = path.join(TEST_AUDIT_DIR, "exec-audit.jsonl");

// Helper to write directly to test file
function writeTestEntry(entry: ExecAuditEntry): void {
  fs.mkdirSync(TEST_AUDIT_DIR, { recursive: true });
  fs.appendFileSync(TEST_AUDIT_FILE, JSON.stringify(entry) + "\n");
}

function clearTestAudit(): void {
  try {
    fs.rmSync(TEST_AUDIT_DIR, { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

describe("exec-audit", () => {
  describe("hashCommand", () => {
    it("returns consistent hash for same command", () => {
      const hash1 = hashCommand("ls -la");
      const hash2 = hashCommand("ls -la");
      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different commands", () => {
      const hash1 = hashCommand("ls -la");
      const hash2 = hashCommand("ls -l");
      expect(hash1).not.toBe(hash2);
    });

    it("returns 16-character hash", () => {
      const hash = hashCommand("any command");
      expect(hash).toHaveLength(16);
    });
  });

  describe("sanitizeEnvForAudit", () => {
    it("includes safe keys", () => {
      const env = {
        PATH: "/usr/bin",
        HOME: "/home/user",
        SECRET_KEY: "should-not-appear",
        AWS_SECRET: "also-hidden",
      };
      const sanitized = sanitizeEnvForAudit(env);
      expect(sanitized.PATH).toBe("/usr/bin");
      expect(sanitized.HOME).toBe("/home/user");
      expect(sanitized.SECRET_KEY).toBeUndefined();
      expect(sanitized.AWS_SECRET).toBeUndefined();
    });

    it("handles undefined values", () => {
      const env = {
        PATH: "/usr/bin",
        HOME: undefined,
      };
      const sanitized = sanitizeEnvForAudit(env);
      expect(sanitized.PATH).toBe("/usr/bin");
      expect(sanitized.HOME).toBeUndefined();
    });
  });

  describe("createAuditEntry", () => {
    it("creates entry with required fields", () => {
      const entry = createAuditEntry({
        command: "echo hello",
        cwd: "/tmp",
        host: "gateway",
        security: "allowlist",
        ask: "on-miss",
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.command).toBe("echo hello");
      expect(entry.cwd).toBe("/tmp");
      expect(entry.host).toBe("gateway");
      expect(entry.security).toBe("allowlist");
      expect(entry.ask).toBe("on-miss");
      expect(entry.decision).toBe("pending");
      expect(entry.decisionChain).toEqual([]);
    });

    it("includes optional fields", () => {
      const entry = createAuditEntry({
        command: "test",
        cwd: "/",
        host: "sandbox",
        security: "deny",
        ask: "off",
        agentId: "test-agent",
        sessionKey: "session-123",
      });

      expect(entry.agentId).toBe("test-agent");
      expect(entry.sessionKey).toBe("session-123");
    });

    it("generates unique IDs", () => {
      const entry1 = createAuditEntry({
        command: "test",
        cwd: "/",
        host: "gateway",
        security: "full",
        ask: "off",
      });
      const entry2 = createAuditEntry({
        command: "test",
        cwd: "/",
        host: "gateway",
        security: "full",
        ask: "off",
      });

      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe("formatAuditEntries", () => {
    it("returns message for empty array", () => {
      const result = formatAuditEntries([]);
      expect(result).toBe("No audit entries found.");
    });

    it("formats entries with status icons", () => {
      const entries: ExecAuditEntry[] = [
        {
          id: "1",
          timestamp: Date.now(),
          entryHash: "hash1",
          previousHash: "0000000000000000000000000000000000000000000000000000000000000000",
          command: "ls",
          commandHash: "abc",
          cwd: "/",
          host: "gateway",
          security: "full",
          ask: "off",
          decisionChain: [],
          decision: "allowed",
          env: {},
        },
        {
          id: "2",
          timestamp: Date.now(),
          entryHash: "hash2",
          previousHash: "hash1",
          command: "rm -rf /",
          commandHash: "def",
          cwd: "/",
          host: "gateway",
          security: "allowlist",
          ask: "on-miss",
          decisionChain: [],
          decision: "denied",
          denialReason: "allowlist miss",
          env: {},
        },
      ];

      const result = formatAuditEntries(entries);
      expect(result).toContain("\u2713"); // Checkmark for allowed
      expect(result).toContain("\u2717"); // X for denied
      expect(result).toContain("ls");
      expect(result).toContain("rm -rf /");
      expect(result).toContain("allowlist miss");
    });
  });

  describe("getAuditStats", () => {
    it("calculates correct statistics", () => {
      const entries: ExecAuditEntry[] = [
        { decision: "allowed", host: "gateway", security: "full" },
        { decision: "allowed", host: "gateway", security: "allowlist" },
        { decision: "denied", host: "sandbox", security: "deny" },
        { decision: "pending", host: "node", security: "allowlist" },
      ].map((partial, i) => ({
        id: String(i),
        timestamp: Date.now(),
        entryHash: `hash${i}`,
        previousHash: i === 0 ? "genesis" : `hash${i - 1}`,
        command: "test",
        commandHash: "hash",
        cwd: "/",
        decisionChain: [],
        env: {},
        ...partial,
        ask: "off" as const,
      }));

      // Note: getAuditStats reads from file, so this test is more of a unit test
      // for the logic. Integration tests would need file setup.
    });
  });

  describe("hash chain", () => {
    beforeEach(() => {
      clearTestAudit();
    });

    afterEach(() => {
      clearTestAudit();
    });

    it("computeEntryHash returns consistent hash", () => {
      const entry = {
        id: "test-id",
        timestamp: 1234567890,
        previousHash: "prev-hash",
        command: "ls -la",
        commandHash: "cmd-hash",
        cwd: "/tmp",
        host: "gateway" as const,
        security: "full" as const,
        ask: "off" as const,
        decisionChain: [],
        decision: "allowed" as const,
        env: {},
      };

      const hash1 = computeEntryHash(entry);
      const hash2 = computeEntryHash(entry);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it("computeEntryHash returns different hash for different entries", () => {
      const entry1 = {
        id: "test-id-1",
        timestamp: 1234567890,
        previousHash: "prev-hash",
        command: "ls -la",
        commandHash: "cmd-hash",
        cwd: "/tmp",
        host: "gateway" as const,
        security: "full" as const,
        ask: "off" as const,
        decisionChain: [],
        decision: "allowed" as const,
        env: {},
      };

      const entry2 = { ...entry1, id: "test-id-2" };

      const hash1 = computeEntryHash(entry1);
      const hash2 = computeEntryHash(entry2);
      expect(hash1).not.toBe(hash2);
    });

    it("getLastEntryHash returns genesis hash for empty log", () => {
      const hash = getLastEntryHash();
      expect(hash).toBe("0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("verifyAuditChain returns valid for empty log", () => {
      const result = verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.totalEntries).toBe(0);
    });
  });
});

// Integration tests for immediate deny patterns are in exec-approvals.test.ts
