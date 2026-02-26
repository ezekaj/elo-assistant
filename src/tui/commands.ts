import type { SlashCommand } from "@mariozechner/pi-tui";
import type { OpenClawConfig } from "../config/types.js";
import { isPlanRequest, isDeepPlanRequest } from "../agents/plan-mode/auto-plan-detector.js";
import { PERMISSION_MODE_DESCRIPTIONS } from "../agents/plan-mode/permission-mode.js";
// Plan Mode imports
import { isPlanMode, getPlanModeState, setPermissionMode } from "../agents/plan-mode/state.js";
import { listChatCommands, listChatCommandsForConfig } from "../auto-reply/commands-registry.js";
import { formatThinkingLevels, listThinkingLevelLabels } from "../auto-reply/thinking.js";
import { VALID_EFFORT_LEVELS } from "../config/env-vars.effort.js";
import { globalHookExecutor } from "../hooks/executor.js";
// Plugin update imports
import { checkForUpdates } from "../plugins/auto-update.js";
// Streaming imports
import { streamSSE } from "../streaming/sse-client.js";
// Teleport imports
import { getTeleportedSessionInfo } from "../teleport/teleport-state.js";
import { createStreamingDisplay } from "./components/streaming-display.js";

const VERBOSE_LEVELS = ["on", "off"];
const REASONING_LEVELS = ["on", "off"];
const ELEVATED_LEVELS = ["on", "off", "ask", "full"];
const ACTIVATION_LEVELS = ["mention", "always"];
const USAGE_FOOTER_LEVELS = ["off", "tokens", "full"];

// Permission mode levels for completions
const PERMISSION_MODES = ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"];

export type ParsedCommand = {
  name: string;
  args: string;
};

export type SlashCommandOptions = {
  cfg?: OpenClawConfig;
  provider?: string;
  model?: string;
};

const COMMAND_ALIASES: Record<string, string> = {
  elev: "elevated",
  perm: "permission",
  perms: "permission",
  accept: "accept-edits",
  auto: "auto-approve",
};

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.replace(/^\//, "").trim();
  if (!trimmed) {
    return { name: "", args: "" };
  }
  const [name, ...rest] = trimmed.split(/\s+/);
  const normalized = name.toLowerCase();
  return {
    name: COMMAND_ALIASES[normalized] ?? normalized,
    args: rest.join(" ").trim(),
  };
}

export function getSlashCommands(options: SlashCommandOptions = {}): SlashCommand[] {
  const thinkLevels = listThinkingLevelLabels(options.provider, options.model);
  const commands: SlashCommand[] = [
    { name: "help", description: "Show slash command help" },
    { name: "status", description: "Show gateway status summary" },
    { name: "agent", description: "Switch agent (or open picker)" },
    { name: "agents", description: "Open agent picker" },
    { name: "session", description: "Switch session (or open picker)" },
    { name: "sessions", description: "Open session picker" },
    {
      name: "model",
      description: "Set model (or open picker)",
    },
    { name: "models", description: "Open model picker" },
    {
      name: "think",
      description: "Set thinking level",
      getArgumentCompletions: (prefix) =>
        thinkLevels
          .filter((v) => v.startsWith(prefix.toLowerCase()))
          .map((value) => ({ value, label: value })),
    },
    {
      name: "verbose",
      description: "Set verbose on/off",
      getArgumentCompletions: (prefix) =>
        VERBOSE_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    {
      name: "reasoning",
      description: "Set reasoning on/off",
      getArgumentCompletions: (prefix) =>
        REASONING_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    {
      name: "usage",
      description: "Toggle per-response usage line",
      getArgumentCompletions: (prefix) =>
        USAGE_FOOTER_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    {
      name: "elevated",
      description: "Set elevated on/off/ask/full",
      getArgumentCompletions: (prefix) =>
        ELEVATED_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    {
      name: "elev",
      description: "Alias for /elevated",
      getArgumentCompletions: (prefix) =>
        ELEVATED_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    {
      name: "effort",
      description: "Set effort level (low|medium|high|max)",
      getArgumentCompletions: (prefix) =>
        VALID_EFFORT_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    {
      name: "cache",
      description: "Show cache metrics",
    },
    {
      name: "cache-reset",
      description: "Reset cache metrics",
    },
    {
      name: "teleport",
      description: "Resume a session from export file",
      getArgumentCompletions: (prefix) => [
        { value: "<path>", label: "Path to session export file" },
      ],
    },
    {
      name: "export-session",
      description: "Export current session to file",
      getArgumentCompletions: (prefix) => [{ value: "<path>", label: "Output path (optional)" }],
    },
    {
      name: "import-session",
      description: "Import session from export file",
      getArgumentCompletions: (prefix) => [
        { value: "<path>", label: "Path to session export file" },
      ],
    },
    {
      name: "hooks",
      description: "Show active hooks status",
    },
    {
      name: "hooks-status",
      description: "Show detailed hooks status",
    },
    // Permission Mode commands
    {
      name: "permission",
      description: "Set permission mode",
      getArgumentCompletions: (prefix) =>
        PERMISSION_MODES.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: `${value} - ${PERMISSION_MODE_DESCRIPTIONS[value]?.description || ""}`,
        })),
    },
    {
      name: "accept-edits",
      description: "Auto-accept file edits, prompt for commands",
    },
    {
      name: "auto-approve",
      description: "Auto-approve all operations (bypass permissions)",
    },
    {
      name: "enter-plan-mode",
      description: "Enter plan mode (no tool execution)",
    },
    {
      name: "exit-plan-mode",
      description: "Exit plan mode with approval",
    },
    {
      name: "plan-status",
      description: "Show plan mode status",
    },
    // YOLO Mode commands
    {
      name: "yolo",
      description: "Toggle YOLO mode (auto-approve all tools)",
      getArgumentCompletions: (prefix) => [
        { value: "on", label: "Enable YOLO mode" },
        { value: "off", label: "Disable YOLO mode" },
        { value: "status", label: "Check YOLO status" },
        { value: "confirm", label: "Confirm YOLO enablement" },
      ],
    },
    // Vim Mode commands
    {
      name: "vim",
      description: "Toggle Vim mode on/off",
      getArgumentCompletions: (prefix) => [
        { value: "on", label: "Enable Vim mode" },
        { value: "off", label: "Disable Vim mode" },
        { value: "status", label: "Show Vim status" },
      ],
    },
    {
      name: "vim-status",
      description: "Show detailed Vim mode status",
    },
    // File History commands
    {
      name: "checkpoint",
      description: "Create/manage file checkpoints",
      getArgumentCompletions: (prefix) => [
        { value: "create <name>", label: "Create checkpoint" },
        { value: "list", label: "List checkpoints" },
        { value: "restore <name>", label: "Restore checkpoint" },
        { value: "diff <name1> <name2>", label: "Compare checkpoints" },
      ],
    },
    {
      name: "rewind",
      description: "Rewind files to previous state",
    },
    {
      name: "file-history",
      description: "Show file history status",
    },
    // Streaming commands
    {
      name: "stream-test",
      description: "Test streaming functionality",
    },
    {
      name: "teleport",
      description: "Teleport to session from another device",
    },
    {
      name: "teleport-status",
      description: "Show teleport status",
    },
    {
      name: "teleport-complete",
      description: "Complete teleport and restore changes",
    },
    {
      name: "plugins-update",
      description: "Check for plugin updates",
    },
    {
      name: "plugins-update-all",
      description: "Update all plugins",
    },
    {
      name: "activation",
      description: "Set group activation",
      getArgumentCompletions: (prefix) =>
        ACTIVATION_LEVELS.filter((v) => v.startsWith(prefix.toLowerCase())).map((value) => ({
          value,
          label: value,
        })),
    },
    { name: "abort", description: "Abort active run" },
    { name: "new", description: "Reset the session" },
    { name: "reset", description: "Reset the session" },
    { name: "settings", description: "Open settings" },
    { name: "exit", description: "Exit the TUI" },
    { name: "quit", description: "Exit the TUI" },
  ];

  const seen = new Set(commands.map((command) => command.name));
  const gatewayCommands = options.cfg ? listChatCommandsForConfig(options.cfg) : listChatCommands();
  for (const command of gatewayCommands) {
    const aliases = command.textAliases.length > 0 ? command.textAliases : [`/${command.key}`];
    for (const alias of aliases) {
      const name = alias.replace(/^\//, "").trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      commands.push({ name, description: command.description });
    }
  }

  return commands;
}

export function helpText(options: SlashCommandOptions = {}): string {
  const thinkLevels = formatThinkingLevels(options.provider, options.model, "|");
  const hookCount = globalHookExecutor.getHooks().length;

  // Get teleport status
  const teleportInfo = getTeleportedSessionInfo();
  const teleportStatus = teleportInfo?.isTeleported
    ? ` (teleported from ${teleportInfo.sessionId})`
    : "";

  // Get current permission mode
  const permState = getPlanModeState();
  const permMode = permState.currentMode;
  const permDesc = PERMISSION_MODE_DESCRIPTIONS[permMode];
  const permStatus = permDesc ? ` (${permDesc.symbol} ${permDesc.name})` : "";

  return [
    "Slash commands:",
    "/help",
    "/commands",
    "/status",
    "/agent <id> (or /agents)",
    "/session <key> (or /sessions)",
    "/model <provider/model> (or /models)",
    `/think <${thinkLevels}>`,
    "/verbose <on|off>",
    "/reasoning <on|off>",
    "/usage <off|tokens|full>",
    "/elevated <on|off|ask|full>",
    "/elev <on|off|ask|full>",
    "/effort <low|medium|high|max>",
    "",
    "# Permission modes:",
    "/permission <default|acceptEdits|bypassPermissions|plan|dontAsk>",
    "/accept-edits        # Auto-accept file edits, prompt for commands",
    "/auto-approve        # Auto-approve everything (bypass)",
    "/enter-plan-mode     # Read-only, no execution",
    "/exit-plan-mode      # Return to default mode",
    "/plan-status         # Show current mode",
    "",
    "# Other:",
    "/hooks",
    "/hooks-status",
    "/checkpoint create|list|restore|diff",
    "/rewind <message-id>",
    "/file-history",
    "/teleport <session-id>",
    "/teleport-status",
    "/teleport-complete",
    "/plugins-update",
    "/plugins-update-all",
    "/activation <mention|always>",
    "/new or /reset",
    "/abort",
    "/settings",
    "/exit",
    "",
    `Active hooks: ${hookCount}${teleportStatus}`,
    `Permission mode: ${permMode}${permStatus}`,
  ].join("\n");
}
