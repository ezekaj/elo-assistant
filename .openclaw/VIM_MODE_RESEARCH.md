# 📝 VIM MODE - DEEP RESEARCH & IMPLEMENTATION PLAN

**Date:** 2026-02-24
**Analysis:** Claude Code Vim Mode vs OpenClaw Current State

---

## 🎯 EXECUTIVE SUMMARY

**Claude Code has FULL Vim mode implementation:**
- ✅ Vim editor mode toggle (normal/vim)
- ✅ INSERT and NORMAL modes
- ✅ Escape key to toggle modes
- ✅ Vim word navigation (w, b, e)
- ✅ Full keybindings customization
- ✅ ~/.claude/keybindings.json config

**OpenClaw currently has:**
- ✅ Basic vim-style navigation (j/k) in lists
- ❌ NO full Vim mode
- ❌ NO INSERT/NORMAL modes
- ❌ NO Vim word navigation
- ❌ NO keybindings customization

---

## 📊 CLAUDE CODE VIM MODE ANALYSIS

### **1. Vim Mode Architecture:**

```typescript
// From Claude Code backup (lines 346362-346379)

var initializeVimMode = Q(() => {
  // Initialize vim mode state
});

var setupVimFeature = Q(() => {
  return {
    name: "vim",
    description: "Toggle between Vim and Normal editing modes",
    load: () => Promise.resolve().then(() => (
      initializeVimMode(), 
      emptyObjectInitializer
    ))
  };
});

// Called during initialization (line 377248)
setupVimFeature();
```

---

### **2. Editor Mode State:**

```typescript
// From Claude Code backup (line 207962)
"vim": {
  "mode": "INSERT" | "NORMAL"  // Current vim editor mode
}

// Mode toggle (lines 346350-346362)
let A = R === "normal" ? "vim" : "normal";
return {
  value: `Editor mode set to ${A}. ${
    A==="vim" 
      ? "Use Escape key to toggle between INSERT and NORMAL modes."
      : "Using standard (readline) keyboard bindings."
  }`
};
```

---

### **3. Vim Word Navigation:**

```typescript
// From Claude Code backup (lines 132598-132634)

nextVimWord() {
  // Move cursor to next word
  // Implements 'w' command
}

endOfVimWord() {
  // Move cursor to end of word
  // Implements 'e' command
}

prevVimWord() {
  // Move cursor to previous word
  // Implements 'b' command
}
```

---

### **4. Keybindings Customization:**

```json
// ~/.claude/keybindings.json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/en/keybindings",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "ctrl+s": "submit",
        "ctrl+enter": "new_line"
      }
    }
  ]
}
```

**Schema:**
```typescript
// From Claude Code backup (lines 411890-411894)
const KeybindingsSchema = y.object({
  bindings: y.array(KeybindingBlock).describe(
    "Array of keybinding blocks by context"
  )
}).describe("Claude Code keybindings configuration");
```

---

### **5. Vim Mode Commands:**

```typescript
// From Claude Code backup (line 314562)
options: ["normal", "vim"],  // Editor mode options

// Command to toggle (lines 346369-346376)
{
  name: "vim",
  description: "Toggle between Vim and Normal editing modes",
  load: () => initializeVimMode()
}
```

---

### **6. Escape Key Handling:**

```typescript
// From Claude Code backup (line 318375)
return XR().editorMode === "vim"

// Escape toggles between INSERT and NORMAL modes
// In NORMAL mode: vim navigation commands work
// In INSERT mode: normal text input
```

---

## 🔍 OPENCLAW CURRENT STATE

### **What OpenClaw Has:**

**1. Custom Editor Component:**
```typescript
// src/tui/components/custom-editor.ts
export class CustomEditor extends Editor {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  // ... other handlers
  
  handleInput(data: string): void {
    // Custom key handling
    if (matchesKey(data, Key.escape) && this.onEscape) {
      this.onEscape();
      return;
    }
    super.handleInput(data);
  }
}
```

**2. Basic Vim Navigation in Lists:**
```typescript
// src/tui/components/filterable-select-list.ts (lines 82-97)
const allowVimNav = !this.filterText.trim();

// Navigation: arrows, vim j/k, or ctrl+p/ctrl+n
if (keyData === "k" && allowVimNav) {
  // Move up
}
if (keyData === "j" && allowVimNav) {
  // Move down
}
```

---

### **What OpenClaw is Missing:**

| Feature | Claude Code | OpenClaw | Status |
|---------|-------------|----------|--------|
| **Vim Mode Toggle** | ✅ `/vim` command | ❌ Missing | ❌ |
| **INSERT/NORMAL Modes** | ✅ Full support | ❌ Missing | ❌ |
| **Escape Toggle** | ✅ Escape toggles modes | ⚠️ Only onEscape callback | ⚠️ |
| **Word Navigation (w,b,e)** | ✅ Full implementation | ❌ Missing | ❌ |
| **Keybindings Config** | ✅ ~/.claude/keybindings.json | ❌ Missing | ❌ |
| **Vim Commands (h,j,k,l)** | ✅ Full support | ⚠️ Partial (j,k only) | ⚠️ |
| **Mode Indicator** | ✅ Shows INSERT/NORMAL | ❌ Missing | ❌ |

---

## 📋 IMPLEMENTATION PLAN

### **Phase 1: Vim Mode State Management** (Priority: HIGH)

**File:** `src/tui/vim-mode/vim-state.ts`

```typescript
/**
 * Vim Mode Types
 */
export type VimMode = 'INSERT' | 'NORMAL' | 'VISUAL';

/**
 * Vim Mode State
 */
export interface VimState {
  enabled: boolean;
  currentMode: VimMode;
  lastCommand?: string;
}

/**
 * Global vim state
 */
const state: VimState = {
  enabled: false,
  currentMode: 'INSERT',
  lastCommand: undefined
};

/**
 * Enable/disable vim mode
 */
export function setVimModeEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    state.currentMode = 'INSERT';
  }
}

/**
 * Check if vim mode is enabled
 */
export function isVimModeEnabled(): boolean {
  return state.enabled;
}

/**
 * Get current vim mode
 */
export function getCurrentVimMode(): VimMode {
  return state.currentMode;
}

/**
 * Set vim mode
 */
export function setCurrentVimMode(mode: VimMode): void {
  state.currentMode = mode;
}

/**
 * Toggle vim mode
 */
export function toggleVimMode(): boolean {
  state.enabled = !state.enabled;
  if (!state.enabled) {
    state.currentMode = 'INSERT';
  }
  return state.enabled;
}

/**
 * Toggle between INSERT and NORMAL modes
 */
export function toggleInsertNormalMode(): VimMode {
  if (!state.enabled) {
    return 'INSERT';
  }
  
  state.currentMode = state.currentMode === 'INSERT' ? 'NORMAL' : 'INSERT';
  return state.currentMode;
}
```

---

### **Phase 2: Vim Mode Commands** (Priority: HIGH)

**File:** `src/tui/vim-mode/vim-commands.ts`

```typescript
import { 
  setVimModeEnabled, 
  toggleVimMode, 
  isVimModeEnabled,
  getCurrentVimMode 
} from './vim-state.js';

/**
 * Create vim mode toggle command
 */
export function createVimToggleCommand(): SlashCommand {
  return {
    name: "vim",
    description: "Toggle Vim mode on/off",
    async handler() {
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
 * Create vim mode status command
 */
export function createVimStatusCommand(): SlashCommand {
  return {
    name: "vim-status",
    description: "Show Vim mode status",
    async handler() {
      const enabled = isVimModeEnabled();
      const mode = getCurrentVimMode();
      
      if (!enabled) {
        return {
          success: true,
          message: "Vim mode is DISABLED"
        };
      }
      
      return {
        success: true,
        message: `Vim mode is ENABLED\nCurrent mode: ${mode}`
      };
    }
  };
}
```

---

### **Phase 3: Vim Keybindings Handler** (Priority: HIGH)

**File:** `src/tui/vim-mode/vim-keybindings.ts`

```typescript
import { 
  getCurrentVimMode, 
  setCurrentVimMode,
  isVimModeEnabled 
} from './vim-state.js';
import type { CustomEditor } from '../components/custom-editor.js';

/**
 * Vim keybindings handler
 */
export class VimKeybindingsHandler {
  private editor: CustomEditor;

  constructor(editor: CustomEditor) {
    this.editor = editor;
  }

  /**
   * Handle vim key input
   */
  handleKey(data: string): boolean {
    if (!isVimModeEnabled()) {
      return false;
    }

    const mode = getCurrentVimMode();

    // Escape toggles between INSERT and NORMAL
    if (data === '\x1b') {  // Escape key
      if (mode === 'INSERT') {
        setCurrentVimMode('NORMAL');
        return true;
      } else if (mode === 'VISUAL') {
        setCurrentVimMode('NORMAL');
        return true;
      }
      return false;
    }

    // NORMAL mode keybindings
    if (mode === 'NORMAL') {
      return this.handleNormalMode(data);
    }

    // INSERT mode - pass through to editor
    return false;
  }

  /**
   * Handle NORMAL mode keys
   */
  private handleNormalMode(data: string): boolean {
    switch (data) {
      // Enter INSERT mode
      case 'i':
      case 'a':
      case 'I':
      case 'A':
      case 'o':
      case 'O':
        setCurrentVimMode('INSERT');
        return true;

      // Movement
      case 'h':
        this.moveCursorLeft();
        return true;
      case 'j':
        this.moveCursorDown();
        return true;
      case 'k':
        this.moveCursorUp();
        return true;
      case 'l':
        this.moveCursorRight();
        return true;

      // Word movement
      case 'w':
        this.moveNextWord();
        return true;
      case 'b':
        this.movePrevWord();
        return true;
      case 'e':
        this.moveToEndWord();
        return true;

      // Line movement
      case '0':
        this.moveToLineStart();
        return true;
      case '$':
        this.moveToLineEnd();
        return true;

      // Delete
      case 'x':
        this.deleteChar();
        return true;
      case 'd':
        // Start delete command (wait for next key)
        return true;

      // Visual mode
      case 'v':
        setCurrentVimMode('VISUAL');
        return true;
    }

    return false;
  }

  /**
   * Movement implementations
   */
  private moveCursorLeft(): void {
    const pos = this.editor.getCursorPosition();
    if (pos.column > 0) {
      this.editor.setCursorPosition(pos.line, pos.column - 1);
    }
  }

  private moveCursorRight(): void {
    const pos = this.editor.getCursorPosition();
    const line = this.editor.getLine(pos.line);
    if (pos.column < line.length) {
      this.editor.setCursorPosition(pos.line, pos.column + 1);
    }
  }

  private moveCursorUp(): void {
    const pos = this.editor.getCursorPosition();
    if (pos.line > 0) {
      this.editor.setCursorPosition(pos.line - 1, pos.column);
    }
  }

  private moveCursorDown(): void {
    const pos = this.editor.getCursorPosition();
    const totalLines = this.editor.getLineCount();
    if (pos.line < totalLines - 1) {
      this.editor.setCursorPosition(pos.line + 1, pos.column);
    }
  }

  private moveNextWord(): void {
    // Implement word-forward logic
    const pos = this.editor.getCursorPosition();
    const text = this.editor.getText();
    // Find next word boundary
    // Set cursor position
  }

  private movePrevWord(): void {
    // Implement word-backward logic
  }

  private moveToEndWord(): void {
    // Implement end-of-word logic
  }

  private moveToLineStart(): void {
    const pos = this.editor.getCursorPosition();
    this.editor.setCursorPosition(pos.line, 0);
  }

  private moveToLineEnd(): void {
    const pos = this.editor.getCursorPosition();
    const line = this.editor.getLine(pos.line);
    this.editor.setCursorPosition(pos.line, line.length);
  }

  private deleteChar(): void {
    // Implement delete character logic
  }
}
```

---

### **Phase 4: Mode Indicator** (Priority: MEDIUM)

**File:** `src/tui/components/vim-mode-indicator.ts`

```typescript
import { getCurrentVimMode, isVimModeEnabled } from '../vim-mode/vim-state.js';
import { Text } from "@mariozechner/pi-tui";

/**
 * Render vim mode indicator
 */
export function renderVimModeIndicator(): any {
  if (!isVimModeEnabled()) {
    return null;
  }

  const mode = getCurrentVimMode();
  
  let color: string;
  let symbol: string;
  
  switch (mode) {
    case 'INSERT':
      color = 'green';
      symbol = 'INSERT';
      break;
    case 'NORMAL':
      color = 'blue';
      symbol = 'NORMAL';
      break;
    case 'VISUAL':
      color = 'yellow';
      symbol = 'VISUAL';
      break;
    default:
      color = 'white';
      symbol = mode;
  }

  return Text.create(`[${symbol}]`, { 
    color, 
    bold: true 
  });
}

/**
 * Render compact vim mode indicator (for status bar)
 */
export function renderCompactVimModeIndicator(): any {
  if (!isVimModeEnabled()) {
    return null;
  }

  const mode = getCurrentVimMode();
  
  switch (mode) {
    case 'INSERT':
      return Text.create('I', { color: 'green', bold: true });
    case 'NORMAL':
      return Text.create('N', { color: 'blue', bold: true });
    case 'VISUAL':
      return Text.create('V', { color: 'yellow', bold: true });
    default:
      return Text.create(mode[0], { color: 'white', bold: true });
  }
}
```

---

### **Phase 5: Keybindings Configuration** (Priority: LOW)

**File:** `src/config/types.vim.ts`

```typescript
/**
 * Vim keybindings configuration
 */
export interface VimKeybindingsConfig {
  /** Enable vim mode */
  enabled?: boolean;
  
  /** Custom keybindings */
  bindings?: Record<string, string>;
  
  /** Normal mode keybindings */
  normalMode?: Record<string, string>;
  
  /** Insert mode keybindings */
  insertMode?: Record<string, string>;
  
  /** Visual mode keybindings */
  visualMode?: Record<string, string>;
}

/**
 * Default vim keybindings
 */
export const DEFAULT_VIM_KEYBINDINGS: VimKeybindingsConfig = {
  enabled: false,
  normalMode: {
    // Movement
    'h': 'move_left',
    'j': 'move_down',
    'k': 'move_up',
    'l': 'move_right',
    
    // Word movement
    'w': 'move_next_word',
    'b': 'move_prev_word',
    'e': 'move_to_end_word',
    
    // Line movement
    '0': 'move_to_line_start',
    '$': 'move_to_line_end',
    '^': 'move_to_first_nonblank',
    'gg': 'move_to_first_line',
    'G': 'move_to_last_line',
    
    // Mode switching
    'i': 'enter_insert',
    'a': 'enter_insert_append',
    'I': 'enter_insert_first',
    'A': 'enter_insert_last',
    'o': 'open_line_below',
    'O': 'open_line_above',
    'v': 'enter_visual',
    'V': 'enter_visual_line',
    
    // Delete
    'x': 'delete_char',
    'd': 'delete_operator',
    'dd': 'delete_line',
    
    // Copy
    'y': 'yank_operator',
    'yy': 'yank_line',
    
    // Paste
    'p': 'paste_after',
    'P': 'paste_before',
    
    // Undo/Redo
    'u': 'undo',
    'ctrl+r': 'redo',
  }
};
```

---

## 📊 IMPLEMENTATION CHECKLIST

### **Phase 1: Core State** (HIGH)
- [ ] Create `src/tui/vim-mode/vim-state.ts`
- [ ] Implement state management
- [ ] Add mode toggle functions
- [ ] Export public API

### **Phase 2: Commands** (HIGH)
- [ ] Create `src/tui/vim-mode/vim-commands.ts`
- [ ] Add `/vim` command
- [ ] Add `/vim-status` command
- [ ] Register commands in TUI

### **Phase 3: Keybindings** (HIGH)
- [ ] Create `src/tui/vim-mode/vim-keybindings.ts`
- [ ] Implement NORMAL mode keys
- [ ] Implement INSERT mode handling
- [ ] Implement VISUAL mode handling
- [ ] Integrate with CustomEditor

### **Phase 4: UI** (MEDIUM)
- [ ] Create `src/tui/components/vim-mode-indicator.ts`
- [ ] Add mode indicator to status bar
- [ ] Add mode indicator to overlay
- [ ] Style with colors (INSERT=green, NORMAL=blue, VISUAL=yellow)

### **Phase 5: Configuration** (LOW)
- [ ] Create `src/config/types.vim.ts`
- [ ] Add config file support
- [ ] Add ~/.openclaw/vim-keybindings.json
- [ ] Add config loading

---

## 🎯 USAGE EXAMPLES

### **Enable Vim Mode:**
```bash
# In TUI
/vim
→ Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes.

/vim-status
→ Vim mode is ENABLED
  Current mode: INSERT
```

### **Vim Mode Usage:**
```
# In INSERT mode (normal typing)
Hello World⎯

# Press Escape → NORMAL mode
[NORMAL] Hello World

# Press 'w' → move to next word
[NORMAL] Hello World⎯

# Press 'i' → INSERT mode
[INSERT] Hello World⎯
```

### **Keybindings:**
```
NORMAL mode:
  h/j/k/l  - Move cursor
  w/b/e    - Word movement
  0/$      - Line start/end
  i/a/I/A  - Enter INSERT mode
  v/V      - Enter VISUAL mode
  x/dd     - Delete
  yy       - Yank line
  p/P      - Paste
  u        - Undo

INSERT mode:
  Normal text input
  Escape   - Return to NORMAL mode
```

---

## 🎉 CONCLUSION

### **Current Status:** ⚠️ **PARTIAL**

**What OpenClaw Has:**
- ✅ Basic j/k navigation in lists
- ✅ CustomEditor with escape handler
- ✅ Good foundation for vim mode

**What's Missing:**
- ❌ Vim mode state management
- ❌ INSERT/NORMAL mode toggle
- ❌ Vim keybindings (h,j,k,l,w,b,e)
- ❌ Mode indicator
- ❌ Keybindings configuration

### **Implementation Priority:**

1. **HIGH** - Core state management (Phase 1)
2. **HIGH** - Vim commands (Phase 2)
3. **HIGH** - Keybindings handler (Phase 3)
4. **MEDIUM** - Mode indicator (Phase 4)
5. **LOW** - Configuration (Phase 5)

**Estimated Time:** ~4-6 hours for full implementation

---

**Research Complete:** 2026-02-24
**Claude Code Parity:** ⚠️ **PARTIAL** (has foundation, needs implementation)
**Priority:** 🟡 **MEDIUM** (nice-to-have for vim users)
