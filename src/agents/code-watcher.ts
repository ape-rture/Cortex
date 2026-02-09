/**
 * Code Watcher Agent (local_script)
 *
 * Checks git hygiene: unpushed commits across monitored repos.
 * Produces alerts when commits have been sitting unpushed.
 *
 * No LLM calls, no memory updates. Pure local computation.
 */

import type { AgentOutput, Finding, Urgency } from "../core/types/agent-output.js";
import type { AgentFunction } from "../core/agent-runner.js";
import { SimpleGitMonitor } from "../core/git-monitor.js";

function urgencyFromHours(hours: number): Urgency {
  if (hours >= 48) return "high";
  if (hours >= 24) return "medium";
  return "low";
}

export const codeWatcherAgent: AgentFunction = async (context) => {
  // Default: monitor the current project. Can be extended via config.
  const monitor = new SimpleGitMonitor({ repos: [context.basePath] });

  try {
    const reports = await monitor.checkAll();

    const findings: Finding[] = reports.map((report) => ({
      type: report.oldest_hours >= 24 ? ("alert" as const) : ("suggestion" as const),
      summary: `${report.repo_name}: ${report.count} unpushed commit${report.count === 1 ? "" : "s"} on ${report.branch} (oldest: ${Math.round(report.oldest_hours)}h ago)`,
      detail: report.commit_summaries.length > 0
        ? report.commit_summaries.map((c) => `- ${c}`).join("\n")
        : undefined,
      urgency: urgencyFromHours(report.oldest_hours),
      confidence: 1.0,
      suggested_action: `Push commits on ${report.branch} in ${report.repo_name}`,
      context_refs: [report.repo_path],
      requires_human: false,
    }));

    return {
      agent: context.agent,
      timestamp: new Date().toISOString(),
      findings,
      memory_updates: [],
      errors: [],
    };
  } catch (err) {
    return {
      agent: context.agent,
      timestamp: new Date().toISOString(),
      findings: [],
      memory_updates: [],
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
};
