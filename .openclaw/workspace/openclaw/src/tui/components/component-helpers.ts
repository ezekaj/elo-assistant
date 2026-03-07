/**
 * Component Helpers for TUI
 *
 * Provides factory functions for creating styled pi-tui components.
 * Use these instead of direct Text/Box constructor calls for styled output.
 */

import { Box, Text } from "@mariozechner/pi-tui";

export interface TextOptions {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
  underline?: boolean;
  tooltip?: string;
}

export interface BoxOptions {
  children?: (Text | Box | string)[];
  border?: {
    type?: string;
    color?: string;
  };
  padding?: number;
  margin?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

/**
 * ANSI color codes
 */
const COLOR_CODES: Record<string, string> = {
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  magenta: "35",
  cyan: "36",
  white: "37",
  gray: "90",
  grey: "90",
};

/**
 * Apply ANSI styling to text
 */
function applyStyle(text: string, options: TextOptions): string {
  let result = text;
  const codes: string[] = [];

  if (options.dim) codes.push("2");
  if (options.bold) codes.push("1");
  if (options.italic) codes.push("3");
  if (options.underline) codes.push("4");
  if (options.color && COLOR_CODES[options.color.toLowerCase()]) {
    codes.push(COLOR_CODES[options.color.toLowerCase()]);
  }

  if (codes.length > 0) {
    result = `\x1b[${codes.join(";")}m${result}\x1b[0m`;
  }

  return result;
}

/**
 * Create a styled Text component
 */
export function createText(text: string, options: TextOptions = {}): Text {
  const styledText = applyStyle(text, options);
  return new Text(styledText);
}

/**
 * Create a Box component with children
 */
export function createBox(options: BoxOptions = {}): Box {
  const padding = typeof options.padding === "number" ? options.padding : 1;
  const box = new Box(padding, padding);

  if (options.children) {
    for (const child of options.children) {
      if (child instanceof Text || child instanceof Box) {
        box.addChild(child);
      } else if (typeof child === "string") {
        box.addChild(new Text(child));
      }
    }
  }

  return box;
}
