/**
 * Keybinding TUI Commands
 *
 * Slash commands for managing keybindings in the TUI.
 */

import type { ChatLog } from "../components/chat-log.js";
import type { KeyAction, KeyBinding, KeybindProfile } from "./types.js";
import {
  getKeybindingManager,
  loadKeybinds,
  saveKeybinds,
  PROFILES,
  ACTION_DESCRIPTIONS,
} from "./index.js";
import { formatBinding, parseBinding } from "./types.js";

// ============================================================================
// COMMAND HANDLER
// ============================================================================

export interface KeybindCommandContext {
  chatLog: ChatLog;
  args: string[];
}

/**
 * Handle /keybind command
 */
export async function handleKeybindCommand(ctx: KeybindCommandContext): Promise<void> {
  const { chatLog, args } = ctx;
  const manager = getKeybindingManager();

  // No args - show all bindings
  if (args.length === 0) {
    showAllBindings(chatLog, manager);
    return;
  }

  const subcommand = args[0].toLowerCase();

  switch (subcommand) {
    case "list":
    case "ls":
      showAllBindings(chatLog, manager);
      break;

    case "profile":
      handleProfileCommand(chatLog, args.slice(1), manager);
      break;

    case "set":
    case "bind":
      handleBindCommand(chatLog, args.slice(1), manager);
      break;

    case "unset":
    case "unbind":
      handleUnbindCommand(chatLog, args.slice(1), manager);
      break;

    case "reset":
      handleResetCommand(chatLog, args.slice(1), manager);
      break;

    case "search":
    case "find":
      handleSearchCommand(chatLog, args.slice(1), manager);
      break;

    case "export":
      handleExportCommand(chatLog, manager);
      break;

    case "import":
      chatLog.addSystem("Import not yet implemented. Edit ~/.openclaw/keybindings.json directly.");
      break;

    case "save":
      await saveKeybinds(manager);
      chatLog.addSystem("✅ Keybindings saved to ~/.openclaw/keybindings.json");
      break;

    case "reload":
      await loadKeybinds(manager);
      chatLog.addSystem("✅ Keybindings reloaded from config");
      break;

    case "help":
      showHelp(chatLog);
      break;

    default:
      // Try to find action by name
      if (args.length >= 2) {
        handleBindCommand(chatLog, args, manager);
      } else {
        chatLog.addSystem(`Unknown subcommand: ${subcommand}\nType /keybind help for usage.`);
      }
  }
}

// ============================================================================
// SUBCOMMANDS
// ============================================================================

/**
 * Show all keybindings
 */
function showAllBindings(chatLog: ChatLog, manager: ReturnType<typeof getKeybindingManager>): void {
  const bindings = manager.getAll();
  const profile = manager.getActiveProfile();

  let output = `# Keybindings (${profile} profile)\n\n`;

  // Group by context
  const byContext = groupBy(bindings, (b) => b.context || "global");

  for (const [context, ctxBindings] of Array.from(byContext)) {
    output += `## ${context.charAt(0).toUpperCase() + context.slice(1)}\n`;

    for (const binding of ctxBindings) {
      const key = formatBinding(binding);
      output += `  ${key.padEnd(20)} → ${binding.description}\n`;
    }
    output += "\n";
  }

  output += `Total: ${bindings.length} bindings\n`;
  output += `Profile: ${profile}\n`;
  output += `\nType /keybind help for more commands`;

  chatLog.addSystem(output);
}

/**
 * Handle profile subcommand
 */
function handleProfileCommand(
  chatLog: ChatLog,
  args: string[],
  manager: ReturnType<typeof getKeybindingManager>,
): void {
  if (args.length === 0) {
    // List profiles
    const profiles = manager.listProfiles();
    const current = manager.getActiveProfile();

    let output = "# Available Profiles\n\n";
    for (const name of profiles) {
      const profile = PROFILES[name];
      const marker = name === current ? " ✓ (active)" : "";
      output += `  ${name}${marker}\n`;
      if (profile) {
        output += `    ${profile.description}\n`;
      }
    }

    chatLog.addSystem(output);
    return;
  }

  const profileName = args[0].toLowerCase();

  if (!PROFILES[profileName]) {
    chatLog.addSystem(
      `Unknown profile: ${profileName}\nAvailable: ${manager.listProfiles().join(", ")}`,
    );
    return;
  }

  manager.loadProfile(profileName);
  chatLog.addSystem(`✅ Switched to ${profileName} profile`);
}

/**
 * Handle bind subcommand
 */
function handleBindCommand(
  chatLog: ChatLog,
  args: string[],
  manager: ReturnType<typeof getKeybindingManager>,
): void {
  if (args.length < 2) {
    chatLog.addSystem(
      "Usage: /keybind set <key> <action>\nExample: /keybind set ctrl+enter submit",
    );
    return;
  }

  const keyStr = args[0];
  const actionName = args[1];

  // Parse key
  const parsed = parseBinding(keyStr);
  if (!parsed) {
    chatLog.addSystem(`Invalid key format: ${keyStr}\nExample: ctrl+enter, shift+tab, escape`);
    return;
  }

  // Validate action
  if (!ACTION_DESCRIPTIONS[actionName as KeyAction]) {
    const validActions = Object.keys(ACTION_DESCRIPTIONS).slice(0, 20).join(", ");
    chatLog.addSystem(`Unknown action: ${actionName}\nCommon actions: ${validActions}...`);
    return;
  }

  // Create binding
  const binding: KeyBinding = {
    id: `custom-${keyStr.replace(/\+/g, "-")}`,
    key: parsed.key,
    modifiers: parsed.modifiers,
    action: actionName as KeyAction,
    description: ACTION_DESCRIPTIONS[actionName as KeyAction] || actionName,
    context: "global",
  };

  // Remove existing binding for this key
  manager.unregister(parsed.key, parsed.modifiers);

  // Register new binding
  manager.register(binding);

  chatLog.addSystem(`✅ Bound ${formatBinding(binding)} → ${actionName}`);
}

/**
 * Handle unbind subcommand
 */
function handleUnbindCommand(
  chatLog: ChatLog,
  args: string[],
  manager: ReturnType<typeof getKeybindingManager>,
): void {
  if (args.length < 1) {
    chatLog.addSystem("Usage: /keybind unset <key>\nExample: /keybind unset ctrl+enter");
    return;
  }

  const keyStr = args[0];
  const parsed = parseBinding(keyStr);

  if (!parsed) {
    chatLog.addSystem(`Invalid key format: ${keyStr}`);
    return;
  }

  const removed = manager.unregister(parsed.key, parsed.modifiers);

  if (removed) {
    chatLog.addSystem(`✅ Unbound ${keyStr}`);
  } else {
    chatLog.addSystem(`No binding found for ${keyStr}`);
  }
}

/**
 * Handle reset subcommand
 */
function handleResetCommand(
  chatLog: ChatLog,
  args: string[],
  manager: ReturnType<typeof getKeybindingManager>,
): void {
  if (args.length > 0 && args[0] === "all") {
    manager.clear();
    manager.loadDefaults();
    chatLog.addSystem("✅ Reset all keybindings to defaults");
  } else {
    manager.loadProfile(manager.getActiveProfile());
    chatLog.addSystem(`✅ Reset to ${manager.getActiveProfile()} profile defaults`);
  }
}

/**
 * Handle search subcommand
 */
function handleSearchCommand(
  chatLog: ChatLog,
  args: string[],
  manager: ReturnType<typeof getKeybindingManager>,
): void {
  if (args.length === 0) {
    chatLog.addSystem("Usage: /keybind search <query>\nExample: /keybind search history");
    return;
  }

  const query = args.join(" ").toLowerCase();
  const bindings = manager.getAll();

  const matches = bindings.filter(
    (b) =>
      b.action.toLowerCase().includes(query) ||
      b.description.toLowerCase().includes(query) ||
      b.key.toLowerCase().includes(query),
  );

  if (matches.length === 0) {
    chatLog.addSystem(`No bindings found matching "${query}"`);
    return;
  }

  let output = `# Search Results: "${query}"\n\n`;
  for (const binding of matches) {
    output += `  ${formatBinding(binding).padEnd(20)} → ${binding.description}\n`;
  }

  chatLog.addSystem(output);
}

/**
 * Handle export subcommand
 */
function handleExportCommand(
  chatLog: ChatLog,
  manager: ReturnType<typeof getKeybindingManager>,
): void {
  const config = manager.export();
  const json = JSON.stringify(config, null, 2);

  chatLog.addSystem(
    `# Current Config\n\n\`\`\`json\n${json}\n\`\`\`\n\nSaved to ~/.openclaw/keybindings.json`,
  );
}

/**
 * Show help
 */
function showHelp(chatLog: ChatLog): void {
  const help = `
# Keybind Commands

/keybind                  Show all keybindings
/keybind list             Show all keybindings
/keybind profile          List available profiles
/keybind profile <name>   Switch to profile (default, vim, emacs)
/keybind set <key> <action>   Bind a key to an action
/keybind unset <key>      Remove a keybinding
/keybind reset            Reset to profile defaults
/keybind reset all        Reset to factory defaults
/keybind search <query>   Search bindings
/keybind export           Show current config
/keybind save             Save to config file
/keybind reload           Reload from config file

## Examples

/keybind set ctrl+enter submit
/keybind set shift+up scroll-up
/keybind unset ctrl+d
/keybind profile emacs

## Key Format

Keys: a-z, 0-9, enter, escape, tab, space, backspace, delete, up, down, left, right, home, end, pageup, pagedown

Modifiers: ctrl, alt, shift, meta (cmd)

Format: ctrl+c, shift+enter, alt+tab, ctrl+shift+s
`.trim();

  chatLog.addSystem(help);
}

// ============================================================================
// UTILITIES
// ============================================================================

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

/**
 * Get keybind commands for TUI registration
 */
export function getKeybindCommands() {
  return {
    name: "keybind",
    description: "Manage keybindings",
    usage: "/keybind [list|profile|set|unset|reset|search|export|save|reload]",
    handler: handleKeybindCommand,
    aliases: ["keybinds", "keymap", "keys"],
  };
}
