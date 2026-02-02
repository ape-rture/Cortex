import path from "node:path";
import { readMarkdownFile, parseTaskQueue } from "../utils/markdown.js";
import { fetchTodayEvents } from "../integrations/google-calendar.js";

function formatSection(title: string, body: string): string {
  return `## ${title}\n${body.trim()}\n`;
}

function summarizeTasks(queueMarkdown: string): string {
  const tasks = parseTaskQueue(queueMarkdown);
  if (tasks.length === 0) return "(no queued tasks)";
  const lines = tasks.slice(0, 8).map((task) => `- [${task.status}] ${task.title}`);
  return lines.join("\n");
}

function summarizeEvents(events: { summary: string; start: string; end: string }[]): string {
  if (events.length === 0) return "(no events today)";
  return events
    .map((event) => `- ${event.summary} (${event.start} -> ${event.end})`)
    .join("\n");
}

export async function runMorningBriefing(): Promise<string> {
  const weeklyFocusPath = path.resolve("context", "weekly-focus.md");
  const pendingPath = path.resolve("actions", "pending.md");
  const queuePath = path.resolve("actions", "queue.md");

  const [weeklyFocus, pendingActions, queueContent, calendar] = await Promise.all([
    readMarkdownFile(weeklyFocusPath).catch(() => "(missing weekly-focus.md)"),
    readMarkdownFile(pendingPath).catch(() => "(missing pending.md)"),
    readMarkdownFile(queuePath).catch(() => ""),
    fetchTodayEvents(),
  ]);

  const calendarSummary = calendar.warning
    ? `(calendar unavailable) ${calendar.warning}`
    : summarizeEvents(calendar.events);
  const calendarSources = calendar.sources?.length
    ? `Sources: ${calendar.sources.join(", ")}`
    : "";

  const output: string[] = [];
  output.push("# Morning Briefing");
  output.push("");
  output.push(formatSection("Weekly Focus", weeklyFocus));
  output.push(formatSection("Pending Actions", pendingActions));
  output.push(formatSection("Task Queue", summarizeTasks(queueContent)));
  output.push(formatSection("Calendar", [calendarSummary, calendarSources].filter(Boolean).join("\n")));

  return output.join("\n").trimEnd() + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMorningBriefing()
    .then((text) => {
      console.log(text);
    })
    .catch((err) => {
      console.error("Failed to run morning briefing:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
