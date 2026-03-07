import { Box, Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { formatToolDetail, resolveToolDisplay } from "../../agents/tool-display.js";
import { markdownTheme, theme } from "../theme/theme.js";

type ToolResultContent = {
  type?: string;
  text?: string;
  mimeType?: string;
  bytes?: number;
  omitted?: boolean;
};

type ToolResult = {
  content?: ToolResultContent[];
  details?: Record<string, unknown>;
};

const PREVIEW_LINES = 8;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SUCCESS_ICON = "✓";
const ERROR_ICON = "✗";

function formatArgs(toolName: string, args: unknown): string {
  const display = resolveToolDisplay({ name: toolName, args });
  const detail = formatToolDetail(display);
  if (detail) {
    return detail;
  }
  if (!args || typeof args !== "object") {
    return "";
  }
  try {
    const str = JSON.stringify(args);
    // Truncate long args
    if (str.length > 80) {
      return str.substring(0, 77) + "...";
    }
    return str;
  } catch {
    return "";
  }
}

function extractText(result?: ToolResult): string {
  if (!result?.content) {
    return "";
  }
  const lines: string[] = [];
  for (const entry of result.content) {
    if (entry.type === "text" && entry.text) {
      lines.push(entry.text);
    } else if (entry.type === "image") {
      const mime = entry.mimeType ?? "image";
      const size = entry.bytes ? ` ${Math.round(entry.bytes / 1024)}kb` : "";
      const omitted = entry.omitted ? " (omitted)" : "";
      lines.push(`[${mime}${size}${omitted}]`);
    }
  }
  return lines.join("\n").trim();
}

export class ToolExecutionComponent extends Container {
  private box: Box;
  private icon: Text;
  private header: Text;
  private argsLine: Text;
  private output: Markdown;
  private toolName: string;
  private args: unknown;
  private result?: ToolResult;
  private expanded = false;
  private isError = false;
  private isPartial = true;
  private spinnerFrame = 0;
  private spinnerInterval?: ReturnType<typeof setInterval>;

  constructor(toolName: string, args: unknown) {
    super();
    this.toolName = toolName;
    this.args = args;
    
    // Main container with rounded corners effect
    this.box = new Box(1, 1, (line) => theme.toolPendingBg(line));
    
    // Status icon (spinner or checkmark)
    this.icon = new Text("", 0, 0);
    
    // Tool name header
    this.header = new Text("", 0, 0);
    
    // Arguments line (dimmed, compact)
    this.argsLine = new Text("", 0, 0);
    
    // Output area
    this.output = new Markdown("", 0, 0, markdownTheme, {
      color: (line) => theme.toolOutput(line),
    });
    
    this.addChild(new Spacer(1));
    this.addChild(this.box);
    this.box.addChild(this.icon);
    this.box.addChild(this.header);
    this.box.addChild(this.argsLine);
    this.box.addChild(this.output);
    
    this.refresh();
  }

  private startSpinner() {
    if (this.spinnerInterval) return;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.updateSpinner();
    }, 80);
  }

  private stopSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
  }

  private updateSpinner() {
    const icon = SPINNER_FRAMES[this.spinnerFrame];
    this.icon.setText(theme.accent(icon));
  }

  setArgs(args: unknown) {
    this.args = args;
    this.refresh();
  }

  setExpanded(expanded: boolean) {
    this.expanded = expanded;
    this.refresh();
  }

  setResult(result: ToolResult | undefined, opts?: { isError?: boolean }) {
    this.result = result;
    this.isPartial = false;
    this.isError = Boolean(opts?.isError);
    this.stopSpinner();
    this.refresh();
  }

  setPartialResult(result: ToolResult | undefined) {
    this.result = result;
    this.isPartial = true;
    this.refresh();
  }

  private refresh() {
    // Background color based on state
    const bg = this.isPartial
      ? theme.toolPendingBg
      : this.isError
        ? theme.toolErrorBg
        : theme.toolSuccessBg;
    this.box.setBgFn((line) => bg(line));

    // Get tool display info
    const display = resolveToolDisplay({
      name: this.toolName,
      args: this.args,
    });

    // Update icon
    if (this.isPartial) {
      this.startSpinner();
      this.updateSpinner();
    } else {
      const iconColor = this.isError ? theme.error : theme.success;
      const icon = this.isError ? ERROR_ICON : SUCCESS_ICON;
      this.icon.setText(iconColor(icon));
    }

    // Update header with tool name and status
    const statusText = this.isPartial ? "" : this.isError ? " failed" : "";
    const title = `${display.emoji} ${display.label}${statusText}`;
    this.header.setText(theme.toolTitle(theme.bold(title)));

    // Update args line (compact, single line)
    const argLine = formatArgs(this.toolName, this.args);
    if (argLine) {
      this.argsLine.setText(theme.dim(`  → ${argLine}`));
    } else {
      this.argsLine.setText("");
    }

    // Update output
    const raw = extractText(this.result);
    const text = raw || (this.isPartial ? "  Running..." : "");
    
    if (!this.expanded && text) {
      const lines = text.split("\n");
      if (lines.length > PREVIEW_LINES) {
        const preview = lines.slice(0, PREVIEW_LINES).join("\n");
        this.output.setText(preview + `\n${theme.dim(`  … (${lines.length - PREVIEW_LINES} more lines)`)}`);
      } else {
        this.output.setText(text);
      }
    } else {
      this.output.setText(text);
    }
  }

  destroy() {
    this.stopSpinner();
  }
}
