/**
 * Key Parser
 *
 * Parses raw terminal input into structured key events.
 * Handles macOS, German QWERTZ keyboards, and various escape sequences.
 */

import type { ParsedKeyEvent, KeyModifier, KeyboardLayout, Platform } from "./types.js";
import { isMacOS, detectKeyboardLayout, SPECIAL_KEYS, MODIFIER_ORDER } from "./types.js";

/**
 * Key Parser
 *
 * Converts raw terminal input to structured key events.
 */
export class KeyParser {
  private static instance: KeyParser;
  private platform: Platform;
  private layout: KeyboardLayout;
  private isMac: boolean;

  private constructor() {
    this.platform = process.platform as Platform;
    this.layout = detectKeyboardLayout();
    this.isMac = isMacOS();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): KeyParser {
    if (!KeyParser.instance) {
      KeyParser.instance = new KeyParser();
    }
    return KeyParser.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static reset(): void {
    KeyParser.instance = undefined as any;
  }

  /**
   * Parse raw input string to structured event
   */
  parse(data: string): ParsedKeyEvent {
    const modifiers: KeyModifier[] = [];
    let key = data;
    const raw = data;

    // Handle empty input
    if (!data || data.length === 0) {
      return { key: "", modifiers: [], raw: "", sequence: [] };
    }

    // Handle escape sequences (starts with ESC)
    if (data[0] === "\x1b") {
      return this.parseEscapeSequence(data);
    }

    // Handle Ctrl modifier (ASCII control characters)
    if (data.length === 1 && data.charCodeAt(0) < 32) {
      return this.parseControlChar(data);
    }

    // Handle DEL (ASCII 127)
    if (data === "\x7f") {
      return { key: "backspace", modifiers: [], raw, sequence: [data] };
    }

    // Map special single keys
    const specialKey = SPECIAL_KEYS[data];
    if (specialKey) {
      return { key: specialKey, modifiers: [], raw, sequence: [data] };
    }

    // Handle regular printable character
    // On German keyboard, some chars need special handling
    if (data.length === 1) {
      return { key: data.toLowerCase(), modifiers: [], raw, sequence: [data] };
    }

    // Multi-char non-escape (rare, maybe unicode)
    return { key: data, modifiers: [], raw, sequence: [data] };
  }

  /**
   * Parse escape sequence
   */
  private parseEscapeSequence(data: string): ParsedKeyEvent {
    const modifiers: KeyModifier[] = [];
    const raw = data;

    // Plain escape key
    if (data === "\x1b") {
      return { key: "escape", modifiers: [], raw, sequence: [data] };
    }

    // Alt + single key (ESC followed by char)
    // On macOS, Option key sends ESC prefix
    if (data.length === 2 && data[0] === "\x1b") {
      modifiers.push("alt");
      const char = data[1];

      // On German keyboard with Option, some chars produce special chars
      // We normalize to the base key
      const normalizedChar = this.normalizeAltChar(char);

      return { key: normalizedChar, modifiers, raw, sequence: [data] };
    }

    // CSI sequences: ESC [
    if (data.startsWith("\x1b[")) {
      return this.parseCSI(data);
    }

    // SS3 sequences: ESC O (function keys)
    if (data.startsWith("\x1bO")) {
      return this.parseSS3(data);
    }

    // Unknown escape sequence
    return { key: "unknown", modifiers, raw, sequence: [data] };
  }

  /**
   * Parse control character
   */
  private parseControlChar(data: string): ParsedKeyEvent {
    const code = data.charCodeAt(0);
    const modifiers: KeyModifier[] = ["ctrl"];
    const raw = data;

    // Ctrl+A = 1, Ctrl+B = 2, ..., Ctrl+Z = 26
    // Convert back to letter
    const letter = String.fromCharCode(code + 96);

    return { key: letter, modifiers, raw, sequence: [data] };
  }

  /**
   * Parse CSI (Control Sequence Introducer) sequence
   */
  private parseCSI(data: string): ParsedKeyEvent {
    const modifiers: KeyModifier[] = [];
    const raw = data;

    // Remove ESC[ prefix
    const seq = data.slice(2);

    // Arrow keys: ESC[A (up), ESC[B (down), ESC[C (right), ESC[D (left)
    if (seq.length === 1 && "ABCDHPQ".includes(seq)) {
      const key = this.decodeArrowKey(seq);
      return { key, modifiers, raw, sequence: [data] };
    }

    // Modified arrow keys: ESC[1;5A (Ctrl+Up), etc.
    const modifiedArrowMatch = seq.match(/^1;(\d)([ABCDHPQ])$/);
    if (modifiedArrowMatch) {
      const modCode = modifiedArrowMatch[1];
      const arrowCode = modifiedArrowMatch[2];
      const key = this.decodeArrowKey(arrowCode);
      modifiers.push(this.decodeModifierCode(modCode));
      return { key, modifiers, raw, sequence: [data] };
    }

    // Home/End on some terminals: ESC[H, ESC[F
    if (seq === "H") {
      return { key: "home", modifiers: [], raw, sequence: [data] };
    }
    if (seq === "F") {
      return { key: "end", modifiers: [], raw, sequence: [data] };
    }

    // VT100 style: ESC[1~ (Home), ESC[4~ (End), ESC[5~ (PgUp), ESC[6~ (PgDn)
    const vtMatch = seq.match(/^(\d+)~$/);
    if (vtMatch) {
      const key = this.decodeVT100Key(vtMatch[1]);
      return { key, modifiers: [], raw, sequence: [data] };
    }

    // Modified VT100: ESC[1;5~ (Ctrl+Home), etc.
    const modifiedVTMatch = seq.match(/^(\d+);(\d+)~$/);
    if (modifiedVTMatch) {
      const keyCode = modifiedVTMatch[1];
      const modCode = modifiedVTMatch[2];
      const key = this.decodeVT100Key(keyCode);
      modifiers.push(this.decodeModifierCode(modCode));
      return { key, modifiers, raw, sequence: [data] };
    }

    // F1-F4 on some terminals: ESC[OP, ESC[OQ, ESC[OR, ESC[OS
    // (These are actually SS3, but some terminals use CSI)
    const fnMatch = seq.match(/^(?:O)?P|Q|R|S$/);
    if (fnMatch) {
      const fnNum = { P: 1, Q: 2, R: 3, S: 4 }[seq.slice(-1)] ?? 0;
      return { key: `f${fnNum}`, modifiers: [], raw, sequence: [data] };
    }

    return { key: "unknown", modifiers, raw, sequence: [data] };
  }

  /**
   * Parse SS3 (Single Shift Three) sequence
   * Used for F1-F4 and some keypad keys
   */
  private parseSS3(data: string): ParsedKeyEvent {
    const seq = data.slice(2); // Remove ESC O
    const raw = data;

    // F1-F4: ESC OP, ESC OQ, ESC OR, ESC OS
    const fnKeys: Record<string, string> = {
      P: "f1",
      Q: "f2",
      R: "f3",
      S: "f4",
    };

    if (fnKeys[seq]) {
      return { key: fnKeys[seq], modifiers: [], raw, sequence: [data] };
    }

    // Keypad keys
    const keypadKeys: Record<string, string> = {
      A: "up",
      B: "down",
      C: "right",
      D: "left",
      H: "home",
      F: "end",
    };

    if (keypadKeys[seq]) {
      return { key: keypadKeys[seq], modifiers: [], raw, sequence: [data] };
    }

    return { key: "unknown", modifiers: [], raw, sequence: [data] };
  }

  /**
   * Decode arrow key code
   */
  private decodeArrowKey(code: string): string {
    const arrows: Record<string, string> = {
      A: "up",
      B: "down",
      C: "right",
      D: "left",
      H: "home",
      P: "f1",
      Q: "f2",
      R: "f3",
      S: "f4",
    };
    return arrows[code] || code.toLowerCase();
  }

  /**
   * Decode VT100 key code
   */
  private decodeVT100Key(code: string): string {
    const keys: Record<string, string> = {
      "1": "home",
      "2": "insert",
      "3": "delete",
      "4": "end",
      "5": "pageup",
      "6": "pagedown",
      "7": "home",
      "8": "end",
      "11": "f1",
      "12": "f2",
      "13": "f3",
      "14": "f4",
      "15": "f5",
      "17": "f6",
      "18": "f7",
      "19": "f8",
      "20": "f9",
      "21": "f10",
      "23": "f11",
      "24": "f12",
    };
    return keys[code] || `unknown-${code}`;
  }

  /**
   * Decode modifier code (from escape sequence)
   *
   * Modifier codes:
   * 1 = None
   * 2 = Shift
   * 3 = Alt (Meta)
   * 4 = Alt+Shift
   * 5 = Ctrl
   * 6 = Ctrl+Shift
   * 7 = Ctrl+Alt
   * 8 = Ctrl+Alt+Shift
   * 9 = Meta (Super)
   */
  private decodeModifierCode(code: string): KeyModifier {
    const mods: Record<string, KeyModifier> = {
      "1": "none",
      "2": "shift",
      "3": "alt",
      "4": "alt",
      "5": "ctrl",
      "6": "ctrl",
      "7": "alt", // Ctrl+Alt - report as alt for our purposes
      "8": "alt",
      "9": "meta",
    };
    return mods[code] || "none";
  }

  /**
   * Normalize Alt character for German keyboard
   *
   * On German keyboard, Alt+key produces different chars.
   * We want to map back to the original key.
   */
  private normalizeAltChar(char: string): string {
    // On macOS with German keyboard, Option produces special chars
    // Common mappings:
    const altMappings: Record<string, string> = {
      // German Option mappings on macOS
      Å: "a", // Option+A
      Ω: "z", // Option+Z (German: Y and Z swapped)
      "∑": "s",
      "∆": "d",
      ƒ: "f",
      "©": "g",
      "˙": "h",
      "¬": "l",
      "∂": "d",
      "∫": "b",
      π: "p",
      ö: "o",
      ä: "a",
      ü: "u",
      ß: "s",
    };

    return altMappings[char] || char.toLowerCase();
  }

  /**
   * Convert parsed event to binding key string
   * Format: "ctrl+alt+shift+key" (modifiers sorted)
   */
  toBindingKey(event: ParsedKeyEvent): string {
    const mods = event.modifiers
      .filter((m) => m !== "none")
      .sort((a, b) => (MODIFIER_ORDER[a] ?? 99) - (MODIFIER_ORDER[b] ?? 99));

    return mods.length > 0 ? `${mods.join("+")}+${event.key}` : event.key;
  }

  /**
   * Parse binding key string to components
   */
  fromBindingKey(bindingKey: string): { key: string; modifiers: KeyModifier[] } {
    const parts = bindingKey.toLowerCase().split("+");

    if (parts.length === 1) {
      return { key: parts[0], modifiers: [] };
    }

    const key = parts.pop()!;
    const modifiers = parts.filter((m) =>
      ["ctrl", "alt", "shift", "meta"].includes(m),
    ) as KeyModifier[];

    return { key, modifiers };
  }

  /**
   * Check if two key events match
   */
  matches(a: ParsedKeyEvent, b: ParsedKeyEvent): boolean {
    return (
      a.key === b.key &&
      a.modifiers.length === b.modifiers.length &&
      a.modifiers.every((m) => b.modifiers.includes(m))
    );
  }

  /**
   * Get display name for a key
   */
  getDisplayName(event: ParsedKeyEvent): string {
    const mods = event.modifiers
      .filter((m) => m !== "none")
      .map((m) => m.charAt(0).toUpperCase() + m.slice(1));

    const keyDisplay = this.formatKeyDisplay(event.key);

    return mods.length > 0 ? `${mods.join("+")}+${keyDisplay}` : keyDisplay;
  }

  /**
   * Format key for display
   */
  private formatKeyDisplay(key: string): string {
    const displayNames: Record<string, string> = {
      escape: "Esc",
      enter: "Enter",
      backspace: "Backspace",
      tab: "Tab",
      space: "Space",
      up: "↑",
      down: "↓",
      left: "←",
      right: "→",
      home: "Home",
      end: "End",
      pageup: "PgUp",
      pagedown: "PgDn",
      insert: "Ins",
      delete: "Del",
    };

    if (displayNames[key]) {
      return displayNames[key];
    }

    // F keys
    if (key.match(/^f\d+$/)) {
      return key.toUpperCase();
    }

    // Single letter
    if (key.length === 1) {
      return key.toUpperCase();
    }

    return key;
  }
}

/**
 * Singleton instance
 */
export const keyParser = KeyParser.getInstance();

/**
 * Convenience function to parse key
 */
export function parseKey(data: string): ParsedKeyEvent {
  return keyParser.parse(data);
}
