/**
 * Risk Classifier for Exec Tool
 *
 * Classifies shell commands into GREEN/YELLOW/RED risk levels.
 * Integrated from exec-enhanced research.
 */

export type RiskLevel = "green" | "yellow" | "red";

export interface RiskClassification {
  level: RiskLevel;
  score: number; // 0-100
  reasons: string[];
  suggestion?: string;
}

// RED patterns - immediately dangerous
const RED_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion?: string }> = [
  {
    pattern: /rm\s+(-[rf]+\s+)*[\/~]/,
    reason: "recursive delete on root/home",
    suggestion: "Use trash-cli or specify exact path",
  },
  {
    pattern: /rm\s+-rf?\s+\*/,
    reason: "recursive delete wildcard",
    suggestion: "Be more specific with target",
  },
  {
    pattern: /dd\s+.*of=\/dev\//,
    reason: "direct disk write",
    suggestion: "Double-check target device",
  },
  { pattern: /mkfs/, reason: "format filesystem" },
  { pattern: /:\(\)\s*\{/, reason: "fork bomb detected" },
  { pattern: /\|\s*:\s*&/, reason: "fork bomb pattern" },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: "write to disk device" },
  { pattern: /chmod\s+(777|a\+rwx)\s+\//, reason: "world-writable root" },
  {
    pattern: /curl.*\|\s*(ba)?sh/,
    reason: "pipe URL to shell",
    suggestion: "Download first, inspect, then execute",
  },
  {
    pattern: /wget.*\|\s*(ba)?sh/,
    reason: "pipe URL to shell",
    suggestion: "Download first, inspect, then execute",
  },
  { pattern: /eval\s*\$\(curl/, reason: "eval remote code" },
  { pattern: />\s*\/etc\/passwd/, reason: "overwrite passwd" },
  { pattern: />\s*\/etc\/shadow/, reason: "overwrite shadow" },
  { pattern: /shutdown|reboot|halt|poweroff/, reason: "system shutdown" },
  { pattern: /kill\s+-9\s+1\b/, reason: "kill init process" },
  { pattern: /rm\s+.*\/\*\s*$/, reason: "delete everything in directory" },
];

// YELLOW patterns - require caution
const YELLOW_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion?: string }> = [
  { pattern: /curl|wget/, reason: "network download" },
  { pattern: /pip\s+install/, reason: "Python package install" },
  { pattern: /npm\s+install/, reason: "Node package install" },
  { pattern: /cargo\s+install/, reason: "Rust package install" },
  { pattern: /apt(-get)?\s+install/, reason: "system package install" },
  { pattern: /brew\s+install/, reason: "Homebrew install" },
  { pattern: /sudo/, reason: "privilege escalation" },
  { pattern: /su\s+-/, reason: "switch user" },
  { pattern: /systemctl|service/, reason: "service management" },
  { pattern: /docker\s+(run|exec|build)/, reason: "container operation" },
  { pattern: /git\s+push/, reason: "publish code" },
  { pattern: /git\s+reset\s+--hard/, reason: "destructive git reset" },
  { pattern: /chmod/, reason: "permission change" },
  { pattern: /chown/, reason: "ownership change" },
  { pattern: /ssh\s/, reason: "remote connection" },
  { pattern: /scp\s/, reason: "remote copy" },
  { pattern: /rsync/, reason: "sync files" },
  { pattern: /crontab/, reason: "scheduled task" },
  { pattern: /nc\s|netcat/, reason: "network utility" },
  { pattern: /nmap/, reason: "network scan" },
];

/**
 * Classify a command's risk level
 */
export function classifyCommandRisk(command: string): RiskClassification {
  const cmd = command.toLowerCase().trim();

  // Check RED patterns first
  for (const { pattern, reason, suggestion } of RED_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        level: "red",
        score: 90 + Math.floor(Math.random() * 10),
        reasons: [reason],
        suggestion,
      };
    }
  }

  // Check YELLOW patterns
  const yellowMatches: string[] = [];
  let suggestion: string | undefined;

  for (const { pattern, reason, suggestion: sug } of YELLOW_PATTERNS) {
    if (pattern.test(cmd)) {
      yellowMatches.push(reason);
      if (sug) suggestion = sug;
    }
  }

  if (yellowMatches.length > 0) {
    return {
      level: "yellow",
      score: 30 + yellowMatches.length * 15,
      reasons: yellowMatches,
      suggestion,
    };
  }

  // GREEN - safe commands
  return {
    level: "green",
    score: 0,
    reasons: ["no risky patterns detected"],
  };
}

/**
 * Format risk classification for display
 */
export function formatRiskWarning(risk: RiskClassification): string | null {
  if (risk.level === "green") return null;

  const emoji = risk.level === "red" ? "🔴" : "🟡";
  const lines = [
    `${emoji} Risk: ${risk.level.toUpperCase()} (score: ${risk.score})`,
    `Reasons: ${risk.reasons.join(", ")}`,
  ];

  if (risk.suggestion) {
    lines.push(`Suggestion: ${risk.suggestion}`);
  }

  return lines.join("\n");
}

/**
 * Check if command should be blocked based on risk
 * Default: false (warn but don't block, use approval flow)
 */
export function shouldBlockCommand(risk: RiskClassification, blockRed = false): boolean {
  return risk.level === "red" && blockRed;
}

/**
 * Check if command requires confirmation
 */
export function requiresConfirmation(risk: RiskClassification): boolean {
  return risk.level === "red" || risk.level === "yellow";
}
