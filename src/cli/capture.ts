import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { MarkdownContentStore } from "../core/content-store.js";
import { MarkdownResearchStore } from "../core/research-store.js";
import { MarkdownFeatureStore } from "../core/feature-store.js";
import { MarkdownIdeaStore } from "../core/idea-store.js";
import { ConfigRouter } from "../core/routing.js";
import {
  CAPTURE_TAG_MAP,
  type CaptureType,
  type FeatureProposal,
  type ProjectSeed,
  type ResearchItem,
} from "../core/types/capture.js";

const PENDING_PATH = path.resolve("actions", "pending.md");
const CORTEX_TASKS_PATH = path.resolve(".cortex", "tasks.md");
const MAX_TITLE_LENGTH = 140;

const TYPE_ALIAS_MAP: Record<string, CaptureType> = {
  research: "research",
  feature: "cortex_feature",
  seed: "project_seed",
  task: "project_task",
  content: "content_idea",
  action: "action_item",
};

const CLASSIFICATION_SYSTEM_PROMPT = [
  "Classify the capture into exactly one category:",
  "research | content_idea | project_task | cortex_feature | project_seed | action_item | needs_review",
  "Return JSON only: {\"category\":\"research\",\"confidence\":0.9}",
  "If confidence is below 0.6, use needs_review.",
].join("\n");

interface CaptureClassification {
  readonly type: CaptureType;
  readonly confidence: number;
}

interface CaptureRuntime {
  readonly researchStore: MarkdownResearchStore;
  readonly featureStore: MarkdownFeatureStore;
  readonly ideaStore: MarkdownIdeaStore;
  readonly contentStore: MarkdownContentStore;
  readonly taskQueue: MarkdownTaskQueue;
  readonly router: Pick<ConfigRouter, "route">;
  readonly pendingPath: string;
  readonly cortexTasksPath: string;
}

interface CaptureRuntimeOptions {
  readonly researchStore?: MarkdownResearchStore;
  readonly featureStore?: MarkdownFeatureStore;
  readonly ideaStore?: MarkdownIdeaStore;
  readonly contentStore?: MarkdownContentStore;
  readonly taskQueue?: MarkdownTaskQueue;
  readonly router?: Pick<ConfigRouter, "route">;
  readonly pendingPath?: string;
  readonly cortexTasksPath?: string;
}

function usage(): string {
  return [
    "Usage:",
    "  /capture research <text>",
    "  /capture feature <text>",
    "  /capture seed <text>",
    "  /capture task <text>",
    "  /capture content <text>",
    "  /capture action <text>",
    "  /capture list [research|feature|seed|task|content|action]",
    "  /capture inbox",
    "  /capture <text> (auto-classify)",
  ].join("\n");
}

function resolveRuntime(options: CaptureRuntimeOptions = {}): CaptureRuntime {
  return {
    researchStore: options.researchStore ?? new MarkdownResearchStore(),
    featureStore: options.featureStore ?? new MarkdownFeatureStore(),
    ideaStore: options.ideaStore ?? new MarkdownIdeaStore(),
    contentStore: options.contentStore ?? new MarkdownContentStore(),
    taskQueue: options.taskQueue ?? new MarkdownTaskQueue(),
    router: options.router ?? new ConfigRouter(),
    pendingPath: options.pendingPath ?? PENDING_PATH,
    cortexTasksPath: options.cortexTasksPath ?? CORTEX_TASKS_PATH,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleAndDescription(text: string): { title: string; description?: string } {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= MAX_TITLE_LENGTH) {
    return { title: normalized };
  }
  return {
    title: `${normalized.slice(0, MAX_TITLE_LENGTH - 3)}...`,
    description: normalized,
  };
}

function extractTaggedCaptureType(
  text: string,
): { type?: CaptureType; normalizedText: string } {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(/^(#\w+)\s*(.*)$/);
  if (!match) return { normalizedText: normalized };

  const token = match[1].toLowerCase();
  const type = CAPTURE_TAG_MAP[token];
  if (!type) return { normalizedText: normalized };
  return {
    type,
    normalizedText: normalizeWhitespace(match[2] ?? ""),
  };
}

function parseClassificationResponse(raw: string): CaptureClassification {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { type: "needs_review", confidence: 0 };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const category = String(parsed.category ?? "").trim().toLowerCase();
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const allowed: CaptureType[] = [
      "research",
      "content_idea",
      "project_task",
      "cortex_feature",
      "project_seed",
      "action_item",
      "needs_review",
    ];
    if (!allowed.includes(category as CaptureType)) {
      return { type: "needs_review", confidence: 0 };
    }
    if (confidence < 0.6) {
      return { type: "needs_review", confidence };
    }
    return { type: category as CaptureType, confidence };
  } catch {
    return { type: "needs_review", confidence: 0 };
  }
}

async function appendProjectTask(text: string, filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, "utf8");
  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n- **${text}** -- Source: /capture (${date}). Agent: TBD.\n`;
  const queuedIndex = content.indexOf("## Queued");
  if (queuedIndex === -1) {
    await fs.writeFile(filePath, content.trimEnd() + "\n" + entry, "utf8");
    return;
  }

  let insertPos = content.indexOf("\n", queuedIndex) + 1;
  const descLine = content.indexOf("\n", insertPos);
  if (descLine !== -1 && content.substring(insertPos, descLine).trimStart().startsWith("*")) {
    insertPos = descLine + 1;
  }
  if (content[insertPos] === "\n") {
    insertPos += 1;
  }

  const updated = content.slice(0, insertPos) + entry + content.slice(insertPos);
  await fs.writeFile(filePath, updated, "utf8");
}

async function appendActionItem(text: string, filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, "utf8");
  const entry = `- [ ] **Dennis**: ${text}\n  - Due: (none)\n  - Context: /capture action\n  - Priority: medium\n`;
  const laterIndex = content.indexOf("## Later");
  if (laterIndex === -1) {
    await fs.writeFile(filePath, `${content.trimEnd()}\n\n${entry}`, "utf8");
    return;
  }

  const afterLater = content.indexOf("\n", laterIndex);
  if (afterLater === -1) {
    await fs.writeFile(filePath, `${content}\n${entry}`, "utf8");
    return;
  }

  let insertPos = afterLater + 1;
  const nextLine = content.indexOf("\n", insertPos);
  if (nextLine !== -1 && content.substring(insertPos, nextLine).trimStart().startsWith("[")) {
    insertPos = nextLine + 1;
  }

  const updated = content.slice(0, insertPos) + entry + content.slice(insertPos);
  await fs.writeFile(filePath, updated, "utf8");
}

async function classifyCaptureType(
  text: string,
  runtime: CaptureRuntime,
): Promise<CaptureClassification> {
  const tagged = extractTaggedCaptureType(text);
  if (tagged.type) {
    return {
      type: tagged.type,
      confidence: 0.95,
    };
  }

  const response = await runtime.router.route({
    task_type: "classification",
    system_prompt: CLASSIFICATION_SYSTEM_PROMPT,
    prompt: normalizeWhitespace(text),
    max_tokens: 200,
  });
  return parseClassificationResponse(response.content);
}

async function routeCapture(
  type: CaptureType,
  text: string,
  runtime: CaptureRuntime,
): Promise<string> {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "Capture text is required.";
  }

  const split = toTitleAndDescription(normalized);
  const date = new Date().toISOString().slice(0, 10);

  if (type === "research") {
    const id = await runtime.researchStore.add({
      title: split.title,
      description: split.description,
      sourceUrl: undefined,
      sourceRef: "capture:cli",
      tags: ["capture_type:research"],
      status: "captured",
      source: "cli",
      result: undefined,
    });
    return `Captured research item ${id}.`;
  }

  if (type === "cortex_feature") {
    const id = await runtime.featureStore.add({
      title: split.title,
      description: split.description,
      rationale: undefined,
      status: "proposed",
      assignedTo: undefined,
      source: "cli",
    });
    return `Captured feature proposal ${id}.`;
  }

  if (type === "project_seed") {
    const id = await runtime.ideaStore.add({
      title: split.title,
      description: split.description,
      category: "uncategorized",
      status: "seed",
      tags: ["capture_type:project_seed"],
      source: "cli",
    });
    return `Captured project seed ${id}.`;
  }

  if (type === "content_idea") {
    const id = await runtime.contentStore.addIdea({
      date,
      topic: split.title,
      format: "post",
      platform: "multi",
      status: "idea",
      source: "capture:cli",
      notes: split.description,
      tags: ["capture_type:content_idea"],
    });
    return `Captured content idea ${id}.`;
  }

  if (type === "project_task") {
    await appendProjectTask(split.title, runtime.cortexTasksPath);
    return "Captured project task to .cortex/tasks.md.";
  }

  if (type === "action_item") {
    await appendActionItem(split.title, runtime.pendingPath);
    return "Captured action item to actions/pending.md.";
  }

  const taskId = await runtime.taskQueue.add({
    title: split.title,
    description: split.description ?? split.title,
    priority: "p2",
    source: "cli",
    tags: ["capture_type:needs_review"],
  });
  await runtime.taskQueue.update(taskId, "blocked", "Needs manual review");
  return `Capture needs review. Added blocked queue item ${taskId}.`;
}

function renderResearchList(items: readonly ResearchItem[]): string {
  if (items.length === 0) return "(no research items)";
  return items
    .map((item) => `- ${item.id} [${item.status}] ${item.title}`)
    .join("\n");
}

function renderFeatureList(items: readonly FeatureProposal[]): string {
  if (items.length === 0) return "(no feature proposals)";
  return items
    .map((item) => `- ${item.id} [${item.status}] ${item.title}`)
    .join("\n");
}

function renderSeedList(items: readonly ProjectSeed[]): string {
  if (items.length === 0) return "(no project seeds)";
  return items
    .map((item) => `- ${item.id} [${item.status}] ${item.title}`)
    .join("\n");
}

async function listCapture(typeArg: string | undefined, runtime: CaptureRuntime): Promise<string> {
  const type = (typeArg ?? "").trim().toLowerCase();
  if (!type) {
    const [research, features, seeds, ideas, queue] = await Promise.all([
      runtime.researchStore.load(),
      runtime.featureStore.load(),
      runtime.ideaStore.load(),
      runtime.contentStore.loadIdeas(),
      runtime.taskQueue.list(),
    ]);
    const inboxCount = queue.filter((item) => item.source === "telegram" || item.source === "slack").length;
    return [
      "# Capture Overview",
      "",
      `- research: ${research.length}`,
      `- feature: ${features.length}`,
      `- seed: ${seeds.length}`,
      `- content: ${ideas.length}`,
      `- inbox: ${inboxCount}`,
    ].join("\n");
  }

  if (type === "research") {
    return renderResearchList(await runtime.researchStore.load());
  }
  if (type === "feature") {
    return renderFeatureList(await runtime.featureStore.load());
  }
  if (type === "seed") {
    return renderSeedList(await runtime.ideaStore.load());
  }
  if (type === "content") {
    const ideas = await runtime.contentStore.loadIdeas();
    if (ideas.length === 0) return "(no content ideas)";
    return ideas.map((item) => `- ${item.id} [${item.status}] ${item.topic}`).join("\n");
  }
  if (type === "task") {
    const tasks = await fs.readFile(runtime.cortexTasksPath, "utf8");
    const lines = tasks
      .split(/\r?\n/)
      .filter((line) => line.trimStart().startsWith("- **"));
    if (lines.length === 0) return "(no project tasks)";
    return lines.slice(0, 20).join("\n");
  }
  if (type === "action") {
    const pending = await fs.readFile(runtime.pendingPath, "utf8");
    const lines = pending
      .split(/\r?\n/)
      .filter((line) => line.trimStart().startsWith("- [ ]"));
    if (lines.length === 0) return "(no pending actions)";
    return lines.slice(0, 20).join("\n");
  }

  return "Usage: /capture list [research|feature|seed|task|content|action]";
}

async function captureInbox(runtime: CaptureRuntime): Promise<string> {
  const tasks = await runtime.taskQueue.list({ status: "queued" });
  const inbox = tasks
    .filter((item) => item.source === "telegram" || item.source === "slack")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (inbox.length === 0) return "Inbox empty.";
  const lines = [`# Capture Inbox (${inbox.length})`, ""];
  for (const item of inbox) {
    lines.push(`- ${item.id} [${item.source}] ${item.title}`);
  }
  return lines.join("\n");
}

export async function runCapture(
  args: string[],
  options: CaptureRuntimeOptions = {},
): Promise<string> {
  const runtime = resolveRuntime(options);
  const [firstRaw, ...rest] = args;
  const first = (firstRaw ?? "").trim().toLowerCase();
  if (!first) return usage();

  if (first === "list") {
    return await listCapture(rest[0], runtime);
  }

  if (first === "inbox") {
    return await captureInbox(runtime);
  }

  if (first in TYPE_ALIAS_MAP) {
    const text = rest.join(" ").trim();
    if (!text) return usage();
    return await routeCapture(TYPE_ALIAS_MAP[first], text, runtime);
  }

  const fullText = args.join(" ").trim();
  const tagged = extractTaggedCaptureType(fullText);
  if (tagged.type) {
    if (!tagged.normalizedText) return usage();
    return await routeCapture(tagged.type, tagged.normalizedText, runtime);
  }

  const classification = await classifyCaptureType(fullText, runtime);
  return await routeCapture(classification.type, fullText, runtime);
}

async function run(): Promise<void> {
  const output = await runCapture(process.argv.slice(2));
  console.log(output);
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  run().catch((error) => {
    console.error(`Capture CLI failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
