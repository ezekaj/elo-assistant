/**
 * TUI Adapter for Keybinding System
 *
 * Provides TUI-specific actions like toggling modes, showing help,
 * and controlling the display.
 */

import type { TUI } from "@mariozechner/pi-tui";

/**
 * Interface for the chat log component.
 */
export interface ChatLog {
  addSystem(message: string): void;
  clear(): void;
}

/**
 * Interface for the gateway client (subset of GatewayChatClient).
 */
export interface GatewayClient {
  patchSession(opts: {
    key: string;
    verboseLevel?: string;
    reasoningLevel?: string;
  }): Promise<{ verboseLevel?: string; reasoningLevel?: string }>;
  connection: { url: string };
}

/**
 * Options for creating the TUI adapter.
 */
export interface TUIAdapterOptions {
  tui: TUI;
  chatLog: ChatLog;
  client: GatewayClient;
  /** Get current session key */
  getSessionKey: () => string;
  /** Refresh session info after changes */
  refreshSessionInfo: () => Promise<void>;
  /** Current verbose level state */
  getVerboseLevel: () => string;
  /** Current reasoning level state */
  getReasoningLevel: () => string;
  /** Callback to open model selector */
  openModelSelector?: () => void;
  /** Callback to open agent selector */
  openAgentSelector?: () => void;
  /** Callback to open session selector */
  openSessionSelector?: () => void;
  /** Callback to create new session */
  setSession?: (key: string) => void;
  /** Callback to show help */
  showHelp?: () => void;
  /** Help text generator */
  helpTextGenerator?: () => string;
  /** Abort callback */
  abortActive?: () => void;
  /** Quit callback */
  onQuit?: () => void;
}

/**
 * TUI adapter providing actions for keybinding system.
 */
export class TUIAdapter {
  private tui: TUI;
  private chatLog: ChatLog;
  private client: GatewayClient;
  private getSessionKey: () => string;
  private refreshSessionInfo: () => Promise<void>;
  private getVerboseLevel: () => string;
  private getReasoningLevel: () => string;
  private openModelSelector?: () => void;
  private openAgentSelector?: () => void;
  private openSessionSelector?: () => void;
  private setSession?: (key: string) => void;
  private showHelp?: () => void;
  private helpTextGenerator?: () => string;
  private abortActive?: () => void;
  private onQuit?: () => void;

  constructor(options: TUIAdapterOptions) {
    this.tui = options.tui;
    this.chatLog = options.chatLog;
    this.client = options.client;
    this.getSessionKey = options.getSessionKey;
    this.refreshSessionInfo = options.refreshSessionInfo;
    this.getVerboseLevel = options.getVerboseLevel;
    this.getReasoningLevel = options.getReasoningLevel;
    this.openModelSelector = options.openModelSelector;
    this.openAgentSelector = options.openAgentSelector;
    this.openSessionSelector = options.openSessionSelector;
    this.setSession = options.setSession;
    this.showHelp = options.showHelp;
    this.helpTextGenerator = options.helpTextGenerator;
    this.abortActive = options.abortActive;
    this.onQuit = options.onQuit;
  }

  // =========================================================================
  // DISPLAY CONTROL
  // =========================================================================

  /**
   * Clear the chat log.
   */
  clear(): void {
    this.chatLog.clear();
    this.tui.requestRender();
  }

  /**
   * Refresh/redraw the display.
   */
  refresh(): void {
    this.tui.requestRender();
  }

  // =========================================================================
  // MODE TOGGLES
  // =========================================================================

  /**
   * Toggle verbose mode.
   */
  async toggleVerbose(): Promise<void> {
    const current = this.getVerboseLevel();
    const newLevel = current === "off" ? "on" : "off";

    try {
      await this.client.patchSession({
        key: this.getSessionKey(),
        verboseLevel: newLevel,
      });
      this.chatLog.addSystem(`Verbose mode: ${newLevel.toUpperCase()}`);
      await this.refreshSessionInfo();
      this.tui.requestRender();
    } catch (err) {
      this.chatLog.addSystem(`Failed to toggle verbose: ${String(err)}`);
    }
  }

  /**
   * Toggle reasoning mode.
   */
  async toggleReasoning(): Promise<void> {
    const current = this.getReasoningLevel();
    const newLevel = current === "off" ? "on" : "off";

    try {
      await this.client.patchSession({
        key: this.getSessionKey(),
        reasoningLevel: newLevel,
      });
      this.chatLog.addSystem(`Reasoning mode: ${newLevel.toUpperCase()}`);
      await this.refreshSessionInfo();
      this.tui.requestRender();
    } catch (err) {
      this.chatLog.addSystem(`Failed to toggle reasoning: ${String(err)}`);
    }
  }

  /**
   * Toggle help display.
   */
  toggleHelp(): void {
    if (this.showHelp) {
      this.showHelp();
    } else if (this.helpTextGenerator) {
      const help = this.helpTextGenerator();
      this.chatLog.addSystem(help);
      this.tui.requestRender();
    } else {
      this.chatLog.addSystem("Help not available");
    }
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  /**
   * Create a new session.
   */
  newSession(): void {
    if (this.setSession) {
      this.setSession("");
    }
  }

  /**
   * Open session selector (next session).
   */
  nextSession(): void {
    if (this.openSessionSelector) {
      this.openSessionSelector();
    }
  }

  /**
   * Open session selector (previous session - same as next for now).
   */
  prevSession(): void {
    if (this.openSessionSelector) {
      this.openSessionSelector();
    }
  }

  /**
   * Switch to a specific session.
   */
  switchSession(key?: string): void {
    if (key && this.setSession) {
      this.setSession(key);
    } else if (this.openSessionSelector) {
      this.openSessionSelector();
    }
  }

  // =========================================================================
  // MODEL/AGENT SELECTION
  // =========================================================================

  /**
   * Open model selector.
   */
  selectModel(): void {
    if (this.openModelSelector) {
      this.openModelSelector();
    }
  }

  /**
   * Open agent selector.
   */
  selectAgent(): void {
    if (this.openAgentSelector) {
      this.openAgentSelector();
    }
  }

  // =========================================================================
  // CONTROL
  // =========================================================================

  /**
   * Abort current operation.
   */
  abort(): void {
    if (this.abortActive) {
      this.abortActive();
      this.chatLog.addSystem("⏹ Aborted");
    }
  }

  /**
   * Quit the application.
   */
  quit(): void {
    if (this.onQuit) {
      this.onQuit();
    }
  }

  // =========================================================================
  // LOGGING
  // =========================================================================

  /**
   * Log a system message.
   */
  logSystem(message: string): void {
    this.chatLog.addSystem(message);
    this.tui.requestRender();
  }

  /**
   * Log an error message.
   */
  logError(message: string): void {
    this.chatLog.addSystem(`❌ ${message}`);
    this.tui.requestRender();
  }
}
