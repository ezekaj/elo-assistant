import type { Component, TUI } from "@mariozechner/pi-tui";
import { randomUUID } from "node:crypto";
import type { SessionsPatchResult } from "../gateway/protocol/index.js";
import type { ChatLog } from "./components/chat-log.js";
import type { GatewayChatClient } from "./gateway-chat.js";
import type {
  AgentSummary,
  GatewayStatusSummary,
  TuiOptions,
  TuiStateAccess,
} from "./tui-types.js";
import { PERMISSION_MODE_DESCRIPTIONS } from "../agents/plan-mode/permission-mode.js";
// Plan Mode imports
import { isPlanMode, getPlanModeState, setPermissionMode } from "../agents/plan-mode/state.js";
import { getYoloModeManager, isYoloModeActive, YOLO_WARNING } from "../agents/yolo-mode/index.js";
import {
  formatThinkingLevels,
  normalizeUsageDisplay,
  resolveResponseUsageMode,
} from "../auto-reply/thinking.js";
import { globalHookExecutor } from "../hooks/executor.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { formatRelativeTime } from "../utils/time-format.js";
import { helpText, parseCommand } from "./commands.js";
import {
  createFilterableSelectList,
  createSearchableSelectList,
  createSettingsList,
} from "./components/selectors.js";
import { createStreamingDisplay, streamSSE } from "./components/streaming-display.js";
import { formatStatusSummary } from "./tui-status-summary.js";
import {
  isVimModeEnabled,
  getCurrentVimMode,
  toggleVimMode,
  getVimState,
  setVimModeEnabled,
} from "./vim-mode/vim-state.js";

type CommandHandlerContext = {
  client: GatewayChatClient;
  chatLog: ChatLog;
  tui: TUI;
  opts: TuiOptions;
  state: TuiStateAccess;
  deliverDefault: boolean;
  openOverlay: (component: Component) => void;
  closeOverlay: () => void;
  refreshSessionInfo: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setSession: (key: string) => Promise<void>;
  refreshAgents: () => Promise<void>;
  abortActive: () => Promise<void>;
  setActivityStatus: (text: string) => void;
  formatSessionKey: (key: string) => string;
  applySessionInfoFromPatch: (result: SessionsPatchResult) => void;
  noteLocalRunId: (runId: string) => void;
  forgetLocalRunId?: (runId: string) => void;
};

export function createCommandHandlers(context: CommandHandlerContext) {
  const {
    client,
    chatLog,
    tui,
    opts,
    state,
    deliverDefault,
    openOverlay,
    closeOverlay,
    refreshSessionInfo,
    loadHistory,
    setSession,
    refreshAgents,
    abortActive,
    setActivityStatus,
    formatSessionKey,
    applySessionInfoFromPatch,
    noteLocalRunId,
    forgetLocalRunId,
  } = context;

  const setAgent = async (id: string) => {
    state.currentAgentId = normalizeAgentId(id);
    await setSession("");
  };

  const openModelSelector = async () => {
    try {
      const models = await client.listModels();
      if (models.length === 0) {
        chatLog.addSystem("no models available");
        tui.requestRender();
        return;
      }
      const items = models.map((model) => ({
        value: `${model.provider}/${model.id}`,
        label: `${model.provider}/${model.id}`,
        description: model.name && model.name !== model.id ? model.name : "",
      }));
      const selector = createSearchableSelectList(items, 9);
      selector.onSelect = (item) => {
        void (async () => {
          try {
            const result = await client.patchSession({
              key: state.currentSessionKey,
              model: item.value,
            });
            chatLog.addSystem(`model set to ${item.value}`);
            applySessionInfoFromPatch(result);
            await refreshSessionInfo();
          } catch (err) {
            chatLog.addSystem(`model set failed: ${String(err)}`);
          }
          closeOverlay();
          tui.requestRender();
        })();
      };
      selector.onCancel = () => {
        closeOverlay();
        tui.requestRender();
      };
      openOverlay(selector);
      tui.requestRender();
    } catch (err) {
      chatLog.addSystem(`model list failed: ${String(err)}`);
      tui.requestRender();
    }
  };

  const openAgentSelector = async () => {
    await refreshAgents();
    if (state.agents.length === 0) {
      chatLog.addSystem("no agents found");
      tui.requestRender();
      return;
    }
    const items = state.agents.map((agent: AgentSummary) => ({
      value: agent.id,
      label: agent.name ? `${agent.id} (${agent.name})` : agent.id,
      description: agent.id === state.agentDefaultId ? "default" : "",
    }));
    const selector = createSearchableSelectList(items, 9);
    selector.onSelect = (item) => {
      void (async () => {
        closeOverlay();
        await setAgent(item.value);
        tui.requestRender();
      })();
    };
    selector.onCancel = () => {
      closeOverlay();
      tui.requestRender();
    };
    openOverlay(selector);
    tui.requestRender();
  };

  const openSessionSelector = async () => {
    try {
      const result = await client.listSessions({
        includeGlobal: false,
        includeUnknown: false,
        includeDerivedTitles: true,
        includeLastMessage: true,
        agentId: state.currentAgentId,
      });
      const items = result.sessions.map((session) => {
        const title = session.derivedTitle ?? session.displayName;
        const formattedKey = formatSessionKey(session.key);
        // Avoid redundant "title (key)" when title matches key
        const label = title && title !== formattedKey ? `${title} (${formattedKey})` : formattedKey;
        // Build description: time + message preview
        const timePart = session.updatedAt ? formatRelativeTime(session.updatedAt) : "";
        const preview = session.lastMessagePreview?.replace(/\s+/g, " ").trim();
        const description =
          timePart && preview ? `${timePart} · ${preview}` : (preview ?? timePart);
        return {
          value: session.key,
          label,
          description,
          searchText: [
            session.displayName,
            session.label,
            session.subject,
            session.sessionId,
            session.key,
            session.lastMessagePreview,
          ]
            .filter(Boolean)
            .join(" "),
        };
      });
      const selector = createFilterableSelectList(items, 9);
      selector.onSelect = (item) => {
        void (async () => {
          closeOverlay();
          await setSession(item.value);
          tui.requestRender();
        })();
      };
      selector.onCancel = () => {
        closeOverlay();
        tui.requestRender();
      };
      openOverlay(selector);
      tui.requestRender();
    } catch (err) {
      chatLog.addSystem(`sessions list failed: ${String(err)}`);
      tui.requestRender();
    }
  };

  const openSettings = () => {
    const items = [
      {
        id: "tools",
        label: "Tool output",
        currentValue: state.toolsExpanded ? "expanded" : "collapsed",
        values: ["collapsed", "expanded"],
      },
      {
        id: "thinking",
        label: "Show thinking",
        currentValue: state.showThinking ? "on" : "off",
        values: ["off", "on"],
      },
    ];
    const settings = createSettingsList(
      items,
      (id, value) => {
        if (id === "tools") {
          state.toolsExpanded = value === "expanded";
          chatLog.setToolsExpanded(state.toolsExpanded);
        }
        if (id === "thinking") {
          state.showThinking = value === "on";
          void loadHistory();
        }
        tui.requestRender();
      },
      () => {
        closeOverlay();
        tui.requestRender();
      },
    );
    openOverlay(settings);
    tui.requestRender();
  };

  const handleCommand = async (raw: string) => {
    const { name, args } = parseCommand(raw);
    if (!name) {
      return;
    }

    // FIX: Detect if this looks like a file path or normal text, not a command
    // If the "command" contains slashes and doesn't match known commands, treat as message
    const knownCommands = [
      "help",
      "status",
      "agent",
      "agents",
      "session",
      "sessions",
      "model",
      "models",
      "think",
      "thinking",
      "verbose",
      "reasoning",
      "elevated",
      "elev",
      "usage",
      "activation",
      "tools",
      "expand",
      "collapse",
      "memory",
      "compact",
      "context",
      "clear",
      "reset",
      "title",
      "rename",
      "delete",
      "remove",
      "list",
      "show",
      "set",
      "get",
      "save",
      "load",
      "export",
      "import",
      "config",
      "settings",
      "hooks",
      "hooks-status",
      "enter-plan-mode",
      "exit-plan-mode",
      "plan-status",
      "teleport",
      "teleport-status",
      "teleport-complete",
      "plugins-update",
      "plugins-update-all",
      "keybind",
      "keybinds",
      "keymap",
      "keys",
      "vim",
      "vim-status",
    ];

    // If name contains path separators or looks like a path, send as message
    if (name.includes("/") || name.includes("\\") || name.includes(".")) {
      // This looks like a file path (e.g., "/Users/..." or "./file.txt")
      // Send as normal message instead of command
      await sendMessage(raw);
      return;
    }

    // If name doesn't match known commands, send as message
    if (!knownCommands.includes(name)) {
      await sendMessage(raw);
      return;
    }

    switch (name) {
      case "help":
        chatLog.addSystem(
          helpText({
            provider: state.sessionInfo.modelProvider,
            model: state.sessionInfo.model,
          }),
        );
        break;
      case "status":
        try {
          const status = await client.getStatus();
          if (typeof status === "string") {
            chatLog.addSystem(status);
            break;
          }
          if (status && typeof status === "object") {
            const lines = formatStatusSummary(status as GatewayStatusSummary);
            for (const line of lines) {
              chatLog.addSystem(line);
            }
            break;
          }
          chatLog.addSystem("status: unknown response");
        } catch (err) {
          chatLog.addSystem(`status failed: ${String(err)}`);
        }
        break;
      case "agent":
        if (!args) {
          await openAgentSelector();
        } else {
          await setAgent(args);
        }
        break;
      case "agents":
        await openAgentSelector();
        break;
      case "session":
        if (!args) {
          await openSessionSelector();
        } else {
          await setSession(args);
        }
        break;
      case "sessions":
        await openSessionSelector();
        break;
      case "model":
        if (!args) {
          await openModelSelector();
        } else {
          try {
            const result = await client.patchSession({
              key: state.currentSessionKey,
              model: args,
            });
            chatLog.addSystem(`model set to ${args}`);
            applySessionInfoFromPatch(result);
            await refreshSessionInfo();
          } catch (err) {
            chatLog.addSystem(`model set failed: ${String(err)}`);
          }
        }
        break;
      case "models":
        await openModelSelector();
        break;
      case "think":
        if (!args) {
          const levels = formatThinkingLevels(
            state.sessionInfo.modelProvider,
            state.sessionInfo.model,
            "|",
          );
          chatLog.addSystem(`usage: /think <${levels}>`);
          break;
        }
        try {
          const result = await client.patchSession({
            key: state.currentSessionKey,
            thinkingLevel: args,
          });
          chatLog.addSystem(`thinking set to ${args}`);
          applySessionInfoFromPatch(result);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`think failed: ${String(err)}`);
        }
        break;
      case "verbose":
        if (!args) {
          chatLog.addSystem("usage: /verbose <on|off>");
          break;
        }
        try {
          const result = await client.patchSession({
            key: state.currentSessionKey,
            verboseLevel: args,
          });
          chatLog.addSystem(`verbose set to ${args}`);
          applySessionInfoFromPatch(result);
          await loadHistory();
        } catch (err) {
          chatLog.addSystem(`verbose failed: ${String(err)}`);
        }
        break;
      case "reasoning":
        if (!args) {
          chatLog.addSystem("usage: /reasoning <on|off>");
          break;
        }
        try {
          const result = await client.patchSession({
            key: state.currentSessionKey,
            reasoningLevel: args,
          });
          chatLog.addSystem(`reasoning set to ${args}`);
          applySessionInfoFromPatch(result);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`reasoning failed: ${String(err)}`);
        }
        break;
      case "usage": {
        const normalized = args ? normalizeUsageDisplay(args) : undefined;
        if (args && !normalized) {
          chatLog.addSystem("usage: /usage <off|tokens|full>");
          break;
        }
        const currentRaw = state.sessionInfo.responseUsage;
        const current = resolveResponseUsageMode(currentRaw);
        const next =
          normalized ?? (current === "off" ? "tokens" : current === "tokens" ? "full" : "off");
        try {
          const result = await client.patchSession({
            key: state.currentSessionKey,
            responseUsage: next === "off" ? null : next,
          });
          chatLog.addSystem(`usage footer: ${next}`);
          applySessionInfoFromPatch(result);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`usage failed: ${String(err)}`);
        }
        break;
      }
      case "elevated":
        if (!args) {
          chatLog.addSystem("usage: /elevated <on|off|ask|full>");
          break;
        }
        if (!["on", "off", "ask", "full"].includes(args)) {
          chatLog.addSystem("usage: /elevated <on|off|ask|full>");
          break;
        }
        try {
          const result = await client.patchSession({
            key: state.currentSessionKey,
            elevatedLevel: args,
          });
          chatLog.addSystem(`elevated set to ${args}`);
          applySessionInfoFromPatch(result);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`elevated failed: ${String(err)}`);
        }
        break;
      case "activation":
        if (!args) {
          chatLog.addSystem("usage: /activation <mention|always>");
          break;
        }
        try {
          const result = await client.patchSession({
            key: state.currentSessionKey,
            groupActivation: args === "always" ? "always" : "mention",
          });
          chatLog.addSystem(`activation set to ${args}`);
          applySessionInfoFromPatch(result);
          await refreshSessionInfo();
        } catch (err) {
          chatLog.addSystem(`activation failed: ${String(err)}`);
        }
        break;

      case "hooks":
        {
          const hooks = globalHookExecutor.getHooks();
          if (hooks.length === 0) {
            chatLog.addSystem("No hooks configured");
          } else {
            chatLog.addSystem(`Active hooks: ${hooks.length}`);
            for (const hook of hooks.slice(0, 10)) {
              chatLog.addSystem(`  - ${hook.event}: ${hook.hooks.length} hook(s)`);
            }
            if (hooks.length > 10) {
              chatLog.addSystem(`  ... and ${hooks.length - 10} more`);
            }
          }
        }
        break;

      case "hooks-status":
        {
          const hooks = globalHookExecutor.getHooks();
          const byEvent: Record<string, number> = {};
          for (const hook of hooks) {
            byEvent[hook.event] = (byEvent[hook.event] || 0) + hook.hooks.length;
          }
          chatLog.addSystem("Hooks status by event:");
          for (const [event, count] of Object.entries(byEvent)) {
            chatLog.addSystem(`  ${event}: ${count} hook(s)`);
          }
          if (hooks.length === 0) {
            chatLog.addSystem("  (no hooks configured)");
          }
        }
        break;

      case "new":
      case "reset":
        try {
          // Clear token counts immediately to avoid stale display (#1523)
          state.sessionInfo.inputTokens = null;
          state.sessionInfo.outputTokens = null;
          state.sessionInfo.totalTokens = null;
          tui.requestRender();

          await client.resetSession(state.currentSessionKey);
          chatLog.addSystem(`session ${state.currentSessionKey} reset`);
          await loadHistory();
        } catch (err) {
          chatLog.addSystem(`reset failed: ${String(err)}`);
        }
        break;
      case "abort":
        await abortActive();
        break;
      case "cache":
        // Show cache metrics
        const { getCacheMetricsTracker } = await import("../agents/cache-metrics-tracker.js");
        const tracker = getCacheMetricsTracker();
        const metrics = tracker.getMetrics("claude");
        chatLog.addSystem(
          `Cache Metrics:\n` +
            `  Hit Rate: ${(metrics.hitRate * 100).toFixed(1)}%\n` +
            `  Read Tokens: ${metrics.cacheReadTokens.toLocaleString()}\n` +
            `  Creation Tokens: ${metrics.cacheCreationTokens.toLocaleString()}\n` +
            `  Input Tokens: ${metrics.inputTokens.toLocaleString()}\n` +
            `  Total Tokens: ${tracker.getTotalTokens().toLocaleString()}\n` +
            `  Requests: ${tracker.getRequestCount()}\n` +
            `  Savings: $${metrics.estimatedSavings.toFixed(4)}`,
        );
        break;
      case "cache-reset":
        // Reset cache metrics
        const { getCacheMetricsTracker: getTracker } =
          await import("../agents/cache-metrics-tracker.js");
        const trackerReset = getTracker();
        trackerReset.reset();
        chatLog.addSystem("Cache metrics reset");
        break;
      case "teleport":
      case "import-session": {
        // Import/teleport session from file
        const { getSessionTeleportManager } = await import("../agents/session-teleport-manager.js");
        const manager = getSessionTeleportManager();

        if (!args) {
          chatLog.addSystem("usage: /teleport <path-to-session-export.json>");
          break;
        }

        try {
          // Import session
          const exportData = await manager.importSession(args);

          // Validate git repo
          const validation = await manager.validateGitRepo(exportData);
          if (validation.status === "repo_mismatch") {
            chatLog.addSystem(
              `Git repository mismatch!\n` +
                `Session is from: ${validation.sessionRepo?.url}\n` +
                `Current repo: ${validation.currentRepo?.url}\n` +
                `Please cd to the correct repository.`,
            );
            break;
          }

          // Set teleported session info
          manager.setTeleportedSessionInfo({
            isTeleported: true,
            sessionId: exportData.sessionId,
            hasLoggedFirstMessage: false,
          });

          // Load session (this would need to be implemented based on your session management)
          // For now, just show success message
          chatLog.addSystem(
            `Session imported successfully!\n` +
              `Session ID: ${exportData.sessionId}\n` +
              `Messages: ${exportData.metadata.messageCount}\n` +
              `Git repo: ${exportData.gitRepo?.url || "N/A"}\n` +
              `Exported: ${new Date(exportData.exportedAt).toLocaleString()}`,
          );

          // Update footer to show teleport status
          updateFooter();
        } catch (error: any) {
          chatLog.addSystem(`Import failed: ${error.message}`);
        }
        break;
      }
      case "export-session": {
        // Export current session to file
        const { getSessionTeleportManager } = await import("../agents/session-teleport-manager.js");
        const manager = getSessionTeleportManager();

        try {
          // Get current session info (this would need to be implemented based on your session management)
          // For now, just show placeholder message
          chatLog.addSystem(
            `Session export is ready!\n` +
              `Usage: /export-session [output-path]\n` +
              `Example: /export-session ./my-session.json\n` +
              `\n` +
              `Note: Full session export requires session management integration.`,
          );
        } catch (error: any) {
          chatLog.addSystem(`Export failed: ${error.message}`);
        }
        break;
      }

      case "teleport-status": {
        // Show teleport status
        const { getTeleportedSessionInfo } = await import("../teleport/teleport-state.js");
        const info = getTeleportedSessionInfo();

        if (info?.isTeleported) {
          chatLog.addSystem(
            `Session Teleport Status:\n` +
              `  Session: ${info.sessionId}\n` +
              `  Branch: ${info.branch || "N/A"}\n` +
              `  Teleported: ${info.teleportedAt?.toLocaleString() || "N/A"}\n` +
              `  First Message Logged: ${info.hasLoggedFirstMessage}`,
          );
        } else {
          chatLog.addSystem("Not a teleported session");
        }
        break;
      }

      case "teleport-complete": {
        // Complete teleport and restore stashed changes
        const { completeTeleport } = await import("../teleport/teleport-executor.js");
        await completeTeleport();
        chatLog.addSystem("✅ Teleport completed, changes restored");
        updateFooter();
        break;
      }

      // Plan Mode commands
      case "enter-plan-mode": {
        setPermissionMode("plan");
        chatLog.addSystem(
          "✅ Entered plan mode. Write tools blocked. Use exit-plan-mode when ready for approval.",
        );
        updateFooter();
        break;
      }

      case "exit-plan-mode": {
        setPermissionMode("default");
        chatLog.addSystem("✅ Exited plan mode. Tools unblocked.");
        updateFooter();
        break;
      }

      case "plan-status": {
        const state = getPlanModeState();
        const desc = PERMISSION_MODE_DESCRIPTIONS[state.currentMode];
        chatLog.addSystem(
          `Permission Mode Status:\n` +
            `  Mode: ${state.currentMode}${desc?.symbol ? ` (${desc.symbol})` : ""}\n` +
            `  Description: ${desc?.description || "N/A"}\n` +
            `  Has Exited Plan: ${state.hasExitedPlanMode}\n` +
            `  Awaiting Approval: ${state.awaitingPlanApproval}\n` +
            `  Approved Domains: ${state.approvedDomains.join(", ") || "none"}`,
        );
        break;
      }

      // YOLO Mode commands
      case "yolo": {
        const yoloManager = getYoloModeManager();
        const action = parsed.args.toLowerCase().trim() || "toggle";

        if (action === "on" || action === "enable") {
          // Request enable (shows warning)
          const result = yoloManager.requestEnable();

          if (result.requiresConfirmation && result.warning) {
            chatLog.addSystem(result.warning);
            chatLog.addSystem("");
            chatLog.addSystem('Type "/yolo confirm" to enable, or any other command to cancel.');
          } else if (result.requiresConfirmation === false) {
            // Already enabled or no warning needed
            chatLog.addSystem(yoloManager.getStatus());
          }
        } else if (action === "confirm") {
          // Confirm enablement
          const result = yoloManager.confirmEnable();
          chatLog.addSystem(result.message);
          if (result.success) {
            chatLog.addSystem("");
            chatLog.addSystem("⚠️  All tool calls will now be auto-approved.");
            chatLog.addSystem('⚠️  Use "/yolo off" to disable.');
          }
        } else if (action === "off" || action === "disable") {
          // Disable YOLO mode
          const result = yoloManager.disableYolo();
          chatLog.addSystem(result.message);
        } else if (action === "status") {
          // Show status
          chatLog.addSystem(yoloManager.getStatus());
        } else {
          // Toggle
          const result = yoloManager.toggleYolo();
          if (result.message) {
            chatLog.addSystem(result.message);
          }
          if (result.requiresConfirmation && result.warning) {
            chatLog.addSystem(result.warning);
          }
        }

        updateFooter();
        break;
      }

      // Vim Mode commands
      case "vim": {
        const subcommand = parsed.args?.toLowerCase().trim();

        if (subcommand === "on" || subcommand === "enable") {
          setVimModeEnabled(true);
          chatLog.addSystem(
            "✅ Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes.",
          );
        } else if (subcommand === "off" || subcommand === "disable") {
          setVimModeEnabled(false);
          chatLog.addSystem("✅ Vim mode DISABLED. Using standard keyboard bindings.");
        } else {
          // Toggle
          const enabled = toggleVimMode();
          if (enabled) {
            chatLog.addSystem(
              "✅ Vim mode ENABLED. Press Escape to toggle between INSERT and NORMAL modes.",
            );
          } else {
            chatLog.addSystem("✅ Vim mode DISABLED. Using standard keyboard bindings.");
          }
        }
        updateFooter();
        break;
      }

      case "keybind":
      case "keybinds":
      case "keymap":
      case "keys": {
        const { handleKeybindCommand } = await import("./keybinds/commands.js");
        const cmdArgs = parsed.args ? parsed.args.split(/\s+/) : [];
        await handleKeybindCommand({ chatLog, args: cmdArgs });
        break;
      }

      case "vim-status": {
        const enabled = isVimModeEnabled();
        const mode = getCurrentVimMode();
        const state = getVimState();

        if (!enabled) {
          chatLog.addSystem("Vim mode is DISABLED\nUse /vim to enable.");
        } else {
          chatLog.addSystem(
            `Vim Mode Status:\n` +
              `  Enabled: Yes\n` +
              `  Current Mode: ${mode}\n` +
              `  Pending Operator: ${state.pendingOperator || "none"}\n` +
              `\n` +
              `NORMAL mode keys:\n` +
              `  h/j/k/l - Move cursor\n` +
              `  w/b/e   - Word movement\n` +
              `  0/$     - Line start/end\n` +
              `  i/a/I/A - Enter INSERT mode\n` +
              `  o/O     - Open line\n` +
              `  v       - Visual mode\n` +
              `  x/dd    - Delete\n` +
              `  Escape  - Toggle INSERT/NORMAL`,
          );
        }
        break;
      }

      // Permission Mode commands (works with ANY model)
      case "permission": {
        const modeArg = parsed.args.toLowerCase().trim();
        if (!modeArg) {
          // Show current mode
          const state = getPlanModeState();
          const desc = PERMISSION_MODE_DESCRIPTIONS[state.currentMode];
          chatLog.addSystem(
            `Current mode: ${state.currentMode}\n` +
              `Description: ${desc?.description || "N/A"}\n\n` +
              `Available modes:\n` +
              Object.entries(PERMISSION_MODE_DESCRIPTIONS)
                .map(([k, v]) => `  ${k.padEnd(20)} - ${v.description}`)
                .join("\n"),
          );
          break;
        }

        // Validate mode
        const validModes = Object.keys(PERMISSION_MODE_DESCRIPTIONS);
        if (!validModes.includes(modeArg)) {
          chatLog.addSystem(`Invalid mode: ${modeArg}\n` + `Valid modes: ${validModes.join(", ")}`);
          break;
        }

        setPermissionMode(modeArg as any);
        const newDesc = PERMISSION_MODE_DESCRIPTIONS[modeArg];
        chatLog.addSystem(
          `✅ Permission mode set to: ${modeArg}\n` + `${newDesc.symbol} ${newDesc.description}`,
        );
        updateFooter();
        break;
      }

      case "accept-edits": {
        setPermissionMode("acceptEdits");
        const desc = PERMISSION_MODE_DESCRIPTIONS.acceptEdits;
        chatLog.addSystem(
          `✅ Accept Edits mode enabled\n` +
            `${desc.symbol} ${desc.description}\n\n` +
            `File edits (Write, Edit, NotebookEdit) will be auto-approved.\n` +
            `Destructive operations (Bash, etc.) will still prompt.`,
        );
        updateFooter();
        break;
      }

      case "auto-approve": {
        setPermissionMode("bypassPermissions");
        const desc = PERMISSION_MODE_DESCRIPTIONS.bypassPermissions;
        chatLog.addSystem(
          `⚠️ Auto-approve mode enabled\n` +
            `${desc.symbol} ${desc.description}\n\n` +
            `ALL operations will be auto-approved without prompting.\n` +
            `Use with caution!`,
        );
        updateFooter();
        break;
      }

      case "stream-test": {
        chatLog.addSystem("📡 Testing streaming...\n");

        const display = createStreamingDisplay();

        // Simulate streaming tokens
        const tokens = ["Hello", " ", "world", "!", " ", "This", " ", "is", " ", "streaming", "."];

        for (const token of tokens) {
          display.handleEvent({
            type: "token",
            data: { content: token, tokenCount: 1 },
            timestamp: Date.now(),
            sequence: 0,
          });

          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        display.handleEvent({
          type: "done",
          data: null,
          timestamp: Date.now(),
          sequence: 0,
        });

        chatLog.addSystem("\n✅ Streaming test complete");
        break;
      }

      case "plugins-update": {
        // Check for plugin updates
        chatLog.addSystem("Checking for plugin updates...");

        const { getUpdateSummary } = await import("../plugins/auto-update.js");
        const summary = await getUpdateSummary();
        chatLog.addSystem(summary);
        break;
      }

      case "plugins-update-all": {
        // Update all plugins
        chatLog.addSystem("Updating all plugins...");

        const { updateAllPlugins } = await import("../plugins/auto-update.js");
        const result = await updateAllPlugins();

        chatLog.addSystem(`✅ Updated: ${result.updated}`);
        if (result.failed > 0) {
          chatLog.addSystem(`❌ Failed: ${result.failed}`);
          for (const error of result.errors) {
            chatLog.addSystem(`  - ${error}`);
          }
        }
        break;
      }

      case "settings":
        openSettings();
        break;
      case "exit":
      case "quit":
        client.stop();
        tui.stop();
        process.exit(0);
        break;
      default:
        await sendMessage(raw);
        break;
    }
    tui.requestRender();
  };

  // MESSAGE QUEUE: Prevent messages from being lost when sent while another is pending
  const messageQueue: string[] = [];
  let isSending = false;

  const processMessageQueue = async () => {
    // If already sending, just queue it - will be processed when current finishes
    if (isSending) {
      return;
    }

    // Process queue one message at a time
    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      if (message) {
        isSending = true;
        await sendMessageInternal(message);
        isSending = false;
        // Loop continues if more messages in queue
      }
    }
  };

  const sendMessageInternal = async (text: string) => {
    try {
      chatLog.addUser(text);
      tui.requestRender();
      const runId = randomUUID();
      noteLocalRunId(runId);
      state.activeChatRunId = runId;
      setActivityStatus("sending");
      await client.sendChat({
        sessionKey: state.currentSessionKey,
        message: text,
        thinking: opts.thinking,
        deliver: deliverDefault,
        timeoutMs: opts.timeoutMs,
        runId,
      });
      setActivityStatus("waiting");
    } catch (err) {
      if (state.activeChatRunId) {
        forgetLocalRunId?.(state.activeChatRunId);
      }
      state.activeChatRunId = null;
      chatLog.addSystem(`send failed: ${String(err)}`);
      setActivityStatus("error");
    } finally {
      isSending = false;
      // Process any remaining messages in queue
      if (messageQueue.length > 0) {
        queueMicrotask(processMessageQueue);
      }
    }
    tui.requestRender();
  };

  const sendMessage = async (text: string) => {
    // Add to queue and process
    messageQueue.push(text);
    // Use queueMicrotask to ensure this runs after current call stack
    queueMicrotask(processMessageQueue);
  };

  return {
    handleCommand,
    sendMessage,
    openModelSelector,
    openAgentSelector,
    openSessionSelector,
    openSettings,
    setAgent,
  };
}
