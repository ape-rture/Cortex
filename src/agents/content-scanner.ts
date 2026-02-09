/**
 * Content Scanner Agent (local_script)
 *
 * Scans the content pipeline for unprocessed seeds, aging drafts,
 * and empty pipelines. Produces suggestions and insights.
 *
 * No LLM calls, no memory updates. Pure local computation.
 */

import type { AgentOutput, Finding } from "../core/types/agent-output.js";
import type { AgentFunction } from "../core/agent-runner.js";
import { MarkdownContentStore } from "../core/content-store.js";

export const contentScannerAgent: AgentFunction = async (context) => {
  const store = new MarkdownContentStore();
  const findings: Finding[] = [];

  try {
    const [ideas, seeds] = await Promise.all([
      store.loadIdeas(),
      store.loadSeeds(),
    ]);

    // Check for unprocessed seeds
    const unprocessedSeeds = seeds.filter((s) => !s.promoted);
    if (unprocessedSeeds.length > 0) {
      findings.push({
        type: "suggestion",
        summary: `${unprocessedSeeds.length} unprocessed content seed${unprocessedSeeds.length === 1 ? "" : "s"} waiting for review`,
        detail: unprocessedSeeds
          .slice(0, 3)
          .map((s) => `- ${s.insight.slice(0, 80)}`)
          .join("\n"),
        urgency: "low",
        confidence: 1.0,
        suggested_action: "Run `npm run content seeds` to review, then `npm run content promote <id>`",
        context_refs: ["projects/content-seeds.md"],
        requires_human: false,
      });
    }

    // Check for ideas stuck in draft status
    const drafts = ideas.filter((i) => i.status === "draft");
    if (drafts.length > 0) {
      findings.push({
        type: "insight",
        summary: `${drafts.length} content draft${drafts.length === 1 ? "" : "s"} in progress`,
        urgency: "low",
        confidence: 0.9,
        suggested_action: "Run `npm run content list --status=draft` to review drafts",
        context_refs: ["projects/content-ideas.md"],
        requires_human: false,
      });
    }

    // Check for empty pipeline
    if (ideas.length === 0 && seeds.length === 0) {
      findings.push({
        type: "suggestion",
        summary: "Content pipeline is empty — consider adding ideas",
        urgency: "low",
        confidence: 1.0,
        suggested_action: "Run `npm run content add` to capture a new idea",
        context_refs: ["projects/content-ideas.md"],
        requires_human: false,
      });
    }

    // Pipeline health overview (always include)
    const byStatus = ideas.reduce(
      (acc, idea) => {
        acc[idea.status] = (acc[idea.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const statusLine = Object.entries(byStatus)
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");

    if (ideas.length > 0) {
      findings.push({
        type: "insight",
        summary: `Content pipeline: ${ideas.length} idea${ideas.length === 1 ? "" : "s"} (${statusLine})`,
        urgency: "low",
        confidence: 1.0,
        context_refs: ["projects/content-ideas.md"],
        requires_human: false,
      });
    }

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
