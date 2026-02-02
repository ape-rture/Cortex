import { promises as fs } from "node:fs";
import path from "node:path";
import type { Task, TaskPriority, TaskStatus, TaskSource } from "../core/types/task-queue.js";

export interface ContactRecord {
  name: string;
  company?: string;
  role?: string;
  type?: string;
  attioId?: string;
  context?: string;
  history?: Array<{ date: string; note: string }>;
  notes?: string;
}

const SECTION_HEADERS = ["queued", "in progress", "completed", "blocked", "failed", "cancelled"] as const;

function normalizeLine(line: string): string {
  return line.trim();
}

function parseKeyValue(line: string): { key: string; value: string } | undefined {
  const match = line.match(/^[-*]\s+([A-Za-z][A-Za-z _-]+):\s*(.*)$/);
  if (!match) return undefined;
  return { key: match[1].trim().toLowerCase(), value: match[2].trim() };
}

function parsePriority(value: string | undefined): TaskPriority {
  if (!value) return "p2";
  const v = value.toLowerCase();
  if (v === "p0" || v === "p1" || v === "p2" || v === "p3") return v;
  if (v === "high") return "p0";
  if (v === "medium") return "p1";
  if (v === "low") return "p2";
  return "p2";
}

function parseStatus(value: string | undefined, checkbox: "checked" | "unchecked"): TaskStatus {
  if (value) {
    const v = value.toLowerCase();
    if (v === "queued" || v === "in_progress" || v === "blocked" || v === "done" || v === "failed" || v === "cancelled") {
      return v as TaskStatus;
    }
  }
  return checkbox === "checked" ? "done" : "queued";
}

function parseSource(value: string | undefined): TaskSource {
  if (!value) return "cli";
  const v = value.toLowerCase();
  if (v === "cli" || v === "slack" || v === "agent" || v === "cron" || v === "webhook") return v as TaskSource;
  return "cli";
}

function extractTitleAndAssignee(line: string): { title: string; assignedTo?: string } {
  // Example formats:
  // - [ ] **Title**
  // - [ ] **Owner**: Task title
  const boldMatch = line.match(/^[-*]\s+\[[ xX]\]\s+\*\*(.+?)\*\*\s*(?::\s*(.+))?$/);
  if (boldMatch) {
    const maybeOwner = boldMatch[1].trim();
    const taskPart = boldMatch[2]?.trim();
    if (taskPart) {
      return { title: taskPart, assignedTo: maybeOwner };
    }
    return { title: maybeOwner };
  }

  const plainMatch = line.match(/^[-*]\s+\[[ xX]\]\s+(.*)$/);
  if (plainMatch) {
    return { title: plainMatch[1].trim() };
  }

  return { title: line.trim() };
}

function generateId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `task-${slug || "item"}-${index + 1}`;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export async function readMarkdownFile(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  return await fs.readFile(resolved, "utf8");
}

export async function appendToFile(filePath: string, content: string): Promise<void> {
  const resolved = path.resolve(filePath);
  let prefix = "";
  try {
    const existing = await fs.readFile(resolved, "utf8");
    if (existing.length > 0 && !existing.endsWith("\n")) {
      prefix = "\n";
    }
  } catch {
    // File may not exist; append will create it.
  }
  await fs.appendFile(resolved, `${prefix}${content}`);
}

export function parseTaskQueue(content: string): Task[] {
  const lines = content.split(/\r?\n/);
  const tasks: Task[] = [];
  let current: Task | null = null;
  let currentIndex = 0;

  const flush = () => {
    if (current) {
      tasks.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const headerMatch = line.match(/^##\s+(.*)$/);
    if (headerMatch) {
      const header = headerMatch[1].trim().toLowerCase();
      if (SECTION_HEADERS.includes(header as (typeof SECTION_HEADERS)[number])) {
        flush();
      }
      continue;
    }

    const taskMatch = line.match(/^[-*]\s+\[[ xX]\]/);
    if (taskMatch) {
      flush();
      const checkbox = line.includes("[x]") || line.includes("[X]") ? "checked" : "unchecked";
      const { title, assignedTo } = extractTitleAndAssignee(line);
      const id = generateId(title, currentIndex);
      const now = new Date().toISOString();
      current = {
        id,
        title,
        status: parseStatus(undefined, checkbox),
        priority: "p2",
        source: "cli",
        assigned_to: assignedTo,
        created_at: now,
        updated_at: now,
      };
      currentIndex += 1;
      continue;
    }

    if (!current) continue;

    const kv = parseKeyValue(line);
    if (!kv) continue;

    switch (kv.key) {
      case "id":
        current.id = kv.value || current.id;
        break;
      case "status":
        current.status = parseStatus(kv.value, "unchecked");
        break;
      case "priority":
        current.priority = parsePriority(kv.value);
        break;
      case "added":
      case "created":
        current.created_at = kv.value || current.created_at;
        break;
      case "updated":
        current.updated_at = kv.value || current.updated_at;
        break;
      case "due":
      case "due by":
        current.due_by = kv.value || current.due_by;
        break;
      case "context":
        current.context_refs = splitList(kv.value);
        break;
      case "tags":
        current.tags = splitList(kv.value);
        break;
      case "result":
        current.result = kv.value;
        break;
      case "source":
        current.source = parseSource(kv.value);
        break;
      case "assigned":
      case "assigned to":
        current.assigned_to = kv.value;
        break;
      case "title":
        current.title = kv.value || current.title;
        break;
      default:
        break;
    }
  }

  flush();
  return tasks;
}

export function serializeTaskQueue(tasks: readonly Task[]): string {
  const groups: Record<TaskStatus, Task[]> = {
    queued: [],
    in_progress: [],
    blocked: [],
    done: [],
    failed: [],
    cancelled: [],
  };

  for (const task of tasks) {
    groups[task.status]?.push(task);
  }

  const renderTask = (task: Task): string[] => {
    const lines: string[] = [];
    const checkbox = task.status === "done" ? "x" : " ";
    lines.push(`- [${checkbox}] **${task.title}**`);
    lines.push(`  - ID: ${task.id}`);
    lines.push(`  - Status: ${task.status}`);
    lines.push(`  - Priority: ${task.priority}`);
    lines.push(`  - Added: ${task.created_at}`);
    lines.push(`  - Updated: ${task.updated_at}`);
    lines.push(`  - Source: ${task.source}`);
    if (task.assigned_to) lines.push(`  - Assigned: ${task.assigned_to}`);
    if (task.due_by) lines.push(`  - Due: ${task.due_by}`);
    if (task.context_refs && task.context_refs.length > 0) {
      lines.push(`  - Context: ${task.context_refs.join(", ")}`);
    }
    if (task.tags && task.tags.length > 0) {
      lines.push(`  - Tags: ${task.tags.join(", ")}`);
    }
    if (task.result) lines.push(`  - Result: ${task.result}`);
    return lines;
  };

  const output: string[] = [];
  output.push("# Task Queue");
  output.push("");
  output.push("This file holds background work for Cortex between sessions.");
  output.push("");

  const sectionOrder: Array<{ title: string; status: TaskStatus }> = [
    { title: "Queued", status: "queued" },
    { title: "In Progress", status: "in_progress" },
    { title: "Completed", status: "done" },
    { title: "Blocked", status: "blocked" },
    { title: "Failed", status: "failed" },
    { title: "Cancelled", status: "cancelled" },
  ];

  for (const section of sectionOrder) {
    output.push(`## ${section.title}`);
    const items = groups[section.status];
    if (!items || items.length === 0) {
      output.push("");
      continue;
    }
    for (const task of items) {
      output.push(...renderTask(task));
    }
    output.push("");
  }

  return output.join("\n").trimEnd() + "\n";
}

export function parseContactFile(content: string): ContactRecord {
  const lines = content.split(/\r?\n/);
  let name = "";
  let company: string | undefined;
  let role: string | undefined;
  let type: string | undefined;
  let attioId: string | undefined;
  let context: string | undefined;
  let notes: string | undefined;
  const history: Array<{ date: string; note: string }> = [];

  let section: "context" | "history" | "notes" | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("# ")) {
      name = line.replace(/^#\s+/, "").trim();
      continue;
    }

    const fieldMatch = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const value = fieldMatch[2].trim();
      if (key === "company") company = value;
      if (key === "role") role = value;
      if (key === "type") type = value;
      if (key === "attio id") attioId = value;
      continue;
    }

    if (line.toLowerCase() === "## context") {
      section = "context";
      continue;
    }
    if (line.toLowerCase() === "## history") {
      section = "history";
      continue;
    }
    if (line.toLowerCase() === "## notes") {
      section = "notes";
      continue;
    }

    if (section === "context" && line) {
      context = context ? `${context}\n${line}` : line;
      continue;
    }

    if (section === "history" && line.startsWith("- ")) {
      const match = line.match(/^-\s+\[(.+?)\]:\s*(.*)$/);
      if (match) {
        history.push({ date: match[1].trim(), note: match[2].trim() });
      }
      continue;
    }

    if (section === "notes" && line) {
      notes = notes ? `${notes}\n${line}` : line;
    }
  }

  return {
    name,
    company,
    role,
    type,
    attioId,
    context,
    history: history.length > 0 ? history : undefined,
    notes,
  };
}
