/**
 * Vim Keybindings Handler
 *
 * Handles Vim keybindings in NORMAL, INSERT, and VISUAL modes.
 */

import type { CustomEditor } from "../components/custom-editor.js";
import { VimOperations, createVimOperations } from "./vim-operations.js";
import {
  getCurrentVimMode,
  setCurrentVimMode,
  isVimModeEnabled,
  setPendingOperator,
  getPendingOperator,
  setLastCommand,
} from "./vim-state.js";

/**
 * Pending command state
 */
interface PendingCommand {
  operator: string;
  startTime: number;
}

/**
 * Vim keybindings handler class
 */
export class VimKeybindingsHandler {
  private editor: CustomEditor;
  private operations: VimOperations;
  private pendingCommand: PendingCommand | null = null;
  private readonly COMMAND_TIMEOUT = 1000; // ms

  constructor(editor: CustomEditor) {
    this.editor = editor;
    this.operations = createVimOperations(editor);
  }

  /**
   * Handle Vim key input
   * Returns true if key was handled, false if it should pass through
   */
  handleKey(data: string): boolean {
    if (!isVimModeEnabled()) {
      return false;
    }

    const mode = getCurrentVimMode();

    // Handle Escape key (toggle INSERT/NORMAL/VISUAL)
    if (data === "\x1b") {
      if (mode === "VISUAL") {
        setCurrentVimMode("NORMAL");
        return true;
      } else if (mode === "INSERT") {
        setCurrentVimMode("NORMAL");
        return true;
      }
      return false;
    }

    // Handle mode-specific keys
    if (mode === "NORMAL") {
      return this.handleNormalMode(data);
    } else if (mode === "VISUAL") {
      return this.handleVisualMode(data);
    }

    // INSERT mode - pass through to editor
    return false;
  }

  /**
   * Handle NORMAL mode keys
   */
  private handleNormalMode(data: string): boolean {
    // Check for pending operator
    if (this.pendingCommand) {
      return this.handlePendingOperator(data);
    }

    // Mode switching
    switch (data) {
      case "i": // Insert
        this.operations.enterInsertMode();
        setCurrentVimMode("INSERT");
        return true;
      case "a": // Append
        this.operations.enterAppendMode();
        setCurrentVimMode("INSERT");
        return true;
      case "I": // Insert at line start
        this.operations.enterInsertAtLineStart();
        setCurrentVimMode("INSERT");
        return true;
      case "A": // Append at line end
        this.operations.enterAppendAtLineEnd();
        setCurrentVimMode("INSERT");
        return true;
      case "o": // Open line below
        {
          const result = this.operations.openLineBelow();
          if (result.success) {
            setCurrentVimMode("INSERT");
          }
        }
        return true;
      case "O": // Open line above
        {
          const result = this.operations.openLineAbove();
          if (result.success) {
            setCurrentVimMode("INSERT");
          }
        }
        return true;
      case "v": // Visual mode
        setCurrentVimMode("VISUAL");
        return true;
    }

    // Movement
    switch (data) {
      case "h":
        return this.handleMovement(() => this.operations.moveLeft());
      case "j":
        return this.handleMovement(() => this.operations.moveDown());
      case "k":
        return this.handleMovement(() => this.operations.moveUp());
      case "l":
        return this.handleMovement(() => this.operations.moveRight());
      case "w":
        return this.handleMovement(() => this.operations.moveToNextWord());
      case "b":
        return this.handleMovement(() => this.operations.moveToPrevWord());
      case "e":
        return this.handleMovement(() => this.operations.moveToEndWord());
      case "0":
        return this.handleMovement(() => this.operations.moveToLineStart());
      case "$":
        return this.handleMovement(() => this.operations.moveToLineEnd());
      case "^":
        return this.handleMovement(() => this.operations.moveToFirstNonBlank());
      case "g": // Start of gg command
        this.startPendingCommand("g");
        return true;
      case "G":
        return this.handleMovement(() => this.operations.moveToLastLine());
    }

    // Operators
    switch (data) {
      case "d": // Delete operator
        this.startPendingCommand("d");
        return true;
      case "y": // Yank operator
        this.startPendingCommand("y");
        return true;
      case "c": // Change operator
        this.startPendingCommand("c");
        return true;
      case "x": // Delete character
        this.operations.deleteChar();
        this.setLastCommand("x");
        return true;
    }

    return false;
  }

  /**
   * Handle VISUAL mode keys
   */
  private handleVisualMode(data: string): boolean {
    // For now, handle basic movement and exit
    switch (data) {
      case "\x1b": // Escape - exit visual mode
        setCurrentVimMode("NORMAL");
        return true;
      case "h":
        return this.handleMovement(() => this.operations.moveLeft());
      case "j":
        return this.handleMovement(() => this.operations.moveDown());
      case "k":
        return this.handleMovement(() => this.operations.moveUp());
      case "l":
        return this.handleMovement(() => this.operations.moveRight());
      case "d": // Delete selection
        // TODO: Implement visual delete
        setCurrentVimMode("NORMAL");
        return true;
      case "y": // Yank selection
        // TODO: Implement visual yank
        setCurrentVimMode("NORMAL");
        return true;
    }
    return false;
  }

  /**
   * Handle pending operator (second key of command like dd, yy)
   */
  private handlePendingOperator(data: string): boolean {
    const pending = this.pendingCommand;
    if (!pending) return false;

    // Check timeout
    if (Date.now() - pending.startTime > this.COMMAND_TIMEOUT) {
      this.pendingCommand = null;
      return false;
    }

    // Handle operator commands
    switch (pending.operator) {
      case "d":
        if (data === "d") {
          this.operations.deleteLine();
          this.setLastCommand("dd");
          this.clearPendingCommand();
          return true;
        }
        break;
      case "y":
        if (data === "y") {
          // TODO: Yank line
          this.clearPendingCommand();
          return true;
        }
        break;
      case "g":
        if (data === "g") {
          this.handleMovement(() => this.operations.moveToFirstLine());
          this.clearPendingCommand();
          return true;
        }
        break;
    }

    // Invalid second key - cancel pending
    this.clearPendingCommand();
    return false;
  }

  /**
   * Handle movement command
   */
  private handleMovement(moveFn: () => { success: boolean }): boolean {
    const result = moveFn();
    if (result.success) {
      // Check if there's a pending operator to apply
      const operator = getPendingOperator();
      if (operator) {
        // TODO: Apply operator to movement range
        setPendingOperator(undefined);
      }
      return true;
    }
    return false;
  }

  /**
   * Start a pending command (for multi-key commands)
   */
  private startPendingCommand(operator: string): void {
    this.pendingCommand = {
      operator,
      startTime: Date.now(),
    };
    setPendingOperator(operator);
  }

  /**
   * Clear pending command
   */
  private clearPendingCommand(): void {
    this.pendingCommand = null;
    setPendingOperator(undefined);
  }

  /**
   * Set last command for repeat (.)
   */
  private setLastCommand(command: string): void {
    setLastCommand(command);
  }
}

/**
 * Create Vim keybindings handler
 */
export function createVimKeybindingsHandler(editor: CustomEditor): VimKeybindingsHandler {
  return new VimKeybindingsHandler(editor);
}
