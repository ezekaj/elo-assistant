/**
 * PTY Modules Integration Test
 *
 * Tests all PTY modules to verify they work correctly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AdaptiveSecurityManager, createAdaptiveManager } from "./pty-adaptive.js";
// Advanced modules
import {
  LocalEchoPrediction,
  DamageTrackingRenderer,
  SharedMemoryTerminal,
  createLocalEchoPredictor,
  createDamageRenderer,
  createSharedMemoryTerminal,
} from "./pty-advanced.js";
import { PtyAnomalyDetector, createAnomalyDetector } from "./pty-anomaly.js";
// Security modules
import {
  SessionAttestation,
  createLightweightAttestation,
  createSecureAttestation,
} from "./pty-attestation.js";
// Core modules
import { stripDsrRequests, buildCursorPositionResponse } from "./pty-dsr.js";
// Performance modules
import {
  FastEscapeScanner,
  FastPtyProcessor,
  createFastProcessor,
  BufferPool,
  ZeroCopyView,
} from "./pty-fast.js";
// Privacy modules
import {
  PtyPrivacyProtector,
  createBalancedPrivacyProtector,
  quickRedact,
  containsSensitiveData,
} from "./pty-privacy.js";
import {
  RingBuffer,
  BinaryEncoder,
  FastPtyReplayBuffer,
  createFastReplayBuffer,
} from "./pty-replay-fast.js";
import { PtyReplayBuffer } from "./pty-replay.js";
import { PtyResizeManager, getDefaultSize } from "./pty-resize.js";
import { PtySecurityFilter, createSecureFilter } from "./pty-security.js";

describe("PTY Core Modules", () => {
  describe("pty-dsr", () => {
    it("should strip DSR requests", () => {
      const input = "Hello\x1b[6nWorld\x1b[6n!";
      const result = stripDsrRequests(input);
      expect(result.cleaned).toBe("HelloWorld!");
      expect(result.requests).toBe(2);
    });

    it("should return empty for no DSR", () => {
      const input = "Hello World!";
      const result = stripDsrRequests(input);
      expect(result.cleaned).toBe("Hello World!");
      expect(result.requests).toBe(0);
    });

    it("should build cursor position response", () => {
      const response = buildCursorPositionResponse();
      expect(response).toMatch(/\x1b\[\d+;\d+R/);
    });
  });

  describe("pty-security", () => {
    let filter: PtySecurityFilter;

    beforeEach(() => {
      filter = createSecureFilter();
    });

    it("should block title change sequences", () => {
      const input = "Hello\x1b]0;Evil Title\x07World";
      const result = filter.filter(input);
      expect(result.safe).not.toContain("\x1b]0;");
      expect(result.safe).toContain("Hello");
      expect(result.safe).toContain("World");
    });

    it("should block clipboard sequences", () => {
      const input = "Data\x1b]52;c;SGVsbG8=\x07More";
      const result = filter.filter(input);
      expect(result.safe).not.toContain("\x1b]52;");
    });

    it("should pass safe content through", () => {
      const input = "Hello World";
      const result = filter.filter(input);
      expect(result.safe).toBe("Hello World");
    });
  });

  describe("pty-replay", () => {
    it("should record and retrieve output", () => {
      const buffer = new PtyReplayBuffer();
      buffer.recordOutput("Hello");
      buffer.recordOutput("World");

      const entries = buffer.getAll();
      expect(entries.length).toBe(2);
      expect(entries[0].type).toBe("stdout");
      expect(entries[0].data).toBe("Hello");
    });

    it("should record exit events", () => {
      const buffer = new PtyReplayBuffer();
      buffer.recordOutput("test");
      buffer.recordExit(0, null);

      const entries = buffer.getAll();
      expect(entries[entries.length - 1].type).toBe("exit");
    });
  });

  describe("pty-resize", () => {
    it("should provide default size", () => {
      const size = getDefaultSize();
      expect(size.cols).toBeGreaterThan(0);
      expect(size.rows).toBeGreaterThan(0);
    });

    it("should create resize manager", () => {
      const manager = new PtyResizeManager();
      expect(manager).toBeDefined();
    });
  });
});

describe("PTY Security Modules", () => {
  describe("pty-attestation", () => {
    it("should create lightweight attestation", () => {
      const attestation = createLightweightAttestation();
      expect(attestation.getSessionId()).toBeDefined();
      expect(attestation.getSessionId().length).toBe(16);
    });

    it("should attest entries asynchronously", async () => {
      const attestation = createLightweightAttestation();
      const entry = await attestation.attest("test", "Hello World", Date.now());

      expect(entry.sequence).toBe(0);
      expect(entry.dataHash).toBeDefined();
      expect(entry.merkleRoot).toBeDefined();
    });

    it("should build merkle tree", async () => {
      const attestation = createLightweightAttestation();
      await attestation.attest("test", "Entry 1", Date.now());
      await attestation.attest("test", "Entry 2", Date.now());
      await attestation.attest("test", "Entry 3", Date.now());

      const stats = attestation.getStats();
      expect(stats.entriesAttested).toBe(3);
      expect(stats.merkleStats.leafCount).toBe(3);
    });

    it("should sign entries when enabled", async () => {
      const attestation = createSecureAttestation();
      const entry = await attestation.attest("test", "Signed data", Date.now());

      expect(entry.signature).toBeDefined();
      expect(entry.signature!.length).toBeGreaterThan(0);

      // Verify signature
      const valid = attestation.verifySignature(entry);
      expect(valid).toBe(true);
    });
  });

  describe("pty-anomaly", () => {
    it("should create anomaly detector", () => {
      const detector = createAnomalyDetector();
      expect(detector).toBeDefined();
    });

    it("should detect high entropy data", () => {
      const detector = createAnomalyDetector();

      // Normal text - low entropy
      const normalResult = detector.analyzeOutput("Hello World! This is normal text.");
      expect(normalResult.overall).toBeLessThan(0.5);

      // Random data - high entropy (simulate known pattern for consistent test)
      const suspiciousData = "nc -l -p 4444";
      const highResult = detector.analyzeOutput(suspiciousData);
      expect(highResult.overall).toBeGreaterThan(normalResult.overall);
    });

    it("should use sampling", () => {
      const detector = createAnomalyDetector();

      // Small data - might not need analysis
      const smallData = "hi";
      // Large data - always needs analysis
      const largeData = "x".repeat(20000);

      // Large data should always trigger analysis
      expect(detector.needsAnalysis(largeData)).toBe(true);
    });
  });

  describe("pty-adaptive", () => {
    it("should create adaptive manager", () => {
      const manager = createAdaptiveManager();
      expect(manager).toBeDefined();
    });

    it("should adjust security level based on signals", () => {
      const manager = createAdaptiveManager();

      // Record low severity signals - level should stay at base (5)
      for (let i = 0; i < 3; i++) {
        manager.recordSignal("unknown-pattern", 0.1);
      }
      expect(manager.getLevel()).toBe(5); // Base level

      // Record high severity signals - level should increase
      for (let i = 0; i < 5; i++) {
        manager.recordSignal("reverse-shell-detected", 5.0);
      }
      expect(manager.getLevel()).toBeGreaterThan(5);
    });
  });
});

describe("PTY Privacy Modules", () => {
  describe("pty-privacy", () => {
    it("should create privacy protector", () => {
      const protector = createBalancedPrivacyProtector();
      expect(protector).toBeDefined();
    });

    it("should detect sensitive data", () => {
      // Patterns require = or : after the keyword
      expect(containsSensitiveData("password=secret123")).toBe(true);
      expect(containsSensitiveData("token=abc123xyz")).toBe(true);
      expect(containsSensitiveData("Hello World")).toBe(false);
    });

    it("should quick redact sensitive patterns", () => {
      const input = "password=secret123 and api_key=abc456";
      const redacted = quickRedact(input);
      expect(redacted).not.toContain("secret123");
      expect(redacted).not.toContain("abc456");
      expect(redacted).toContain("[REDACTED]");
    });

    it("should protect entries", () => {
      const protector = createBalancedPrivacyProtector();
      const entry = {
        sequence: 0,
        type: "stdout",
        data: "secret=mysecretkey123",
        timestamp: Date.now(),
      };
      const result = protector.protect(entry);

      expect(result.data).not.toContain("mysecretkey123");
    });
  });
});

describe("PTY Performance Modules", () => {
  describe("pty-fast", () => {
    describe("FastEscapeScanner", () => {
      it("should find escape positions", () => {
        const data = Buffer.from("Hello\x1b[31mRed\x1b[0mWorld");
        const positions = FastEscapeScanner.findEscapes(data);
        expect(positions.length).toBe(2);
        expect(positions[0]).toBe(5); // First ESC at index 5
      });

      it("should detect presence of escapes", () => {
        expect(FastEscapeScanner.hasEscape(Buffer.from("Hello World"))).toBe(false);
        expect(FastEscapeScanner.hasEscape(Buffer.from("Hello\x1b[31m"))).toBe(true);
      });

      it("should handle empty buffer", () => {
        const positions = FastEscapeScanner.findEscapes(Buffer.from(""));
        expect(positions.length).toBe(0);
      });
    });

    describe("FastPtyProcessor", () => {
      it("should process data", () => {
        const responses: string[] = [];
        const processor = createFastProcessor((r) => responses.push(r));

        const result = processor.process("Hello World");
        expect(result.output.toString()).toBe("Hello World");
        expect(result.sequences.length).toBe(0);
      });

      it("should detect escape sequences", () => {
        const processor = createFastProcessor(() => {});
        const result = processor.process("\x1b[31mRed Text\x1b[0m");
        expect(result.sequences.length).toBeGreaterThan(0);
      });

      it("should track statistics", () => {
        const processor = createFastProcessor(() => {});
        processor.process("Test 1");
        processor.process("Test 2");

        const stats = processor.getStats();
        expect(stats.chunksProcessed).toBe(2);
        expect(stats.bytesProcessed).toBe(12);
      });
    });

    describe("BufferPool", () => {
      it("should acquire and release buffers", () => {
        const pool = new BufferPool();
        const buf1 = pool.acquire(100);
        expect(buf1.length).toBeGreaterThanOrEqual(100);

        pool.release(buf1);
        const buf2 = pool.acquire(100);
        // Should get same buffer back from pool
        expect(buf2.length).toBe(buf1.length);
      });

      it("should round up to power of 2", () => {
        const pool = new BufferPool();
        const buf = pool.acquire(100);
        expect(buf.length).toBe(128); // Next power of 2
      });
    });

    describe("ZeroCopyView", () => {
      it("should create slice without copying", () => {
        const original = Buffer.from("Hello World");
        const view = ZeroCopyView.slice(original, 0, 5);
        expect(view.toString()).toBe("Hello");
        expect(view.buffer).toBe(original.buffer);
      });
    });
  });

  describe("pty-replay-fast", () => {
    describe("RingBuffer", () => {
      it("should add and retrieve items", () => {
        const ring = new RingBuffer<number>(5);
        ring.push(1);
        ring.push(2);
        ring.push(3);

        expect(ring.size()).toBe(3);
        const all = ring.getAll();
        expect(all[0]).toBe(1);
        expect(all[2]).toBe(3);
      });

      it("should overwrite oldest when full", () => {
        const ring = new RingBuffer<number>(3);
        ring.push(1);
        ring.push(2);
        ring.push(3);
        const evicted = ring.push(4);

        expect(evicted).toBe(1); // First item evicted
        expect(ring.size()).toBe(3);
        expect(ring.getAll()).toEqual([2, 3, 4]);
      });
    });

    describe("BinaryEncoder", () => {
      it("should encode and decode entries", () => {
        const encoder = new BinaryEncoder();
        const entry = {
          timestamp: Date.now(),
          type: "stdout",
          data: Buffer.from("Hello World"),
        };

        const encoded = encoder.encode(entry);
        expect(encoded).toBeInstanceOf(Buffer);
        expect(encoded.length).toBeGreaterThan(0);

        // Verify decoding works
        const { entry: decoded } = BinaryEncoder.decode(encoded);
        expect(decoded.type).toBe("stdout");
        expect(decoded.data.toString()).toBe("Hello World");
      });
    });

    describe("FastPtyReplayBuffer", () => {
      it("should record output", () => {
        const buffer = createFastReplayBuffer();
        buffer.recordOutput("Hello");
        buffer.recordOutput("World");

        const entries = buffer.getAll();
        expect(entries.length).toBe(2);
      });

      it("should respect capacity limits", () => {
        const buffer = createFastReplayBuffer({ maxEntries: 3 });
        buffer.recordOutput("1");
        buffer.recordOutput("2");
        buffer.recordOutput("3");
        buffer.recordOutput("4");

        const entries = buffer.getAll();
        expect(entries.length).toBe(3);
        // Oldest should be evicted - data is Buffer so convert to string
        expect(entries[0].data.toString()).toBe("2");
      });
    });
  });
});

describe("PTY Advanced Modules", () => {
  describe("LocalEchoPrediction", () => {
    it("should predict printable characters", () => {
      const predictor = createLocalEchoPredictor();
      const result = predictor.predict("a");

      expect(result.canShow).toBe(true);
      expect(result.display).toBe("a");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should predict backspace", () => {
      const predictor = createLocalEchoPredictor();
      predictor.predict("a");
      predictor.predict("b");
      const result = predictor.predict("\x7f"); // Backspace

      expect(result.canShow).toBe(true);
      expect(result.display).toBe("\b \b");
    });

    it("should not predict arrow keys", () => {
      const predictor = createLocalEchoPredictor();
      const result = predictor.predict("\x1b[A"); // Up arrow

      expect(result.canShow).toBe(false);
      expect(result.display).toBeNull();
    });

    it("should confirm predictions", () => {
      const predictor = createLocalEchoPredictor();
      const prediction = predictor.predict("a");
      const confirmation = predictor.confirm(prediction.seq, "a");

      expect(confirmation.found).toBe(true);
      expect(confirmation.correct).toBe(true);
    });
  });

  describe("DamageTrackingRenderer", () => {
    it("should track cell changes", () => {
      const renderer = createDamageRenderer(10, 10);

      renderer.setCell(0, 0, { char: "A", fg: 7, bg: 0, attrs: 0 });
      renderer.setCell(0, 1, { char: "B", fg: 7, bg: 0, attrs: 0 });

      const output = renderer.render();
      expect(output.cellsChanged).toBe(2);
      expect(output.escapeSequences.length).toBeGreaterThan(0);
    });

    it("should not redraw unchanged cells", () => {
      const renderer = createDamageRenderer(10, 10);

      renderer.setCell(0, 0, { char: "A", fg: 7, bg: 0, attrs: 0 });
      renderer.render();

      // Same cell, same value
      renderer.setCell(0, 0, { char: "A", fg: 7, bg: 0, attrs: 0 });
      const output = renderer.render();

      expect(output.cellsChanged).toBe(0);
    });

    it("should track efficiency stats", () => {
      const renderer = createDamageRenderer(10, 10);

      renderer.setCell(0, 0, { char: "A", fg: 7, bg: 0, attrs: 0 });
      renderer.render();
      renderer.render(); // Second render, no changes

      const stats = renderer.getStats();
      expect(stats.efficiency).toBeGreaterThan(0);
    });
  });

  describe("SharedMemoryTerminal", () => {
    it("should create shared memory", () => {
      const terminal = createSharedMemoryTerminal(80, 24);
      const buffer = terminal.getSharedBuffer();

      expect(buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it("should write and read cells", () => {
      const terminal = createSharedMemoryTerminal(80, 24);

      terminal.writeCell(0, 0, 65, 7, 0); // 'A'
      terminal.writeCell(0, 1, 66, 7, 0); // 'B'

      const frame = terminal.readFrame();
      expect(frame).not.toBeNull();
      expect(frame!.cols).toBe(80);
      expect(frame!.rows).toBe(24);
    });

    it("should batch write cells", () => {
      const terminal = createSharedMemoryTerminal(80, 24);

      terminal.writeCells([
        { row: 0, col: 0, char: 65, fg: 7, bg: 0 },
        { row: 0, col: 1, char: 66, fg: 7, bg: 0 },
        { row: 0, col: 2, char: 67, fg: 7, bg: 0 },
      ]);

      const frame = terminal.readFrame();
      expect(frame).not.toBeNull();
    });

    it("should reconstruct from buffer", () => {
      const original = createSharedMemoryTerminal(80, 24);
      original.writeCell(0, 0, 88, 7, 0); // 'X'

      const reconstructed = SharedMemoryTerminal.fromBuffer(original.getSharedBuffer());
      const frame = reconstructed.readFrame();
      expect(frame).not.toBeNull();
    });
  });
});

describe("Integration Test", () => {
  it("should process data through full pipeline", async () => {
    // 1. Create all components
    const securityFilter = createSecureFilter();
    const anomalyDetector = createAnomalyDetector();
    const adaptiveManager = createAdaptiveManager();
    const attestation = createLightweightAttestation();
    const privacyProtector = createBalancedPrivacyProtector();
    const fastProcessor = createFastProcessor(() => {});
    const replayBuffer = createFastReplayBuffer();
    const localEcho = createLocalEchoPredictor();

    // 2. Simulate PTY output
    const rawOutput = "Password: secret123\x1b]0;Evil Title\x07\nCommand output here";

    // 3. Fast path check
    const { sequences } = fastProcessor.process(rawOutput);

    // 4. Security filter
    const { safe: safeOutput } = securityFilter.filter(rawOutput);
    expect(safeOutput).not.toContain("\x1b]0;"); // Title blocked

    // 5. Anomaly detection
    if (anomalyDetector.needsAnalysis(safeOutput)) {
      const score = anomalyDetector.analyzeOutput(safeOutput);
      adaptiveManager.recordAnomalyScore(score);
    }

    // 6. Privacy protection
    const { data: privateOutput } = privacyProtector.protect({
      type: "stdout",
      data: safeOutput,
      timestamp: Date.now(),
    });
    expect(privateOutput).not.toContain("secret123"); // Password redacted

    // 7. Attestation
    const attestedEntry = await attestation.attest("stdout", privateOutput, Date.now());
    expect(attestedEntry.merkleRoot).toBeDefined();

    // 8. Replay buffer
    replayBuffer.recordOutput(privateOutput);
    expect(replayBuffer.getAll().length).toBe(1);

    // 9. Local echo (for input)
    const prediction = localEcho.predict("a");
    expect(prediction.canShow).toBe(true);
  });
});
