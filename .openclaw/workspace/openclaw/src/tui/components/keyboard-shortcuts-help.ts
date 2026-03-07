/**
 * Keyboard Shortcuts Help Overlay
 *
 * Shows all available keyboard shortcuts when user presses '?'
 */

import chalk from "chalk";
import type { Component } from "@mariozechner/pi-tui";

export interface KeyShortcut {
  key: string;
  description: string;
  category?: string;
}

const shortcuts: KeyShortcut[] = [
  // Navigation
  { key: "↑/↓", description: "Navigate history/scroll", category: "Navigation" },
  { key: "PgUp/PgDn", description: "Scroll chat log", category: "Navigation" },
  { key: "Home/End", description: "Jump to start/end", category: "Navigation" },
  
  // Editing
  { key: "Ctrl+A", description: "Go to line start", category: "Editing" },
  { key: "Ctrl+E", description: "Go to line end", category: "Editing" },
  { key: "Ctrl+K", description: "Clear to end of line", category: "Editing" },
  { key: "Ctrl+U", description: "Clear to start of line", category: "Editing" },
  { key: "Ctrl+W", description: "Delete previous word", category: "Editing" },
  { key: "Tab", description: "Autocomplete", category: "Editing" },
  
  // Actions
  { key: "Enter", description: "Send message", category: "Actions" },
  { key: "Shift+Enter", description: "New line", category: "Actions" },
  { key: "Escape", description: "Close overlay/cancel", category: "Actions" },
  { key: "Ctrl+C", description: "Interrupt agent", category: "Actions" },
  { key: "Ctrl+D", description: "Exit TUI", category: "Actions" },
  { key: "!", description: "Execute shell command", category: "Actions" },
  
  // Slash Commands
  { key: "/help", description: "Show help", category: "Commands" },
  { key: "/status", description: "Show session status", category: "Commands" },
  { key: "/clear", description: "Clear screen", category: "Commands" },
  { key: "/model", description: "Change model", category: "Commands" },
  { key: "/reasoning", description: "Toggle reasoning", category: "Commands" },
  { key: "/think", description: "Toggle thinking", category: "Commands" },
  { key: "/compact", description: "Compact context", category: "Commands" },
  
  // Vim Mode (if enabled)
  { key: "Esc (vim)", description: "Enter normal mode", category: "Vim Mode" },
  { key: "i (vim)", description: "Insert mode", category: "Vim Mode" },
  { key: ": (vim)", description: "Command mode", category: "Vim Mode" },
  { key: "/ (vim)", description: "Search mode", category: "Vim Mode" },
];

/**
 * Format keyboard shortcuts into a displayable panel
 */
export function formatKeyboardShortcuts(): string {
  const lines: string[] = [];
  
  // Header
  const header = chalk.bold.cyan("⌨️  Keyboard Shortcuts");
  const subheader = chalk.dim("Press Escape or ? to close");
  const separator = chalk.gray("─".repeat(50));
  
  lines.push("");
  lines.push(`  ${header}`);
  lines.push(`  ${subheader}`);
  lines.push(`  ${separator}`);
  lines.push("");
  
  // Group by category
  const categories = new Map<string, KeyShortcut[]>();
  for (const shortcut of shortcuts) {
    const category = shortcut.category || "General";
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)!.push(shortcut);
  }
  
  // Display each category
  for (const [category, items] of categories) {
    lines.push(`  ${chalk.bold.yellow(category)}`);
    
    for (const item of items) {
      const key = chalk.cyan(item.key.padEnd(15));
      const desc = chalk.dim(item.description);
      lines.push(`    ${key}  ${desc}`);
    }
    
    lines.push("");
  }
  
  lines.push(`  ${separator}`);
  lines.push("");
  
  return lines.join("\n");
}

/**
 * Create keyboard shortcuts overlay component
 */
export function createKeyboardShortcutsHelp(): string {
  return formatKeyboardShortcuts();
}
