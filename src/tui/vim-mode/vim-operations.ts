/**
 * Vim Operations
 *
 * Implements Vim text operations (move, delete, etc.)
 */

import type { CustomEditor } from "../components/custom-editor.js";
import type { VimCursor, VimOperationResult } from "./types.js";

/**
 * Vim operations class
 */
export class VimOperations {
  private editor: CustomEditor;

  constructor(editor: CustomEditor) {
    this.editor = editor;
  }

  // ============================================================================
  // CURSOR MOVEMENT
  // ============================================================================

  /**
   * Move cursor left (h)
   */
  moveLeft(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    if (pos.column > 0) {
      this.editor.setCursorPosition(pos.line, pos.column - 1);
      return { success: true, cursor: { line: pos.line, column: pos.column - 1 } };
    }
    return { success: false };
  }

  /**
   * Move cursor right (l)
   */
  moveRight(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const line = this.editor.getLine(pos.line);
    if (pos.column < line.length) {
      this.editor.setCursorPosition(pos.line, pos.column + 1);
      return { success: true, cursor: { line: pos.line, column: pos.column + 1 } };
    }
    return { success: false };
  }

  /**
   * Move cursor up (k)
   */
  moveUp(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    if (pos.line > 0) {
      this.editor.setCursorPosition(pos.line - 1, pos.column);
      return { success: true, cursor: { line: pos.line - 1, column: pos.column } };
    }
    return { success: false };
  }

  /**
   * Move cursor down (j)
   */
  moveDown(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const totalLines = this.editor.getLineCount();
    if (pos.line < totalLines - 1) {
      this.editor.setCursorPosition(pos.line + 1, pos.column);
      return { success: true, cursor: { line: pos.line + 1, column: pos.column } };
    }
    return { success: false };
  }

  /**
   * Move to start of line (0)
   */
  moveToLineStart(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    this.editor.setCursorPosition(pos.line, 0);
    return { success: true, cursor: { line: pos.line, column: 0 } };
  }

  /**
   * Move to end of line ($)
   */
  moveToLineEnd(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const line = this.editor.getLine(pos.line);
    this.editor.setCursorPosition(pos.line, line.length);
    return { success: true, cursor: { line: pos.line, column: line.length } };
  }

  /**
   * Move to first non-blank character (^)
   */
  moveToFirstNonBlank(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const line = this.editor.getLine(pos.line);
    const match = line.match(/\S/);
    const column = match ? match.index! : 0;
    this.editor.setCursorPosition(pos.line, column);
    return { success: true, cursor: { line: pos.line, column } };
  }

  /**
   * Move to first line (gg)
   */
  moveToFirstLine(): VimOperationResult {
    this.editor.setCursorPosition(0, 0);
    return { success: true, cursor: { line: 0, column: 0 } };
  }

  /**
   * Move to last line (G)
   */
  moveToLastLine(): VimOperationResult {
    const lastLine = this.editor.getLineCount() - 1;
    this.editor.setCursorPosition(lastLine, 0);
    return { success: true, cursor: { line: lastLine, column: 0 } };
  }

  /**
   * Move to next word (w)
   */
  moveToNextWord(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const text = this.editor.getText();
    const lines = text.split("\n");

    let currentLine = pos.line;
    let currentCol = pos.column;

    // Find next word boundary
    const line = lines[currentLine] || "";

    // Skip non-word characters first
    let foundNonWord = false;
    for (let i = currentCol; i < line.length; i++) {
      if (!this.isWordChar(line[i])) {
        foundNonWord = true;
        currentCol = i;
        break;
      }
    }

    // If we didn't find non-word, we're at end of line
    if (!foundNonWord) {
      // Move to next line if available
      if (currentLine < lines.length - 1) {
        currentLine++;
        const nextLine = lines[currentLine] || "";
        const match = nextLine.match(/\S/);
        if (match) {
          this.editor.setCursorPosition(currentLine, match.index!);
          return { success: true, cursor: { line: currentLine, column: match.index! } };
        }
      }
      return { success: false };
    }

    // Now skip non-word characters to find next word
    for (let i = currentCol; i < line.length; i++) {
      if (this.isWordChar(line[i])) {
        this.editor.setCursorPosition(currentLine, i);
        return { success: true, cursor: { line: currentLine, column: i } };
      }
    }

    // Move to next line if not found
    if (currentLine < lines.length - 1) {
      currentLine++;
      const nextLine = lines[currentLine] || "";
      const match = nextLine.match(/\S/);
      if (match) {
        this.editor.setCursorPosition(currentLine, match.index!);
        return { success: true, cursor: { line: currentLine, column: match.index! } };
      }
    }

    return { success: false };
  }

  /**
   * Move to previous word (b)
   */
  moveToPrevWord(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const text = this.editor.getText();
    const lines = text.split("\n");

    let currentLine = pos.line;
    let currentCol = pos.column;

    const line = lines[currentLine] || "";

    // Move back to start of current word or previous word
    for (let i = currentCol - 1; i >= 0; i--) {
      if (this.isWordChar(line[i]) && (i === 0 || !this.isWordChar(line[i - 1]))) {
        this.editor.setCursorPosition(currentLine, i);
        return { success: true, cursor: { line: currentLine, column: i } };
      }
    }

    // Move to previous line if not found
    if (currentLine > 0) {
      currentLine--;
      const prevLine = lines[currentLine] || "";
      const words = prevLine.match(/\S+/g);
      if (words && words.length > 0) {
        const lastWord = words[words.length - 1];
        const lastWordStart = prevLine.lastIndexOf(lastWord);
        this.editor.setCursorPosition(currentLine, lastWordStart);
        return { success: true, cursor: { line: currentLine, column: lastWordStart } };
      }
    }

    return { success: false };
  }

  /**
   * Move to end of word (e)
   */
  moveToEndWord(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const text = this.editor.getText();
    const lines = text.split("\n");

    let currentLine = pos.line;
    let currentCol = pos.column;

    const line = lines[currentLine] || "";

    // Find end of current or next word
    for (let i = currentCol + 1; i < line.length; i++) {
      if (!this.isWordChar(line[i]) && i > currentCol + 1) {
        this.editor.setCursorPosition(currentLine, i - 1);
        return { success: true, cursor: { line: currentLine, column: i - 1 } };
      }
    }

    // Find end of last word on line
    const words = line.match(/\S+/g);
    if (words && words.length > 0) {
      const lastWord = words[words.length - 1];
      const lastWordEnd = line.lastIndexOf(lastWord) + lastWord.length - 1;
      this.editor.setCursorPosition(currentLine, lastWordEnd);
      return { success: true, cursor: { line: currentLine, column: lastWordEnd } };
    }

    return { success: false };
  }

  // ============================================================================
  // TEXT OPERATIONS
  // ============================================================================

  /**
   * Delete character under cursor (x)
   */
  deleteChar(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const line = this.editor.getLine(pos.line);
    if (pos.column < line.length) {
      const newText = line.slice(0, pos.column) + line.slice(pos.column + 1);
      this.editor.setLine(pos.line, newText);
      return { success: true };
    }
    return { success: false };
  }

  /**
   * Delete line (dd)
   */
  deleteLine(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    const totalLines = this.editor.getLineCount();

    if (totalLines === 1) {
      this.editor.setText("");
      return { success: true };
    }

    this.editor.removeLine(pos.line);

    // Move cursor to previous line if deleted last line
    if (pos.line >= totalLines - 1) {
      this.editor.setCursorPosition(pos.line - 1, 0);
    } else {
      this.editor.setCursorPosition(pos.line, 0);
    }

    return { success: true };
  }

  /**
   * Insert mode (i)
   */
  enterInsertMode(): VimOperationResult {
    return { success: true, mode: "INSERT" };
  }

  /**
   * Append mode (a)
   */
  enterAppendMode(): VimOperationResult {
    this.moveRight();
    return { success: true, mode: "INSERT" };
  }

  /**
   * Insert at line start (I)
   */
  enterInsertAtLineStart(): VimOperationResult {
    this.moveToFirstNonBlank();
    return { success: true, mode: "INSERT" };
  }

  /**
   * Append at line end (A)
   */
  enterAppendAtLineEnd(): VimOperationResult {
    this.moveToLineEnd();
    return { success: true, mode: "INSERT" };
  }

  /**
   * Open line below (o)
   */
  openLineBelow(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    this.editor.insertLine(pos.line + 1, "");
    this.editor.setCursorPosition(pos.line + 1, 0);
    return { success: true, mode: "INSERT" };
  }

  /**
   * Open line above (O)
   */
  openLineAbove(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    this.editor.insertLine(pos.line, "");
    this.editor.setCursorPosition(pos.line, 0);
    return { success: true, mode: "INSERT" };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Check if character is a word character
   */
  private isWordChar(char: string): boolean {
    return /\w/.test(char);
  }
}

/**
 * Create Vim operations instance
 */
export function createVimOperations(editor: CustomEditor): VimOperations {
  return new VimOperations(editor);
}
