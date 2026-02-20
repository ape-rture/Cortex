import "dotenv/config";
import { promises as fsPromises } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import type { ContentFormat, ContentPlatform, PodcastEpisode } from "../core/types/content.js";
import type { Task, TaskStatus } from "../core/types/task-queue.js";
import { MarkdownContentStore } from "../core/content-store.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { ConfigRouter } from "../core/routing.js";
import { LLMContentDraftGenerator } from "../core/content-draft-generator.js";
import { LLMPodcastDistributionGenerator } from "../core/podcast-distribution.js";
import { LLMContentSeedExtractor } from "../core/content-seed-extractor.js";
import { isGranolaUrl, fetchGranolaTranscript } from "../integrations/granola.js";
import { nextSeedId } from "../utils/markdown.js";

const VALID_STATUSES: readonly TaskStatus[] = [
  "queued",
  "in_progress",
  "blocked",
  "done",
  "failed",
  "cancelled",
];

const LEGACY_STATUS_MAP: Readonly<Record<string, TaskStatus>> = {
  idea: "queued",
  outline: "queued",
  draft: "in_progress",
  review: "in_progress",
  approved: "done",
  published: "done",
  killed: "cancelled",
};

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
  status?: TaskStatus;
  platform?: ContentPlatform;
  format?: string;
  source?: string;
  notes?: string;
  topic?: string;
};

function parseStatusFlag(value: string): TaskStatus | undefined {
  const normalized = value.trim().toLowerCase();
  if (VALID_STATUSES.includes(normalized as TaskStatus)) {
    return normalized as TaskStatus;
  }
  return LEGACY_STATUS_MAP[normalized];
}

function parseFlags(argv: readonly string[]): ContentArgs {
  const args: ContentArgs = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [key, rawValue] = token.slice(2).split("=", 2);
    const value = rawValue?.trim();
    if (!value) continue;
    if (key === "status") {
      const parsed = parseStatusFlag(value);
      if (parsed) args.status = parsed;
    }
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
  console.log("  npm run content list [--status=in_progress] [--platform=x]");
  console.log("  npm run content add \"Topic\" [--format=thread] [--platform=x] [--source=manual] [--notes=\"...\"]");
  console.log("  npm run content status <task-id> <queued|in_progress|blocked|done|failed|cancelled>");
  console.log("  npm run content pipeline");
  console.log("  npm run content search <query>");
  console.log("  npm run content draft <task-id>");
  console.log('  npm run content revise <task-id> "feedback"');
  console.log('  npm run content podcast <episode-number> "title"');
  console.log("  npm run content extract <file-or-url>");
  console.log("  npm run content seeds");
  console.log("  npm run content promote <seed-id>");
}

type ContentTaskRow = {
  id: string;
  date: string;
  topic: string;
  format: string;
  platform: string;
  status: string;
};

function formatIdeasTable(ideas: readonly ContentTaskRow[]): string {
  if (ideas.length === 0) return "(no content tasks)";
  const lines: string[] = [];
  lines.push("| ID | Date | Topic | Format | Platform | Status |");
  lines.push("|---|---|---|---|---|---|");
  for (const idea of ideas) {
    lines.push(`| ${idea.id} | ${idea.date} | ${idea.topic} | ${idea.format} | ${idea.platform} | ${idea.status} |`);
  }
  return lines.join("\n");
}

async function loadContentTasks(queue: MarkdownTaskQueue): Promise<readonly Task[]> {
  return await queue.listByType("content");
}

function toContentTaskRow(task: Task): ContentTaskRow {
  return {
    id: task.id,
    date: task.created_at.slice(0, 10),
    topic: task.title,
    format: task.format ?? "post",
    platform: task.platform ?? "multi",
    status: task.status,
  };
}

function findContentTask(tasks: readonly Task[], id: string): Task | undefined {
  return tasks.find((task) => task.id === id);
}

async function listIdeas(queue: MarkdownTaskQueue, flags: ContentArgs): Promise<void> {
  let ideas = [...await loadContentTasks(queue)];
  if (flags.status) ideas = ideas.filter((idea) => idea.status === flags.status);
  if (flags.platform) ideas = ideas.filter((idea) => (idea.platform ?? "multi") === flags.platform);
  console.log(formatIdeasTable(ideas.map(toContentTaskRow)));
}

async function addIdea(queue: MarkdownTaskQueue, argv: readonly string[], flags: ContentArgs): Promise<void> {
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

  const id = await queue.add({
    title: topic,
    description: notes || undefined,
    priority: "p2",
    source: "cli",
    capture_type: "content",
    format,
    platform,
    tags: ["capture_type:content_idea", ...(source ? [`content_source:${source}`] : [])],
  });

  console.log(`Added content task ${id}: ${topic}`);
}

async function updateStatus(queue: MarkdownTaskQueue, argv: readonly string[]): Promise<void> {
  const values = argv.filter((item) => !item.startsWith("--"));
  const id = values[0];
  const status = parseStatusFlag(values[1] ?? "");
  if (!id || !status) {
    throw new Error("Usage: status <task-id> <queued|in_progress|blocked|done|failed|cancelled>");
  }

  const contentTasks = await loadContentTasks(queue);
  if (!findContentTask(contentTasks, id)) {
    throw new Error(`Content task not found: ${id}`);
  }

  await queue.update(id, status);
  console.log(`Updated ${id} to ${status}`);
}

async function pipeline(queue: MarkdownTaskQueue): Promise<void> {
  const ideas = await loadContentTasks(queue);
  const counts = VALID_STATUSES.map((status) => ({
    status,
    count: ideas.filter((idea) => idea.status === status).length,
  }));
  console.log("# Content Pipeline");
  for (const item of counts) {
    console.log(`- ${item.status}: ${item.count}`);
  }
}

async function draftIdea(
  queue: MarkdownTaskQueue,
  store: MarkdownContentStore,
  argv: readonly string[],
): Promise<void> {
  const id = argv.filter((item) => !item.startsWith("--"))[0];
  if (!id) throw new Error("Usage: draft <task-id>");

  const ideas = await loadContentTasks(queue);
  const idea = findContentTask(ideas, id);
  if (!idea) throw new Error(`Content task not found: ${id}`);

  const router = new ConfigRouter();
  const generator = new LLMContentDraftGenerator(router);

  console.log(`Generating draft for ${id}: ${idea.title}...`);
  const draft = await generator.generateDraft({
    topic: idea.title,
    format: (idea.format ?? "post") as ContentFormat,
    platform: (idea.platform ?? "multi") as ContentPlatform,
    context: idea.description,
  });

  const finalDraft = { ...draft, ideaId: id };
  await store.saveDraft(finalDraft);
  await queue.update(id, "in_progress", "Draft generated");

  console.log(`Draft saved to projects/content-drafts/${id}.md`);
  if (finalDraft.threadPosts?.length) {
    console.log(`\nThread (${finalDraft.threadPosts.length} posts):`);
    finalDraft.threadPosts.forEach((post, i) => console.log(`  ${i + 1}. ${post}`));
  } else {
    console.log(`\n${finalDraft.currentText.slice(0, 500)}...`);
  }
}

async function reviseDraftCmd(store: MarkdownContentStore, argv: readonly string[]): Promise<void> {
  const positional = argv.filter((item) => !item.startsWith("--"));
  const id = positional[0];
  const feedback = positional.slice(1).join(" ").trim();
  if (!id || !feedback) throw new Error('Usage: revise <task-id> "feedback"');

  const existing = await store.loadDraft(id);
  if (!existing) throw new Error(`No draft found for ${id}. Run 'draft ${id}' first.`);

  const router = new ConfigRouter();
  const generator = new LLMContentDraftGenerator(router);

  console.log(`Revising draft for ${id}...`);
  const revised = await generator.reviseDraft(existing, feedback);
  await store.saveDraft(revised);

  console.log(`Draft revised (v${revised.revisions[0]?.version ?? "?"})`);
  console.log(revised.currentText.slice(0, 500));
}

async function podcastCmd(
  queue: MarkdownTaskQueue,
  store: MarkdownContentStore,
  argv: readonly string[],
): Promise<void> {
  const positional = argv.filter((item) => !item.startsWith("--"));
  const episodeNumber = parseInt(positional[0] ?? "", 10);
  const title = positional.slice(1).join(" ").trim();

  if (!episodeNumber || !title) {
    const rl = createInterface({ input, output });
    try {
      const epNum = parseInt(await rl.question("Episode number: "), 10);
      const epTitle = (await rl.question("Episode title: ")).trim();
      const guestName = (await rl.question("Guest name: ")).trim();
      const guestHandle = (await rl.question("Guest X handle (optional): ")).trim() || undefined;
      const guestCompany = (await rl.question("Guest company (optional): ")).trim() || undefined;
      const guestCompanyHandle = (await rl.question("Company X handle (optional): ")).trim() || undefined;
      const guestWebsite = (await rl.question("Guest website (optional): ")).trim() || undefined;
      const notes = (await rl.question("Episode notes/topics: ")).trim();
      const linksStr = (await rl.question("Links (comma-separated, optional): ")).trim();
      const links = linksStr ? linksStr.split(",").map((l) => l.trim()).filter(Boolean) : [];

      const episode: PodcastEpisode = {
        episodeNumber: epNum,
        title: epTitle || `Block by Block Ep. ${epNum}`,
        guestName,
        guestHandle,
        guestCompany,
        guestCompanyHandle,
        guestWebsite,
        notes,
        links,
      };

      await generatePodcastPack(queue, store, episode);
    } finally {
      rl.close();
    }
    return;
  }

  throw new Error("For non-interactive podcast, run without args to get interactive prompts.");
}

async function generatePodcastPack(
  queue: MarkdownTaskQueue,
  store: MarkdownContentStore,
  episode: PodcastEpisode,
): Promise<void> {
  const router = new ConfigRouter();
  const generator = new LLMPodcastDistributionGenerator(router);

  console.log(`Generating distribution pack for ${episode.title}...`);
  const pack = await generator.generatePack(episode);

  console.log("\n--- YouTube Description ---");
  console.log(pack.youtubeDescription);
  console.log("\n--- @indexingco Tweet ---");
  console.log(pack.companyTweet);
  console.log(`(${pack.companyTweet.length} chars)`);
  console.log("\n--- @ape_rture Post ---");
  console.log(pack.personalPost);

  const commonTags = ["capture_type:content_idea", `episode:${episode.episodeNumber}`];
  const ytId = await queue.add({
    title: `${episode.title} - YouTube Description`,
    description: "Podcast distribution output",
    priority: "p2",
    source: "cli",
    capture_type: "content",
    format: "podcast_episode",
    platform: "youtube",
    tags: commonTags,
  });
  const tweetId = await queue.add({
    title: `${episode.title} - @indexingco Tweet`,
    description: "Podcast distribution output",
    priority: "p2",
    source: "cli",
    capture_type: "content",
    format: "post",
    platform: "x",
    tags: commonTags,
  });
  const postId = await queue.add({
    title: `${episode.title} - @ape_rture Post`,
    description: "Podcast distribution output",
    priority: "p2",
    source: "cli",
    capture_type: "content",
    format: "post",
    platform: "x",
    tags: commonTags,
  });

  await queue.update(ytId, "in_progress", "Draft generated from podcast distribution");
  await queue.update(tweetId, "in_progress", "Draft generated from podcast distribution");
  await queue.update(postId, "in_progress", "Draft generated from podcast distribution");

  const now = new Date().toISOString();
  await store.saveDraft({
    ideaId: ytId,
    format: "podcast_episode",
    platform: "youtube",
    currentText: pack.youtubeDescription,
    revisions: [{ version: 1, timestamp: now, text: pack.youtubeDescription, author: "llm", changeNote: "Generated from podcast distribution" }],
    updatedAt: now,
  });
  await store.saveDraft({
    ideaId: tweetId,
    format: "post",
    platform: "x",
    currentText: pack.companyTweet,
    revisions: [{ version: 1, timestamp: now, text: pack.companyTweet, author: "llm", changeNote: "Generated from podcast distribution" }],
    updatedAt: now,
  });
  await store.saveDraft({
    ideaId: postId,
    format: "post",
    platform: "x",
    currentText: pack.personalPost,
    revisions: [{ version: 1, timestamp: now, text: pack.personalPost, author: "llm", changeNote: "Generated from podcast distribution" }],
    updatedAt: now,
  });

  await store.saveChain({
    chainId: `chain-ep${episode.episodeNumber}`,
    root: { ideaId: ytId, platform: "youtube", format: "podcast_episode" },
    derivatives: [
      { ideaId: tweetId, platform: "x", format: "post" },
      { ideaId: postId, platform: "x", format: "post" },
    ],
    createdAt: now,
  });

  console.log(`\nSaved as chain: ${ytId} -> ${tweetId} + ${postId}`);
}

async function extractSeeds(store: MarkdownContentStore, argv: readonly string[]): Promise<void> {
  const target = argv.filter((item) => !item.startsWith("--"))[0];
  if (!target) throw new Error("Usage: extract <file-path-or-granola-url>");

  let text: string;
  let sourceRef: string;
  let source: "granola" | "meeting" | "reading" = "reading";

  if (isGranolaUrl(target)) {
    console.log(`Fetching Granola transcript from ${target}...`);
    const transcript = await fetchGranolaTranscript(target);
    text = transcript.text;
    sourceRef = target;
    source = "granola";
    if (transcript.title) console.log(`Title: ${transcript.title}`);
  } else {
    text = await fsPromises.readFile(target, "utf8");
    sourceRef = target;
    source = "meeting";
  }

  const router = new ConfigRouter();
  const extractor = new LLMContentSeedExtractor(router);

  console.log("Extracting content seeds...");
  const seeds = await extractor.extractSeeds({ text, source, sourceRef });

  if (seeds.length === 0) {
    console.log("No seeds extracted above confidence threshold.");
    return;
  }

  const existing = await store.loadSeeds();
  const date = new Date().toISOString().slice(0, 10);
  const newSeeds = seeds.map((seed, i) => ({
    ...seed,
    id: nextSeedId([...existing, ...seeds.slice(0, i)], date),
  }));

  await store.saveSeeds([...existing, ...newSeeds]);

  console.log(`\nExtracted ${newSeeds.length} seeds:`);
  for (const seed of newSeeds) {
    console.log(`  ${seed.id}: ${seed.insight.slice(0, 100)}...`);
  }
}

async function listSeeds(store: MarkdownContentStore): Promise<void> {
  const seeds = await store.loadSeeds();
  const unprocessed = seeds.filter((s) => !s.promoted);

  if (unprocessed.length === 0) {
    console.log("(no unprocessed seeds)");
    return;
  }

  console.log(`# Unprocessed Seeds (${unprocessed.length})`);
  for (const seed of unprocessed) {
    console.log(`\n${seed.id} [${seed.source}]`);
    console.log(`  ${seed.insight}`);
    if (seed.suggestedAngles?.length) {
      console.log(`  Angles: ${seed.suggestedAngles.join("; ")}`);
    }
  }
}

async function promoteSeed(
  queue: MarkdownTaskQueue,
  store: MarkdownContentStore,
  argv: readonly string[],
): Promise<void> {
  const seedId = argv.filter((item) => !item.startsWith("--"))[0];
  if (!seedId) throw new Error("Usage: promote <seed-id>");

  const seeds = await store.loadSeeds();
  const seed = seeds.find((s) => s.id === seedId);
  if (!seed) throw new Error(`Seed not found: ${seedId}`);
  if (seed.promoted) throw new Error(`Seed already promoted to ${seed.promotedToId}`);

  const taskId = await queue.add({
    title: seed.insight,
    description: `Promoted from seed ${seedId}`,
    priority: "p2",
    source: "cli",
    capture_type: "content",
    format: "post",
    platform: "x",
    tags: ["capture_type:content_idea", `seed:${seedId}`],
  });

  const updated = seeds.map((s) =>
    s.id === seedId ? { ...s, promoted: true, promotedToId: taskId } : s,
  );
  await store.saveSeeds(updated);

  console.log(`Promoted ${seedId} -> ${taskId}`);
}

async function searchIdeas(queue: MarkdownTaskQueue, argv: readonly string[]): Promise<void> {
  const query = argv.filter((item) => !item.startsWith("--")).join(" ").trim().toLowerCase();
  if (!query) {
    console.log("Usage: content search <query>");
    return;
  }
  const tasks = await loadContentTasks(queue);
  const results = tasks.filter(
    (task) => task.title.toLowerCase().includes(query) || (task.description ?? "").toLowerCase().includes(query),
  );
  console.log(formatIdeasTable(results.map(toContentTaskRow)));
}

/** Callable from web terminal and other entry points. */
export async function runContent(args: string[]): Promise<string> {
  const [command, ...rest] = args;
  const store = new MarkdownContentStore();
  const queue = new MarkdownTaskQueue();

  if (!command || command === "pipeline") {
    const ideas = await loadContentTasks(queue);
    const seeds = await store.loadSeeds();
    const unprocessed = seeds.filter((s) => !s.promoted).length;
    const counts = VALID_STATUSES.map((status) => ({
      status,
      count: ideas.filter((idea) => idea.status === status).length,
    })).filter((c) => c.count > 0);

    const lines = ["# Content Pipeline", ""];
    for (const c of counts) lines.push(`- ${c.status}: ${c.count}`);
    if (counts.length === 0) lines.push("(no content tasks yet)");
    lines.push("", `Seeds: ${unprocessed} unprocessed, ${seeds.length - unprocessed} promoted`);
    lines.push(`Total Content Tasks: ${ideas.length}`);
    return lines.join("\n");
  }

  if (command === "list") {
    const flags = parseFlags(rest);
    let ideas = [...await loadContentTasks(queue)];
    if (flags.status) ideas = ideas.filter((i) => i.status === flags.status);
    if (flags.platform) ideas = ideas.filter((i) => (i.platform ?? "multi") === flags.platform);
    return formatIdeasTable(ideas.map(toContentTaskRow));
  }

  if (command === "search") {
    const query = rest.filter((item) => !item.startsWith("--")).join(" ").trim().toLowerCase();
    if (!query) return "Usage: content search <query>";
    const ideas = await loadContentTasks(queue);
    const results = ideas.filter(
      (task) => task.title.toLowerCase().includes(query) || (task.description ?? "").toLowerCase().includes(query),
    );
    return formatIdeasTable(results.map(toContentTaskRow));
  }

  if (command === "seeds") {
    const seeds = await store.loadSeeds();
    const unprocessed = seeds.filter((s) => !s.promoted);
    if (unprocessed.length === 0) return "(no unprocessed seeds)";
    const lines = [`# Unprocessed Seeds (${unprocessed.length})`, ""];
    for (const seed of unprocessed) {
      lines.push(`**${seed.id}** [${seed.source}]`);
      lines.push(seed.insight);
      if (seed.suggestedAngles?.length) lines.push(`Angles: ${seed.suggestedAngles.join("; ")}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  return "Usage: content <list|add|status|pipeline|search|draft|revise|podcast|extract|seeds|promote> [args]";
}

async function run(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    printUsage();
    return;
  }

  const flags = parseFlags(rest);
  const store = new MarkdownContentStore();
  const queue = new MarkdownTaskQueue();

  switch (command) {
    case "list":
      await listIdeas(queue, flags);
      return;
    case "add":
      await addIdea(queue, rest, flags);
      return;
    case "status":
      await updateStatus(queue, rest);
      return;
    case "pipeline":
      await pipeline(queue);
      return;
    case "search":
      await searchIdeas(queue, rest);
      return;
    case "draft":
      await draftIdea(queue, store, rest);
      return;
    case "revise":
      await reviseDraftCmd(store, rest);
      return;
    case "podcast":
      await podcastCmd(queue, store, rest);
      return;
    case "extract":
      await extractSeeds(store, rest);
      return;
    case "seeds":
      await listSeeds(store);
      return;
    case "promote":
      await promoteSeed(queue, store, rest);
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
