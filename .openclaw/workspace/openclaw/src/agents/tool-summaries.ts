import type { AgentTool } from "@mariozechner/pi-agent-core";

export function buildToolSummaryMap(tools: AgentTool[]): Record<string, string> {
  const summaries: Record<string, string> = {};
  for (const tool of tools) {
    const desc = typeof tool.description === "string" ? tool.description.trim() : undefined;
    const label = typeof tool.label === "string" ? tool.label.trim() : undefined;
    const summary = desc || label;
    if (!summary) {
      continue;
    }
    summaries[tool.name.toLowerCase()] = summary;
  }
  return summaries;
}
