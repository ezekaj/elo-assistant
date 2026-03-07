/**
 * Advanced PTY Innovations
 *
 * Implements cutting-edge terminal technologies:
 * 1. Mosh-style local echo prediction
 * 2. Damage tracking renderer (Notcurses-style)
 * 3. Shared memory IPC for zero-copy
 * 4. UDP transport abstraction
 * 5. Modern process monitoring (pidfd-style)
 */

import { createHash, randomBytes } from "crypto";
import dgram from "dgram";
import { EventEmitter } from "events";
import { scheduleTimeout, cancelTimeout, scheduleInterval, cancelInterval } from "./timer-wheel.js";

// ============================================================================
// 1. MOSH-STYLE LOCAL ECHO PREDICTION
// ============================================================================

/**
 * Predicts server response for low-latency typing
 * Based on Mosh's State Synchronization Protocol (SSP)
 */
export class LocalEchoPrediction {
  private pendingPredictions: Map<number, PredictedEcho> = new Map();
  private sequenceNumber = 0;
  private confirmedState: string = "";
  private predictedState: string = "";

  // Prediction confidence thresholds
  private readonly SAFE_CHARS = /^[\x20-\x7E]$/; // Printable ASCII
  private readonly BACKSPACE = "\x7f";
  private readonly ENTER = "\r";
  private readonly ARROW_KEYS = /^\x1b\[[ABCD]$/;

  /**
   * Predict echo for input character
   * Returns predicted output to display immediately
   */
  predict(input: string): PredictionResult {
    const seq = this.sequenceNumber++;

    // Safe to predict: printable characters
    if (this.SAFE_CHARS.test(input)) {
      const prediction: PredictedEcho = {
        seq,
        input,
        predicted: input,
        timestamp: Date.now(),
        confidence: 0.95, // Very high for printable
      };
      this.pendingPredictions.set(seq, prediction);
      this.predictedState += input;

      return {
        display: input,
        seq,
        confidence: prediction.confidence,
        canShow: true,
      };
    }

    // Backspace prediction
    if (input === this.BACKSPACE && this.predictedState.length > 0) {
      const prediction: PredictedEcho = {
        seq,
        input,
        predicted: "\b \b", // Move back, space, move back
        timestamp: Date.now(),
        confidence: 0.85,
      };
      this.pendingPredictions.set(seq, prediction);
      this.predictedState = this.predictedState.slice(0, -1);

      return {
        display: "\b \b",
        seq,
        confidence: prediction.confidence,
        canShow: true,
      };
    }

    // Enter key - predict newline
    if (input === this.ENTER) {
      const prediction: PredictedEcho = {
        seq,
        input,
        predicted: "\r\n",
        timestamp: Date.now(),
        confidence: 0.7, // Medium - command output unknown
      };
      this.pendingPredictions.set(seq, prediction);
      this.predictedState = "";

      return {
        display: "\r\n",
        seq,
        confidence: prediction.confidence,
        canShow: true,
      };
    }

    // Arrow keys - no prediction (cursor movement varies)
    if (this.ARROW_KEYS.test(input)) {
      return {
        display: null,
        seq,
        confidence: 0,
        canShow: false,
      };
    }

    // Unknown input - can't predict
    return {
      display: null,
      seq,
      confidence: 0,
      canShow: false,
    };
  }

  /**
   * Confirm prediction with actual server response
   * Returns whether prediction was correct
   */
  confirm(seq: number, actual: string): ConfirmResult {
    const prediction = this.pendingPredictions.get(seq);
    if (!prediction) {
      return { found: false, correct: false, latency: 0 };
    }

    const latency = Date.now() - prediction.timestamp;
    const correct = prediction.predicted === actual;

    this.pendingPredictions.delete(seq);

    if (correct) {
      this.confirmedState = this.predictedState;
    } else {
      // Misprediction - need to correct display
      this.predictedState = this.confirmedState + actual;
    }

    return {
      found: true,
      correct,
      latency,
      correction: correct ? null : actual,
    };
  }

  /**
   * Get unconfirmed predictions (for timeout handling)
   */
  getUnconfirmed(olderThanMs: number = 1000): PredictedEcho[] {
    const cutoff = Date.now() - olderThanMs;
    const stale: PredictedEcho[] = [];

    for (const [seq, pred] of this.pendingPredictions) {
      if (pred.timestamp < cutoff) {
        stale.push(pred);
        this.pendingPredictions.delete(seq);
      }
    }

    return stale;
  }

  /**
   * Reset prediction state (on disconnect, etc.)
   */
  reset(): void {
    this.pendingPredictions.clear();
    this.confirmedState = "";
    this.predictedState = "";
  }

  getStats(): { pending: number; confirmed: number; predicted: number } {
    return {
      pending: this.pendingPredictions.size,
      confirmed: this.confirmedState.length,
      predicted: this.predictedState.length,
    };
  }
}

interface PredictedEcho {
  seq: number;
  input: string;
  predicted: string;
  timestamp: number;
  confidence: number;
}

interface PredictionResult {
  display: string | null;
  seq: number;
  confidence: number;
  canShow: boolean;
}

interface ConfirmResult {
  found: boolean;
  correct: boolean;
  latency: number;
  correction?: string | null;
}

// ============================================================================
// 2. DAMAGE TRACKING RENDERER (NOTCURSES-STYLE)
// ============================================================================

/**
 * Tracks which cells changed to minimize redraw
 * Inspired by Notcurses' damage tracking algorithm
 */
export class DamageTrackingRenderer {
  private lastFrame: TerminalCell[] = [];
  private currentFrame: TerminalCell[] = [];
  private damageRegions: Set<number> = new Set(); // Row indices
  private cols: number;
  private rows: number;

  // Statistics
  private stats = {
    totalFrames: 0,
    cellsChanged: 0,
    cellsUnchanged: 0,
    rowsRedrawn: 0,
    fullRedraws: 0,
  };

  constructor(cols: number = 80, rows: number = 24) {
    this.cols = cols;
    this.rows = rows;
    this.initializeFrames();
  }

  private initializeFrames(): void {
    const totalCells = this.cols * this.rows;
    this.lastFrame = new Array(totalCells);
    this.currentFrame = new Array(totalCells);

    for (let i = 0; i < totalCells; i++) {
      this.lastFrame[i] = { char: " ", fg: 7, bg: 0, attrs: 0 };
      this.currentFrame[i] = { char: " ", fg: 7, bg: 0, attrs: 0 };
    }
  }

  // Cursor position for writeOutput
  private cursorRow = 0;
  private cursorCol = 0;

  /**
   * Update a cell in the current frame
   */
  setCell(row: number, col: number, cell: TerminalCell): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;

    const idx = row * this.cols + col;
    this.currentFrame[idx] = cell;
  }

  /**
   * Write output string to the frame buffer at cursor position
   * Handles basic cursor movement (newlines, carriage returns)
   */
  writeOutput(output: string): void {
    for (const char of output) {
      if (char === "\n") {
        this.cursorRow++;
        if (this.cursorRow >= this.rows) {
          this.cursorRow = this.rows - 1;
        }
      } else if (char === "\r") {
        this.cursorCol = 0;
      } else {
        this.setCell(this.cursorRow, this.cursorCol, {
          char,
          fg: 7,
          bg: 0,
          attrs: 0,
        });
        this.cursorCol++;
        if (this.cursorCol >= this.cols) {
          this.cursorCol = 0;
          this.cursorRow++;
          if (this.cursorRow >= this.rows) {
            this.cursorRow = this.rows - 1;
          }
        }
      }
    }
  }

  /**
   * Calculate damage and generate minimal update commands
   */
  render(): RenderOutput {
    this.stats.totalFrames++;
    this.damageRegions.clear();

    let cellsChanged = 0;
    const changes: CellChange[] = [];

    // Compare frames cell by cell
    for (let i = 0; i < this.currentFrame.length; i++) {
      if (!this.cellEqual(this.currentFrame[i], this.lastFrame[i])) {
        cellsChanged++;
        const row = Math.floor(i / this.cols);
        const col = i % this.cols;
        this.damageRegions.add(row);

        changes.push({
          row,
          col,
          cell: this.currentFrame[i],
        });
      }
    }

    this.stats.cellsChanged += cellsChanged;
    this.stats.cellsUnchanged += this.currentFrame.length - cellsChanged;
    this.stats.rowsRedrawn += this.damageRegions.size;

    // Generate optimized escape sequences
    const output = this.generateOutput(changes);

    // Swap frames
    const temp = this.lastFrame;
    this.lastFrame = this.currentFrame;
    this.currentFrame = temp;

    return {
      escapeSequences: output,
      cellsChanged,
      rowsAffected: this.damageRegions.size,
      isFullRedraw: this.damageRegions.size === this.rows,
    };
  }

  private cellEqual(a: TerminalCell, b: TerminalCell): boolean {
    return a.char === b.char && a.fg === b.fg && a.bg === b.bg && a.attrs === b.attrs;
  }

  private generateOutput(changes: CellChange[]): string {
    if (changes.length === 0) return "";

    // Sort by position for optimal cursor movement
    changes.sort((a, b) => a.row * this.cols + a.col - (b.row * this.cols + b.col));

    let output = "";
    let lastRow = -1;
    let lastCol = -1;
    let lastFg = -1;
    let lastBg = -1;

    for (const change of changes) {
      // Cursor positioning
      if (change.row !== lastRow || change.col !== lastCol + 1) {
        output += `\x1b[${change.row + 1};${change.col + 1}H`; // Move cursor
      }

      // Color changes (only if different)
      if (change.cell.fg !== lastFg || change.cell.bg !== lastBg) {
        output += `\x1b[38;5;${change.cell.fg};48;5;${change.cell.bg}m`;
        lastFg = change.cell.fg;
        lastBg = change.cell.bg;
      }

      // Character
      output += change.cell.char;
      lastRow = change.row;
      lastCol = change.col;
    }

    // Reset colors at end
    output += "\x1b[0m";

    return output;
  }

  /**
   * Force full redraw (on resize, etc.)
   */
  forceFullRedraw(): void {
    this.stats.fullRedraws++;
    for (let i = 0; i < this.rows; i++) {
      this.damageRegions.add(i);
    }
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.initializeFrames();
    this.forceFullRedraw();
  }

  getStats(): typeof this.stats & { efficiency: number } {
    const total = this.stats.cellsChanged + this.stats.cellsUnchanged;
    return {
      ...this.stats,
      efficiency: total > 0 ? this.stats.cellsUnchanged / total : 1,
    };
  }
}

interface TerminalCell {
  char: string;
  fg: number; // 256-color index
  bg: number;
  attrs: number; // Bold, italic, etc.
}

interface CellChange {
  row: number;
  col: number;
  cell: TerminalCell;
}

interface RenderOutput {
  escapeSequences: string;
  cellsChanged: number;
  rowsAffected: number;
  isFullRedraw: boolean;
}

// ============================================================================
// 3. SHARED MEMORY IPC (ZERO-COPY)
// ============================================================================

/**
 * Zero-copy terminal data sharing via SharedArrayBuffer
 * For multi-process terminal architectures
 */
export class SharedMemoryTerminal {
  private shm: SharedArrayBuffer;
  private header: Int32Array;
  private cells: Uint32Array;
  private scrollback: Uint32Array;

  // Header layout (64 bytes)
  private static readonly HEADER_SIZE = 16; // 16 int32s
  private static readonly WRITE_CURSOR = 0;
  private static readonly READ_CURSOR = 1;
  private static readonly COLS = 2;
  private static readonly ROWS = 3;
  private static readonly SCROLLBACK_START = 4;
  private static readonly SCROLLBACK_END = 5;
  private static readonly FLAGS = 6;
  private static readonly SEQUENCE = 7;

  constructor(cols: number = 80, rows: number = 24, scrollbackLines: number = 1000) {
    const cellCount = cols * rows;
    const scrollbackCount = cols * scrollbackLines;
    const totalSize =
      SharedMemoryTerminal.HEADER_SIZE * 4 + // Header (bytes)
      cellCount * 4 + // Cells (uint32 each)
      scrollbackCount * 4; // Scrollback

    this.shm = new SharedArrayBuffer(totalSize);

    let offset = 0;
    this.header = new Int32Array(this.shm, offset, SharedMemoryTerminal.HEADER_SIZE);
    offset += SharedMemoryTerminal.HEADER_SIZE * 4;

    this.cells = new Uint32Array(this.shm, offset, cellCount);
    offset += cellCount * 4;

    this.scrollback = new Uint32Array(this.shm, offset, scrollbackCount);

    // Initialize header
    Atomics.store(this.header, SharedMemoryTerminal.COLS, cols);
    Atomics.store(this.header, SharedMemoryTerminal.ROWS, rows);
    Atomics.store(this.header, SharedMemoryTerminal.WRITE_CURSOR, 0);
    Atomics.store(this.header, SharedMemoryTerminal.READ_CURSOR, 0);
  }

  /**
   * Write cell (writer process)
   * Uses atomic operations for lock-free synchronization
   */
  writeCell(row: number, col: number, char: number, fg: number, bg: number): void {
    const cols = Atomics.load(this.header, SharedMemoryTerminal.COLS);
    const idx = row * cols + col;

    // Pack into single uint32: char(16) | fg(8) | bg(8)
    const packed = (char & 0xffff) | ((fg & 0xff) << 16) | ((bg & 0xff) << 24);

    // Atomic store - no locks needed
    Atomics.store(this.cells, idx, packed);

    // Increment write cursor (signals new data)
    Atomics.add(this.header, SharedMemoryTerminal.WRITE_CURSOR, 1);
  }

  /**
   * Write multiple cells (batch)
   */
  writeCells(
    updates: Array<{ row: number; col: number; char: number; fg: number; bg: number }>,
  ): void {
    const cols = Atomics.load(this.header, SharedMemoryTerminal.COLS);

    for (const u of updates) {
      const idx = u.row * cols + u.col;
      const packed = (u.char & 0xffff) | ((u.fg & 0xff) << 16) | ((u.bg & 0xff) << 24);
      Atomics.store(this.cells, idx, packed);
    }

    // Single cursor increment for batch
    Atomics.add(this.header, SharedMemoryTerminal.WRITE_CURSOR, updates.length);
  }

  /**
   * Read frame (reader process)
   * Returns null if no new data
   */
  readFrame(): SharedFrame | null {
    const writeCursor = Atomics.load(this.header, SharedMemoryTerminal.WRITE_CURSOR);
    const readCursor = Atomics.load(this.header, SharedMemoryTerminal.READ_CURSOR);

    if (writeCursor === readCursor) {
      return null; // No new data
    }

    // Update read cursor
    Atomics.store(this.header, SharedMemoryTerminal.READ_CURSOR, writeCursor);

    // Return view into shared memory (zero-copy!)
    return {
      cells: this.cells,
      cols: Atomics.load(this.header, SharedMemoryTerminal.COLS),
      rows: Atomics.load(this.header, SharedMemoryTerminal.ROWS),
      sequence: writeCursor,
    };
  }

  /**
   * Wait for new data (blocking)
   * Uses Atomics.wait for efficient waiting
   */
  async waitForData(timeoutMs: number = 1000): Promise<boolean> {
    const currentCursor = Atomics.load(this.header, SharedMemoryTerminal.READ_CURSOR);

    // Atomics.waitAsync for non-blocking wait (Node.js 16+)
    const result = (Atomics as any).waitAsync(
      this.header,
      SharedMemoryTerminal.WRITE_CURSOR,
      currentCursor,
      timeoutMs,
    );

    if (result.async) {
      const waitResult = await result.value;
      return waitResult === "ok";
    }

    return result.value === "not-equal"; // Already changed
  }

  /**
   * Notify waiting readers
   */
  notifyReaders(): void {
    Atomics.notify(this.header, SharedMemoryTerminal.WRITE_CURSOR, 1);
  }

  /**
   * Get underlying SharedArrayBuffer for IPC
   */
  getSharedBuffer(): SharedArrayBuffer {
    return this.shm;
  }

  /**
   * Create from existing SharedArrayBuffer (reader process)
   */
  static fromBuffer(buffer: SharedArrayBuffer): SharedMemoryTerminal {
    const instance = Object.create(SharedMemoryTerminal.prototype);
    instance.shm = buffer;

    let offset = 0;
    instance.header = new Int32Array(buffer, offset, SharedMemoryTerminal.HEADER_SIZE);
    offset += SharedMemoryTerminal.HEADER_SIZE * 4;

    const cols = Atomics.load(instance.header, SharedMemoryTerminal.COLS);
    const rows = Atomics.load(instance.header, SharedMemoryTerminal.ROWS);
    const cellCount = cols * rows;

    instance.cells = new Uint32Array(buffer as unknown as ArrayBuffer, offset, Number(cellCount));
    offset += Number(cellCount) * 4;

    const scrollbackCount = (buffer.byteLength - offset) / 4;
    instance.scrollback = new Uint32Array(buffer, offset, scrollbackCount);

    return instance;
  }
}

interface SharedFrame {
  cells: Uint32Array;
  cols: number;
  rows: number;
  sequence: number;
}

// ============================================================================
// 4. UDP TRANSPORT ABSTRACTION (MOSH-STYLE)
// ============================================================================

/**
 * UDP-based terminal transport with roaming support
 * Inspired by Mosh's State Synchronization Protocol
 */
export class UdpTerminalTransport extends EventEmitter {
  private socket: dgram.Socket;
  private sessionKey: Buffer;
  private sequenceNumber = 0;
  private lastReceivedSeq = 0;
  private unackedPackets: Map<number, UdpPacket> = new Map();
  private remoteAddress: string | null = null;
  private remotePort: number | null = null;

  // Retransmission settings
  private readonly RETRANSMIT_TIMEOUT_MS = 50;
  private readonly MAX_RETRANSMITS = 5;
  private retransmitTimerId: string | null = null;
  private static instanceCounter = 0;
  private readonly instanceId = ++UdpTerminalTransport.instanceCounter;

  // Statistics
  private stats = {
    packetsSent: 0,
    packetsReceived: 0,
    packetsRetransmitted: 0,
    packetsDropped: 0,
    bytesTransferred: 0,
  };

  constructor() {
    super();
    this.socket = dgram.createSocket("udp4");
    this.sessionKey = randomBytes(16); // AES-128 key

    this.socket.on("message", (msg, rinfo) => this.handleMessage(msg, rinfo));
    this.socket.on("error", (err) => this.emit("error", err));
  }

  /**
   * Bind to local port
   */
  async bind(port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.socket.bind(port, () => {
        const addr = this.socket.address();
        resolve(typeof addr === "string" ? 0 : addr.port);
      });
      this.socket.once("error", reject);
    });
  }

  /**
   * Connect to remote endpoint
   */
  connect(address: string, port: number): void {
    this.remoteAddress = address;
    this.remotePort = port;
  }

  /**
   * Send data with reliability
   */
  send(data: Buffer): number {
    if (!this.remoteAddress || !this.remotePort) {
      throw new Error("Not connected");
    }

    const seq = this.sequenceNumber++;

    const packet: UdpPacket = {
      seq,
      ack: this.lastReceivedSeq,
      timestamp: process.hrtime.bigint(),
      data: this.encrypt(data),
      retransmits: 0,
    };

    const encoded = this.encodePacket(packet);
    this.socket.send(encoded, this.remotePort, this.remoteAddress);

    this.unackedPackets.set(seq, packet);
    this.stats.packetsSent++;
    this.stats.bytesTransferred += encoded.length;

    this.scheduleRetransmit();

    return seq;
  }

  /**
   * Handle incoming message
   */
  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const packet = this.decodePacket(msg);
      this.stats.packetsReceived++;

      // Update remote address (supports roaming!)
      if (this.remoteAddress !== rinfo.address || this.remotePort !== rinfo.port) {
        this.remoteAddress = rinfo.address;
        this.remotePort = rinfo.port;
        this.emit("roam", { address: rinfo.address, port: rinfo.port });
      }

      // Process acknowledgment
      this.processAck(packet.ack);

      // Update last received sequence
      if (packet.seq > this.lastReceivedSeq) {
        this.lastReceivedSeq = packet.seq;
      }

      // Decrypt and emit data
      if (packet.data.length > 0) {
        const decrypted = this.decrypt(packet.data);
        this.emit("data", decrypted);
      }
    } catch {
      this.stats.packetsDropped++;
    }
  }

  /**
   * Process acknowledgment - remove acked packets
   */
  private processAck(ackSeq: number): void {
    for (const [seq] of this.unackedPackets) {
      if (seq <= ackSeq) {
        this.unackedPackets.delete(seq);
      }
    }
  }

  /**
   * Schedule retransmission timer
   */
  private scheduleRetransmit(): void {
    if (this.retransmitTimerId) return;

    const timerId = `udp-retransmit-${this.instanceId}`;
    this.retransmitTimerId = timerId;
    scheduleTimeout(timerId, this.RETRANSMIT_TIMEOUT_MS, () => {
      this.retransmitTimerId = null;
      this.retransmitPackets();
    });
  }

  /**
   * Retransmit unacked packets
   */
  private retransmitPackets(): void {
    const now = process.hrtime.bigint();

    for (const [seq, packet] of this.unackedPackets) {
      const ageMs = Number(now - packet.timestamp) / 1e6;

      if (ageMs > this.RETRANSMIT_TIMEOUT_MS) {
        if (packet.retransmits >= this.MAX_RETRANSMITS) {
          this.unackedPackets.delete(seq);
          this.stats.packetsDropped++;
          continue;
        }

        // Retransmit
        packet.retransmits++;
        packet.timestamp = now;

        const encoded = this.encodePacket(packet);
        this.socket.send(encoded, this.remotePort!, this.remoteAddress!);
        this.stats.packetsRetransmitted++;
      }
    }

    if (this.unackedPackets.size > 0) {
      this.scheduleRetransmit();
    }
  }

  /**
   * Simple XOR encryption (replace with AES in production)
   */
  private encrypt(data: Buffer): Buffer {
    const result = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      result[i] = data[i] ^ this.sessionKey[i % this.sessionKey.length];
    }
    return result;
  }

  private decrypt(data: Buffer): Buffer {
    return this.encrypt(data); // XOR is symmetric
  }

  /**
   * Encode packet to wire format
   */
  private encodePacket(packet: UdpPacket): Buffer {
    // Format: seq(4) + ack(4) + length(4) + data
    const header = Buffer.alloc(12);
    header.writeUInt32LE(packet.seq, 0);
    header.writeUInt32LE(packet.ack, 4);
    header.writeUInt32LE(packet.data.length, 8);

    return Buffer.concat([header, packet.data]);
  }

  /**
   * Decode packet from wire format
   */
  private decodePacket(data: Buffer): UdpPacket {
    if (data.length < 12) {
      throw new Error("Packet too short");
    }

    const seq = data.readUInt32LE(0);
    const ack = data.readUInt32LE(4);
    const length = data.readUInt32LE(8);

    return {
      seq,
      ack,
      timestamp: process.hrtime.bigint(),
      data: data.subarray(12, 12 + length),
      retransmits: 0,
    };
  }

  /**
   * Close transport
   */
  close(): void {
    if (this.retransmitTimerId) {
      cancelTimeout(this.retransmitTimerId);
      this.retransmitTimerId = null;
    }
    this.socket.close();
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  getSessionKey(): Buffer {
    return this.sessionKey;
  }
}

interface UdpPacket {
  seq: number;
  ack: number;
  timestamp: bigint;
  data: Buffer;
  retransmits: number;
}

// ============================================================================
// 5. MODERN PROCESS MONITOR (PIDFD-STYLE)
// ============================================================================

/**
 * Event-driven process monitoring
 * Emulates pidfd/signalfd semantics in pure Node.js
 */
export class ModernProcessMonitor extends EventEmitter {
  private pid: number;
  private checkIntervalActive = false;
  private readonly checkTimerId: string;
  private lastState: ProcessState | null = null;
  private static instanceCounter = 0;

  // Event types
  static readonly EVENT_EXIT = "exit";
  static readonly EVENT_SIGNAL = "signal";
  static readonly EVENT_STATE_CHANGE = "state";

  constructor(pid: number) {
    super();
    this.pid = pid;
    this.checkTimerId = `process-monitor-${++ModernProcessMonitor.instanceCounter}-${pid}`;
    this.lastState = this.getProcessState();
  }

  /**
   * Start monitoring
   */
  start(intervalMs: number = 100): void {
    if (this.checkIntervalActive) return;

    this.checkIntervalActive = true;
    scheduleInterval(this.checkTimerId, intervalMs, () => {
      this.checkProcess();
    });

    // Also listen for SIGCHLD (if this is our child)
    process.on("SIGCHLD", this.handleSigchld);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkIntervalActive) {
      cancelInterval(this.checkTimerId);
      this.checkIntervalActive = false;
    }
    process.off("SIGCHLD", this.handleSigchld);
  }

  /**
   * Check process state
   */
  private checkProcess(): void {
    const state = this.getProcessState();

    if (!state.alive && this.lastState?.alive) {
      this.emit(ModernProcessMonitor.EVENT_EXIT, {
        pid: this.pid,
        exitCode: state.exitCode,
        signal: state.signal,
      });
      this.stop();
    } else if (state.state !== this.lastState?.state) {
      this.emit(ModernProcessMonitor.EVENT_STATE_CHANGE, {
        pid: this.pid,
        oldState: this.lastState?.state,
        newState: state.state,
      });
    }

    this.lastState = state;
  }

  /**
   * Handle SIGCHLD signal
   */
  private handleSigchld = (): void => {
    this.checkProcess();
  };

  /**
   * Get current process state
   */
  private getProcessState(): ProcessState {
    try {
      // Check if process exists
      process.kill(this.pid, 0);

      // Try to read /proc on Linux
      try {
        const { execSync } = require("child_process");
        const status = execSync(`ps -o state= -p ${this.pid}`, {
          encoding: "utf8",
          timeout: 100,
        }).trim();

        return {
          alive: true,
          state: this.parseProcessState(status),
          exitCode: null,
          signal: null,
        };
      } catch {
        return {
          alive: true,
          state: "running",
          exitCode: null,
          signal: null,
        };
      }
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ESRCH") {
        return {
          alive: false,
          state: "zombie",
          exitCode: null,
          signal: null,
        };
      }
      throw err;
    }
  }

  /**
   * Parse process state from ps output
   */
  private parseProcessState(status: string): string {
    const stateMap: Record<string, string> = {
      R: "running",
      S: "sleeping",
      D: "disk-sleep",
      Z: "zombie",
      T: "stopped",
      t: "tracing-stop",
      W: "waking", // W was "paging" in older kernels, now "waking"
      X: "dead",
      x: "dead",
      K: "wakekill",
      P: "parked",
    };

    return stateMap[status.charAt(0)] || "unknown";
  }

  /**
   * Send signal to process
   */
  signal(sig: NodeJS.Signals | number): boolean {
    try {
      process.kill(this.pid, sig);
      this.emit(ModernProcessMonitor.EVENT_SIGNAL, {
        pid: this.pid,
        signal: sig,
        sent: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for process exit (Promise-based)
   */
  async waitForExit(timeoutMs?: number): Promise<ExitInfo> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.off(ModernProcessMonitor.EVENT_EXIT, onExit);
        if (timer) clearTimeout(timer);
      };

      const onExit = (info: ExitInfo) => {
        cleanup();
        resolve(info);
      };

      this.on(ModernProcessMonitor.EVENT_EXIT, onExit);

      let timer: NodeJS.Timeout | undefined;
      if (timeoutMs) {
        timer = setTimeout(() => {
          cleanup();
          reject(new Error("Timeout waiting for process exit"));
        }, timeoutMs);
      }

      // Check if already exited
      if (!this.lastState?.alive) {
        cleanup();
        resolve({
          pid: this.pid,
          exitCode: this.lastState?.exitCode ?? null,
          signal: this.lastState?.signal ?? null,
        });
      }
    });
  }
}

interface ProcessState {
  alive: boolean;
  state: string;
  exitCode: number | null;
  signal: string | null;
}

interface ExitInfo {
  pid: number;
  exitCode: number | null;
  signal: string | null;
}

// ============================================================================
// 6. FACTORY FUNCTIONS
// ============================================================================

/**
 * Create local echo predictor
 */
export function createLocalEchoPredictor(): LocalEchoPrediction {
  return new LocalEchoPrediction();
}

/**
 * Create damage tracking renderer
 */
export function createDamageRenderer(cols: number = 80, rows: number = 24): DamageTrackingRenderer {
  return new DamageTrackingRenderer(cols, rows);
}

/**
 * Create shared memory terminal
 */
export function createSharedMemoryTerminal(
  cols: number = 80,
  rows: number = 24,
  scrollback: number = 1000,
): SharedMemoryTerminal {
  return new SharedMemoryTerminal(cols, rows, scrollback);
}

/**
 * Create UDP transport
 */
export function createUdpTransport(): UdpTerminalTransport {
  return new UdpTerminalTransport();
}

/**
 * Create process monitor
 */
export function createProcessMonitor(pid: number): ModernProcessMonitor {
  return new ModernProcessMonitor(pid);
}
