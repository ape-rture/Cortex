import "dotenv/config";
import path from "node:path";
import { readMarkdownFile, parseTaskQueue } from "../utils/markdown.js";
import type { GmailMailSummary, GmailMessageHeader } from "../core/types/gmail.js";
import { fetchTodayEvents } from "../integrations/google-calendar.js";
import { GMAIL_ACCOUNTS, GoogleGmailClient } from "../integrations/gmail.js";
import { FocusClient } from "../integrations/focus.js";
import { SimpleGitMonitor } from "../core/git-monitor.js";
import { ProjectHeartbeatMonitor } from "../core/project-heartbeat.js";
import { MarkdownSessionSnapshotStore } from "../core/session-snapshot.js";
import { MarkdownContactStore } from "../utils/contact-store.js";
import { SimpleDecayDetector } from "../core/decay-detector.js";
import { MarkdownContentStore } from "../core/content-store.js";
import { fetchLinkedInAcceptances, formatLinkedInAcceptances } from "./linkedin-acceptances.js";

function formatSection(title: string, body: string): string {
  return `## ${title}\n${body.trim()}\n`;
}

function summarizeTasks(queueMarkdown: string): string {
  const tasks = parseTaskQueue(queueMarkdown);
  if (tasks.length === 0) return "(no queued tasks)";
  const lines = tasks.slice(0, 8).map((task) => `- [${task.status}] ${task.title}`);
  return lines.join("\n");
}

function summarizeTelegramInbox(queueMarkdown: string): string {
  const tasks = parseTaskQueue(queueMarkdown);
  const telegramTasks = tasks.filter((t) => t.source === "telegram");
  if (telegramTasks.length === 0) return "(no captured messages)";

  const pending = telegramTasks.filter((t) => t.status === "queued");
  const needsReview = telegramTasks.filter((t) => t.status === "blocked");
  const routed = telegramTasks.filter((t) => t.status === "done" && t.result?.startsWith("\u2192"));

  const sections: string[] = [];

  if (pending.length > 0) {
    sections.push(`**Pending** (${pending.length}):\n${pending.map((t) => `- ${t.title}`).join("\n")}`);
  }
  if (needsReview.length > 0) {
    sections.push(`**Needs review** (${needsReview.length}):\n${needsReview.map((t) => `- ${t.title}`).join("\n")}`);
  }
  if (routed.length > 0) {
    const recent = routed.slice(-5);
    sections.push(`**Recently routed** (${routed.length}):\n${recent.map((t) => `- ${t.title} ${t.result}`).join("\n")}`);
  }

  if (sections.length === 0) return "(no captured messages)";
  return sections.join("\n\n");
}

function summarizeEvents(events: { summary: string; start: string; end: string }[]): string {
  if (events.length === 0) return "(no events today)";
  return events
    .map((event) => `- ${event.summary} (${event.start} -> ${event.end})`)
    .join("\n");
}

const URGENT_SUBJECT_PATTERN = /\b(urgent|asap|action required|deadline|due|eod|important|follow up|reply needed)\b/i;
const MONEY_PATTERN = /\b(invoice|payment|paid|overdue|billing|refund|\$\d+)\b/i;

/** Gmail auto-assigned category labels — low value for morning triage. */
const NOISE_LABELS = new Set([
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_FORUMS",
]);

function scoreUrgency(message: GmailMessageHeader, accountEmail?: string): number {
  let score = 0;

  // Penalize noise categories heavily — promotions/social/forums shouldn't surface
  for (const label of message.labelIds) {
    if (NOISE_LABELS.has(label)) {
      score -= 200;
      break;
    }
  }

  // Subject urgency keywords
  if (URGENT_SUBJECT_PATTERN.test(message.subject)) score += 100;

  // Money/billing signals in subject or snippet
  if (MONEY_PATTERN.test(message.subject) || MONEY_PATTERN.test(message.snippet)) score += 60;

  // Gmail's IMPORTANT label
  if (message.labelIds.includes("IMPORTANT")) score += 40;

  // Question in subject — likely expects a reply
  if (message.subject.includes("?")) score += 30;

  // Direct-to: user is an explicit recipient (not just CC'd or BCC'd)
  if (accountEmail) {
    const emailLower = accountEmail.toLowerCase();
    if (message.to.some((r) => r.toLowerCase().includes(emailLower))) score += 25;
  }

  // Internal work emails (same domain) get a boost
  if (message.accountId === "indexing" && message.from.includes("@indexing.co")) score += 20;

  // Read = already handled. Heavy penalty so they don't surface.
  if (message.isUnread) score += 30;
  else score -= 150;

  if (message.hasAttachments) score += 5;

  // Recency bonus (bounded, decays by 1 point per day)
  const parsedDate = Date.parse(message.date);
  if (!Number.isNaN(parsedDate)) {
    score += Math.max(0, 20 - Math.floor((Date.now() - parsedDate) / (1000 * 60 * 60 * 24)));
  }

  return score;
}

function summarizeMail(summary: GmailMailSummary): string {
  if (summary.accounts.length === 0) return "(mail unavailable)";

  const lines: string[] = [];
  lines.push(`Total unread: ${summary.totalUnread}`);
  for (const account of summary.accounts) {
    lines.push(`- ${account.label} (${account.email}): ${account.unreadCount}`);
    if (account.warning) {
      lines.push(`  warning: ${account.warning}`);
    }
  }

  // Build email lookup for direct-to scoring
  const emailByAccount = new Map(
    summary.accounts.map((a) => [a.accountId, a.email]),
  );

  const scored = summary.accounts
    .flatMap((account) => account.topUnread.map((message) => ({
      accountLabel: account.label,
      message,
      score: scoreUrgency(message, emailByAccount.get(account.accountId)),
    })))
    .sort((a, b) => b.score - a.score);

  // Split: actionable (positive score) vs noise (promotions, social, etc.)
  const actionable = scored.filter((e) => e.score > 0).slice(0, 5);
  const noiseCount = scored.filter((e) => e.score <= 0).length;

  if (actionable.length === 0) {
    lines.push("");
    lines.push("Action needed: (none)");
    if (noiseCount > 0) {
      lines.push(`(${noiseCount} low-priority emails filtered)`);
    }
    return lines.join("\n");
  }

  lines.push("");
  lines.push("**Action needed:**");
  for (const entry of actionable) {
    const snippet = entry.message.snippet.length > 80
      ? entry.message.snippet.slice(0, 80) + "..."
      : entry.message.snippet;
    lines.push(`- [${entry.accountLabel}] ${entry.message.subject} (${entry.message.from})`);
    if (snippet) {
      lines.push(`  > ${snippet}`);
    }
  }

  if (noiseCount > 0) {
    lines.push("");
    lines.push(`(${noiseCount} low-priority emails filtered)`);
  }

  return lines.join("\n");
}

function buildMailFallback(error: unknown): GmailMailSummary {
  const message = error instanceof Error ? error.message : "unknown error";
  return {
    totalUnread: 0,
    accounts: GMAIL_ACCOUNTS.map((account) => ({
      accountId: account.id,
      label: account.label ?? account.id,
      email: account.email,
      unreadCount: 0,
      topUnread: [],
      warning: `Gmail unavailable: ${message}`,
    })),
  };
}

function summarizeGit(reports: readonly { repo_name: string; branch: string; count: number; oldest_hours: number }[]): string {
  if (reports.length === 0) return "(no unpushed commits)";
  return reports
    .map((report) => `- ${report.repo_name} (${report.branch}): ${report.count} unpushed (oldest ${report.oldest_hours}h)`)
    .join("\n");
}

function summarizeProjectHealth(
  reports: readonly {
    projectName: string;
    currentBranch: string;
    daysSinceLastCommit: number;
    unpushedCommitCount: number;
    staleBranchCount: number;
    error?: string;
  }[],
): string {
  const flagged = reports.filter(
    (report) =>
      Boolean(report.error) ||
      report.daysSinceLastCommit > 7 ||
      report.unpushedCommitCount > 0 ||
      report.staleBranchCount > 0,
  );

  if (flagged.length === 0) return "(all active projects healthy)";

  return flagged.map((report) => {
    if (report.error) {
      return `- ${report.projectName}: ${report.error}`;
    }

    const parts: string[] = [];
    if (report.daysSinceLastCommit > 7) parts.push(`${report.daysSinceLastCommit}d since commit`);
    if (report.unpushedCommitCount > 0) parts.push(`${report.unpushedCommitCount} unpushed`);
    if (report.staleBranchCount > 0) parts.push(`${report.staleBranchCount} stale branches`);
    const summary = parts.length > 0 ? parts.join(", ") : "healthy";
    return `- ${report.projectName} (${report.currentBranch}): ${summary}`;
  }).join("\n");
}

function summarizeSnapshot(snapshot: { working_on: string; next_steps: readonly string[] } | undefined): string {
  if (!snapshot) return "(no snapshot)";
  const lines = [
    `Working on: ${snapshot.working_on}`,
    ...snapshot.next_steps.slice(0, 3).map((item) => `- ${item}`),
  ];
  return lines.join("\n");
}

function summarizeContentPipeline(
  ideas: readonly { status: string }[],
  seedCount: { unprocessed: number; promoted: number },
): string {
  if (ideas.length === 0 && seedCount.unprocessed === 0) return "(no content in pipeline)";

  const statusCounts: Record<string, number> = {};
  for (const idea of ideas) {
    statusCounts[idea.status] = (statusCounts[idea.status] ?? 0) + 1;
  }

  const lines: string[] = [];
  for (const [status, count] of Object.entries(statusCounts)) {
    lines.push(`- ${status}: ${count}`);
  }
  if (seedCount.unprocessed > 0) {
    lines.push(`- unprocessed seeds: ${seedCount.unprocessed}`);
  }
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

function summarizePostingReminders(
  ideas: readonly { status: string; topic: string; platform: string }[],
): string {
  const ready = ideas.filter((i) => i.status === "draft" || i.status === "approved");

  const lines: string[] = [];

  // X reminder
  lines.push("**X (Twitter)**");
  const xDraft = ready.find((i) => i.platform === "x");
  if (xDraft) {
    lines.push(`- Ready to post: "${xDraft.topic}"`);
  } else {
    lines.push("- No draft ready. Consider sharing a quick insight or thread today.");
  }

  lines.push("");

  // LinkedIn reminder
  lines.push("**LinkedIn**");
  const liDraft = ready.find((i) => i.platform === "linkedin");
  if (liDraft) {
    lines.push(`- Ready to post: "${liDraft.topic}"`);
  } else {
    lines.push("- No draft ready. Consider posting about a recent project or lesson learned.");
  }

  return lines.join("\n");
}

export async function runMorningBriefing(): Promise<string> {
  const weeklyFocusPath = path.resolve("context", "weekly-focus.md");
  const pendingPath = path.resolve("actions", "pending.md");
  const queuePath = path.resolve("actions", "queue.md");

  const contentStore = new MarkdownContentStore();
  const gmailClient = new GoogleGmailClient();
  const focusClient = new FocusClient();

  const [weeklyFocus, pendingActions, queueContent, calendar, mailSummary, gitReports, projectHealth, snapshot, decayAlerts, contentIdeas, contentSeeds] = await Promise.all([
    readMarkdownFile(weeklyFocusPath).catch(() => "(missing weekly-focus.md)"),
    readMarkdownFile(pendingPath).catch(() => "(missing pending.md)"),
    readMarkdownFile(queuePath).catch(() => ""),
    fetchTodayEvents(),
    gmailClient.fetchMailSummary(10).catch((error) => buildMailFallback(error)),
    new SimpleGitMonitor().checkAll(),
    new ProjectHeartbeatMonitor().checkAll(),
    new MarkdownSessionSnapshotStore().load(),
    new SimpleDecayDetector(new MarkdownContactStore()).detectDecay().catch(() => []),
    contentStore.loadIdeas().catch(() => [] as const),
    contentStore.loadSeeds().catch(() => [] as const),
  ]);

  // LinkedIn acceptances — fetched after mail summary to avoid slowing down the main batch
  const linkedInAcceptances = await fetchLinkedInAcceptances(gmailClient, focusClient).catch(() => []);

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
  output.push(formatSection("Telegram Inbox", summarizeTelegramInbox(queueContent)));
  output.push(formatSection("Pending Actions", pendingActions));
  output.push(formatSection("Task Queue", summarizeTasks(queueContent)));
  output.push(formatSection("Calendar", [calendarSummary, calendarSources].filter(Boolean).join("\n")));
  output.push(formatSection("Email", summarizeMail(mailSummary)));
  output.push(formatSection("LinkedIn Acceptances", formatLinkedInAcceptances(linkedInAcceptances)));
  output.push(formatSection("Git", summarizeGit(gitReports)));
  output.push(formatSection("Project Health", summarizeProjectHealth(projectHealth)));
  output.push(formatSection("Relationship Alerts", summarizeDecay(decayAlerts)));
  const unprocessedSeeds = contentSeeds.filter((s) => !s.promoted).length;
  const promotedSeeds = contentSeeds.length - unprocessedSeeds;
  output.push(formatSection("Content Pipeline", summarizeContentPipeline(contentIdeas, { unprocessed: unprocessedSeeds, promoted: promotedSeeds })));
  output.push(formatSection("Post Today", summarizePostingReminders(contentIdeas)));
  output.push(formatSection("Picking Up Where We Left Off", summarizeSnapshot(snapshot)));

  return output.join("\n").trimEnd() + "\n";
}

import { fileURLToPath } from "node:url";

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runMorningBriefing()
    .then((text) => {
      console.log(text);
    })
    .catch((err) => {
      console.error("Failed to run morning briefing:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
