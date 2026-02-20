import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";

export interface CodexExecConfig {
  readonly prompt: string;
  readonly workingDir: string;
  readonly model?: string;
  readonly sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
  readonly timeoutMs?: number;
  readonly codexPath?: string;
}

export interface CodexJsonlEvent extends Record<string, unknown> {
  readonly type?: string;
}

export interface CodexExecResult {
  readonly exitCode: number;
  readonly lastMessage: string;
  readonly events: readonly CodexJsonlEvent[];
  readonly durationMs: number;
}

type SpawnImpl = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

interface CodexProcessDeps {
  readonly spawnImpl?: SpawnImpl;
  readonly mkdtempImpl?: (prefix: string) => Promise<string>;
  readonly readFileImpl?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  readonly rmImpl?: (filePath: string, options: { recursive: boolean; force: boolean }) => Promise<void>;
}

interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

function parseJsonLine(line: string): CodexJsonlEvent | null {
  const text = line.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as CodexJsonlEvent;
  } catch {
    return null;
  }
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<ProcessExit> {
  return await new Promise<ProcessExit>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

export async function executeCodexCliAgent(
  config: CodexExecConfig,
  onEvent?: (event: CodexJsonlEvent) => void,
  deps: CodexProcessDeps = {},
): Promise<CodexExecResult> {
  const start = Date.now();
  const spawnImpl = deps.spawnImpl ?? ((command, args, options) => spawn(command, args, options));
  const mkdtempImpl = deps.mkdtempImpl ?? fs.mkdtemp;
  const readFileImpl = deps.readFileImpl ?? fs.readFile;
  const rmImpl = deps.rmImpl ?? fs.rm;

  const timeoutMs = config.timeoutMs ?? 600_000;
  const codexPath = config.codexPath ?? "codex";
  const tempDir = await mkdtempImpl(path.join(os.tmpdir(), "cortex-codex-"));
  const outputPath = path.join(tempDir, "last-message.txt");

  const args: string[] = [
    "exec",
    "-",
    "--full-auto",
    "--json",
    "--ephemeral",
    "--color",
    "never",
    "-C",
    config.workingDir,
    "-o",
    outputPath,
  ];

  if (config.model) {
    args.push("--model", config.model);
  }
  if (config.sandboxMode) {
    args.push("--sandbox", config.sandboxMode);
  }

  const child = spawnImpl(codexPath, args, {
    shell: false,
    stdio: "pipe",
  });

  const events: CodexJsonlEvent[] = [];
  const stdout = createInterface({ input: child.stdout });
  stdout.on("line", (line) => {
    const parsed = parseJsonLine(line);
    if (!parsed) return;
    events.push(parsed);
    if (onEvent) onEvent(parsed);
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);

  try {
    child.stdin.end(config.prompt);
    const exit = await waitForExit(child);
    const lastMessage = await readFileImpl(outputPath, "utf8").catch(() => "");

    return {
      exitCode: timedOut ? -1 : (exit.code ?? 1),
      lastMessage: lastMessage.trim(),
      events,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
    stdout.close();
    await rmImpl(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
