/**
 * Theme Manager for OpenClaw TUI
 *
 * Supports multiple color schemes: Default, Matrix, Dracula, Nord, Tokyo Night
 */

import type {
  EditorTheme,
  MarkdownTheme,
  SelectListTheme,
  SettingsListTheme,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import { highlight, supportsLanguage } from "cli-highlight";
import type { SearchableSelectListTheme } from "../components/searchable-select-list.js";
import { createSyntaxTheme } from "./syntax-theme.js";

export type ThemeName = "default" | "matrix" | "dracula" | "nord" | "tokyo-night";

export interface ThemePalette {
  name: ThemeName;
  text: string;
  dim: string;
  accent: string;
  accentSoft: string;
  border: string;
  userBg: string;
  userText: string;
  systemText: string;
  toolPendingBg: string;
  toolSuccessBg: string;
  toolErrorBg: string;
  toolTitle: string;
  toolOutput: string;
  quote: string;
  quoteBorder: string;
  code: string;
  codeBlock: string;
  codeBorder: string;
  link: string;
  error: string;
  success: string;
}

// Default theme (current OpenClaw theme)
const defaultPalette: ThemePalette = {
  name: "default",
  text: "#E8E3D5",
  dim: "#7B7F87",
  accent: "#F6C453",
  accentSoft: "#F2A65A",
  border: "#3C414B",
  userBg: "#2B2F36",
  userText: "#F3EEE0",
  systemText: "#9BA3B2",
  toolPendingBg: "#1F2A2F",
  toolSuccessBg: "#1E2D23",
  toolErrorBg: "#2F1F1F",
  toolTitle: "#F6C453",
  toolOutput: "#E1DACB",
  quote: "#8CC8FF",
  quoteBorder: "#3B4D6B",
  code: "#F0C987",
  codeBlock: "#1E232A",
  codeBorder: "#343A45",
  link: "#7DD3A5",
  error: "#F97066",
  success: "#7DD3A5",
};

// Matrix theme (green on black)
const matrixPalette: ThemePalette = {
  name: "matrix",
  text: "#00FF41",
  dim: "#008F11",
  accent: "#39FF14",
  accentSoft: "#32CD32",
  border: "#003B00",
  userBg: "#001100",
  userText: "#00FF41",
  systemText: "#00CC00",
  toolPendingBg: "#002200",
  toolSuccessBg: "#003300",
  toolErrorBg: "#330000",
  toolTitle: "#39FF14",
  toolOutput: "#00DD00",
  quote: "#00FF88",
  quoteBorder: "#006633",
  code: "#00FFAA",
  codeBlock: "#001A00",
  codeBorder: "#003300",
  link: "#00FF66",
  error: "#FF0040",
  success: "#00FF41",
};

// Dracula theme
const draculaPalette: ThemePalette = {
  name: "dracula",
  text: "#F8F8F2",
  dim: "#6272A4",
  accent: "#BD93F9",
  accentSoft: "#FF79C6",
  border: "#44475A",
  userBg: "#282A36",
  userText: "#F8F8F2",
  systemText: "#8BE9FD",
  toolPendingBg: "#282A36",
  toolSuccessBg: "#1E3A2F",
  toolErrorBg: "#3A1E2F",
  toolTitle: "#FF79C6",
  toolOutput: "#F8F8F2",
  quote: "#8BE9FD",
  quoteBorder: "#44475A",
  code: "#F1FA8C",
  codeBlock: "#282A36",
  codeBorder: "#44475A",
  link: "#50FA7B",
  error: "#FF5555",
  success: "#50FA7B",
};

// Nord theme
const nordPalette: ThemePalette = {
  name: "nord",
  text: "#ECEFF4",
  dim: "#D8DEE9",
  accent: "#88C0D0",
  accentSoft: "#81A1C1",
  border: "#3B4252",
  userBg: "#2E3440",
  userText: "#ECEFF4",
  systemText: "#A3BE8C",
  toolPendingBg: "#3B4252",
  toolSuccessBg: "#2E4035",
  toolErrorBg: "#4O3535",
  toolTitle: "#88C0D0",
  toolOutput: "#ECEFF4",
  quote: "#B48EAD",
  quoteBorder: "#4C566A",
  code: "#A3BE8C",
  codeBlock: "#3B4252",
  codeBorder: "#4C566A",
  link: "#8FBCBB",
  error: "#BF616A",
  success: "#A3BE8C",
};

// Tokyo Night theme
const tokyoNightPalette: ThemePalette = {
  name: "tokyo-night",
  text: "#C0CAF5",
  dim: "#565F89",
  accent: "#7AA2F7",
  accentSoft: "#BB9AF7",
  border: "#1F2335",
  userBg: "#16161E",
  userText: "#C0CAF5",
  systemText: "#9ECE6A",
  toolPendingBg: "#1F2335",
  toolSuccessBg: "#1F2E1F",
  toolErrorBg: "#2E1F1F",
  toolTitle: "#BB9AF7",
  toolOutput: "#C0CAF5",
  quote: "#9ECE6A",
  quoteBorder: "#292E42",
  code: "#E0AF68",
  codeBlock: "#1F2335",
  codeBorder: "#292E42",
  link: "#73DACA",
  error: "#F7768E",
  success: "#9ECE6A",
};

const themes: Record<ThemeName, ThemePalette> = {
  default: defaultPalette,
  matrix: matrixPalette,
  dracula: draculaPalette,
  nord: nordPalette,
  "tokyo-night": tokyoNightPalette,
};

// Current theme (can be changed at runtime)
let currentTheme: ThemeName = "default";

/**
 * Set the current theme
 */
export function setTheme(name: ThemeName): void {
  if (themes[name]) {
    currentTheme = name;
  }
}

/**
 * Get current theme name
 */
export function getCurrentThemeName(): ThemeName {
  return currentTheme;
}

/**
 * Get list of available themes
 */
export function getAvailableThemes(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

/**
 * Get current palette
 */
function getPalette(): ThemePalette {
  return themes[currentTheme];
}

const fg = (hex: string) => (text: string) => chalk.hex(hex)(text);
const bg = (hex: string) => (text: string) => chalk.bgHex(hex)(text);

/**
 * Highlight code with syntax coloring.
 */
function highlightCode(code: string, lang?: string): string[] {
  const palette = getPalette();
  const syntaxTheme = createSyntaxTheme(fg(palette.code));
  
  try {
    const language = lang && supportsLanguage(lang) ? lang : undefined;
    const highlighted = highlight(code, {
      language,
      theme: syntaxTheme,
      ignoreIllegals: true,
    });
    return highlighted.split("\n");
  } catch {
    return code.split("\n").map((line) => fg(palette.code)(line));
  }
}

/**
 * Build theme object from current palette
 */
function buildThemeFromPalette(palette: ThemePalette) {
  return {
    fg: fg(palette.text),
    dim: fg(palette.dim),
    accent: fg(palette.accent),
    accentSoft: fg(palette.accentSoft),
    success: fg(palette.success),
    error: fg(palette.error),
    header: (text: string) => chalk.bold(fg(palette.accent)(text)),
    system: fg(palette.systemText),
    userBg: bg(palette.userBg),
    userText: fg(palette.userText),
    toolTitle: fg(palette.toolTitle),
    toolOutput: fg(palette.toolOutput),
    toolPendingBg: bg(palette.toolPendingBg),
    toolSuccessBg: bg(palette.toolSuccessBg),
    toolErrorBg: bg(palette.toolErrorBg),
    border: fg(palette.border),
    bold: (text: string) => chalk.bold(text),
    italic: (text: string) => chalk.italic(text),
  };
}

/**
 * Get current theme
 */
export const theme = new Proxy({} as ReturnType<typeof buildThemeFromPalette>, {
  get(target, prop) {
    const palette = getPalette();
    const t = buildThemeFromPalette(palette);
    return t[prop as keyof typeof t];
  },
});

/**
 * Get markdown theme for current palette
 */
export function getMarkdownTheme(): MarkdownTheme {
  const palette = getPalette();
  return {
    heading: (text) => chalk.bold(fg(palette.accent)(text)),
    link: (text) => fg(palette.link)(text),
    linkUrl: (text) => chalk.dim(text),
    code: (text) => fg(palette.code)(text),
    codeBlock: (text) => fg(palette.code)(text),
    codeBlockBorder: (text) => fg(palette.codeBorder)(text),
    quote: (text) => fg(palette.quote)(text),
    quoteBorder: (text) => fg(palette.quoteBorder)(text),
    hr: (text) => fg(palette.border)(text),
    listBullet: (text) => fg(palette.accentSoft)(text),
    bold: (text) => chalk.bold(text),
    italic: (text) => chalk.italic(text),
    strikethrough: (text) => chalk.strikethrough(text),
    underline: (text) => chalk.underline(text),
    highlightCode,
  };
}

export const markdownTheme = new Proxy({} as MarkdownTheme, {
  get(target, prop) {
    const mt = getMarkdownTheme();
    return mt[prop as keyof MarkdownTheme];
  },
});

export const selectListTheme: SelectListTheme = {
  selectedPrefix: (text) => fg(getPalette().accent)(text),
  selectedText: (text) => chalk.bold(fg(getPalette().accent)(text)),
  description: (text) => fg(getPalette().dim)(text),
  scrollInfo: (text) => fg(getPalette().dim)(text),
  noMatch: (text) => fg(getPalette().dim)(text),
};

export const filterableSelectListTheme = {
  ...selectListTheme,
  filterLabel: (text: string) => fg(getPalette().dim)(text),
};

export const settingsListTheme: SettingsListTheme = {
  label: (text, selected) =>
    selected ? chalk.bold(fg(getPalette().accent)(text)) : fg(getPalette().text)(text),
  value: (text, selected) => (selected ? fg(getPalette().accentSoft)(text) : fg(getPalette().dim)(text)),
  description: (text) => fg(getPalette().systemText)(text),
  cursor: fg(getPalette().accent)("→ "),
  hint: (text) => fg(getPalette().dim)(text),
};

export const editorTheme: EditorTheme = {
  borderColor: (text) => fg(getPalette().border)(text),
  selectList: selectListTheme,
};

export const searchableSelectListTheme: SearchableSelectListTheme = {
  selectedPrefix: (text) => fg(getPalette().accent)(text),
  selectedText: (text) => chalk.bold(fg(getPalette().accent)(text)),
  description: (text) => fg(getPalette().dim)(text),
  scrollInfo: (text) => fg(getPalette().dim)(text),
  noMatch: (text) => fg(getPalette().dim)(text),
  searchPrompt: (text) => fg(getPalette().accentSoft)(text),
  searchInput: (text) => fg(getPalette().text)(text),
  matchHighlight: (text) => chalk.bold(fg(getPalette().accent)(text)),
};
