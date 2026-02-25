/**
 * Piece Table Text Buffer - VS Code/Monaco-style O(1) text operations.
 *
 * Why Piece Table?
 * - O(1) appends (perfect for streaming)
 * - O(log n) line access with caching
 * - Handles large files efficiently (VS Code handles 35MB+)
 * - No string concatenation overhead (current approach is O(n) copies)
 *
 * Architecture:
 * - Original buffer: immutable initial content
 * - Add buffer: appends only (never modified)
 * - Piece list: references into buffers
 */

type BufferSource = "original" | "add";

interface Piece {
  source: BufferSource;
  start: number;
  length: number;
}

interface Buffer {
  content: string;
  lineStarts: number[]; // Pre-computed line start offsets
}

export class PieceTable {
  private original: Buffer;
  private add: Buffer;
  private pieces: Piece[] = [];
  private cachedPieceIndex: number = 0; // Cache for streaming locality
  private cachedPieceOffset: number = 0;
  private totalLength: number = 0;

  constructor(initialContent: string = "") {
    this.original = {
      content: initialContent,
      lineStarts: this.computeLineStarts(initialContent),
    };
    this.add = {
      content: "",
      lineStarts: [0],
    };

    if (initialContent.length > 0) {
      this.pieces.push({
        source: "original",
        start: 0,
        length: initialContent.length,
      });
      this.totalLength = initialContent.length;
    }
  }

  /**
   * O(1) append - perfect for streaming
   */
  append(text: string): void {
    if (text.length === 0) return;

    const start = this.add.content.length;
    this.add.content += text;

    // Incrementally compute line starts for new text
    const baseOffset = start === 0 ? 0 : this.add.lineStarts[this.add.lineStarts.length - 1];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        this.add.lineStarts.push(start + i + 1);
      }
    }

    // Coalesce with last piece if it's also from add buffer
    const lastPiece = this.pieces[this.pieces.length - 1];
    if (lastPiece && lastPiece.source === "add" && lastPiece.start + lastPiece.length === start) {
      lastPiece.length += text.length;
    } else {
      this.pieces.push({
        source: "add",
        start,
        length: text.length,
      });
    }

    this.totalLength += text.length;
  }

  /**
   * Get the full text content (for final output)
   */
  getText(): string {
    const chunks: string[] = [];
    for (const piece of this.pieces) {
      const buffer = piece.source === "original" ? this.original : this.add;
      chunks.push(buffer.content.slice(piece.start, piece.start + piece.length));
    }
    return chunks.join("");
  }

  /**
   * O(log n) character offset access with caching
   */
  charAt(offset: number): string {
    if (offset < 0 || offset >= this.totalLength) return "";

    const { piece, localOffset } = this.findPieceAt(offset);
    const buffer = piece.source === "original" ? this.original : this.add;
    return buffer.content[piece.start + localOffset];
  }

  /**
   * Get a range of text
   */
  getRange(start: number, length: number): string {
    if (start < 0 || length <= 0 || start >= this.totalLength) return "";

    const end = Math.min(start + length, this.totalLength);
    const chunks: string[] = [];
    let currentOffset = start;

    while (currentOffset < end) {
      const { piece, pieceOffset, localOffset } = this.findPieceAtWithInfo(currentOffset);
      const buffer = piece.source === "original" ? this.original : this.add;

      const availableInPiece = piece.length - localOffset;
      const needed = end - currentOffset;
      const take = Math.min(availableInPiece, needed);

      chunks.push(
        buffer.content.slice(piece.start + localOffset, piece.start + localOffset + take),
      );
      currentOffset += take;
    }

    return chunks.join("");
  }

  /**
   * Get total length
   */
  get length(): number {
    return this.totalLength;
  }

  /**
   * Get line count
   */
  getLineCount(): number {
    // Count newlines + 1 (or 0 if empty)
    if (this.totalLength === 0) return 0;

    let count = 1;
    for (const piece of this.pieces) {
      const buffer = piece.source === "original" ? this.original : this.add;
      const text = buffer.content.slice(piece.start, piece.start + piece.length);
      for (const ch of text) {
        if (ch === "\n") count++;
      }
    }
    return count;
  }

  /**
   * Get a specific line (0-indexed)
   */
  getLine(lineNumber: number): string {
    if (lineNumber < 0) return "";

    let currentLine = 0;
    let lineStart = 0;

    for (const piece of this.pieces) {
      const buffer = piece.source === "original" ? this.original : this.add;
      const text = buffer.content.slice(piece.start, piece.start + piece.length);

      for (let i = 0; i < text.length; i++) {
        if (currentLine === lineNumber) {
          // Find end of line
          const endOfLine = text.indexOf("\n", i);
          if (endOfLine === -1) {
            // Line continues to end of this piece and possibly beyond
            const rest = text.slice(i);
            // Check subsequent pieces
            const pieceIndex = this.pieces.indexOf(piece);
            const remaining = this.pieces.slice(pieceIndex + 1);
            for (const nextPiece of remaining) {
              const nextBuffer = nextPiece.source === "original" ? this.original : this.add;
              const nextText = nextBuffer.content.slice(
                nextPiece.start,
                nextPiece.start + nextPiece.length,
              );
              const nextNewline = nextText.indexOf("\n");
              if (nextNewline === -1) {
                return rest + nextText;
              }
              return rest + nextText.slice(0, nextNewline);
            }
            return rest;
          }
          return text.slice(i, endOfLine);
        }
        if (text[i] === "\n") {
          currentLine++;
        }
      }
    }

    return "";
  }

  /**
   * Get multiple lines efficiently
   */
  getLines(startLine: number, count: number): string[] {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const line = this.getLine(startLine + i);
      if (line === "" && startLine + i >= this.getLineCount()) break;
      lines.push(line);
    }
    return lines;
  }

  /**
   * Clear all content
   */
  clear(): void {
    this.pieces = [];
    this.add.content = "";
    this.add.lineStarts = [0];
    this.totalLength = 0;
    this.cachedPieceIndex = 0;
    this.cachedPieceOffset = 0;
  }

  // Private helpers

  private computeLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        starts.push(i + 1);
      }
    }
    return starts;
  }

  private findPieceAt(offset: number): { piece: Piece; localOffset: number } {
    const { piece, localOffset } = this.findPieceAtWithInfo(offset);
    return { piece, localOffset };
  }

  private findPieceAtWithInfo(offset: number): {
    piece: Piece;
    pieceOffset: number;
    localOffset: number;
  } {
    // Use cache for streaming locality (consecutive accesses likely in same piece)
    if (this.cachedPieceIndex < this.pieces.length) {
      const cachedPiece = this.pieces[this.cachedPieceIndex];
      const cachedEnd = this.cachedPieceOffset + cachedPiece.length;
      if (offset >= this.cachedPieceOffset && offset < cachedEnd) {
        return {
          piece: cachedPiece,
          pieceOffset: this.cachedPieceOffset,
          localOffset: offset - this.cachedPieceOffset,
        };
      }
    }

    // Binary search would be better for many pieces, but linear is fine for streaming (usually 1-3 pieces)
    let pieceOffset = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      const piece = this.pieces[i];
      if (offset >= pieceOffset && offset < pieceOffset + piece.length) {
        this.cachedPieceIndex = i;
        this.cachedPieceOffset = pieceOffset;
        return {
          piece,
          pieceOffset,
          localOffset: offset - pieceOffset,
        };
      }
      pieceOffset += piece.length;
    }

    // Return last piece if offset is at end
    const lastPiece = this.pieces[this.pieces.length - 1];
    if (lastPiece && offset === this.totalLength) {
      return {
        piece: lastPiece,
        pieceOffset: this.totalLength - lastPiece.length,
        localOffset: lastPiece.length,
      };
    }

    throw new Error(`Offset ${offset} out of bounds (length: ${this.totalLength})`);
  }
}
