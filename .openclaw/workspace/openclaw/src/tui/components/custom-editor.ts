import { Editor, Key, matchesKey } from "@mariozechner/pi-tui";
import { getKeybindingManager, type ActionContext, executeAction } from "../keybinds/index.js";
import { createVimKeybindingsHandler } from "../vim-mode/vim-keybindings.js";
import { isVimModeEnabled, getCurrentVimMode } from "../vim-mode/vim-state.js";

/**
 * Legacy callback interface for backward compatibility.
 * These are gradually being replaced by the keybinding action system.
 */
export interface CustomEditorCallbacks {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  onCtrlG?: () => void;
  onCtrlL?: () => void;
  onCtrlO?: () => void;
  onCtrlP?: () => void;
  onCtrlT?: () => void;
  onShiftTab?: () => void;
  onAltEnter?: () => void;
}

export class CustomEditor extends Editor {
  // Legacy callbacks (backward compatibility)
  onEscape?: () => void;
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  onCtrlG?: () => void;
  onCtrlL?: () => void;
  onCtrlO?: () => void;
  onCtrlP?: () => void;
  onCtrlT?: () => void;
  onShiftTab?: () => void;
  onAltEnter?: () => void;

  // New action-based keybinding context
  actionContext?: Partial<ActionContext>;

  // Flag to enable new keybinding system
  private useKeybindManager: boolean = true;

  private vimHandler = createVimKeybindingsHandler(this);

  // ============================================================================
  // VIM MODE ADAPTER METHODS
  // These methods adapt the pi-tui Editor API to the interface expected by
  // VimOperations. The base Editor has: getText(), getLines(), getCursor()
  // ============================================================================

  /**
   * Get cursor position as {line, column} for Vim operations
   */
  getCursorPosition(): { line: number; column: number } {
    const cursor = this.getCursor();
    return { line: cursor.line, column: cursor.col };
  }

  /**
   * Set cursor position - adapts to pi-tui Editor
   * pi-tui Editor doesn't expose setCursor directly, so we use
   * handleInput with arrow key escape sequences to move the cursor.
   */
  setCursorPosition(line: number, column: number): void {
    const current = this.getCursor();

    // Move vertically first
    const lineDelta = line - current.line;
    if (lineDelta !== 0) {
      const arrowKey = lineDelta > 0 ? "\x1b[B" : "\x1b[A"; // Down : Up
      for (let i = 0; i < Math.abs(lineDelta); i++) {
        super.handleInput(arrowKey);
      }
    }

    // Recalculate column after vertical movement (line length may differ)
    const newCurrent = this.getCursor();
    const colDelta = column - newCurrent.col;
    if (colDelta !== 0) {
      const arrowKey = colDelta > 0 ? "\x1b[C" : "\x1b[D"; // Right : Left
      for (let i = 0; i < Math.abs(colDelta); i++) {
        super.handleInput(arrowKey);
      }
    }
  }

  /**
   * Get a specific line by index
   */
  getLine(lineIndex: number): string {
    const lines = this.getLines();
    return lines[lineIndex] ?? "";
  }

  /**
   * Set a specific line's content
   */
  setLine(lineIndex: number, content: string): void {
    const lines = this.getLines();
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines[lineIndex] = content;
      this.setText(lines.join("\n"));
    }
  }

  /**
   * Get total number of lines
   */
  getLineCount(): number {
    return this.getLines().length;
  }

  /**
   * Remove a line at the given index
   */
  removeLine(lineIndex: number): void {
    const lines = this.getLines();
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines.splice(lineIndex, 1);
      if (lines.length === 0) {
        lines.push("");
      }
      this.setText(lines.join("\n"));
    }
  }

  /**
   * Insert a new line at the given index
   */
  insertLine(lineIndex: number, content: string): void {
    const lines = this.getLines();
    const clampedIndex = Math.max(0, Math.min(lineIndex, lines.length));
    lines.splice(clampedIndex, 0, content);
    this.setText(lines.join("\n"));
  }

  /**
   * Set the action context for the new keybinding system.
   * When set, keybindings will use executeAction() instead of legacy callbacks.
   */
  setActionContext(ctx: Partial<ActionContext>): void {
    this.actionContext = ctx;
  }

  /**
   * Enable or disable the keybinding manager.
   * When disabled, falls back to legacy callback-based handling.
   */
  setKeybindManagerEnabled(enabled: boolean): void {
    this.useKeybindManager = enabled;
  }

  handleInput(data: string): void {
    // First, try Vim keybindings
    if (isVimModeEnabled()) {
      const handled = this.vimHandler.handleKey(data);
      if (handled) {
        return;
      }
    }

    // Try the new keybinding system
    if (this.useKeybindManager) {
      const manager = getKeybindingManager();
      const binding = manager.match(data);

      if (binding && this.actionContext) {
        // Set context if we have vim mode info
        if (isVimModeEnabled()) {
          const vimMode = getCurrentVimMode();
          manager.setContext(vimMode === "NORMAL" ? "vim-normal" : "vim-insert");
        } else {
          manager.setContext("input");
        }

        // Execute the action
        const handled = executeAction(binding.action, this.actionContext as ActionContext);
        if (handled) {
          return;
        }
      }
    }

    // Fall back to legacy callback-based handling
    if (matchesKey(data, Key.alt("enter")) && this.onAltEnter) {
      this.onAltEnter();
      return;
    }
    if (matchesKey(data, Key.ctrl("l")) && this.onCtrlL) {
      this.onCtrlL();
      return;
    }
    if (matchesKey(data, Key.ctrl("o")) && this.onCtrlO) {
      this.onCtrlO();
      return;
    }
    if (matchesKey(data, Key.ctrl("p")) && this.onCtrlP) {
      this.onCtrlP();
      return;
    }
    if (matchesKey(data, Key.ctrl("g")) && this.onCtrlG) {
      this.onCtrlG();
      return;
    }
    if (matchesKey(data, Key.ctrl("t")) && this.onCtrlT) {
      this.onCtrlT();
      return;
    }
    if (matchesKey(data, Key.shift("tab")) && this.onShiftTab) {
      this.onShiftTab();
      return;
    }
    if (matchesKey(data, Key.escape) && this.onEscape && !this.isShowingAutocomplete()) {
      this.onEscape();
      return;
    }
    if (matchesKey(data, Key.ctrl("c")) && this.onCtrlC) {
      this.onCtrlC();
      return;
    }
    if (matchesKey(data, Key.ctrl("d"))) {
      if (this.getText().length === 0 && this.onCtrlD) {
        this.onCtrlD();
      }
      return;
    }

    super.handleInput(data);
  }
}
