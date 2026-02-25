#!/usr/bin/env npx tsx
// Probe: what does the real sandboxed read tool actually return?
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createSandboxedReadTool, clearReadToolCache } from "./src/agents/pi-tools.read.js";

const ROOT = "/tmp/pi-tools-e2e-probe";
if (existsSync(ROOT)) rmSync(ROOT, { recursive: true });
mkdirSync(ROOT, { recursive: true });

writeFileSync(`${ROOT}/hello.txt`, "line one\nline two\nline three");

clearReadToolCache();
const tool = createSandboxedReadTool(ROOT);

const result = await tool.execute("probe-1", { path: `${ROOT}/hello.txt` }, undefined as any);
console.log("RESULT TYPE:", typeof result);
console.log("RESULT KEYS:", Object.keys(result as any));
console.log("CONTENT:", JSON.stringify((result as any).content, null, 2));

rmSync(ROOT, { recursive: true });
