import "dotenv/config";
import { fileURLToPath } from "node:url";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { ConfigRouter } from "../core/routing.js";
import { CAPTURE_TAG_MAP, type CaptureType } from "../core/types/capture.js";
import type { CaptureType as TaskCaptureType, Task } from "../core/types/task-queue.js";

const MAX_TITLE_LENGTH = 140;

const TYPE_ALIAS_MAP: Record<string, CaptureType> = {
  research: "research",
  feature: "cortex_feature",
  seed: "project_seed",
  task: "project_task",
  content: "content_idea",
  action: "action_item",
};

const ALL_CAPTURE_TYPES: readonly CaptureType[] = [
  "research",
  "content_idea",
  "project_task",
  "cortex_feature",
  "project_seed",
  "action_item",
  "needs_review",
];

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
  readonly taskQueue: MarkdownTaskQueue;
  readonly router: Pick<ConfigRouter, "route">;
}

interface CaptureRuntimeOptions {
  readonly taskQueue?: MarkdownTaskQueue;
  readonly router?: Pick<ConfigRouter, "route">;
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
    taskQueue: options.taskQueue ?? new MarkdownTaskQueue(),
    router: options.router ?? new ConfigRouter(),
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
    if (!ALL_CAPTURE_TYPES.includes(category as CaptureType)) {
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

function mapToQueueCaptureType(type: CaptureType): TaskCaptureType {
  switch (type) {
    case "research":
      return "research";
    case "content_idea":
      return "content";
    case "cortex_feature":
      return "feature";
    case "project_seed":
      return "seed";
    case "project_task":
    case "action_item":
    case "needs_review":
      return "task";
  }
}

function captureTypeFromTask(task: Task): CaptureType {
  for (const tag of task.tags ?? []) {
    if (!tag.startsWith("capture_type:")) continue;
    const value = tag.slice("capture_type:".length).trim() as CaptureType;
    if (ALL_CAPTURE_TYPES.includes(value)) return value;
  }

  switch (task.capture_type) {
    case "research":
      return "research";
    case "content":
      return "content_idea";
    case "feature":
      return "cortex_feature";
    case "seed":
      return "project_seed";
    case "task":
      return "project_task";
  }
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
  const queueCaptureType = mapToQueueCaptureType(type);

  const taskId = await runtime.taskQueue.add({
    title: split.title,
    description: split.description,
    priority: "p2",
    source: "cli",
    capture_type: queueCaptureType,
    tags: [`capture_type:${type}`],
    ...(type === "research" ? { source_ref: "capture:cli" } : {}),
    ...(type === "project_seed" ? { category: "uncategorized" } : {}),
    ...(type === "content_idea" ? { format: "post", platform: "multi" } : {}),
  });

  if (type === "needs_review") {
    await runtime.taskQueue.update(taskId, "blocked", "Needs manual review");
    return `Capture needs review. Added blocked queue item ${taskId}.`;
  }

  return `Captured ${type} as queue task ${taskId}.`;
}

function renderTaskList(tasks: readonly Task[]): string {
  if (tasks.length === 0) return "(no captures)";
  return tasks
    .map((task) => `- ${task.id} [${task.status}] ${task.title}`)
    .join("\n");
}

async function listCapture(typeArg: string | undefined, runtime: CaptureRuntime): Promise<string> {
  const type = (typeArg ?? "").trim().toLowerCase();
  const all = await runtime.taskQueue.list();

  if (!type) {
    const byType = new Map<CaptureType, number>();
    for (const captureType of ALL_CAPTURE_TYPES) {
      byType.set(captureType, 0);
    }
    for (const task of all) {
      const captureType = captureTypeFromTask(task);
      byType.set(captureType, (byType.get(captureType) ?? 0) + 1);
    }

    const inboxCount = all.filter((item) => item.source === "telegram" || item.source === "slack").length;
    return [
      "# Capture Overview",
      "",
      `- research: ${byType.get("research") ?? 0}`,
      `- feature: ${byType.get("cortex_feature") ?? 0}`,
      `- seed: ${byType.get("project_seed") ?? 0}`,
      `- content: ${byType.get("content_idea") ?? 0}`,
      `- project task: ${byType.get("project_task") ?? 0}`,
      `- action item: ${byType.get("action_item") ?? 0}`,
      `- needs review: ${byType.get("needs_review") ?? 0}`,
      `- inbox: ${inboxCount}`,
    ].join("\n");
  }

  const filterType = TYPE_ALIAS_MAP[type];
  if (!filterType) {
    return "Usage: /capture list [research|feature|seed|task|content|action]";
  }
  const filtered = all.filter((task) => captureTypeFromTask(task) === filterType);
  return renderTaskList(filtered);
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
