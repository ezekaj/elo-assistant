/**
 * Editor Adapter for Keybinding System
 *
 * Wraps the pi-tui Editor to provide a clean interface for keybinding actions.
 * Handles cursor positioning, text manipulation, and history navigation.
 */

import type { Editor } from "@mariozechner/pi-tui";

/**
 * Cursor position as a single character offset from start of text.
 */
export interface CursorPosition {
  /** Absolute character offset (0-based) */
  offset: number;
  /** Line number (0-based) */
  line: number;
  /** Column on line (0-based) */
  col: number;
}

/**
 * History entry with text and metadata.
 */
export interface HistoryEntry {
  text: string;
  timestamp: number;
}

/**
 * Editor adapter that provides a stable interface for keybinding actions.
 *
 * The pi-tui Editor uses {line, col} for cursor position and has
 * internal history/autocomplete. This adapter bridges to the action system.
 */
export class EditorAdapter {
  private editor: Editor;
  private history: string[] = [];
  private historyIndex: number = -1;
  private savedText: string = "";

  constructor(editor: Editor) {
    this.editor = editor;
  }

  // =========================================================================
  // TEXT ACCESS
  // =========================================================================

  /**
   * Get the full text content.
   */
  getText(): string {
    return this.editor.getText();
  }

  /**
   * Set the full text content.
   */
  setText(text: string): void {
    this.editor.setText(text);
  }

  /**
   * Clear all text.
   */
  clear(): void {
    this.editor.setText("");
  }

  /**
   * Insert text at current cursor position.
   */
  insert(text: string): void {
    this.editor.insertTextAtCursor(text);
  }

  // =========================================================================
  // CURSOR POSITIONING
  // =========================================================================

  /**
   * Get cursor position as character offset.
   *
   * Converts the Editor's {line, col} to a linear offset.
   */
  getCursorOffset(): number {
    const lines = this.editor.getLines();
    const cursor = this.editor.getCursor();

    let offset = 0;
    for (let i = 0; i < cursor.line; i++) {
      offset += lines[i]?.length ?? 0;
      offset += 1; // newline
    }
    offset += cursor.col;

    return offset;
  }

  /**
   * Get cursor position with full details.
   */
  getCursor(): CursorPosition {
    const cursor = this.editor.getCursor();
    return {
      offset: this.getCursorOffset(),
      line: cursor.line,
      col: cursor.col,
    };
  }

  /**
   * Set cursor position from character offset.
   *
   * Converts linear offset to {line, col} and moves cursor.
   * Note: The pi-tui Editor doesn't have a public setCursor method,
   * so this manipulates text to achieve cursor movement.
   */
  setCursorOffset(offset: number): void {
    const lines = this.editor.getLines();
    let currentOffset = 0;
    let targetLine = 0;
    let targetCol = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i]?.length ?? 0;
      const lineEndOffset = currentOffset + lineLength;

      if (offset <= lineEndOffset) {
        targetLine = i;
        targetCol = Math.max(0, offset - currentOffset);
        break;
      }

      currentOffset = lineEndOffset + 1; // +1 for newline
      targetLine = i + 1;
      targetCol = 0;
    }

    // The Editor doesn't expose setCursor, but we can use setText
    // to rebuild with cursor at the right position.
    // For now, this is a limitation - we can only move cursor
    // to start/end of line easily.

    // Simple approach: if moving to start/end, use setText
    const text = this.getText();
    if (offset <= 0) {
      // Already at start after setText
      this.setText(text);
    } else if (offset >= text.length) {
      // setText puts cursor at end
      this.setText(text);
    }
    // For middle positions, we'd need Editor support
    // This is a known limitation
  }

  // =========================================================================
  // TEXT MANIPULATION
  // =========================================================================

  /**
   * Delete text in a range.
   *
   * @param start Start offset (character position)
   * @param end End offset (character position)
   */
  delete(start: number, end: number): void {
    const text = this.getText();
    const before = text.slice(0, start);
    const after = text.slice(end);
    this.setText(before + after);
    this.setCursorOffset(start);
  }

  /**
   * Delete from cursor to end of line.
   */
  deleteToEndOfLine(): void {
    const lines = this.editor.getLines();
    const cursor = this.editor.getCursor();
    const lineText = lines[cursor.line] ?? "";
    const beforeCursor = lineText.slice(0, cursor.col);

    // Rebuild the line without the part after cursor
    lines[cursor.line] = beforeCursor;

    // Rebuild full text
    this.setText(lines.join("\n"));
  }

  /**
   * Delete from cursor to start of line.
   */
  deleteToStartOfLine(): void {
    const lines = this.editor.getLines();
    const cursor = this.editor.getCursor();
    const lineText = lines[cursor.line] ?? "";
    const afterCursor = lineText.slice(cursor.col);

    // Rebuild the line without the part before cursor
    lines[cursor.line] = afterCursor;

    // Rebuild full text and set cursor to start of line
    this.setText(lines.join("\n"));
  }

  // =========================================================================
  // HISTORY NAVIGATION
  // =========================================================================

  /**
   * Add text to history.
   */
  addToHistory(text: string): void {
    // Don't add empty or duplicate consecutive entries
    if (!text.trim() || this.history[this.history.length - 1] === text) {
      return;
    }
    this.history.push(text);
    // Also add to Editor's internal history
    this.editor.addToHistory(text);
  }

  /**
   * Navigate to previous history item.
   *
   * @returns The previous history text, or undefined if at beginning
   */
  historyPrev(): string | undefined {
    if (this.history.length === 0) {
      return undefined;
    }

    // Save current text when starting navigation
    if (this.historyIndex === -1) {
      this.savedText = this.getText();
    }

    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      const text = this.history[this.history.length - 1 - this.historyIndex];
      if (text !== undefined) {
        this.setText(text);
      }
      return text;
    }

    return undefined;
  }

  /**
   * Navigate to next history item.
   *
   * @returns The next history text, or undefined if at end
   */
  historyNext(): string | undefined {
    if (this.historyIndex === -1) {
      return undefined;
    }

    this.historyIndex--;

    if (this.historyIndex === -1) {
      // Return to saved text
      this.setText(this.savedText);
      return "";
    }

    const text = this.history[this.history.length - 1 - this.historyIndex];
    if (text !== undefined) {
      this.setText(text);
    }
    return text;
  }

  /**
   * Search history for matching prefix.
   */
  historySearch(prefix: string): string | undefined {
    if (!prefix || this.history.length === 0) {
      return undefined;
    }

    // Search from most recent backwards
    for (let i = this.history.length - 1; i >= 0; i--) {
      const entry = this.history[i];
      if (entry?.startsWith(prefix)) {
        return entry;
      }
    }

    return undefined;
  }

  /**
   * Reset history navigation state.
   */
  resetHistoryNav(): void {
    this.historyIndex = -1;
    this.savedText = "";
  }

  // =========================================================================
  // AUTOCOMPLETE
  // =========================================================================

  /**
   * Check if autocomplete is showing.
   */
  isAutocompleteActive(): boolean {
    return this.editor.isShowingAutocomplete();
  }

  /**
   * Navigate to next autocomplete suggestion.
   *
   * Note: The Editor handles Tab for autocomplete internally.
   * We simulate down arrow for navigation.
   */
  autocompleteNext(): void {
    if (!this.isAutocompleteActive()) return;
    // The Editor handles autocomplete navigation internally
    // We can't directly control it, but Tab/Shift+Tab work
    // This is a known limitation
  }

  /**
   * Navigate to previous autocomplete suggestion.
   */
  autocompletePrev(): void {
    if (!this.isAutocompleteActive()) return;
    // Similar limitation as autocompleteNext
  }

  /**
   * Cancel autocomplete.
   */
  autocompleteCancel(): void {
    if (!this.isAutocompleteActive()) return;
    // Escape key cancels, but we can't programmatically trigger it
    // User needs to press Escape
  }

  /**
   * Accept current autocomplete suggestion.
   */
  autocompleteAccept(): void {
    if (!this.isAutocompleteActive()) return;
    // Tab or Enter accepts, handled internally by Editor
  }

  // =========================================================================
  // SUBMISSION
  // =========================================================================

  /**
   * Trigger submission of current text.
   */
  submit(): void {
    const text = this.getText();
    // Add to our history before submitting
    this.addToHistory(text);
    // Reset history navigation
    this.resetHistoryNav();
    // Trigger the Editor's submit
    this.editor.onSubmit?.(text);
  }
}
