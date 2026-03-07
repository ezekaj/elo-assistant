/**
 * Color Diff Fallback using Highlight.js with Lazy Loading
 *
 * Provides syntax highlighting and diff coloring when native Syntect is unavailable.
 * Uses Highlight.js for syntax highlighting with on-demand language loading.
 */

import type { HighlightOptions, DiffHighlightOptions, HighlightResult } from "../types.js";
import { logInfo, logWarn } from "../../logger.js";
import { ANSI_COLORS, type DiffLineType } from "./types.js";

let hljsModule: any | null = null;
let hljsAvailable: boolean | undefined;
const loadedLanguages = new Set<string>();

/**
 * Try to load Highlight.js core module
 */
async function loadHighlightJs(): Promise<any | null> {
  if (hljsModule !== null) {
    return hljsModule;
  }

  try {
    // Load highlight.js core only (no languages)
    const hljs = await import("highlight.js/lib/core");
    hljsModule = hljs.default || hljs;
    hljsAvailable = true;
    logInfo("[ColorDiff] Highlight.js core loaded successfully");
    return hljsModule;
  } catch (err) {
    hljsModule = null;
    hljsAvailable = false;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logWarn(`[ColorDiff] Highlight.js not available: ${errorMsg}`);
    return null;
  }
}

/**
 * Lazily load a specific language
 */
async function loadLanguage(language: string): Promise<boolean> {
  if (loadedLanguages.has(language)) {
    return true;
  }

  const hljs = await loadHighlightJs();
  if (!hljs) {
    return false;
  }

  try {
    // Map language names to highlight.js module names
    const langMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      jsx: "javascript",
      tsx: "typescript",
      py: "python",
      rb: "ruby",
      rs: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
      swift: "swift",
      kt: "kotlin",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      sql: "sql",
      html: "xml",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      md: "markdown",
      markdown: "markdown",
      diff: "diff",
      patch: "diff",
      makefile: "makefile",
      toml: "toml",
      ini: "ini",
      lua: "lua",
      perl: "perl",
      r: "r",
      matlab: "matlab",
      julia: "julia",
      haskell: "haskell",
      erlang: "erlang",
      elixir: "elixir",
      clojure: "clojure",
      fsharp: "fsharp",
      ocaml: "ocaml",
      vb: "vbnet",
      dart: "dart",
      groovy: "groovy",
      powershell: "powershell",
      dockerfile: "dockerfile",
      tf: "hcl",
      hcl: "hcl",
      terraform: "hcl",
      protobuf: "protobuf",
      graphql: "graphql",
    };

    const hljsName = langMap[language.toLowerCase()] || language.toLowerCase();

    // Dynamically import the language
    const langModule = await import(`highlight.js/lib/languages/${hljsName}`);
    const langFunc = langModule.default || langModule;

    hljs.registerLanguage(hljsName, langFunc);
    loadedLanguages.add(language);

    logInfo(`[ColorDiff] Loaded language: ${language}`);
    return true;
  } catch (err) {
    // Language not found, will use auto-detect
    return false;
  }
}

/**
 * Check if Highlight.js is available
 */
export async function isHighlightJsAvailable(): Promise<boolean> {
  if (hljsAvailable !== undefined) {
    return hljsAvailable;
  }
  return (await loadHighlightJs()) !== null;
}

/**
 * Map language names to Highlight.js aliases
 */
function mapLanguage(lang: string): string {
  const mapping: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    jsx: "javascript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    sql: "sql",
    html: "xml",
    htm: "xml",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    markdown: "markdown",
    diff: "diff",
    patch: "diff",
    makefile: "makefile",
    mk: "makefile",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "nginx",
    nginx: "nginx",
    apache: "apache",
    lua: "lua",
    perl: "perl",
    pl: "perl",
    r: "r",
    matlab: "matlab",
    julia: "julia",
    haskell: "haskell",
    hs: "haskell",
    erlang: "erlang",
    elixir: "elixir",
    ex: "elixir",
    clojure: "clojure",
    clj: "clojure",
    fsharp: "fsharp",
    fs: "fsharp",
    ocaml: "ocaml",
    ml: "ocaml",
    vb: "vbnet",
    basic: "vbnet",
    dart: "dart",
    flutter: "dart",
    groovy: "groovy",
    gradle: "groovy",
    powershell: "powershell",
    ps1: "powershell",
    dockerfile: "dockerfile",
    tf: "hcl",
    hcl: "hcl",
    terraform: "hcl",
    protobuf: "protobuf",
    proto: "protobuf",
    graphql: "graphql",
    gql: "graphql",
  };
  return mapping[lang.toLowerCase()] || lang;
}

/**
 * Detect language from filename
 */
export async function detectLanguageFromFilename(filename: string): Promise<string | null> {
  const hljs = await loadHighlightJs();
  if (!hljs) {
    return null;
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (!ext) {
    return null;
  }

  const lang = mapLanguage(ext);

  // Try to load the language
  await loadLanguage(lang);

  // Check if highlight.js supports this language
  try {
    hljs.getLanguage(lang);
    return lang;
  } catch {
    return null;
  }
}

/**
 * Highlight source code with lazy language loading
 */
export async function highlightCode(options: HighlightOptions): Promise<HighlightResult> {
  const hljs = await loadHighlightJs();
  if (!hljs) {
    throw new Error("Highlight.js not available");
  }

  const startTime = Date.now();
  const language = options.language ? mapLanguage(options.language) : "auto";

  let result;

  if (language === "auto") {
    // Auto-detect language (loads all languages, use sparingly)
    result = hljs.highlightAuto(options.code);
  } else {
    // Load specific language on-demand
    await loadLanguage(language);

    try {
      result = hljs.highlight(options.code, { language });
    } catch {
      // Language not found, try auto-detect
      result = hljs.highlightAuto(options.code);
    }
  }

  // Convert to ANSI if requested
  let output: string;
  if (options.format === "ansi") {
    output = convertHtmlToAnsi(result.value);
  } else {
    output = result.value;
  }

  return {
    output,
    language: result.language || "unknown",
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Convert HTML highlighting to ANSI escape codes
 */
function convertHtmlToAnsi(html: string): string {
  let result = html;

  // Map HTML color codes to ANSI
  const colorMap: Record<string, string> = {
    "hljs-comment": ANSI_COLORS.dim,
    "hljs-quote": ANSI_COLORS.dim,
    "hljs-variable": ANSI_COLORS.red,
    "hljs-template-variable": ANSI_COLORS.red,
    "hljs-strong": ANSI_COLORS.bold,
    "hljs-emphasis": ANSI_COLORS.italic,
    "hljs-number": ANSI_COLORS.yellow,
    "hljs-literal": ANSI_COLORS.yellow,
    "hljs-string": ANSI_COLORS.green,
    "hljs-doctag": ANSI_COLORS.green,
    "hljs-title": ANSI_COLORS.blue,
    "hljs-section": ANSI_COLORS.blue,
    "hljs-selector-tag": ANSI_COLORS.magenta,
    "hljs-name": ANSI_COLORS.magenta,
    "hljs-keyword": ANSI_COLORS.cyan,
    "hljs-attr": ANSI_COLORS.cyan,
    "hljs-type": ANSI_COLORS.cyan,
    "hljs-function": ANSI_COLORS.blue,
    "hljs-params": ANSI_COLORS.white,
    "hljs-deletion": ANSI_COLORS.red,
    "hljs-addition": ANSI_COLORS.green,
  };

  // Replace HTML tags with ANSI codes
  for (const [className, ansiCode] of Object.entries(colorMap)) {
    const openTag = `<span class="${className}">`;
    const closeTag = "</span>";

    result = result.replace(new RegExp(openTag, "g"), ansiCode);
    result = result.replace(new RegExp(closeTag, "g"), ANSI_COLORS.reset);
  }

  // Remove any remaining HTML tags
  result = result.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  result = result
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return result;
}

/**
 * Highlight a diff
 */
export async function highlightDiff(options: DiffHighlightOptions): Promise<HighlightResult> {
  const startTime = Date.now();

  const lines = options.diff.split("\n");
  const highlightedLines: string[] = [];

  for (const line of lines) {
    let color = "";
    let prefix = "";

    if (line.startsWith("+") && !line.startsWith("+++")) {
      color = ANSI_COLORS.green;
      prefix = "+";
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      color = ANSI_COLORS.red;
      prefix = "-";
    } else if (line.startsWith("@@")) {
      color = ANSI_COLORS.cyan;
      prefix = "";
    } else if (line.startsWith("diff")) {
      color = ANSI_COLORS.yellow;
      prefix = "";
    } else if (line.startsWith("index")) {
      color = ANSI_COLORS.dim;
      prefix = "";
    } else if (line.trim() === "") {
      color = "";
      prefix = "";
    } else {
      // Context line
      color = ANSI_COLORS.dim;
      prefix = " ";
    }

    if (color) {
      highlightedLines.push(`${color}${line}${ANSI_COLORS.reset}`);
    } else {
      highlightedLines.push(line);
    }
  }

  return {
    output: highlightedLines.join("\n"),
    language: "diff",
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * List available themes (highlight.js doesn't support themes in the same way)
 */
export function listThemesFallback(): string[] {
  return ["default"];
}

/**
 * List supported languages (common ones we support)
 */
export async function listLanguagesFallback(): Promise<string[]> {
  return [
    "javascript",
    "typescript",
    "python",
    "rust",
    "go",
    "java",
    "cpp",
    "c",
    "csharp",
    "php",
    "swift",
    "kotlin",
    "bash",
    "sql",
    "html",
    "css",
    "scss",
    "sass",
    "less",
    "json",
    "yaml",
    "xml",
    "markdown",
    "diff",
    "makefile",
    "toml",
    "ini",
    "lua",
    "perl",
    "r",
    "haskell",
    "elixir",
    "clojure",
    "fsharp",
    "ocaml",
    "dart",
    "groovy",
    "powershell",
    "dockerfile",
    "hcl",
    "terraform",
    "protobuf",
    "graphql",
  ];
}

/**
 * Get Highlight.js version
 */
export async function getVersion(): Promise<string> {
  try {
    const pkg = await import("highlight.js/package.json");
    return pkg.default?.version || "unknown";
  } catch {
    return "unknown";
  }
}
