import { MarkdownTaskQueue } from "../../core/task-queue.js";
import type { CaptureType as QueueCaptureType, TaskPriority, TaskQueue } from "../../core/types/task-queue.js";
import { CAPTURE_TAG_MAP, type CaptureType } from "../../core/types/capture.js";

const DEFAULT_PRIORITY: TaskPriority = "p2";
const MAX_TITLE_LENGTH = 160;

export interface TelegramQueueMessage {
  readonly chatId: string | number;
  readonly messageId: string | number;
  readonly text: string;
  readonly userId?: string | number;
}

export interface TelegramQueuedTask {
  readonly taskId: string;
  readonly priority: TaskPriority;
  readonly duplicate: boolean;
  readonly messageRef: string;
  readonly preview: string;
}

interface ParsedTelegramMessage {
  readonly content: string;
  readonly priority: TaskPriority;
  readonly captureType?: CaptureType;
}

function toQueueCaptureType(captureType: CaptureType | undefined): QueueCaptureType {
  switch (captureType) {
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
    case undefined:
      return "task";
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function removeLeadingMention(value: string): string {
  return value.replace(/^@\w+\s+/, "").trim();
}

function toPreview(value: string): string {
  if (value.length <= 80) return value;
  return `${value.slice(0, 77)}...`;
}

function toTitle(value: string): string {
  if (value.length <= MAX_TITLE_LENGTH) return value;
  return `${value.slice(0, MAX_TITLE_LENGTH - 3)}...`;
}

function parsePriorityPrefix(value: string): ParsedTelegramMessage {
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

function parseCaptureTypePrefix(value: string): { content: string; captureType?: CaptureType } {
  const match = value.match(/^(#\w+)\s*(.*)$/);
  if (!match) return { content: value };
  const token = match[1].toLowerCase();
  const captureType = CAPTURE_TAG_MAP[token];
  if (!captureType) return { content: value };
  return {
    captureType,
    content: normalizeWhitespace(match[2] ?? ""),
  };
}

export function parseTelegramQueueMessage(text: string): ParsedTelegramMessage {
  const normalized = normalizeWhitespace(removeLeadingMention(text));
  if (!normalized) {
    return { priority: DEFAULT_PRIORITY, content: "" };
  }
  const priorityParsed = parsePriorityPrefix(normalized);
  const captureParsed = parseCaptureTypePrefix(priorityParsed.content);
  return {
    priority: priorityParsed.priority,
    content: captureParsed.content,
    captureType: captureParsed.captureType,
  };
}

export async function enqueueTelegramMessage(
  message: TelegramQueueMessage,
  queue: TaskQueue = new MarkdownTaskQueue(),
): Promise<TelegramQueuedTask> {
  const parsed = parseTelegramQueueMessage(message.text);
  if (!parsed.content) {
    throw new Error("Telegram message is empty after normalization");
  }

  const chatId = String(message.chatId);
  const messageId = String(message.messageId);
  const userId = message.userId !== undefined ? String(message.userId) : undefined;
  const messageRef = `telegram:${chatId}:${messageId}`;

  const existing = (await queue.list()).find((task) =>
    task.source === "telegram" &&
    task.context_refs?.includes(messageRef),
  );

  if (existing) {
    return {
      taskId: existing.id,
      priority: existing.priority,
      duplicate: true,
      messageRef,
      preview: toPreview(existing.title),
    };
  }

  const title = toTitle(parsed.content);
  const id = await queue.add({
    title,
    description: parsed.content === title ? undefined : parsed.content,
    priority: parsed.priority,
    source: "telegram",
    capture_type: toQueueCaptureType(parsed.captureType),
    assigned_to: userId ? `telegram:${userId}` : undefined,
    context_refs: [messageRef],
    tags: [
      "telegram",
      `chat:${chatId}`,
      ...(parsed.captureType ? [`capture_type:${parsed.captureType}`] : []),
      ...(userId ? [`user:${userId}`] : []),
    ],
  });

  return {
    taskId: id,
    priority: parsed.priority,
    duplicate: false,
    messageRef,
    preview: toPreview(title),
  };
}
