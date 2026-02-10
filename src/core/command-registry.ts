/**
 * Shared Command Registry
 *
 * Extracted from src/ui/handlers/chat.ts so both the web terminal
 * and Slack bot can resolve the same commands.
 *
 * Every command takes a string (args after the command name) and
 * returns a markdown string result. The caller is responsible for
 * formatting the output for their specific transport (HTML, Slack mrkdwn, etc.).
 */

import { runMorningBriefing } from "../cli/gm.js";
import { runDailyDigest } from "../cli/digest.js";
import { runMeetingPrep } from "../cli/prep.js";
import { runContent } from "../cli/content.js";
import { runProject } from "../cli/project.js";
import { runOrchestrate } from "../cli/orchestrate.js";
import { MarkdownTaskQueue } from "./task-queue.js";
import { MarkdownContactStore } from "../utils/contact-store.js";
import { MarkdownSessionSnapshotStore } from "./session-snapshot.js";
import { ConfigRouter } from "./routing.js";
import type { AgentEvent } from "./types/events.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandHandler = (args: string) => Promise<string>;

export interface CommandResult {
  readonly content: string;
  readonly modelUsed: string;
}

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

/** Simple slash commands: /command [args] -> local result */
export function getCommandRegistry(): Record<string, CommandHandler> {
  return {
    "/digest": () => runDailyDigest(),
    "/prep": (args) => {
      if (!args.trim()) return Promise.resolve('Usage: /prep "Contact Name"');
      return runMeetingPrep(args.trim());
    },
    "/content": (args) => {
      const parts = args.trim().split(/\s+/);
      return runContent(parts.filter(Boolean));
    },
    "/project": (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        return runProject(["status"]);
      }
      return runProject(parts);
    },
    "/orchestrate": (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      return runOrchestrate(parts);
    },
    "/tasks": async () => {
      const queue = new MarkdownTaskQueue();
      const tasks = await queue.list();
      if (tasks.length === 0) return "(no tasks in queue)";
      const lines = ["# Task Queue", ""];
      for (const task of tasks) {
        lines.push(`- [${task.status}] **${task.title}** (${task.priority})`);
        if (task.description) lines.push(`  ${task.description}`);
      }
      return lines.join("\n");
    },
    "/contacts": async (args) => {
      const query = args.trim();
      const store = new MarkdownContactStore();
      if (!query) {
        const all = await store.loadAll();
        if (all.length === 0) return "(no contacts)";
        return all.map((c) => `- **${c.name}**${c.company ? ` (${c.company})` : ""} — ${c.type}`).join("\n");
      }
      const results = await store.search(query);
      if (results.length === 0) return `No contacts matching "${query}"`;
      return results.map((c) => `- **${c.name}**${c.company ? ` (${c.company})` : ""} — ${c.type}`).join("\n");
    },
    "/snapshot": async () => {
      const snapshot = await new MarkdownSessionSnapshotStore().load();
      if (!snapshot) return "(no session snapshot)";
      const lines = [
        `# Session Snapshot`,
        "",
        `**Working on:** ${snapshot.working_on}`,
        "",
        "**Next steps:**",
        ...snapshot.next_steps.map((s) => `- ${s}`),
      ];
      if (snapshot.open_questions?.length) {
        lines.push("", "**Open questions:**");
        for (const q of snapshot.open_questions) lines.push(`- ${q}`);
      }
      return lines.join("\n");
    },
  };
}

// ---------------------------------------------------------------------------
// Morning command (special: supports hybrid mode with LLM follow-up)
// ---------------------------------------------------------------------------

export function parseMorningCommand(value: string): { instruction?: string } | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gm" || normalized === "/gm" || normalized === "good morning" || normalized === "morning") {
    return {};
  }

  const slashWithArg = value.trim().match(/^\/gm\s+(.+)$/i);
  if (slashWithArg) {
    const instruction = slashWithArg[1].trim();
    return instruction ? { instruction } : {};
  }

  return null;
}

// ---------------------------------------------------------------------------
// Orchestrator event formatting
// ---------------------------------------------------------------------------

export function formatOrchestratorEvent(event: AgentEvent): string {
  if (event.type === "started") {
    return `- ${event.agent}: started`;
  }
  if (event.type === "action") {
    return `- ${event.agent}: ${event.action.kind} ${event.action.label} (${event.phase})`;
  }
  if (event.ok) {
    return `- ${event.agent}: completed`;
  }
  return `- ${event.agent}: failed (${event.error ?? "unknown error"})`;
}

// ---------------------------------------------------------------------------
// Resolve prompt to command
// ---------------------------------------------------------------------------

export async function resolveCommand(
  prompt: string,
  router: ConfigRouter,
): Promise<CommandResult | null> {
  // Morning briefing (special: hybrid mode)
  const morning = parseMorningCommand(prompt);
  if (morning) {
    const briefing = await runMorningBriefing();
    if (!morning.instruction) {
      return { content: briefing, modelUsed: "local:gm" };
    }

    const response = await router.route({
      task_type: "complex_reasoning",
      system_prompt: "You're a personal assistant. Help with the user's request based on their briefing.",
      prompt: `Here's my morning briefing:\n\n${briefing}\n\nUser request: ${morning.instruction}`,
    });
    return {
      content: response.content,
      modelUsed: `hybrid:gm+${response.model_used}`,
    };
  }

  // Legacy aliases (no slash)
  const normalized = prompt.trim().toLowerCase();
  if (normalized === "digest") {
    const content = await runDailyDigest();
    return { content, modelUsed: "local:digest" };
  }

  // Slash command registry
  const commands = getCommandRegistry();
  const match = prompt.trim().match(/^(\/\w+)(?:\s+(.*))?$/);
  if (match) {
    const cmd = match[1].toLowerCase();
    const args = match[2] ?? "";
    const handler = commands[cmd];
    if (handler) {
      const content = await handler(args);
      const tag = cmd.slice(1); // remove leading /
      return { content, modelUsed: `local:${tag}` };
    }
  }

  return null;
}
