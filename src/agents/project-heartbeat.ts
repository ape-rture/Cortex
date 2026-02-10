/**
 * Project Heartbeat Agent (local_script)
 *
 * Checks active project repositories for stale activity,
 * unpushed commits, and stale local branches.
 */

import type { AgentOutput, Finding, Urgency } from "../core/types/agent-output.js";
import type { AgentFunction } from "../core/agent-runner.js";
import { ProjectHeartbeatMonitor } from "../core/project-heartbeat.js";

function urgencyFromReport(
  daysSinceLastCommit: number,
  unpushedCommitCount: number,
  staleBranchCount: number,
  hasError: boolean,
): Urgency {
  if (hasError || daysSinceLastCommit > 14) return "high";
  if (daysSinceLastCommit > 7 || unpushedCommitCount > 0 || staleBranchCount > 0) return "medium";
  return "low";
}

function toFinding(report: {
  projectName: string;
  projectPath: string;
  currentBranch: string;
  daysSinceLastCommit: number;
  unpushedCommitCount: number;
  staleBranchCount: number;
  error?: string;
}): Finding | null {
  if (
    !report.error &&
    report.daysSinceLastCommit <= 7 &&
    report.unpushedCommitCount === 0 &&
    report.staleBranchCount === 0
  ) {
    return null;
  }

  if (report.error) {
    return {
      type: "alert",
      summary: `${report.projectName}: ${report.error}`,
      urgency: "high",
      confidence: 1.0,
      suggested_action: `Open ${report.projectPath} and verify git access`,
      context_refs: [report.projectPath],
      requires_human: false,
    };
  }

  const details = [
    `branch: ${report.currentBranch}`,
    `days since commit: ${report.daysSinceLastCommit}`,
    `unpushed commits: ${report.unpushedCommitCount}`,
    `stale branches: ${report.staleBranchCount}`,
  ];

  return {
    type: "insight",
    summary: `${report.projectName}: ${details.join(", ")}`,
    urgency: urgencyFromReport(
      report.daysSinceLastCommit,
      report.unpushedCommitCount,
      report.staleBranchCount,
      false,
    ),
    confidence: 1.0,
    suggested_action: `Review git hygiene in ${report.projectName}`,
    context_refs: [report.projectPath],
    requires_human: false,
  };
}

export const projectHeartbeatAgent: AgentFunction = async (context) => {
  const monitor = new ProjectHeartbeatMonitor();

  try {
    const reports = await monitor.checkAll();
    const findings = reports
      .map((report) => toFinding(report))
      .filter((finding): finding is Finding => finding !== null);

    const output: AgentOutput = {
      agent: context.agent,
      timestamp: new Date().toISOString(),
      findings,
      memory_updates: [],
      errors: [],
    };
    return output;
  } catch (error) {
    const output: AgentOutput = {
      agent: context.agent,
      timestamp: new Date().toISOString(),
      findings: [],
      memory_updates: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
    return output;
  }
};
