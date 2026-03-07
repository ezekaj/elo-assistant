import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  analyzeArgvCommand,
  analyzeShellCommand,
  checkImmediateDeny,
  evaluateExecAllowlist,
  evaluateShellAllowlist,
  getImmediateDenyPatterns,
  isSafeBinUsage,
  matchAllowlist,
  maxAsk,
  minSecurity,
  normalizeSafeBins,
  requiresExecApproval,
  resolveCommandResolution,
  resolveExecApprovals,
  resolveExecApprovalsFromFile,
  type ExecAllowlistEntry,
} from "./exec-approvals.js";

function makePathEnv(binDir: string): NodeJS.ProcessEnv {
  if (process.platform !== "win32") {
    return { PATH: binDir };
  }
  return { PATH: binDir, PATHEXT: ".EXE;.CMD;.BAT;.COM" };
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-exec-approvals-"));
}

describe("exec approvals allowlist matching", () => {
  it("ignores basename-only patterns", () => {
    const resolution = {
      rawExecutable: "rg",
      resolvedPath: "/opt/homebrew/bin/rg",
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "RG" }];
    const match = matchAllowlist(entries, resolution);
    expect(match).toBeNull();
  });

  it("matches by resolved path with **", () => {
    const resolution = {
      rawExecutable: "rg",
      resolvedPath: "/opt/homebrew/bin/rg",
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "/opt/**/rg" }];
    const match = matchAllowlist(entries, resolution);
    expect(match?.pattern).toBe("/opt/**/rg");
  });

  it("does not let * cross path separators", () => {
    const resolution = {
      rawExecutable: "rg",
      resolvedPath: "/opt/homebrew/bin/rg",
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "/opt/*/rg" }];
    const match = matchAllowlist(entries, resolution);
    expect(match).toBeNull();
  });

  it("requires a resolved path", () => {
    const resolution = {
      rawExecutable: "bin/rg",
      resolvedPath: undefined,
      executableName: "rg",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "bin/rg" }];
    const match = matchAllowlist(entries, resolution);
    expect(match).toBeNull();
  });
});

describe("exec approvals command resolution", () => {
  it("resolves PATH executables", () => {
    const dir = makeTempDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "rg.exe" : "rg";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const res = resolveCommandResolution("rg -n foo", undefined, makePathEnv(binDir));
    expect(res?.resolvedPath).toBe(exe);
    expect(res?.executableName).toBe(exeName);
  });

  it("resolves relative paths against cwd", () => {
    const dir = makeTempDir();
    const cwd = path.join(dir, "project");
    const script = path.join(cwd, "scripts", "run.sh");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "");
    fs.chmodSync(script, 0o755);
    const res = resolveCommandResolution("./scripts/run.sh --flag", cwd, undefined);
    expect(res?.resolvedPath).toBe(script);
  });

  it("parses quoted executables", () => {
    const dir = makeTempDir();
    const cwd = path.join(dir, "project");
    const script = path.join(cwd, "bin", "tool");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "");
    fs.chmodSync(script, 0o755);
    const res = resolveCommandResolution('"./bin/tool" --version', cwd, undefined);
    expect(res?.resolvedPath).toBe(script);
  });
});

describe("exec approvals shell parsing", () => {
  it("parses simple pipelines", () => {
    const res = analyzeShellCommand({ command: "echo ok | jq .foo" });
    expect(res.ok).toBe(true);
    expect(res.segments.map((seg) => seg.argv[0])).toEqual(["echo", "jq"]);
  });

  it("parses chained commands", () => {
    const res = analyzeShellCommand({ command: "ls && rm -rf /" });
    expect(res.ok).toBe(true);
    expect(res.chains?.map((chain) => chain[0]?.argv[0])).toEqual(["ls", "rm"]);
  });

  it("parses argv commands", () => {
    const res = analyzeArgvCommand({ argv: ["/bin/echo", "ok"] });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv).toEqual(["/bin/echo", "ok"]);
  });

  it("rejects command substitution inside double quotes", () => {
    const res = analyzeShellCommand({ command: 'echo "output: $(whoami)"' });
    expect(res.ok).toBe(false);
    // May be caught by immediate deny or parser - both are valid
    expect(res.reason).toMatch(/command substitution|\$\(\)/);
  });

  it("rejects backticks inside double quotes", () => {
    const res = analyzeShellCommand({ command: 'echo "output: `id`"' });
    expect(res.ok).toBe(false);
    // May be caught by immediate deny or parser - both are valid
    expect(res.reason).toMatch(/backtick|`/);
  });

  it("rejects command substitution outside quotes", () => {
    const res = analyzeShellCommand({ command: "echo $(whoami)" });
    expect(res.ok).toBe(false);
    // May be caught by immediate deny or parser - both are valid
    expect(res.reason).toMatch(/command substitution|\$\(\)/);
  });

  it("allows escaped command substitution inside double quotes", () => {
    const res = analyzeShellCommand({ command: 'echo "output: \\$(whoami)"' });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv[0]).toBe("echo");
  });

  it("allows command substitution syntax inside single quotes", () => {
    const res = analyzeShellCommand({ command: "echo 'output: $(whoami)'" });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv[0]).toBe("echo");
  });

  it("rejects windows shell metacharacters", () => {
    const res = analyzeShellCommand({
      command: "ping 127.0.0.1 -n 1 & whoami",
      platform: "win32",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unsupported windows shell token: &");
  });

  it("parses windows quoted executables", () => {
    const res = analyzeShellCommand({
      command: '"C:\\Program Files\\Tool\\tool.exe" --version',
      platform: "win32",
    });
    expect(res.ok).toBe(true);
    expect(res.segments[0]?.argv).toEqual(["C:\\Program Files\\Tool\\tool.exe", "--version"]);
  });
});

describe("exec approvals shell allowlist (chained commands)", () => {
  it("allows chained commands when all parts are allowlisted", () => {
    const allowlist: ExecAllowlistEntry[] = [
      { pattern: "/usr/bin/obsidian-cli" },
      { pattern: "/usr/bin/head" },
    ];
    const result = evaluateShellAllowlist({
      command:
        "/usr/bin/obsidian-cli print-default && /usr/bin/obsidian-cli search foo | /usr/bin/head",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(true);
  });

  it("rejects chained commands when any part is not allowlisted", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/obsidian-cli" }];
    const result = evaluateShellAllowlist({
      command: "/usr/bin/obsidian-cli print-default && /usr/bin/rm -rf /",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(false);
  });

  it("returns analysisOk=false for malformed chains", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/echo" }];
    const result = evaluateShellAllowlist({
      command: "/usr/bin/echo ok &&",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(false);
    expect(result.allowlistSatisfied).toBe(false);
  });

  it("respects quotes when splitting chains", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/echo" }];
    const result = evaluateShellAllowlist({
      command: '/usr/bin/echo "foo && bar"',
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(true);
  });

  it("respects escaped quotes when splitting chains", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/echo" }];
    const result = evaluateShellAllowlist({
      command: '/usr/bin/echo "foo\\" && bar"',
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.analysisOk).toBe(true);
    expect(result.allowlistSatisfied).toBe(true);
  });

  it("rejects windows chain separators for allowlist analysis", () => {
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/ping" }];
    const result = evaluateShellAllowlist({
      command: "ping 127.0.0.1 -n 1 & whoami",
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
      platform: "win32",
    });
    expect(result.analysisOk).toBe(false);
    expect(result.allowlistSatisfied).toBe(false);
  });
});

describe("exec approvals safe bins", () => {
  it("allows safe bins with non-path args", () => {
    const dir = makeTempDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "jq.exe" : "jq";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const res = analyzeShellCommand({
      command: "jq .foo",
      cwd: dir,
      env: makePathEnv(binDir),
    });
    expect(res.ok).toBe(true);
    const segment = res.segments[0];
    const ok = isSafeBinUsage({
      argv: segment.argv,
      resolution: segment.resolution,
      safeBins: normalizeSafeBins(["jq"]),
      cwd: dir,
    });
    expect(ok).toBe(true);
  });

  it("blocks safe bins with file args", () => {
    const dir = makeTempDir();
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === "win32" ? "jq.exe" : "jq";
    const exe = path.join(binDir, exeName);
    fs.writeFileSync(exe, "");
    fs.chmodSync(exe, 0o755);
    const file = path.join(dir, "secret.json");
    fs.writeFileSync(file, "{}");
    const res = analyzeShellCommand({
      command: "jq .foo secret.json",
      cwd: dir,
      env: makePathEnv(binDir),
    });
    expect(res.ok).toBe(true);
    const segment = res.segments[0];
    const ok = isSafeBinUsage({
      argv: segment.argv,
      resolution: segment.resolution,
      safeBins: normalizeSafeBins(["jq"]),
      cwd: dir,
    });
    expect(ok).toBe(false);
  });
});

describe("exec approvals allowlist evaluation", () => {
  it("satisfies allowlist on exact match", () => {
    const analysis = {
      ok: true,
      segments: [
        {
          raw: "tool",
          argv: ["tool"],
          resolution: {
            rawExecutable: "tool",
            resolvedPath: "/usr/bin/tool",
            executableName: "tool",
          },
        },
      ],
    };
    const allowlist: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/tool" }];
    const result = evaluateExecAllowlist({
      analysis,
      allowlist,
      safeBins: new Set(),
      cwd: "/tmp",
    });
    expect(result.allowlistSatisfied).toBe(true);
    expect(result.allowlistMatches.map((entry) => entry.pattern)).toEqual(["/usr/bin/tool"]);
  });

  it("satisfies allowlist via safe bins", () => {
    const analysis = {
      ok: true,
      segments: [
        {
          raw: "jq .foo",
          argv: ["jq", ".foo"],
          resolution: {
            rawExecutable: "jq",
            resolvedPath: "/usr/bin/jq",
            executableName: "jq",
          },
        },
      ],
    };
    const result = evaluateExecAllowlist({
      analysis,
      allowlist: [],
      safeBins: normalizeSafeBins(["jq"]),
      cwd: "/tmp",
    });
    expect(result.allowlistSatisfied).toBe(true);
    expect(result.allowlistMatches).toEqual([]);
  });

  it("satisfies allowlist via auto-allow skills", () => {
    const analysis = {
      ok: true,
      segments: [
        {
          raw: "skill-bin",
          argv: ["skill-bin", "--help"],
          resolution: {
            rawExecutable: "skill-bin",
            resolvedPath: "/opt/skills/skill-bin",
            executableName: "skill-bin",
          },
        },
      ],
    };
    const result = evaluateExecAllowlist({
      analysis,
      allowlist: [],
      safeBins: new Set(),
      skillBins: new Set(["skill-bin"]),
      autoAllowSkills: true,
      cwd: "/tmp",
    });
    expect(result.allowlistSatisfied).toBe(true);
  });
});

describe("exec approvals policy helpers", () => {
  it("minSecurity returns the more restrictive value", () => {
    expect(minSecurity("deny", "full")).toBe("deny");
    expect(minSecurity("allowlist", "full")).toBe("allowlist");
  });

  it("maxAsk returns the more aggressive ask mode", () => {
    expect(maxAsk("off", "always")).toBe("always");
    expect(maxAsk("on-miss", "off")).toBe("on-miss");
  });

  it("requiresExecApproval respects ask mode and allowlist satisfaction", () => {
    expect(
      requiresExecApproval({
        ask: "always",
        security: "allowlist",
        analysisOk: true,
        allowlistSatisfied: true,
      }),
    ).toBe(true);
    expect(
      requiresExecApproval({
        ask: "off",
        security: "allowlist",
        analysisOk: true,
        allowlistSatisfied: false,
      }),
    ).toBe(false);
    expect(
      requiresExecApproval({
        ask: "on-miss",
        security: "allowlist",
        analysisOk: true,
        allowlistSatisfied: true,
      }),
    ).toBe(false);
    expect(
      requiresExecApproval({
        ask: "on-miss",
        security: "allowlist",
        analysisOk: false,
        allowlistSatisfied: false,
      }),
    ).toBe(true);
    expect(
      requiresExecApproval({
        ask: "on-miss",
        security: "full",
        analysisOk: false,
        allowlistSatisfied: false,
      }),
    ).toBe(false);
  });
});

describe("exec approvals wildcard agent", () => {
  it("merges wildcard allowlist entries with agent entries", () => {
    const dir = makeTempDir();
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(dir);

    try {
      const approvalsPath = path.join(dir, ".openclaw", "exec-approvals.json");
      fs.mkdirSync(path.dirname(approvalsPath), { recursive: true });
      fs.writeFileSync(
        approvalsPath,
        JSON.stringify(
          {
            version: 1,
            agents: {
              "*": { allowlist: [{ pattern: "/bin/hostname" }] },
              main: { allowlist: [{ pattern: "/usr/bin/uname" }] },
            },
          },
          null,
          2,
        ),
      );

      const resolved = resolveExecApprovals("main");
      expect(resolved.allowlist.map((entry) => entry.pattern)).toEqual([
        "/bin/hostname",
        "/usr/bin/uname",
      ]);
    } finally {
      homedirSpy.mockRestore();
    }
  });
});

describe("exec approvals node host allowlist check", () => {
  // These tests verify the allowlist satisfaction logic used by the node host path
  // The node host checks: matchAllowlist() || isSafeBinUsage() for each command segment
  // Using hardcoded resolution objects for cross-platform compatibility

  it("satisfies allowlist when command matches exact path pattern", () => {
    const resolution = {
      rawExecutable: "python3",
      resolvedPath: "/usr/bin/python3",
      executableName: "python3",
    };
    const entries: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/python3" }];
    const match = matchAllowlist(entries, resolution);
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe("/usr/bin/python3");
  });

  it("satisfies allowlist when command matches ** wildcard pattern", () => {
    // Simulates symlink resolution: /opt/homebrew/bin/python3 -> /opt/homebrew/opt/python@3.14/bin/python3.14
    const resolution = {
      rawExecutable: "python3",
      resolvedPath: "/opt/homebrew/opt/python@3.14/bin/python3.14",
      executableName: "python3.14",
    };
    // Pattern with ** matches across multiple directories
    const entries: ExecAllowlistEntry[] = [{ pattern: "/opt/**/python*" }];
    const match = matchAllowlist(entries, resolution);
    expect(match?.pattern).toBe("/opt/**/python*");
  });

  it("does not satisfy allowlist when command is not in allowlist", () => {
    const resolution = {
      rawExecutable: "unknown-tool",
      resolvedPath: "/usr/local/bin/unknown-tool",
      executableName: "unknown-tool",
    };
    // Allowlist has different commands
    const entries: ExecAllowlistEntry[] = [
      { pattern: "/usr/bin/python3" },
      { pattern: "/opt/**/node" },
    ];
    const match = matchAllowlist(entries, resolution);
    expect(match).toBeNull();

    // Also not a safe bin
    const safe = isSafeBinUsage({
      argv: ["unknown-tool", "--help"],
      resolution,
      safeBins: normalizeSafeBins(["jq", "curl"]),
      cwd: "/tmp",
    });
    expect(safe).toBe(false);
  });

  it("satisfies via safeBins even when not in allowlist", () => {
    const resolution = {
      rawExecutable: "jq",
      resolvedPath: "/usr/bin/jq",
      executableName: "jq",
    };
    // Not in allowlist
    const entries: ExecAllowlistEntry[] = [{ pattern: "/usr/bin/python3" }];
    const match = matchAllowlist(entries, resolution);
    expect(match).toBeNull();

    // But is a safe bin with non-file args
    const safe = isSafeBinUsage({
      argv: ["jq", ".foo"],
      resolution,
      safeBins: normalizeSafeBins(["jq"]),
      cwd: "/tmp",
    });
    expect(safe).toBe(true);
  });
});

describe("exec approvals default agent migration", () => {
  it("migrates legacy default agent entries to main", () => {
    const file = {
      version: 1,
      agents: {
        default: { allowlist: [{ pattern: "/bin/legacy" }] },
      },
    };
    const resolved = resolveExecApprovalsFromFile({ file });
    expect(resolved.allowlist.map((entry) => entry.pattern)).toEqual(["/bin/legacy"]);
    expect(resolved.file.agents?.default).toBeUndefined();
    expect(resolved.file.agents?.main?.allowlist?.[0]?.pattern).toBe("/bin/legacy");
  });

  it("prefers main agent settings when both main and default exist", () => {
    const file = {
      version: 1,
      agents: {
        main: { ask: "always", allowlist: [{ pattern: "/bin/main" }] },
        default: { ask: "off", allowlist: [{ pattern: "/bin/legacy" }] },
      },
    };
    const resolved = resolveExecApprovalsFromFile({ file });
    expect(resolved.agent.ask).toBe("always");
    expect(resolved.allowlist.map((entry) => entry.pattern)).toEqual(["/bin/main", "/bin/legacy"]);
    expect(resolved.file.agents?.default).toBeUndefined();
  });
});

describe("immediate deny patterns", () => {
  describe("checkImmediateDeny", () => {
    it("blocks command substitution $()", () => {
      const result = checkImmediateDeny("echo $(whoami)");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("command substitution");
    });

    it("blocks backtick substitution", () => {
      const result = checkImmediateDeny("echo `whoami`");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("backtick");
    });

    it("blocks variable expansion ${}", () => {
      const result = checkImmediateDeny("echo ${PATH}");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("variable expansion");
    });

    it("blocks IFS manipulation", () => {
      const result = checkImmediateDeny("IFS=: read a b");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("IFS");
    });

    it("blocks nested shell -c", () => {
      const result = checkImmediateDeny('sh -c "rm -rf /"');
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("nested shell");
    });

    it("blocks bash -c", () => {
      const result = checkImmediateDeny('bash -c "malicious"');
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("nested shell");
    });

    it("blocks python -c", () => {
      const result = checkImmediateDeny('python -c "import os"');
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("python -c");
    });

    it("blocks ruby -e", () => {
      const result = checkImmediateDeny("ruby -e \"system('ls')\"");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("ruby -e");
    });

    it("blocks perl -e", () => {
      const result = checkImmediateDeny('perl -e "print 1"');
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("perl -e");
    });

    it("blocks node -e", () => {
      const result = checkImmediateDeny('node -e "process.exit(1)"');
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("node -e");
    });

    it("blocks awk system() calls", () => {
      const result = checkImmediateDeny("awk '{system(\"rm -rf /\")}' /dev/null");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("awk system");
    });

    it("blocks process substitution <()", () => {
      const result = checkImmediateDeny("diff <(ls) <(ls -a)");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("process substitution");
    });

    it("blocks eval command", () => {
      const result = checkImmediateDeny('eval "rm -rf /"');
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("eval");
    });

    it("blocks source command", () => {
      const result = checkImmediateDeny("source ~/.bashrc");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("source");
    });

    it("blocks dot source command", () => {
      const result = checkImmediateDeny(". ~/.bashrc");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("dot source");
    });

    it("blocks function definitions", () => {
      const result = checkImmediateDeny("f() { rm -rf /; }");
      expect(result.denied).toBe(true);
      expect(result.reason).toContain("function");
    });

    it("allows safe commands", () => {
      const safeCommands = [
        "ls -la",
        "git status",
        "npm install",
        "cat /etc/passwd",
        "grep pattern file.txt",
        "echo hello world",
        "pwd",
        "whoami",
        "date",
        "curl https://example.com",
      ];

      for (const cmd of safeCommands) {
        const result = checkImmediateDeny(cmd);
        expect(result.denied).toBe(false);
      }
    });
  });

  describe("analyzeShellCommand with immediate deny", () => {
    it("rejects commands with blocked patterns", () => {
      const result = analyzeShellCommand({ command: "echo $(whoami)" });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("blocked pattern");
    });

    it("can skip immediate deny check", () => {
      const result = analyzeShellCommand({
        command: "echo $(whoami)",
        skipImmediateDeny: true,
      });
      // Should pass parsing (the $() will be caught by other parser logic)
      // but won't be blocked by immediate deny
      expect(result.reason).not.toContain("blocked pattern");
    });
  });

  describe("getImmediateDenyPatterns", () => {
    it("returns array of patterns with reasons", () => {
      const patterns = getImmediateDenyPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(10);
      for (const p of patterns) {
        expect(p.pattern).toBeDefined();
        expect(p.reason).toBeDefined();
      }
    });
  });
});

describe("evasion attempt prevention", () => {
  const EVASION_ATTEMPTS = [
    { cmd: "$(rm -rf /)", reason: "command substitution" },
    { cmd: "`rm -rf /`", reason: "backtick substitution" },
    { cmd: 'sh -c "rm -rf /"', reason: "nested shell" },
    { cmd: 'bash -c "rm -rf /"', reason: "nested shell" },
    { cmd: "python -c \"import os; os.system('rm -rf /')\"", reason: "python inline" },
    { cmd: "ruby -e \"system('rm -rf /')\"", reason: "ruby inline" },
    { cmd: "perl -e \"system('rm -rf /')\"", reason: "perl inline" },
    { cmd: "eval 'rm -rf /'", reason: "eval" },
    { cmd: "source /tmp/malicious.sh", reason: "source" },
    { cmd: ". /tmp/malicious.sh", reason: "dot source" },
    { cmd: "awk '{system(\"rm\")}' /dev/null", reason: "awk system" },
  ];

  for (const { cmd, reason } of EVASION_ATTEMPTS) {
    it(`blocks evasion attempt: ${reason}`, () => {
      const denyResult = checkImmediateDeny(cmd);
      expect(denyResult.denied).toBe(true);

      const analyzeResult = analyzeShellCommand({ command: cmd });
      expect(analyzeResult.ok).toBe(false);
    });
  }
});
