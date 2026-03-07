/**
 * Enhanced Markdown Renderer
 *
 * Features:
 * - Line numbers for code blocks
 * - Collapsible long code sections
 * - Better syntax highlighting
 * - Copy button indicator
 */

import chalk from "chalk";

export interface CodeBlockOptions {
  showLineNumbers?: boolean;
  startLine?: number;
  collapseThreshold?: number;
  language?: string;
}

/**
 * Add line numbers to code
 */
export function addLineNumbers(code: string, startLine: number = 1): string {
  const lines = code.split("\n");
  const maxLineNum = startLine + lines.length - 1;
  const padding = String(maxLineNum).length;
  
  return lines.map((line, index) => {
    const lineNum = String(startLine + index).padStart(padding, " ");
    return chalk.dim(`${lineNum} │ `) + line;
  }).join("\n");
}

/**
 * Format code block with line numbers and styling
 */
export function formatEnhancedCodeBlock(
  code: string,
  language?: string,
  options: CodeBlockOptions = {}
): string {
  const {
    showLineNumbers = true,
    startLine = 1,
    collapseThreshold = 50,
  } = options;
  
  const lines = code.split("\n");
  const lineCount = lines.length;
  
  // Header
  const headerParts: string[] = [];
  if (language) {
    headerParts.push(chalk.cyan(language));
  }
  headerParts.push(chalk.dim(`${lineCount} lines`));
  
  const header = chalk.gray("┌─ ") + headerParts.join(" · ") + chalk.gray(" ─".repeat(Math.max(0, 40 - headerParts.join(" · ").length)));
  
  // Body
  let body: string;
  if (showLineNumbers) {
    body = addLineNumbers(code, startLine);
  } else {
    body = code;
  }
  
  // Footer with copy hint
  const footer = chalk.gray("└" + "─".repeat(50));
  
  return `${header}\n${body}\n${footer}`;
}

/**
 * Create collapsible code block indicator
 */
export function createCollapsibleBlock(
  code: string,
  language?: string,
  previewLines: number = 5
): { preview: string; full: string; isCollapsed: boolean } {
  const lines = code.split("\n");
  const isCollapsed = lines.length > previewLines;
  
  if (!isCollapsed) {
    return {
      preview: formatEnhancedCodeBlock(code, language),
      full: formatEnhancedCodeBlock(code, language),
      isCollapsed: false,
    };
  }
  
  const previewCode = lines.slice(0, previewLines).join("\n");
  const remaining = lines.length - previewLines;
  
  const previewHeader = chalk.gray("┌─ ") + 
    (language ? chalk.cyan(language) + " · " : "") +
    chalk.dim(`${lines.length} lines`) +
    chalk.gray(" ─".repeat(20));
  
  const previewBody = addLineNumbers(previewCode, 1);
  
  const expandIndicator = chalk.gray("│ ") + 
    chalk.dim(`... ${remaining} more lines (click to expand)`);
  
  const previewFooter = chalk.gray("└" + "─".repeat(50));
  
  return {
    preview: `${previewHeader}\n${previewBody}\n${expandIndicator}\n${previewFooter}`,
    full: formatEnhancedCodeBlock(code, language),
    isCollapsed: true,
  };
}

/**
 * Format inline code with background
 */
export function formatInlineCode(code: string): string {
  return chalk.bgHex("#1E232A")(chalk.hex("#F0C987")(` ${code} `));
}

/**
 * Format diff with colors
 */
export function formatDiff(code: string): string {
  const lines = code.split("\n");
  return lines.map(line => {
    if (line.startsWith("+") || line.startsWith("++")) {
      return chalk.green(line);
    } else if (line.startsWith("-") || line.startsWith("--")) {
      return chalk.red(line);
    } else if (line.startsWith("@@") || line.startsWith("diff")) {
      return chalk.cyan(line);
    } else {
      return chalk.dim(line);
    }
  }).join("\n");
}

/**
 * Detect if code is a diff
 */
export function isDiffCode(code: string, language?: string): boolean {
  if (language === "diff") return true;
  return code.startsWith("diff --git") || 
         code.includes("\n++") ||
         code.includes("\n--");
}
