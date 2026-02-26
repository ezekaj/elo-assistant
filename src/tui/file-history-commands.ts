import type { SlashCommand } from "@mariozechner/pi-tui";
import { getFileHistoryManager } from "../agents/file-history/index.js";

/**
 * Create file history checkpoint command
 */
export function createCheckpointCommand(): SlashCommand {
  return {
    name: "checkpoint",
    description: "Create a named checkpoint for files",
    getArgumentCompletions: (prefix) => [
      { value: "create <name>", label: "Create checkpoint with name" },
      { value: "list", label: "List all checkpoints" },
      { value: "restore <name>", label: "Restore to checkpoint" },
      { value: "diff <name1> <name2>", label: "Compare two checkpoints" },
    ],
    async handler(args) {
      const parts = args?.trim().split(/\s+/) || [];
      const subcommand = parts[0]?.toLowerCase();

      try {
        const fileHistory = getFileHistoryManager(process.cwd());

        if (subcommand === "create") {
          const name = parts[1] || `checkpoint-${Date.now()}`;
          const snapshot = await fileHistory.createSnapshot(`checkpoint:${name}`, {
            name,
            force: true,
          });
          if (snapshot) {
            return {
              success: true,
              message: `✅ Checkpoint '${name}' created with ${snapshot.files.size} files`,
            };
          }
          return {
            success: false,
            message: "❌ Failed to create checkpoint (no files tracked)",
          };
        }

        if (subcommand === "list") {
          const snapshots = fileHistory.getSnapshots();
          if (snapshots.length === 0) {
            return {
              success: true,
              message: "No checkpoints found",
            };
          }

          const list = snapshots
            .map(
              (s) =>
                `  ${s.name || s.id} - ${new Date(s.timestamp).toLocaleString()} (${s.files.size} files)`,
            )
            .join("\n");

          return {
            success: true,
            message: `Checkpoints:\n${list}`,
          };
        }

        if (subcommand === "restore") {
          const name = parts[1];
          if (!name) {
            return {
              success: false,
              message: "Usage: /checkpoint restore <name>",
            };
          }

          const result = await fileHistory.rewindToSnapshot(name);
          if (result.success) {
            return {
              success: true,
              message: `✅ Restored ${result.restoredFiles.length} files from checkpoint '${name}'`,
            };
          } else {
            return {
              success: false,
              message: `❌ Failed to restore: ${result.error}`,
            };
          }
        }

        if (subcommand === "diff") {
          const name1 = parts[1];
          const name2 = parts[2];
          if (!name1 || !name2) {
            return {
              success: false,
              message: "Usage: /checkpoint diff <name1> <name2>",
            };
          }

          const diff = fileHistory.compareSnapshots(name1, name2);
          if (!diff) {
            return {
              success: false,
              message: "One or both checkpoints not found",
            };
          }

          let output = `Diff: ${name1} → ${name2}\n\n`;
          if (diff.added.length > 0) {
            output += `Added (${diff.added.length}):\n  ${diff.added.join("\n  ")}\n\n`;
          }
          if (diff.removed.length > 0) {
            output += `Removed (${diff.removed.length}):\n  ${diff.removed.join("\n  ")}\n\n`;
          }
          if (diff.modified.length > 0) {
            output += `Modified (${diff.modified.length}):\n  ${diff.modified.map((m) => m.path).join("\n  ")}\n`;
          }

          return {
            success: true,
            message: output || "No changes",
          };
        }

        return {
          success: false,
          message: "Usage: /checkpoint <create|list|restore|diff> [args]",
        };
      } catch (error) {
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create rewind command
 */
export function createRewindCommand(): SlashCommand {
  return {
    name: "rewind",
    description: "Rewind files to a previous state",
    getArgumentCompletions: (prefix) => [
      { value: "<message-id>", label: "Message ID to rewind to" },
    ],
    async handler(args) {
      const messageId = args?.trim();

      if (!messageId) {
        return {
          success: false,
          message: "Usage: /rewind <message-id>",
        };
      }

      try {
        const fileHistory = getFileHistoryManager(process.cwd());
        const result = await fileHistory.rewindToSnapshot(messageId);

        if (result.success && result.snapshot) {
          const snapshotName = result.snapshot.name || result.snapshot.id;
          return {
            success: true,
            message: `✅ Rewound ${result.restoredFiles.length} files to state at '${snapshotName}'`,
          };
        } else {
          return {
            success: false,
            message: `❌ Failed to rewind: ${result.error}`,
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/**
 * Create file history status command
 */
export function createFileHistoryStatusCommand(): SlashCommand {
  return {
    name: "file-history",
    description: "Show file history status",
    async handler() {
      try {
        const fileHistory = getFileHistoryManager(process.cwd());
        const state = fileHistory.getState();

        return {
          success: true,
          message:
            `File History Status:\n` +
            `  Tracked files: ${state.trackedFiles.size}\n` +
            `  Snapshots: ${state.snapshots.length}\n` +
            `  Max snapshots: ${state.maxSnapshots}\n` +
            `  Sequence: ${state.snapshotSequence}`,
        };
      } catch (error) {
        return {
          success: false,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}
