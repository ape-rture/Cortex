/**
 * Orchestrator CLI
 *
 * Run Cortex orchestrator cycle: spawn agents, score findings, surface results.
 *
 * Usage:
 *   npm run orchestrate                                # run one CLI trigger cycle
 *   npm run orchestrate -- --agents=sales-watcher      # run specific agents
 *   npm run orchestrate -- --trigger=cron              # run one cron-typed cycle
 *   npm run orchestrate -- --cron                      # run all configured cron triggers once
 *   npm run orchestrate -- --schedule="0 7 * * *"      # attach schedule metadata
 *   npm run orchestrate -- --verbose                   # show all findings
 *   npm run orchestrate -- --history                   # show in-memory cycle history
 */

import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import type { Trigger, TriggerType } from "../core/types/orchestrator.js";
import type { ScoredFinding } from "../core/types/agent-output.js";
import type { OrchestratorConfig, OrchestratorCycle } from "../core/types/orchestrator.js";
import type { AgentEvent } from "../core/types/events.js";

const DEFAULT_CONFIG_PATH = "context/orchestrator.json";
const FALLBACK_AGENTS = ["sales-watcher", "content-scanner", "code-watcher"];

// ---------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------

export interface OrchestrateArgs {
  agents?: string[];
  verbose?: boolean;
  showHistory?: boolean;
  triggerType?: TriggerType;
  schedule?: string;
  runCronTriggers?: boolean;
  error?: string;
}

function isTriggerType(value: string): value is TriggerType {
  return (
    value === "cron" ||
    value === "slack" ||
    value === "webhook" ||
    value === "file_change" ||
    value === "cli" ||
    value === "agent_request"
  );
}

export function parseArgs(argv: readonly string[]): OrchestrateArgs {
  const args: OrchestrateArgs = {};

  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [key, rawValue] = token.slice(2).split("=", 2);

    switch (key) {
      case "agents":
        args.agents = rawValue?.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "verbose":
        args.verbose = true;
        break;
      case "history":
        args.showHistory = true;
        break;
      case "cron":
        args.runCronTriggers = true;
        break;
      case "schedule":
        if (rawValue && rawValue.trim()) {
          args.schedule = rawValue.trim();
        }
        break;
      case "trigger":
        if (!rawValue) {
          args.error = "Missing value for --trigger";
          break;
        }
        {
          const normalized = rawValue.trim();
          if (!isTriggerType(normalized)) {
            args.error = `Invalid trigger type: ${rawValue}`;
            break;
          }
          args.triggerType = normalized;
        }
        break;
      default:
        break;
    }
  }

  return args;
}

// ---------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------

function urgencyBadge(urgency: string): string {
  switch (urgency) {
    case "critical": return "CRITICAL";
    case "high": return "HIGH";
    case "medium": return "MEDIUM";
    case "low": return "LOW";
    default: return urgency.toUpperCase();
  }
}

function formatFinding(sf: ScoredFinding, index: number): string {
  const lines: string[] = [];
  lines.push(`${index + 1}. [${urgencyBadge(sf.finding.urgency)}] ${sf.finding.summary} (agent: ${sf.agent}, salience: ${sf.salience})`);
  if (sf.finding.detail) {
    lines.push(`   > ${sf.finding.detail.split("\n").join("\n   > ")}`);
  }
  if (sf.finding.suggested_action) {
    lines.push(`   Action: ${sf.finding.suggested_action}`);
  }
  return lines.join("\n");
}

function formatCycle(cycle: OrchestratorCycle, verbose = false): string {
  const lines: string[] = [];
  const triggerLabel = cycle.trigger.schedule
    ? `${cycle.trigger.type} (${cycle.trigger.schedule})`
    : cycle.trigger.type;

  lines.push(`# Orchestrator Cycle: ${cycle.cycle_id}`);
  lines.push(`Started: ${cycle.started_at} | Trigger: ${triggerLabel} | Agents: ${cycle.agents_spawned.length} | Findings: ${cycle.scored_findings.length} | Surfaced: ${cycle.surfaced.length}`);
  lines.push("");

  if (cycle.surfaced.length > 0) {
    lines.push("## Surfaced Findings");
    lines.push("");
    cycle.surfaced.forEach((sf, i) => {
      lines.push(formatFinding(sf, i));
    });
    lines.push("");
  } else {
    lines.push("*No findings passed the fame threshold.*");
    lines.push("");
  }

  if (verbose && cycle.scored_findings.length > cycle.surfaced.length) {
    lines.push("## All Findings");
    lines.push("");
    cycle.scored_findings.forEach((sf, i) => {
      const marker = sf.salience >= 0.3 ? "" : " (below threshold)";
      lines.push(`${i + 1}. [${urgencyBadge(sf.finding.urgency)}] ${sf.finding.summary} - salience: ${sf.salience}${marker}`);
    });
    lines.push("");
  }

  const agentErrors = cycle.agent_outputs.flatMap((o) =>
    o.errors.map((e) => `${o.agent}: ${e}`),
  );
  if (agentErrors.length > 0) {
    lines.push("## Errors");
    lines.push("");
    agentErrors.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }

  lines.push(`Completed: ${cycle.completed_at}`);
  return lines.join("\n");
}

function formatCronCycles(cycles: readonly OrchestratorCycle[]): string {
  const lines: string[] = [];
  lines.push("# Orchestrator Cron Run");
  lines.push("");
  lines.push(`Cron triggers run: ${cycles.length}`);
  lines.push("");
  for (const cycle of cycles) {
    const schedule = cycle.trigger.schedule ?? "(no schedule)";
    lines.push(`- ${schedule}: ${cycle.agents_spawned.length} agents, ${cycle.surfaced.length} surfaced findings`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

async function loadConfig(configPath: string): Promise<OrchestratorConfig | undefined> {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return JSON.parse(raw) as OrchestratorConfig;
  } catch {
    return undefined;
  }
}

function pickAgents(
  config: OrchestratorConfig | undefined,
  triggerType: TriggerType,
  schedule: string | undefined,
): string[] {
  if (!config) return [...FALLBACK_AGENTS];
  const candidates = config.triggers.filter((t) => t.type === triggerType);
  if (candidates.length === 0) return [...FALLBACK_AGENTS];

  if (schedule) {
    const exact = candidates.find((t) => t.schedule === schedule);
    if (exact?.agents?.length) return [...exact.agents];
  }
  return candidates[0]?.agents?.length ? [...candidates[0].agents] : [...FALLBACK_AGENTS];
}

function registerDefaultAgents(orchestrator: CortexOrchestrator): void {
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

interface RunOrchestrateOptions {
  configPath?: string;
  onEvent?: (event: AgentEvent) => void;
}

export async function runOrchestrate(
  argv: string[] = [],
  options: RunOrchestrateOptions = {},
): Promise<string> {
  const args = parseArgs(argv);
  if (args.error) return `Usage error: ${args.error}`;

  const configPath =
    options.configPath ??
    process.env.ORCHESTRATOR_CONFIG_PATH ??
    DEFAULT_CONFIG_PATH;

  const orchestrator = new CortexOrchestrator(configPath);
  registerDefaultAgents(orchestrator);
  const unsubscribe = options.onEvent ? orchestrator.onEvent(options.onEvent) : undefined;

  try {
    if (args.showHistory) {
      const cycles = orchestrator.history(5);
      if (cycles.length === 0) {
        return "No cycle history available (history is in-memory only).";
      }
      const lines = ["# Orchestrator History", ""];
      for (const cycle of cycles) {
        lines.push(`- **${cycle.cycle_id}** (${cycle.started_at}): ${cycle.agents_spawned.length} agents, ${cycle.surfaced.length} surfaced findings`);
      }
      return lines.join("\n");
    }

    const config = await loadConfig(configPath);

    if (args.runCronTriggers) {
      const cronTriggers = (config?.triggers ?? []).filter((trigger) => trigger.type === "cron");
      if (cronTriggers.length === 0) {
        return "No cron triggers configured.";
      }

      const cycles: OrchestratorCycle[] = [];
      for (const configured of cronTriggers) {
        const trigger: Trigger = {
          ...configured,
          agents: args.agents ?? [...configured.agents],
        };
        cycles.push(await orchestrator.runCycle(trigger));
      }

      return formatCronCycles(cycles);
    }

    const triggerType = args.triggerType ?? "cli";
    const triggerAgents = args.agents ?? pickAgents(config, triggerType, args.schedule);
    const trigger: Trigger = {
      type: triggerType,
      agents: triggerAgents,
      ...(args.schedule ? { schedule: args.schedule } : {}),
    };

    const cycle = await orchestrator.runCycle(trigger);
    return formatCycle(cycle, args.verbose);
  } finally {
    unsubscribe?.();
  }
}

// ---------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runOrchestrate(process.argv.slice(2))
    .then((output) => {
      console.log(output);
    })
    .catch((err) => {
      console.error("Orchestrator failed:", err);
      process.exit(1);
    });
}
