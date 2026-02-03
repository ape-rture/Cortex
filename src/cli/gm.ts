import path from "node:path";
import { readMarkdownFile, parseTaskQueue } from "../utils/markdown.js";
import { fetchTodayEvents } from "../integrations/google-calendar.js";
import { SimpleGitMonitor } from "../core/git-monitor.js";
import { MarkdownSessionSnapshotStore } from "../core/session-snapshot.js";
import { MarkdownContactStore } from "../utils/contact-store.js";
import { SimpleDecayDetector } from "../core/decay-detector.js";

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

function summarizeGit(reports: readonly { repo_name: string; branch: string; count: number; oldest_hours: number }[]): string {
  if (reports.length === 0) return "(no unpushed commits)";
  return reports
    .map((report) => `- ${report.repo_name} (${report.branch}): ${report.count} unpushed (oldest ${report.oldest_hours}h)`)
    .join("\n");
}

function summarizeSnapshot(snapshot: { working_on: string; next_steps: readonly string[] } | undefined): string {
  if (!snapshot) return "(no snapshot)";
  const lines = [
    `Working on: ${snapshot.working_on}`,
    ...snapshot.next_steps.slice(0, 3).map((item) => `- ${item}`),
  ];
  return lines.join("\n");
}

function summarizeDecay(alerts: readonly { contact: { name: string; company?: string }; daysSinceContact: number; lastTopic?: string }[]): string {
  if (alerts.length === 0) return "(no relationship alerts)";
  return alerts
    .map((alert) => {
      const who = alert.contact.company ? `${alert.contact.name} (${alert.contact.company})` : alert.contact.name;
      const topic = alert.lastTopic ? ` — ${alert.lastTopic}` : "";
      return `- ${who}: ${alert.daysSinceContact} days since last contact${topic}`;
    })
    .join("\n");
}

export async function runMorningBriefing(): Promise<string> {
  const weeklyFocusPath = path.resolve("context", "weekly-focus.md");
  const pendingPath = path.resolve("actions", "pending.md");
  const queuePath = path.resolve("actions", "queue.md");

  const [weeklyFocus, pendingActions, queueContent, calendar, gitReports, snapshot, decayAlerts] = await Promise.all([
    readMarkdownFile(weeklyFocusPath).catch(() => "(missing weekly-focus.md)"),
    readMarkdownFile(pendingPath).catch(() => "(missing pending.md)"),
    readMarkdownFile(queuePath).catch(() => ""),
    fetchTodayEvents(),
    new SimpleGitMonitor().checkAll(),
    new MarkdownSessionSnapshotStore().load(),
    new SimpleDecayDetector(new MarkdownContactStore()).detectDecay().catch(() => []),
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
  output.push(formatSection("Git", summarizeGit(gitReports)));
  output.push(formatSection("Relationship Alerts", summarizeDecay(decayAlerts)));
  output.push(formatSection("Picking Up Where We Left Off", summarizeSnapshot(snapshot)));

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
