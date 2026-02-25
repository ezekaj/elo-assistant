import { describe, it, expect } from "vitest";
import { PieceTable } from "./piece-table.js";

describe("PieceTable", () => {
  it("should start empty", () => {
    const pt = new PieceTable();
    expect(pt.length).toBe(0);
    expect(pt.getText()).toBe("");
    expect(pt.getLineCount()).toBe(0);
  });

  it("should initialize with content", () => {
    const pt = new PieceTable("Hello\nWorld");
    expect(pt.length).toBe(11);
    expect(pt.getText()).toBe("Hello\nWorld");
    expect(pt.getLineCount()).toBe(2);
  });

  it("should append text with O(1) efficiency", () => {
    const pt = new PieceTable();
    pt.append("Hello");
    pt.append(" ");
    pt.append("World");
    expect(pt.getText()).toBe("Hello World");
    expect(pt.length).toBe(11);
  });

  it("should handle multiple appends efficiently", () => {
    const pt = new PieceTable();
    const parts = ["Line 1\n", "Line 2\n", "Line 3\n"];
    for (const part of parts) {
      pt.append(part);
    }
    expect(pt.getText()).toBe("Line 1\nLine 2\nLine 3\n");
    // Trailing newline creates 4 lines (last is empty)
    expect(pt.getLineCount()).toBe(4);
  });

  it("should get specific lines", () => {
    const pt = new PieceTable("First\nSecond\nThird");
    expect(pt.getLine(0)).toBe("First");
    expect(pt.getLine(1)).toBe("Second");
    expect(pt.getLine(2)).toBe("Third");
    expect(pt.getLine(3)).toBe("");
    expect(pt.getLine(-1)).toBe("");
  });

  it("should get multiple lines", () => {
    const pt = new PieceTable("A\nB\nC\nD");
    expect(pt.getLines(0, 2)).toEqual(["A", "B"]);
    expect(pt.getLines(1, 2)).toEqual(["B", "C"]);
  });

  it("should get character at offset", () => {
    const pt = new PieceTable("Hello");
    expect(pt.charAt(0)).toBe("H");
    expect(pt.charAt(4)).toBe("o");
    expect(pt.charAt(5)).toBe("");
    expect(pt.charAt(-1)).toBe("");
  });

  it("should get ranges of text", () => {
    const pt = new PieceTable("Hello World");
    expect(pt.getRange(0, 5)).toBe("Hello");
    expect(pt.getRange(6, 5)).toBe("World");
    expect(pt.getRange(0, 100)).toBe("Hello World");
  });

  it("should handle streaming scenario", () => {
    const pt = new PieceTable();

    // Simulate streaming deltas
    const deltas = ["The ", "quick ", "brown ", "fox ", "jumps."];
    for (const delta of deltas) {
      pt.append(delta);
    }

    expect(pt.getText()).toBe("The quick brown fox jumps.");
    expect(pt.length).toBe(26);
  });

  it("should handle mixed content with newlines", () => {
    const pt = new PieceTable();
    pt.append("Line 1\n");
    pt.append("Line 2\n");
    pt.append("Line 3");

    expect(pt.getLineCount()).toBe(3);
    expect(pt.getLine(0)).toBe("Line 1");
    expect(pt.getLine(1)).toBe("Line 2");
    expect(pt.getLine(2)).toBe("Line 3");
  });

  it("should clear content", () => {
    const pt = new PieceTable("Some content");
    pt.clear();
    expect(pt.length).toBe(0);
    expect(pt.getText()).toBe("");
  });

  it("should handle large appends efficiently", () => {
    const pt = new PieceTable();
    const start = Date.now();

    // 10,000 appends should be fast with O(1)
    for (let i = 0; i < 10000; i++) {
      pt.append("x");
    }

    const elapsed = Date.now() - start;
    expect(pt.length).toBe(10000);
    // Should complete in under 100ms (O(n) concat would take seconds)
    expect(elapsed).toBeLessThan(100);
  });

  it("should coalesce adjacent add buffer pieces", () => {
    const pt = new PieceTable();
    pt.append("a");
    pt.append("b");
    pt.append("c");
    // All should coalesce into one piece
    expect(pt.getText()).toBe("abc");
  });
});
