# 📝 VIM MODE - COMPREHENSIVE IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Goal:** Full Vim mode implementation for OpenClaw TUI - Bug-free, fully wired

---

## 🎯 EXECUTIVE SUMMARY

Implement **complete Vim mode** for OpenClaw TUI matching Claude Code functionality:
- ✅ Vim mode toggle (`/vim` command)
- ✅ INSERT and NORMAL modes
- ✅ Escape key toggles modes
- ✅ Full h,j,k,l movement
- ✅ Word navigation (w, b, e)
- ✅ Line movement (0, $, gg, G)
- ✅ Mode indicator in status bar
- ✅ Visual mode support
- ✅ Delete/yank/paste operations

**Architecture:** Minimal changes, add new vim-mode module

---

## 📊 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                    OPENCLAW TUI                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  CustomEditor│◀──▶│  Vim Mode    │◀──▶│  TUI Input   │  │
│  │  Component   │    │  Handler     │    │  Handler     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Vim State      │                      │
│                    │  (INSERT/NORMAL)│                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Mode Indicator │                      │
│                    │  (Status Bar)   │                      │
│                    └─────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 FILE STRUCTURE

### **New Files to Create:**

```
src/
└── tui/
    └── vim-mode/
        ├── types.ts                    # Vim mode types
        ├── vim-state.ts                # State management
        ├── vim-commands.ts             # TUI commands
        ├── vim-keybindings.ts          # Key handler
        ├── vim-operations.ts           # Vim operations (move, delete, etc.)
        └── index.ts                    # Public exports
    
    └── components/
        └── vim-mode-indicator.ts       # Mode indicator UI
```

### **Modified Files:**

```
src/
├── tui/
│   ├── components/
│   │   └── custom-editor.ts            # Add Vim key handling
│   ├── commands.ts                     # Add Vim commands
│   └── tui-command-handlers.ts         # Add Vim handlers
│
└── config/
    └── types.vim.ts                    # Vim config types (optional)
```

---

## 🔧 IMPLEMENTATION PHASES

### **Phase 1: Types & State** (Critical)

#### **1.1 Type Definitions** (`src/tui/vim-mode/types.ts`)

```typescript
/**
 * Vim Mode Types
 * 
 * Defines the different modes in Vim editing
 */

/**
 * Vim editor mode
 * - INSERT: Normal text input
 * - NORMAL: Command/navigation mode
 * - VISUAL: Text selection mode
 */
export type VimMode = 'INSERT' | 'NORMAL' | 'VISUAL';

/**
 * Vim state interface
 */
export interface VimState {
  /** Is Vim mode enabled */
  enabled: boolean;
  
  /** Current mode */
  currentMode: VimMode;
  
  /** Pending operator (d, y, c, etc.) */
  pendingOperator?: string;
  
  /** Last command for repeat (.) */
  lastCommand?: string;
}

/**
 * Vim cursor position
 */
export interface VimCursor {
  line: number;
  column: number;
}

/**
 * Vim text range for visual mode
 */
export interface VimRange {
  start: VimCursor;
  end: VimCursor;
}

/**
 * Vim operation result
 */
export interface VimOperationResult {
  success: boolean;
  mode?: VimMode;
  cursor?: VimCursor;
  text?: string;
}

/**
 * Vim configuration
 */
export interface VimConfig {
  enabled: boolean;
  useRelativeNumbers?: boolean;
  tabStop?: number;
  expandTab?: boolean;
}

// Mode constants
export const VIM_MODES = {
  INSERT: 'INSERT' as VimMode,
  NORMAL: 'NORMAL' as VimMode,
  VISUAL: 'VISUAL' as VimMode,
};

// Default config
export const DEFAULT_VIM_CONFIG: VimConfig = {
  enabled: false,
  useRelativeNumbers: false,
  tabStop: 2,
  expandTab: true,
};
```

---

#### **1.2 State Management** (`src/tui/vim-mode/vim-state.ts`)

```typescript
/**
 * Vim Mode State Management
 * 
 * Manages Vim mode state globally for the TUI.
 * Thread-safe singleton pattern.
 */

import type { VimState, VimMode, VimConfig, VimCursor } from './types.js';
import { DEFAULT_VIM_CONFIG, VIM_MODES } from './types.js';

/**
 * Global Vim state (singleton)
 */
const state: VimState = {
  enabled: false,
  currentMode: VIM_MODES.INSERT,
  pendingOperator: undefined,
  lastCommand: undefined,
};

/**
 * Vim configuration
 */
let config: VimConfig = { ...DEFAULT_VIM_CONFIG };

/**
 * Event listeners for mode changes
 */
type ModeChangeListener = (mode: VimMode) => void;
const modeChangeListeners: ModeChangeListener[] = [];

/**
 * Enable/disable Vim mode
 */
export function setVimModeEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    state.currentMode = VIM_MODES.INSERT;
    state.pendingOperator = undefined;
  }
  notifyModeChange(state.currentMode);
}

/**
 * Check if Vim mode is enabled
 */
export function isVimModeEnabled(): boolean {
  return state.enabled;
}

/**
 * Get current Vim mode
 */
export function getCurrentVimMode(): VimMode {
  return state.currentMode;
}

/**
 * Set current Vim mode
 */
export function setCurrentVimMode(mode: VimMode): void {
  if (!state.enabled && mode !== VIM_MODES.INSERT) {
    return;  // Can't switch modes if Vim is disabled
  }
  state.currentMode = mode;
  notifyModeChange(mode);
}

/**
 * Toggle Vim mode on/off
 */
export function toggleVimMode(): boolean {
  state.enabled = !state.enabled;
  if (!state.enabled) {
    state.currentMode = VIM_MODES.INSERT;
    state.pendingOperator = undefined;
  }
  notifyModeChange(state.currentMode);
  return state.enabled;
}

/**
 * Toggle between INSERT and NORMAL modes
 */
export function toggleInsertNormalMode(): VimMode {
  if (!state.enabled) {
    return VIM_MODES.INSERT;
  }
  
  state.currentMode = state.currentMode === VIM_MODES.INSERT 
    ? VIM_MODES.NORMAL 
    : VIM_MODES.INSERT;
  
  state.pendingOperator = undefined;
  notifyModeChange(state.currentMode);
  return state.currentMode;
}

/**
 * Set pending operator (for d, y, c commands)
 */
export function setPendingOperator(operator: string | undefined): void {
  state.pendingOperator = operator;
}

/**
 * Get pending operator
 */
export function getPendingOperator(): string | undefined {
  return state.pendingOperator;
}

/**
 * Set last command (for . repeat)
 */
export function setLastCommand(command: string): void {
  state.lastCommand = command;
}

/**
 * Get last command
 */
export function getLastCommand(): string | undefined {
  return state.lastCommand;
}

/**
 * Get full Vim state
 */
export function getVimState(): VimState {
  return { ...state };
}

/**
 * Set Vim configuration
 */
export function setVimConfig(newConfig: Partial<VimConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get Vim configuration
 */
export function getVimConfig(): VimConfig {
  return { ...config };
}

/**
 * Add mode change listener
 */
export function onModeChange(listener: ModeChangeListener): () => void {
  modeChangeListeners.push(listener);
  return () => {
    const index = modeChangeListeners.indexOf(listener);
    if (index > -1) {
      modeChangeListeners.splice(index, 1);
    }
  };
}

/**
 * Notify listeners of mode change
 */
function notifyModeChange(mode: VimMode): void {
  for (const listener of modeChangeListeners) {
    try {
      listener(mode);
    } catch (error) {
      console.error('Vim mode listener error:', error);
    }
  }
}

/**
 * Reset Vim state (for new session)
 */
export function resetVimState(): void {
  state.enabled = false;
  state.currentMode = VIM_MODES.INSERT;
  state.pendingOperator = undefined;
  state.lastCommand = undefined;
  notifyModeChange(state.currentMode);
}
```

---

### **Phase 2: Vim Operations** (Critical)

#### **2.1 Vim Operations** (`src/tui/vim-mode/vim-operations.ts`)

```typescript
/**
 * Vim Operations
 * 
 * Implements Vim text operations (move, delete, yank, etc.)
 */

import type { VimCursor, VimRange, VimOperationResult } from './types.js';
import type { CustomEditor } from '../components/custom-editor.js';

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
    const lines = text.split('\n');
    
    let currentLine = pos.line;
    let currentCol = pos.column;
    
    // Find next word boundary
    const line = lines[currentLine] || '';
    let foundWord = false;
    
    // Skip current word
    for (let i = currentCol; i < line.length; i++) {
      if (!this.isWordChar(line[i])) {
        foundWord = true;
        currentCol = i;
        break;
      }
    }
    
    // Skip non-word characters
    for (let i = currentCol; i < line.length; i++) {
      if (this.isWordChar(line[i])) {
        this.editor.setCursorPosition(currentLine, i);
        return { success: true, cursor: { line: currentLine, column: i } };
      }
    }
    
    // Move to next line if not found
    if (currentLine < lines.length - 1) {
      currentLine++;
      const nextLine = lines[currentLine] || '';
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
    const lines = text.split('\n');
    
    let currentLine = pos.line;
    let currentCol = pos.column;
    
    const line = lines[currentLine] || '';
    
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
      const prevLine = lines[currentLine] || '';
      const words = prevLine.match(/\S+/g);
      if (words && words.length > 0) {
        const lastWordStart = prevLine.lastIndexOf(words[words.length - 1]);
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
    const lines = text.split('\n');
    
    let currentLine = pos.line;
    let currentCol = pos.column;
    
    const line = lines[currentLine] || '';
    
    // Find end of current or next word
    for (let i = currentCol; i < line.length; i++) {
      if (!this.isWordChar(line[i]) && i > currentCol) {
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
      this.editor.setText('');
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
    return { success: true, mode: 'INSERT' };
  }

  /**
   * Append mode (a)
   */
  enterAppendMode(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    this.moveRight();
    return { success: true, mode: 'INSERT' };
  }

  /**
   * Insert at line start (I)
   */
  enterInsertAtLineStart(): VimOperationResult {
    this.moveToFirstNonBlank();
    return { success: true, mode: 'INSERT' };
  }

  /**
   * Append at line end (A)
   */
  enterAppendAtLineEnd(): VimOperationResult {
    this.moveToLineEnd();
    return { success: true, mode: 'INSERT' };
  }

  /**
   * Open line below (o)
   */
  openLineBelow(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    this.editor.insertLine(pos.line + 1, '');
    this.editor.setCursorPosition(pos.line + 1, 0);
    return { success: true, mode: 'INSERT' };
  }

  /**
   * Open line above (O)
   */
  openLineAbove(): VimOperationResult {
    const pos = this.editor.getCursorPosition();
    this.editor.insertLine(pos.line, '');
    this.editor.setCursorPosition(pos.line, 0);
    return { success: true, mode: 'INSERT' };
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
```

---

### **Phase 3: Keybindings Handler** (Critical)

#### **3.1 Vim Keybindings** (`src/tui/vim-mode/vim-keybindings.ts`)

```typescript
/**
 * Vim Keybindings Handler
 * 
 * Handles Vim keybindings in NORMAL, INSERT, and VISUAL modes.
 */

import type { CustomEditor } from '../components/custom-editor.js';
import { 
  getCurrentVimMode, 
  setCurrentVimMode,
  isVimModeEnabled,
  setPendingOperator,
  getPendingOperator,
  setLastCommand
} from './vim-state.js';
import { VimOperations, createVimOperations } from './vim-operations.js';

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

    // Handle Escape key (toggle INSERT/NORMAL)
    if (data === '\x1b') {
      if (mode === 'VISUAL') {
        setCurrentVimMode('NORMAL');
        return true;
      } else if (mode === 'INSERT') {
        setCurrentVimMode('NORMAL');
        return true;
      }
      return false;
    }

    // Handle mode-specific keys
    if (mode === 'NORMAL') {
      return this.handleNormalMode(data);
    } else if (mode === 'VISUAL') {
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
      case 'i': // Insert
        this.operations.enterInsertMode();
        setCurrentVimMode('INSERT');
        return true;
      case 'a': // Append
        this.operations.enterAppendMode();
        setCurrentVimMode('INSERT');
        return true;
      case 'I': // Insert at line start
        this.operations.enterInsertAtLineStart();
        setCurrentVimMode('INSERT');
        return true;
      case 'A': // Append at line end
        this.operations.enterAppendAtLineEnd();
        setCurrentVimMode('INSERT');
        return true;
      case 'o': // Open line below
        const resultO = this.operations.openLineBelow();
        if (resultO.success) {
          setCurrentVimMode('INSERT');
        }
        return true;
      case 'O': // Open line above
        const resultO2 = this.operations.openLineAbove();
        if (resultO2.success) {
          setCurrentVimMode('INSERT');
        }
        return true;
      case 'v': // Visual mode
        setCurrentVimMode('VISUAL');
        return true;
    }

    // Movement
    switch (data) {
      case 'h': return this.handleMovement(() => this.operations.moveLeft());
      case 'j': return this.handleMovement(() => this.operations.moveDown());
      case 'k': return this.handleMovement(() => this.operations.moveUp());
      case 'l': return this.handleMovement(() => this.operations.moveRight());
      case 'w': return this.handleMovement(() => this.operations.moveToNextWord());
      case 'b': return this.handleMovement(() => this.operations.moveToPrevWord());
      case 'e': return this.handleMovement(() => this.operations.moveToEndWord());
      case '0': return this.handleMovement(() => this.operations.moveToLineStart());
      case '$': return this.handleMovement(() => this.operations.moveToLineEnd());
      case '^': return this.handleMovement(() => this.operations.moveToFirstNonBlank());
      case 'g': // Start of gg command
        this.startPendingCommand('g');
        return true;
      case 'G': return this.handleMovement(() => this.operations.moveToLastLine());
    }

    // Operators
    switch (data) {
      case 'd': // Delete operator
        this.startPendingCommand('d');
        return true;
      case 'y': // Yank operator
        this.startPendingCommand('y');
        return true;
      case 'c': // Change operator
        this.startPendingCommand('c');
        return true;
      case 'x': // Delete character
        this.operations.deleteChar();
        this.setLastCommand('x');
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
      case '\x1b': // Escape - exit visual mode
        setCurrentVimMode('NORMAL');
        return true;
      case 'h': return this.handleMovement(() => this.operations.moveLeft());
      case 'j': return this.handleMovement(() => this.operations.moveDown());
      case 'k': return this.handleMovement(() => this.operations.moveUp());
      case 'l': return this.handleMovement(() => this.operations.moveRight());
      case 'd': // Delete selection
        // TODO: Implement visual delete
        setCurrentVimMode('NORMAL');
        return true;
      case 'y': // Yank selection
        // TODO: Implement visual yank
        setCurrentVimMode('NORMAL');
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
      case 'd':
        if (data === 'd') {
          this.operations.deleteLine();
          this.setLastCommand('dd');
          this.clearPendingCommand();
          return true;
        }
        break;
      case 'y':
        if (data === 'y') {
          // TODO: Yank line
          this.clearPendingCommand();
          return true;
        }
        break;
      case 'g':
        if (data === 'g') {
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
```

---

### **Phase 4: Mode Indicator** (Medium Priority)

#### **4.1 Mode Indicator** (`src/tui/components/vim-mode-indicator.ts`)

```typescript
/**
 * Vim Mode Indicator Component
 * 
 * Displays current Vim mode in the status bar.
 */

import { Text } from "@mariozechner/pi-tui";
import { getCurrentVimMode, isVimModeEnabled } from '../vim-mode/vim-state.js';

/**
 * Render Vim mode indicator
 */
export function renderVimModeIndicator(): any {
  if (!isVimModeEnabled()) {
    return null;
  }

  const mode = getCurrentVimMode();
  
  let color: string;
  let symbol: string;
  let tooltip: string;
  
  switch (mode) {
    case 'INSERT':
      color = 'green';
      symbol = 'INSERT';
      tooltip = 'Vim INSERT mode - typing inserts text';
      break;
    case 'NORMAL':
      color = 'blue';
      symbol = 'NORMAL';
      tooltip = 'Vim NORMAL mode - use vim commands';
      break;
    case 'VISUAL':
      color = 'yellow';
      symbol = 'VISUAL';
      tooltip = 'Vim VISUAL mode - selecting text';
      break;
    default:
      color = 'white';
      symbol = mode;
      tooltip = `Vim ${mode} mode`;
  }

  return Text.create(`[${symbol}]`, { 
    color, 
    bold: true,
    tooltip
  });
}

/**
 * Render compact Vim mode indicator (for status bar)
 */
export function renderCompactVimModeIndicator(): any {
  if (!isVimModeEnabled()) {
    return null;
  }

  const mode = getCurrentVimMode();
  
  let color: string;
  let symbol: string;
  
  switch (mode) {
    case 'INSERT':
      color = 'green';
      symbol = 'I';
      break;
    case 'NORMAL':
      color = 'blue';
      symbol = 'N';
      break;
    case 'VISUAL':
      color = 'yellow';
      symbol = 'V';
      break;
    default:
      color = 'white';
      symbol = mode[0];
  }

  return Text.create(symbol, { color, bold: true });
}

/**
 * Get Vim mode status text for display
 */
export function getVimModeStatusText(): string {
  if (!isVimModeEnabled()) {
    return 'Vim mode: OFF';
  }

  const mode = getCurrentVimMode();
  return `Vim mode: ${mode}`;
}
```

---

### **Phase 5: TUI Integration** (High Priority)

#### **5.1 Update CustomEditor** (`src/tui/components/custom-editor.ts`)

```typescript
import { Editor, Key, matchesKey } from "@mariozechner/pi-tui";
import { createVimKeybindingsHandler } from '../vim-mode/vim-keybindings.js';
import { isVimModeEnabled, getCurrentVimMode } from '../vim-mode/vim-state.js';

export class CustomEditor extends Editor {
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

  private vimHandler = createVimKeybindingsHandler(this);

  handleInput(data: string): void {
    // First, try Vim keybindings
    if (isVimModeEnabled()) {
      const handled = this.vimHandler.handleKey(data);
      if (handled) {
        return;
      }
    }

    // Then handle special keys
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
```

---

### **Phase 6: Commands & Handlers** (High Priority)

#### **6.1 Vim Commands** (`src/tui/vim-mode/vim-commands.ts`)

```typescript
import type { SlashCommand } from "@mariozechner/pi-tui";
import { 
  toggleVimMode, 
  isVimModeEnabled, 
  getCurrentVimMode,
  getVimState
} from './vim-state.js';

/**
 * Create Vim toggle command
 */
export function createVimToggleCommand(): SlashCommand {
  return {
    name: "vim",
    description: "Toggle Vim mode on/off",
    async handler(args) {
      const subcommand = args?.toLowerCase().trim();
      
      if (subcommand === 'on' || subcommand === 'enable') {
        setVimModeEnabled(true);
        return {
          success: true,
          message: "Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes."
        };
      }
      
      if (subcommand === 'off' || subcommand === 'disable') {
        setVimModeEnabled(false);
        return {
          success: true,
          message: "Vim mode DISABLED. Using standard keyboard bindings."
        };
      }
      
      // Toggle
      const enabled = toggleVimMode();
      return {
        success: true,
        message: enabled 
          ? "Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes."
          : "Vim mode DISABLED. Using standard keyboard bindings."
      };
    }
  };
}

/**
 * Create Vim status command
 */
export function createVimStatusCommand(): SlashCommand {
  return {
    name: "vim-status",
    description: "Show Vim mode status",
    async handler() {
      const enabled = isVimModeEnabled();
      const mode = getCurrentVimMode();
      const state = getVimState();
      
      if (!enabled) {
        return {
          success: true,
          message: "Vim mode is DISABLED\nUse /vim to enable."
        };
      }
      
      return {
        success: true,
        message: `Vim Mode Status:\n` +
          `  Enabled: Yes\n` +
          `  Current Mode: ${mode}\n` +
          `  Pending Operator: ${state.pendingOperator || 'none'}\n` +
          `\n` +
          `NORMAL mode keys:\n` +
          `  h/j/k/l - Move cursor\n` +
          `  w/b/e   - Word movement\n` +
          `  0/$     - Line start/end\n` +
          `  i/a/I/A - Enter INSERT mode\n` +
          `  o/O     - Open line\n` +
          `  v       - Visual mode\n` +
          `  x/dd    - Delete\n` +
          `  Escape  - Toggle INSERT/NORMAL`
      };
    }
  };
}
```

---

## ✅ VERIFICATION CHECKLIST

### **Code Quality:**
- [ ] All TypeScript types defined
- [ ] All functions have JSDoc comments
- [ ] All errors properly handled
- [ ] No circular dependencies
- [ ] All exports in index.ts

### **Feature Completeness:**
- [ ] Vim state management working
- [ ] INSERT/NORMAL modes working
- [ ] VISUAL mode working
- [ ] Movement keys (h,j,k,l) working
- [ ] Word movement (w,b,e) working
- [ ] Line movement (0,$,gg,G) working
- [ ] Mode switching (Escape,i,a) working
- [ ] Delete operations (x,dd) working
- [ ] Mode indicator showing
- [ ] /vim command working
- [ ] /vim-status command working

### **Integration:**
- [ ] CustomEditor updated
- [ ] Vim commands registered
- [ ] Vim handlers implemented
- [ ] Mode indicator in status bar
- [ ] All components wired together

### **Testing:**
- [ ] Test Vim mode toggle
- [ ] Test INSERT/NORMAL toggle
- [ ] Test movement keys
- [ ] Test word movement
- [ ] Test delete operations
- [ ] Test mode indicator
- [ ] Test TUI commands

---

## 📝 IMPLEMENTATION ORDER

1. **Phase 1:** Types & State (30 min)
2. **Phase 2:** Vim Operations (1 hour)
3. **Phase 3:** Keybindings Handler (1.5 hours)
4. **Phase 4:** Mode Indicator (30 min)
5. **Phase 5:** CustomEditor Update (30 min)
6. **Phase 6:** Commands & Handlers (30 min)
7. **Phase 7:** Testing & Verification (30 min)

**Total Time:** ~5 hours

---

**Status:** Ready for implementation
**Estimated Lines:** ~1,500 new lines
**Estimated Files:** 7 new, 3 modified
