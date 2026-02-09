/**
 * Sales Watcher Agent (local_script)
 *
 * Checks for stale relationships using SimpleDecayDetector.
 * Produces findings for contacts that haven't been contacted recently.
 *
 * No LLM calls, no memory updates. Pure local computation.
 */

import type { AgentOutput, Finding, Urgency } from "../core/types/agent-output.js";
import type { AgentFunction } from "../core/agent-runner.js";
import { SimpleDecayDetector } from "../core/decay-detector.js";
import { MarkdownContactStore } from "../utils/contact-store.js";

function urgencyFromDays(days: number): Urgency {
  if (days >= 60) return "high";
  if (days >= 30) return "medium";
  return "low";
}

export const salesWatcherAgent: AgentFunction = async (context) => {
  const store = new MarkdownContactStore();
  const detector = new SimpleDecayDetector(store);

  try {
    const alerts = await detector.detectDecay();

    const findings: Finding[] = alerts.map((alert) => ({
      type: "alert" as const,
      summary: `No contact with ${alert.contact.name} in ${alert.daysSinceContact} days`,
      detail: alert.lastTopic
        ? `Last topic: ${alert.lastTopic}`
        : undefined,
      urgency: urgencyFromDays(alert.daysSinceContact),
      confidence: 0.95,
      suggested_action: alert.suggestedAction,
      context_refs: alert.contact.filePath ? [alert.contact.filePath] : [],
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
