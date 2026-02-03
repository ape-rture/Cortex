import { promises as fs } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readMarkdownFile, parseTaskQueue } from "../utils/markdown.js";
import type { DailyDigest, DigestGenerator, DigestItem } from "./types/daily-digest.js";

const execAsync = promisify(exec);

const DEFAULT_LOG_PATH = path.resolve(".cortex", "log.md");
const DEFAULT_QUEUE_PATH = path.resolve("actions", "queue.md");
const DEFAULT_PENDING_PATH = path.resolve("actions", "pending.md");
const DEFAULT_DAILY_DIR = path.resolve("daily");

function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractLogEntries(content: string, date: string): string[] {
  const lines = content.split(/\r?\n/);
  const header = `## ${date}`;
  const results: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      inSection = line.startsWith(header);
      continue;
    }
    if (!inSection) continue;
    if (line.trim().startsWith("- ")) {
      results.push(line.replace(/^[-]\s+/, "").trim());
    }
  }
  return results;
}

function parsePendingTasks(content: string): string[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("- [ ]"))
    .map((line) => line.replace(/^- \[ \] /, "").trim());
}

async function gitCommitsSinceMidnight(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git log --oneline --since="midnight"');
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export class MarkdownDigestGenerator implements DigestGenerator {
  private readonly logPath: string;
  private readonly queuePath: string;
  private readonly pendingPath: string;

  constructor(options?: { logPath?: string; queuePath?: string; pendingPath?: string }) {
    this.logPath = options?.logPath ?? DEFAULT_LOG_PATH;
    this.queuePath = options?.queuePath ?? DEFAULT_QUEUE_PATH;
    this.pendingPath = options?.pendingPath ?? DEFAULT_PENDING_PATH;
  }

  async generate(date?: string): Promise<DailyDigest> {
    const targetDate = date ?? todayLocalDate();
    const [logContent, queueContent, pendingContent, gitLines] = await Promise.all([
      readMarkdownFile(this.logPath).catch(() => ""),
      readMarkdownFile(this.queuePath).catch(() => ""),
      readMarkdownFile(this.pendingPath).catch(() => ""),
      gitCommitsSinceMidnight(),
    ]);

    const logItems = extractLogEntries(logContent, targetDate).map((summary) => ({
      summary,
      source: "log" as const,
    }));

    const queueTasks = parseTaskQueue(queueContent);
    const accomplishedQueue = queueTasks
      .filter((task) => task.status === "done")
      .map((task) => ({ summary: task.title, source: "queue" as const }));
    const openQueue = queueTasks
      .filter((task) => task.status !== "done")
      .map((task) => ({ summary: task.title, source: "queue" as const }));

    const pendingItems = parsePendingTasks(pendingContent).map((summary) => ({
      summary,
      source: "pending" as const,
    }));

    const gitItems = gitLines.map((summary) => ({ summary, source: "git" as const }));

    const accomplished: DigestItem[] = [...logItems, ...accomplishedQueue, ...gitItems];
    const stillOpen: DigestItem[] = [...openQueue, ...pendingItems];

    return {
      date: targetDate,
      generated_at: new Date().toISOString(),
      accomplished,
      still_open: stillOpen,
      shifted: [],
      tomorrow: [],
    };
  }

  toMarkdown(digest: DailyDigest): string {
    const lines: string[] = [];
    lines.push(`# Daily Digest: ${digest.date}`);
    lines.push("");

    const sections: Array<{ title: string; items: readonly DigestItem[] }> = [
      { title: "Accomplished", items: digest.accomplished },
      { title: "Still Open", items: digest.still_open },
      { title: "Shifted", items: digest.shifted },
    ];

    for (const section of sections) {
      if (section.items.length === 0) continue;
      lines.push(`## ${section.title}`);
      for (const item of section.items) {
        lines.push(`- ${item.summary}`);
      }
      lines.push("");
    }

    if (digest.tomorrow.length > 0) {
      lines.push("## Tomorrow");
      for (const item of digest.tomorrow) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    return lines.join("\n").trimEnd() + "\n";
  }

  async write(digest: DailyDigest): Promise<string> {
    await fs.mkdir(DEFAULT_DAILY_DIR, { recursive: true });
    const filePath = path.join(DEFAULT_DAILY_DIR, `${digest.date}.md`);
    await fs.writeFile(filePath, this.toMarkdown(digest), "utf8");
    return filePath;
  }
}
