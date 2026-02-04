import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { ContentFormat, ContentPlatform, ContentStatus } from "../core/types/content.js";
import { MarkdownContentStore } from "../core/content-store.js";

const VALID_STATUSES: readonly ContentStatus[] = [
  "idea",
  "outline",
  "draft",
  "review",
  "approved",
  "published",
  "killed",
];

const VALID_PLATFORMS: readonly ContentPlatform[] = [
  "x",
  "linkedin",
  "youtube",
  "spotify",
  "newsletter",
  "blog",
  "internal",
  "multi",
];

const VALID_FORMATS: readonly ContentFormat[] = [
  "thread",
  "post",
  "article",
  "newsletter",
  "video_script",
  "podcast_episode",
  "other",
];

type ContentArgs = {
  status?: ContentStatus;
  platform?: ContentPlatform;
  format?: string;
  source?: string;
  notes?: string;
  topic?: string;
};

function parseFlags(argv: readonly string[]): ContentArgs {
  const args: ContentArgs = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [key, rawValue] = token.slice(2).split("=", 2);
    const value = rawValue?.trim();
    if (!value) continue;
    if (key === "status" && VALID_STATUSES.includes(value as ContentStatus)) args.status = value as ContentStatus;
    if (key === "platform" && VALID_PLATFORMS.includes(value as ContentPlatform)) args.platform = value as ContentPlatform;
    if (key === "format") args.format = value;
    if (key === "source") args.source = value;
    if (key === "notes") args.notes = value;
    if (key === "topic") args.topic = value;
  }
  return args;
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  npm run content list [--status=review] [--platform=x]");
  console.log("  npm run content add \"Topic\" [--format=thread] [--platform=x] [--source=manual] [--notes=\"...\"]");
  console.log("  npm run content status <idea-id> <new-status>");
  console.log("  npm run content pipeline");
}

function formatIdeasTable(ideas: readonly {
  id: string;
  date: string;
  topic: string;
  format: string;
  platform: string;
  status: string;
}[]): string {
  if (ideas.length === 0) return "(no ideas)";
  const lines: string[] = [];
  lines.push("| ID | Date | Topic | Format | Platform | Status |");
  lines.push("|---|---|---|---|---|---|");
  for (const idea of ideas) {
    lines.push(`| ${idea.id} | ${idea.date} | ${idea.topic} | ${idea.format} | ${idea.platform} | ${idea.status} |`);
  }
  return lines.join("\n");
}

async function listIdeas(store: MarkdownContentStore, flags: ContentArgs): Promise<void> {
  let ideas = await store.loadIdeas();
  if (flags.status) ideas = ideas.filter((idea) => idea.status === flags.status);
  if (flags.platform) ideas = ideas.filter((idea) => idea.platform === flags.platform);
  console.log(formatIdeasTable(ideas));
}

async function addIdea(store: MarkdownContentStore, argv: readonly string[], flags: ContentArgs): Promise<void> {
  const positionalTopic = argv.filter((item) => !item.startsWith("--")).join(" ").trim();
  let topic = flags.topic ?? positionalTopic;
  let format: ContentFormat = VALID_FORMATS.includes((flags.format ?? "") as ContentFormat)
    ? (flags.format as ContentFormat)
    : "post";
  let platform = (flags.platform ?? "x") as ContentPlatform;
  let source = flags.source ?? "manual";
  let notes = flags.notes ?? "";

  if (!topic) {
    const rl = createInterface({ input, output });
    try {
      topic = (await rl.question("Topic: ")).trim();
      const formatInput = (await rl.question("Format (post/thread/article/...): ")).trim();
      const platformInput = (await rl.question("Platform (x/linkedin/youtube/...): ")).trim();
      const sourceInput = (await rl.question("Source (manual/seed/...): ")).trim();
      notes = (await rl.question("Notes (optional): ")).trim();
      if (formatInput && VALID_FORMATS.includes(formatInput as ContentFormat)) format = formatInput as ContentFormat;
      if (platformInput && VALID_PLATFORMS.includes(platformInput as ContentPlatform)) platform = platformInput as ContentPlatform;
      if (sourceInput) source = sourceInput;
    } finally {
      rl.close();
    }
  }

  if (!topic) throw new Error("Topic is required.");

  const date = new Date().toISOString().slice(0, 10);
  const id = await store.addIdea({
    date,
    topic,
    format,
    platform,
    status: "idea",
    source,
    notes: notes || undefined,
    tags: [],
  });

  console.log(`Added content idea ${id}: ${topic}`);
}

async function updateStatus(store: MarkdownContentStore, argv: readonly string[]): Promise<void> {
  const values = argv.filter((item) => !item.startsWith("--"));
  const id = values[0];
  const status = values[1] as ContentStatus | undefined;
  if (!id || !status || !VALID_STATUSES.includes(status)) {
    throw new Error(`Usage: status <idea-id> <${VALID_STATUSES.join("|")}>`);
  }
  await store.updateIdeaStatus(id, status);
  console.log(`Updated ${id} to ${status}`);
}

async function pipeline(store: MarkdownContentStore): Promise<void> {
  const ideas = await store.loadIdeas();
  const counts = VALID_STATUSES.map((status) => ({
    status,
    count: ideas.filter((idea) => idea.status === status).length,
  }));
  console.log("# Content Pipeline");
  for (const item of counts) {
    console.log(`- ${item.status}: ${item.count}`);
  }
}

async function run(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    printUsage();
    return;
  }

  const flags = parseFlags(rest);
  const store = new MarkdownContentStore();

  switch (command) {
    case "list":
      await listIdeas(store, flags);
      return;
    case "add":
      await addIdea(store, rest, flags);
      return;
    case "status":
      await updateStatus(store, rest);
      return;
    case "pipeline":
      await pipeline(store);
      return;
    default:
      printUsage();
  }
}

import { fileURLToPath } from "node:url";

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  run().catch((err) => {
    console.error(`Content CLI failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
