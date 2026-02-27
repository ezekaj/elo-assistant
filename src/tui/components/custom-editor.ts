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
