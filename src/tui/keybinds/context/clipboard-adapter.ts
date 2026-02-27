/**
 * Clipboard Adapter for Keybinding System
 *
 * Provides clipboard operations using Node.js child_process.
 * Supports macOS (pbcopy/pbpaste), Linux (xclip/xsel), and Windows (clip/powershell).
 */

import { spawn } from "child_process";

/**
 * Clipboard adapter that works across platforms.
 */
export class ClipboardAdapter {
  private platform: string;
  private lastCopied: string = "";

  constructor() {
    this.platform = process.platform;
  }

  /**
   * Copy text to clipboard.
   *
   * @param text Text to copy
   */
  async copy(text?: string): Promise<void> {
    const textToCopy = text ?? this.lastCopied;
    if (!textToCopy) return;

    this.lastCopied = textToCopy;

    try {
      if (this.platform === "darwin") {
        await this.runCommand("pbcopy", [], textToCopy);
      } else if (this.platform === "linux") {
        // Try xclip first, fall back to xsel
        try {
          await this.runCommand("xclip", ["-selection", "clipboard"], textToCopy);
        } catch {
          await this.runCommand("xsel", ["--clipboard", "--input"], textToCopy);
        }
      } else if (this.platform === "win32") {
        // Windows - use clip command
        await this.runCommand("clip", [], textToCopy);
      }
    } catch (err) {
      // Silent fail - clipboard is not critical
      console.debug("Clipboard copy failed:", err);
    }
  }

  /**
   * Paste text from clipboard.
   *
   * @returns Clipboard contents or undefined if unavailable
   */
  async paste(): Promise<string | undefined> {
    try {
      if (this.platform === "darwin") {
        return await this.runCommandOutput("pbpaste", []);
      } else if (this.platform === "linux") {
        // Try xclip first, fall back to xsel
        try {
          return await this.runCommandOutput("xclip", ["-selection", "clipboard", "-o"]);
        } catch {
          return await this.runCommandOutput("xsel", ["--clipboard", "--output"]);
        }
      } else if (this.platform === "win32") {
        // Windows - use PowerShell
        return await this.runCommandOutput("powershell", ["-command", "Get-Clipboard"]);
      }
    } catch (err) {
      console.debug("Clipboard paste failed:", err);
    }

    return undefined;
  }

  /**
   * Get the last copied text (internal buffer).
   */
  getLastCopied(): string {
    return this.lastCopied;
  }

  /**
   * Set the internal buffer (for yank operations).
   */
  setLastCopied(text: string): void {
    this.lastCopied = text;
  }

  /**
   * Run a command with stdin.
   */
  private runCommand(command: string, args: string[], input: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });

      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });

      proc.stdin?.write(input);
      proc.stdin?.end();
    });
  }

  /**
   * Run a command and capture stdout.
   */
  private runCommandOutput(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });

      let output = "";

      proc.on("error", reject);
      proc.stdout?.on("data", (data) => {
        output += data.toString();
      });
      proc.on("close", (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });
    });
  }
}

/**
 * Singleton clipboard adapter.
 */
let clipboardAdapter: ClipboardAdapter | null = null;

/**
 * Get the clipboard adapter singleton.
 */
export function getClipboardAdapter(): ClipboardAdapter {
  if (!clipboardAdapter) {
    clipboardAdapter = new ClipboardAdapter();
  }
  return clipboardAdapter;
}
