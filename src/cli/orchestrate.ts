/**
 * Orchestrator CLI
 *
 * Run Cortex orchestrator cycle: spawn agents, score findings, surface results.
 *
 * Usage:
 *   npm run orchestrate                          # run all agents
 *   npm run orchestrate -- --agents=sales,code   # run specific agents
 *   npm run orchestrate -- --verbose             # show all findings, not just surfaced
 *   npm run orchestrate -- --history             # show recent cycle history
 */

import { fileURLToPath } from "node:url";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import type { Trigger } from "../core/types/orchestrator.js";
import type { ScoredFinding } from "../core/types/agent-output.js";

// ---------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------

interface OrchestrateArgs {
  agents?: string[];
  verbose?: boolean;
  showHistory?: boolean;
}

function parseArgs(argv: readonly string[]): OrchestrateArgs {
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

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

let orchestrator: CortexOrchestrator;

export async function runOrchestrate(argv: string[] = []): Promise<string> {
  const args = parseArgs(argv);

  orchestrator = new CortexOrchestrator();

  // Register local agents
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);

  // Show history if requested
  if (args.showHistory) {
    const cycles = orchestrator.history(5);
    if (cycles.length === 0) {
      return "No cycle history available (history is in-memory only).";
    }
    const lines = ["# Orchestrator History\n"];
    for (const cycle of cycles) {
      lines.push(`- **${cycle.cycle_id}** (${cycle.started_at}): ${cycle.agents_spawned.length} agents, ${cycle.surfaced.length} surfaced findings`);
    }
    return lines.join("\n");
  }

  // Build trigger
  const allAgents = ["sales-watcher", "content-scanner", "code-watcher"];
  const trigger: Trigger = {
    type: "cli",
    agents: args.agents ?? allAgents,
  };

  // Run cycle
  const cycle = await orchestrator.runCycle(trigger);

  // Format output
  const lines: string[] = [];
  lines.push(`# Orchestrator Cycle: ${cycle.cycle_id}`);
  lines.push(`Started: ${cycle.started_at} | Agents: ${cycle.agents_spawned.length} | Findings: ${cycle.scored_findings.length} | Surfaced: ${cycle.surfaced.length}`);
  lines.push("");

  // Surfaced findings
  if (cycle.surfaced.length > 0) {
    lines.push("## Surfaced Findings\n");
    cycle.surfaced.forEach((sf, i) => {
      lines.push(formatFinding(sf, i));
    });
    lines.push("");
  } else {
    lines.push("*No findings passed the fame threshold.*\n");
  }

  // Verbose: show all findings
  if (args.verbose && cycle.scored_findings.length > cycle.surfaced.length) {
    lines.push("## All Findings\n");
    cycle.scored_findings.forEach((sf, i) => {
      const marker = sf.salience >= 0.3 ? "" : " (below threshold)";
      lines.push(`${i + 1}. [${urgencyBadge(sf.finding.urgency)}] ${sf.finding.summary} — salience: ${sf.salience}${marker}`);
    });
    lines.push("");
  }

  // Errors
  const agentErrors = cycle.agent_outputs.flatMap((o) =>
    o.errors.map((e) => `${o.agent}: ${e}`),
  );
  if (agentErrors.length > 0) {
    lines.push("## Errors\n");
    agentErrors.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }

  lines.push(`Completed: ${cycle.completed_at}`);
  return lines.join("\n");
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
