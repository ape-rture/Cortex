/**
 * Ralph — Autonomous Dual-Agent Supervisor Loop
 *
 * Reads .cortex/tasks.md, picks the next task, routes to Claude (SDK) or
 * Codex (CLI subprocess), verifies completion, and loops until done.
 *
 * Usage:
 *   npm run ralph                                     # run all queued tasks
 *   npm run ralph -- --group="Unified Capture Store"  # only tasks in that group
 *   npm run ralph -- --agent=codex                    # only codex tasks
 *   npm run ralph -- --task="Extend Task type"        # specific task by title match
 *   npm run ralph -- --max-iterations=10              # cap iterations (default: 20)
 *   npm run ralph -- --dry-run                        # show plan without executing
 *   npm run ralph -- --verbose                        # extra logging
 */

import "dotenv/config";
import { fileURLToPath } from "node:url";
import type { RalphConfig, RalphEvent, RalphResult } from "../core/ralph-loop.js";
import { RalphLoop } from "../core/ralph-loop.js";

// ---------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------

export interface RalphArgs {
  /** Filter: only run tasks under this ### group header */
  group?: string;
  /** Filter: only run tasks for this agent */
  agent?: "claude" | "codex";
  /** Filter: only run a specific task by title substring */
  task?: string;
  /** Safety limit on iterations (default: 20) */
  maxIterations?: number;
  /** Print what would happen, don't execute */
  dryRun?: boolean;
  /** Extra logging */
  verbose?: boolean;
  /** Parse error */
  error?: string;
}

function isAgentName(value: string): value is "claude" | "codex" {
  return value === "claude" || value === "codex";
}

export function parseRalphArgs(argv: readonly string[]): RalphArgs {
  const args: RalphArgs = {};

  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const eqIdx = token.indexOf("=");
    const key = eqIdx === -1 ? token.slice(2) : token.slice(2, eqIdx);
    const rawValue = eqIdx === -1 ? undefined : token.slice(eqIdx + 1);

    switch (key) {
      case "group":
        if (!rawValue?.trim()) {
          args.error = "Missing value for --group";
        } else {
          args.group = rawValue.trim();
        }
        break;

      case "agent":
        if (!rawValue?.trim()) {
          args.error = "Missing value for --agent";
        } else if (!isAgentName(rawValue.trim())) {
          args.error = `Invalid agent: "${rawValue}". Must be "claude" or "codex"`;
        } else {
          args.agent = rawValue.trim() as "claude" | "codex";
        }
        break;

      case "task":
        if (!rawValue?.trim()) {
          args.error = "Missing value for --task";
        } else {
          args.task = rawValue.trim();
        }
        break;

      case "max-iterations": {
        const n = Number(rawValue);
        if (!Number.isFinite(n) || n < 1) {
          args.error = `Invalid --max-iterations: "${rawValue}". Must be a positive integer`;
        } else {
          args.maxIterations = Math.floor(n);
        }
        break;
      }

      case "dry-run":
        args.dryRun = true;
        break;

      case "verbose":
        args.verbose = true;
        break;

      default:
        break;
    }
  }

  return args;
}

// ---------------------------------------------------------------------
// Event formatting
// ---------------------------------------------------------------------

function formatEvent(event: RalphEvent, verbose: boolean): string | null {
  const prefix = `[ralph][${String(event.iteration).padStart(2, " ")}]`;
  const ts = new Date(event.timestamp).toLocaleTimeString();

  switch (event.type) {
    case "loop_started":
      return `${prefix} ${ts}  Starting supervisor loop — ${event.message}`;
    case "task_picked":
      return `${prefix} ${ts}  Picked: "${event.task?.title}" -> ${event.agent}`;
    case "agent_started":
      return `${prefix} ${ts}  Dispatching to ${event.agent}...`;
    case "agent_progress":
      return verbose ? `${prefix} ${ts}    ${event.message}` : null;
    case "agent_completed":
      return `${prefix} ${ts}  Agent finished — ${event.detail ?? event.message}`;
    case "task_verified":
      return `${prefix} ${ts}  DONE: "${event.task?.title}"`;
    case "task_stuck":
      return `${prefix} ${ts}  STUCK: "${event.task?.title}" — ${event.message}`;
    case "loop_completed":
      return `${prefix} ${ts}  Loop complete: ${event.message}`;
    case "loop_error":
      return `${prefix} ${ts}  ERROR: ${event.message}`;
    default:
      return verbose ? `${prefix} ${ts}  ${event.message}` : null;
  }
}

function formatResult(result: RalphResult): string {
  const lines: string[] = ["", "# Ralph Loop Summary", ""];

  lines.push(`Exit reason: ${result.exitReason}`);
  lines.push(`Iterations: ${result.iterations}`);

  if (result.tasksCompleted.length > 0) {
    lines.push("", "## Completed");
    for (const t of result.tasksCompleted) {
      lines.push(`  - ${t}`);
    }
  }

  if (result.tasksFailed.length > 0) {
    lines.push("", "## Failed / Stuck");
    for (const t of result.tasksFailed) {
      lines.push(`  - ${t}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------

async function runDryRun(config: RalphConfig): Promise<string> {
  const { promises: fs } = await import("node:fs");
  const { parseFullBoard } = await import("../ui/handlers/tasks.js");

  const raw = await fs.readFile(config.taskBoardPath, "utf8");
  const board = parseFullBoard(raw);

  const queued = board.tasks.filter((t) => t.status === "queued");
  const filtered = queued.filter((t) => {
    if (config.filter?.group && t.group !== config.filter.group) return false;
    if (config.filter?.agent && t.agent !== config.filter.agent) return false;
    if (config.filter?.taskTitle && !t.title.toLowerCase().includes(config.filter.taskTitle.toLowerCase())) return false;
    return true;
  });

  if (filtered.length === 0) {
    return "# Ralph Dry Run\n\nNo matching tasks found in the queue.";
  }

  const lines = [
    "# Ralph Dry Run",
    "",
    `Found ${filtered.length} matching queued task(s):`,
    "",
  ];

  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    lines.push(`${i + 1}. **${t.title}**`);
    lines.push(`   Agent: ${t.agent ?? "unassigned"}`);
    if (t.branch) lines.push(`   Branch: ${t.branch}`);
    if (t.group) lines.push(`   Group: ${t.group}`);
    if (t.description) lines.push(`   ${t.description.slice(0, 120)}`);
    lines.push("");
  }

  lines.push(`Max iterations: ${config.maxIterations}`);
  lines.push("", "Run without --dry-run to execute.");

  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

export async function runRalph(argv: string[] = []): Promise<string> {
  const args = parseRalphArgs(argv);
  if (args.error) return `Usage error: ${args.error}`;

  const config: RalphConfig = {
    taskBoardPath: ".cortex/tasks.md",
    logPath: ".cortex/log.md",
    activePath: ".cortex/active.md",
    basePath: process.cwd(),
    maxIterations: args.maxIterations ?? 20,
    maxStuckCount: 3,
    filter: {
      ...(args.group ? { group: args.group } : {}),
      ...(args.agent ? { agent: args.agent } : {}),
      ...(args.task ? { taskTitle: args.task } : {}),
    },
    claude: {
      model: "sonnet",
      maxTurns: 50,
      maxBudgetUsd: 10.0,
      timeoutMs: 600_000,
    },
    codex: {
      sandboxMode: "workspace-write",
      timeoutMs: 600_000,
    },
  };

  // Dry-run mode: show what would happen without executing
  if (args.dryRun) {
    return runDryRun(config);
  }

  // Real execution
  const verbose = args.verbose ?? false;
  const loop = new RalphLoop(config, (event: RalphEvent) => {
    const line = formatEvent(event, verbose);
    if (line) console.log(line);
  });

  // Graceful shutdown on signals
  const abort = () => {
    console.log("\n[ralph] Received shutdown signal, finishing current agent...");
    loop.abort();
  };
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);

  try {
    const result = await loop.run();
    return formatResult(result);
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

// ---------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runRalph(process.argv.slice(2))
    .then((output) => {
      console.log(output);
    })
    .catch((err) => {
      console.error("Ralph failed:", err);
      process.exit(1);
    });
}
