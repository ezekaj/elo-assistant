/**
 * Exec Audit CLI
 *
 * Query and manage the exec audit log.
 */

import type { Command } from "commander";
import type { ExecHost } from "../infra/exec-approvals.js";
import {
  formatAuditEntries,
  getAuditStats,
  pruneAuditLog,
  readAuditLog,
  verifyAuditChain,
  type AuditQueryOptions,
  type ExecAuditEntry,
} from "../infra/exec-audit.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { renderTable } from "../terminal/table.js";
import { isRich, theme } from "../terminal/theme.js";

type AuditCliOpts = {
  last?: string;
  command?: string;
  denied?: boolean;
  allowed?: boolean;
  since?: string;
  agent?: string;
  host?: string;
  json?: boolean;
  stats?: boolean;
};

type PruneCliOpts = {
  days?: string;
  json?: boolean;
};

/**
 * Parse duration strings like "1h", "30m", "7d" into milliseconds
 */
function parseDuration(value: string): number | null {
  const match = /^(\d+)([smhd])$/.exec(value.trim().toLowerCase());
  if (!match) return null;

  const num = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return num * 1000;
    case "m":
      return num * 60 * 1000;
    case "h":
      return num * 60 * 60 * 1000;
    case "d":
      return num * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function renderAuditTable(entries: ExecAuditEntry[]) {
  const rich = isRich();
  const tableWidth = Math.max(80, (process.stdout.columns ?? 120) - 1);

  const rows = entries.map((entry) => {
    const time = new Date(entry.timestamp).toISOString().replace("T", " ").slice(0, 19);
    const cmd = entry.command.length > 40 ? entry.command.slice(0, 37) + "..." : entry.command;
    const statusIcon =
      entry.decision === "allowed"
        ? rich
          ? theme.success("\u2713")
          : "\u2713"
        : entry.decision === "denied"
          ? rich
            ? theme.error("\u2717")
            : "\u2717"
          : entry.decision === "dry-run"
            ? rich
              ? theme.muted("\u25cb")
              : "\u25cb"
            : "?";

    return {
      Status: statusIcon,
      Time: time,
      Host: entry.host,
      Security: entry.security,
      Command: cmd,
      Exit: entry.execution?.exitCode?.toString() ?? "-",
    };
  });

  defaultRuntime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Status", header: "", minWidth: 2 },
        { key: "Time", header: "Time", minWidth: 19 },
        { key: "Host", header: "Host", minWidth: 8 },
        { key: "Security", header: "Security", minWidth: 10 },
        { key: "Command", header: "Command", minWidth: 20, flex: true },
        { key: "Exit", header: "Exit", minWidth: 5 },
      ],
      rows,
    }).trimEnd(),
  );
}

function renderStats(stats: ReturnType<typeof getAuditStats>) {
  const rich = isRich();
  const heading = (text: string) => (rich ? theme.heading(text) : text);
  const tableWidth = Math.max(60, (process.stdout.columns ?? 120) - 1);

  defaultRuntime.log(heading("Audit Statistics"));
  defaultRuntime.log("");

  const summaryRows = [
    { Field: "Total", Value: stats.total.toString() },
    {
      Field: "Allowed",
      Value: rich ? theme.success(stats.allowed.toString()) : stats.allowed.toString(),
    },
    {
      Field: "Denied",
      Value: rich ? theme.error(stats.denied.toString()) : stats.denied.toString(),
    },
    { Field: "Pending", Value: stats.pending.toString() },
  ];

  defaultRuntime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Field", header: "Metric", minWidth: 12 },
        { key: "Value", header: "Count", minWidth: 10 },
      ],
      rows: summaryRows,
    }).trimEnd(),
  );

  if (Object.keys(stats.byHost).length > 0) {
    defaultRuntime.log("");
    defaultRuntime.log(heading("By Host"));
    const hostRows = Object.entries(stats.byHost).map(([host, count]) => ({
      Host: host,
      Count: count.toString(),
    }));
    defaultRuntime.log(
      renderTable({
        width: tableWidth,
        columns: [
          { key: "Host", header: "Host", minWidth: 12 },
          { key: "Count", header: "Count", minWidth: 10 },
        ],
        rows: hostRows,
      }).trimEnd(),
    );
  }

  if (Object.keys(stats.bySecurity).length > 0) {
    defaultRuntime.log("");
    defaultRuntime.log(heading("By Security Mode"));
    const securityRows = Object.entries(stats.bySecurity).map(([mode, count]) => ({
      Mode: mode,
      Count: count.toString(),
    }));
    defaultRuntime.log(
      renderTable({
        width: tableWidth,
        columns: [
          { key: "Mode", header: "Mode", minWidth: 12 },
          { key: "Count", header: "Count", minWidth: 10 },
        ],
        rows: securityRows,
      }).trimEnd(),
    );
  }
}

export function registerExecAuditCli(program: Command) {
  const audit = program
    .command("audit")
    .description("Query and manage the exec audit log")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n` +
        `  ${theme.command("openclaw audit --last 20")}\n` +
        `    ${theme.muted("Show last 20 audit entries")}\n` +
        `  ${theme.command('openclaw audit --command "rm" --denied')}\n` +
        `    ${theme.muted("Show denied commands matching 'rm'")}\n` +
        `  ${theme.command("openclaw audit --since 1h --host gateway")}\n` +
        `    ${theme.muted("Show gateway commands from last hour")}\n` +
        `  ${theme.command("openclaw audit --stats")}\n` +
        `    ${theme.muted("Show audit statistics")}\n` +
        `  ${theme.command("openclaw audit prune --days 30")}\n` +
        `    ${theme.muted("Remove entries older than 30 days")}\n\n` +
        `${theme.muted("Docs:")} ${formatDocsLink("/cli/audit", "docs.openclaw.ai/cli/audit")}\n`,
    )
    .option("--last <n>", "Show last N entries")
    .option("--command <pattern>", "Filter by command pattern (regex)")
    .option("--denied", "Show only denied commands", false)
    .option("--allowed", "Show only allowed commands", false)
    .option("--since <duration>", "Show entries since duration (e.g., 1h, 30m, 7d)")
    .option("--agent <id>", "Filter by agent ID")
    .option("--host <host>", "Filter by host (sandbox|gateway|node)")
    .option("--json", "Output as JSON", false)
    .option("--stats", "Show statistics instead of entries", false)
    .action(async (opts: AuditCliOpts) => {
      try {
        // Handle stats mode
        if (opts.stats) {
          let since: number | undefined;
          if (opts.since) {
            const durationMs = parseDuration(opts.since);
            if (durationMs === null) {
              defaultRuntime.error(`Invalid duration: ${opts.since}. Use format like 1h, 30m, 7d.`);
              defaultRuntime.exit(1);
              return;
            }
            since = Date.now() - durationMs;
          }

          const stats = getAuditStats(since);

          if (opts.json) {
            defaultRuntime.log(JSON.stringify(stats, null, 2));
            return;
          }

          renderStats(stats);
          return;
        }

        // Build query options
        const queryOpts: AuditQueryOptions = {};

        if (opts.last) {
          const n = Number.parseInt(opts.last, 10);
          if (Number.isNaN(n) || n <= 0) {
            defaultRuntime.error("--last must be a positive number");
            defaultRuntime.exit(1);
            return;
          }
          queryOpts.last = n;
        }

        if (opts.command) {
          queryOpts.command = opts.command;
        }

        if (opts.denied) {
          queryOpts.denied = true;
        }

        if (opts.allowed) {
          queryOpts.allowed = true;
        }

        if (opts.since) {
          const durationMs = parseDuration(opts.since);
          if (durationMs === null) {
            defaultRuntime.error(`Invalid duration: ${opts.since}. Use format like 1h, 30m, 7d.`);
            defaultRuntime.exit(1);
            return;
          }
          queryOpts.since = Date.now() - durationMs;
        }

        if (opts.agent) {
          queryOpts.agentId = opts.agent;
        }

        if (opts.host) {
          const host = opts.host.toLowerCase();
          if (host !== "sandbox" && host !== "gateway" && host !== "node") {
            defaultRuntime.error("--host must be sandbox, gateway, or node");
            defaultRuntime.exit(1);
            return;
          }
          queryOpts.host = host as ExecHost;
        }

        // Default to last 50 if no filters specified
        if (!queryOpts.last && !queryOpts.since && !queryOpts.command) {
          queryOpts.last = 50;
        }

        const entries = readAuditLog(queryOpts);

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          defaultRuntime.log(theme.muted("No audit entries found."));
          return;
        }

        defaultRuntime.log(theme.heading(`Audit Log (${entries.length} entries)`));
        defaultRuntime.log("");
        renderAuditTable(entries);
      } catch (err) {
        defaultRuntime.error(`Failed to read audit log: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });

  audit
    .command("prune")
    .description("Remove old audit entries")
    .option("--days <n>", "Remove entries older than N days", "30")
    .option("--json", "Output result as JSON", false)
    .action(async (opts: PruneCliOpts) => {
      try {
        const days = Number.parseInt(opts.days ?? "30", 10);
        if (Number.isNaN(days) || days <= 0) {
          defaultRuntime.error("--days must be a positive number");
          defaultRuntime.exit(1);
          return;
        }

        const olderThanMs = days * 24 * 60 * 60 * 1000;
        const removed = pruneAuditLog(olderThanMs);

        if (opts.json) {
          defaultRuntime.log(JSON.stringify({ removed, days }));
          return;
        }

        if (removed === 0) {
          defaultRuntime.log(theme.muted(`No entries older than ${days} days.`));
        } else {
          defaultRuntime.log(theme.success(`Removed ${removed} entries older than ${days} days.`));
        }
      } catch (err) {
        defaultRuntime.error(`Failed to prune audit log: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });

  audit
    .command("clear")
    .description("Clear all audit entries")
    .option("--json", "Output result as JSON", false)
    .action(async (opts: { json?: boolean }) => {
      try {
        const removed = pruneAuditLog(0); // Remove everything

        if (opts.json) {
          defaultRuntime.log(JSON.stringify({ removed }));
          return;
        }

        defaultRuntime.log(theme.success(`Cleared ${removed} audit entries.`));
      } catch (err) {
        defaultRuntime.error(`Failed to clear audit log: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });

  audit
    .command("verify")
    .description("Verify audit log hash chain integrity")
    .option("--json", "Output result as JSON", false)
    .option("--verbose", "Show details for each entry", false)
    .action(async (opts: { json?: boolean; verbose?: boolean }) => {
      try {
        const result = verifyAuditChain();

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.totalEntries === 0) {
          defaultRuntime.log(theme.muted("No audit entries to verify."));
          return;
        }

        const statusIcon = result.valid ? theme.success("\u2713") : theme.error("\u2717");
        const statusText = result.valid ? theme.success("VALID") : theme.error("TAMPERED");

        defaultRuntime.log(`${statusIcon} Chain integrity: ${statusText}`);
        defaultRuntime.log("");
        defaultRuntime.log(`  Total entries:   ${result.totalEntries}`);
        defaultRuntime.log(`  Valid entries:   ${theme.success(result.validEntries.toString())}`);
        defaultRuntime.log(
          `  Invalid entries: ${result.invalidEntries > 0 ? theme.error(result.invalidEntries.toString()) : "0"}`,
        );

        if (result.firstInvalidIndex !== undefined) {
          defaultRuntime.log("");
          defaultRuntime.log(
            theme.error(`  First tampered entry at index: ${result.firstInvalidIndex}`),
          );
        }

        if (opts.verbose && result.entries.length > 0) {
          defaultRuntime.log("");
          defaultRuntime.log(theme.heading("Entry Details:"));
          for (const entry of result.entries) {
            const icon = entry.valid ? theme.success("\u2713") : theme.error("\u2717");
            const time = new Date(entry.timestamp).toISOString().replace("T", " ").slice(0, 19);
            defaultRuntime.log(`  ${icon} [${entry.index}] ${time} ${entry.id.slice(0, 8)}...`);
            if (entry.error) {
              defaultRuntime.log(`      ${theme.error(entry.error)}`);
            }
          }
        }
      } catch (err) {
        defaultRuntime.error(`Failed to verify audit log: ${String(err)}`);
        defaultRuntime.exit(1);
      }
    });
}
