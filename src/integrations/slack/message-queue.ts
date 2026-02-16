import { MarkdownTaskQueue } from "../../core/task-queue.js";
import type { TaskPriority, TaskQueue } from "../../core/types/task-queue.js";

const DEFAULT_PRIORITY: TaskPriority = "p2";
const MAX_TITLE_LENGTH = 160;

export interface SlackQueueMessage {
  readonly channelId: string;
  readonly messageTs: string;
  readonly text: string;
  readonly userId?: string;
  readonly threadTs?: string;
}

export interface SlackQueuedTask {
  readonly taskId: string;
  readonly priority: TaskPriority;
  readonly duplicate: boolean;
  readonly messageRef: string;
  readonly threadRef: string;
  readonly preview: string;
}

interface ParsedSlackMessage {
  readonly content: string;
  readonly priority: TaskPriority;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeLeadingMention(value: string): string {
  return value.replace(/^<@[^>]+>\s*/, "").trim();
}

function toPreview(value: string): string {
  if (value.length <= 80) return value;
  return `${value.slice(0, 77)}...`;
}

function toTitle(value: string): string {
  if (value.length <= MAX_TITLE_LENGTH) return value;
  return `${value.slice(0, MAX_TITLE_LENGTH - 3)}...`;
}

function parsePriorityPrefix(value: string): ParsedSlackMessage {
  const directMatch = value.match(/^(?:\[(p[0-3])\]|(p[0-3]))\s*[:\-]?\s*(.+)$/i);
  if (directMatch) {
    const priority = (directMatch[1] ?? directMatch[2] ?? DEFAULT_PRIORITY).toLowerCase() as TaskPriority;
    const content = directMatch[3]?.trim() ?? "";
    return { priority, content };
  }

  if (value.startsWith("!!")) {
    return {
      priority: "p0",
      content: value.slice(2).trim(),
    };
  }
  if (value.startsWith("!")) {
    return {
      priority: "p1",
      content: value.slice(1).trim(),
    };
  }

  return {
    priority: DEFAULT_PRIORITY,
    content: value,
  };
}

export function parseSlackQueueMessage(text: string): ParsedSlackMessage {
  const normalized = normalizeWhitespace(removeLeadingMention(text));
  if (!normalized) {
    return { priority: DEFAULT_PRIORITY, content: "" };
  }
  return parsePriorityPrefix(normalized);
}

export async function enqueueSlackMessage(
  message: SlackQueueMessage,
  queue: TaskQueue = new MarkdownTaskQueue(),
): Promise<SlackQueuedTask> {
  const parsed = parseSlackQueueMessage(message.text);
  if (!parsed.content) {
    throw new Error("Slack message is empty after normalization");
  }

  const threadTs = message.threadTs?.trim() || message.messageTs;
  const messageRef = `slack:${message.channelId}:${message.messageTs}`;
  const threadRef = `slack-thread:${message.channelId}:${threadTs}`;

  const existing = (await queue.list()).find((task) =>
    task.source === "slack" &&
    task.context_refs?.includes(messageRef),
  );

  if (existing) {
    return {
      taskId: existing.id,
      priority: existing.priority,
      duplicate: true,
      messageRef,
      threadRef,
      preview: toPreview(existing.title),
    };
  }

  const title = toTitle(parsed.content);
  const id = await queue.add({
    title,
    description: parsed.content === title ? undefined : parsed.content,
    priority: parsed.priority,
    source: "slack",
    assigned_to: message.userId ? `slack:${message.userId}` : undefined,
    context_refs: [messageRef, threadRef],
    tags: [
      "slack",
      `channel:${message.channelId}`,
      `thread:${threadTs}`,
      ...(message.userId ? [`user:${message.userId}`] : []),
    ],
  });

  return {
    taskId: id,
    priority: parsed.priority,
    duplicate: false,
    messageRef,
    threadRef,
    preview: toPreview(title),
  };
}
