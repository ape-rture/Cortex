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
import { runMail } from "../cli/mail.js";
import { runProject } from "../cli/project.js";
import { runOrchestrate } from "../cli/orchestrate.js";
import { MarkdownTaskQueue } from "./task-queue.js";
import { interceptCommandShortcut } from "./command-interceptor.js";
import {
  formatQueueSummary,
  listFailedSourceTasks,
  parseQueueLimitArg,
  retryFailedSourceTasks,
  retryQueueTaskById,
  summarizeQueue,
} from "./queue-admin.js";
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

function relativeAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function runInboxCommand(args: string): Promise<string> {
  const queue = new MarkdownTaskQueue();
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] ?? "").toLowerCase();

  // /inbox done <id> - mark as done
  if (sub === "done") {
    const taskId = parts[1];
    if (!taskId) return "Usage: /inbox done <task-id>";
    await queue.update(taskId, "done");
    return `Marked ${taskId} as done.`;
  }

  // /inbox cancel <id> - mark as cancelled
  if (sub === "cancel") {
    const taskId = parts[1];
    if (!taskId) return "Usage: /inbox cancel <task-id>";
    await queue.update(taskId, "cancelled");
    return `Cancelled ${taskId}.`;
  }

  // /inbox (default) - list unprocessed Slack/Telegram captures
  const tasks = await queue.list({ status: "queued" });
  const inboxTasks = tasks
    .filter((t) => t.source === "slack" || t.source === "telegram")
    .sort((a, b) => {
      const byPriority = a.priority.localeCompare(b.priority);
      if (byPriority !== 0) return byPriority;
      return a.created_at.localeCompare(b.created_at);
    });

  if (inboxTasks.length === 0) return "Inbox empty.";

  const lines = [`**Inbox** - ${inboxTasks.length} item${inboxTasks.length === 1 ? "" : "s"}`, ""];
  for (const task of inboxTasks) {
    const age = relativeAge(task.created_at);
    const preview = task.title.length > 80 ? `${task.title.slice(0, 77)}...` : task.title;
    lines.push(`- \`${task.id}\` (${task.priority}, ${age}) ${preview}`);
  }
  lines.push("", "_Use `/inbox done <id>` or `/inbox cancel <id>` to clear items._");
  return lines.join("\n");
}

function parseQueueSourceArg(value: string | undefined): "slack" | "telegram" | undefined {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "slack" || normalized === "telegram") return normalized;
  return undefined;
}

async function runQueueCommand(args: string): Promise<string> {
  const queue = new MarkdownTaskQueue();
  const parts = args.trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] ?? "status").toLowerCase();

  if (sub === "status" || sub === "summary") {
    const summary = await summarizeQueue(queue);
    return formatQueueSummary(summary);
  }

  if (sub === "failed") {
    const sourceFromFirstArg = parseQueueSourceArg(parts[1]);
    const limit = parseQueueLimitArg(sourceFromFirstArg ? undefined : parts[1], 10);
    const source = sourceFromFirstArg ?? parseQueueSourceArg(parts[2]) ?? "slack";
    return await listFailedSourceTasks(queue, { limit, source });
  }

  if (sub === "retry") {
    const target = (parts[1] ?? "").trim();
    if (!target) {
      return "Usage: /queue retry <task-id|failed>";
    }

    if (target === "failed" || target === "all" || target === "all-failed") {
      const source = parseQueueSourceArg(parts[2]) ?? "slack";
      return await retryFailedSourceTasks(queue, source);
    }

    return await retryQueueTaskById(queue, target);
  }

  return "Usage: /queue status | /queue failed [limit] [slack|telegram] | /queue retry <task-id|failed> [slack|telegram]";
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
    "/mail": (args) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      return runMail(parts);
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
    "/inbox": (args) => runInboxCommand(args),
    "/queue": (args) => runQueueCommand(args),
    "/contacts": async (args) => {
      const query = args.trim();
      const store = new MarkdownContactStore();
      if (!query) {
        const all = await store.loadAll();
        if (all.length === 0) return "(no contacts)";
        return all.map((c) => `- **${c.name}**${c.company ? ` (${c.company})` : ""} â€” ${c.type}`).join("\n");
      }
      const results = await store.search(query);
      if (results.length === 0) return `No contacts matching "${query}"`;
      return results.map((c) => `- **${c.name}**${c.company ? ` (${c.company})` : ""} â€” ${c.type}`).join("\n");
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
  const intercepted = interceptCommandShortcut(prompt);
  const input = intercepted.prompt;

  // Morning briefing (special: hybrid mode)
  const morning = parseMorningCommand(input);
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
  const normalized = input.trim().toLowerCase();
  if (normalized === "digest") {
    const content = await runDailyDigest();
    return { content, modelUsed: "local:digest" };
  }

  // Slash command registry
  const commands = getCommandRegistry();
  const match = input.trim().match(/^(\/\w+)(?:\s+(.*))?$/);
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

