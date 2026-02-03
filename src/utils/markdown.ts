import { promises as fs } from "node:fs";
import path from "node:path";
import type { Task, TaskPriority, TaskStatus, TaskSource } from "../core/types/task-queue.js";
import type {
  Contact,
  ContactInfo,
  ContactType,
  InteractionRecord,
  InteractionType,
  RelationshipStatus,
} from "../core/types/crm.js";

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

function parseContactType(value: string | undefined): ContactType {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "other";
  if (normalized === "customer" || normalized === "lead" || normalized === "partner" || normalized === "investor" || normalized === "other") {
    return normalized as ContactType;
  }
  return "other";
}

function parseRelationshipStatus(value: string | undefined): RelationshipStatus {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "active";
  if (normalized === "active" || normalized === "nurturing" || normalized === "dormant" || normalized === "churned") {
    return normalized as RelationshipStatus;
  }
  return "active";
}

function parseInteractionType(value: string | undefined): InteractionType {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "other";
  if (normalized === "meeting" || normalized === "email" || normalized === "call" || normalized === "slack" || normalized === "telegram" || normalized === "other") {
    return normalized as InteractionType;
  }
  return "other";
}

function parseKeyPoints(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function parseContactFile(content: string, filePath = ""): Contact {
  const lines = content.split(/\r?\n/);
  let name = "";
  let company: string | undefined;
  let role: string | undefined;
  let type: ContactType = "other";
  let attioId: string | undefined;
  let context: string | undefined;
  let notes: string | undefined;
  let contactInfo: ContactInfo | undefined;
  let relationshipStatus: RelationshipStatus = "active";
  let lastContact: string | undefined;
  let nextFollowUp: string | undefined;
  const history: InteractionRecord[] = [];

  let section: "contactInfo" | "context" | "relationship" | "history" | "notes" | undefined;
  let currentInteraction: InteractionRecord | undefined;

  const flushInteraction = () => {
    if (currentInteraction) {
      history.push(currentInteraction);
      currentInteraction = undefined;
    }
  };

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
      if (key === "type") type = parseContactType(value);
      if (key === "attio id") attioId = value;
      if (key === "status") relationshipStatus = parseRelationshipStatus(value);
      if (key === "last contact") lastContact = value;
      if (key === "next follow-up") nextFollowUp = value;
      continue;
    }

    const lower = line.toLowerCase();
    if (lower === "## contact info") {
      section = "contactInfo";
      continue;
    }
    if (lower === "## context") {
      section = "context";
      continue;
    }
    if (lower === "## relationship") {
      section = "relationship";
      continue;
    }
    if (lower === "## interaction history" || lower === "## history") {
      flushInteraction();
      section = "history";
      continue;
    }
    if (lower === "## notes") {
      section = "notes";
      continue;
    }

    if (section === "contactInfo" && line.startsWith("- ")) {
      const infoMatch = line.match(/^-\s+([^:]+):\s*(.*)$/);
      if (infoMatch) {
        const infoKey = infoMatch[1].trim().toLowerCase();
        const infoValue = infoMatch[2].trim();
        contactInfo = contactInfo ?? {};
        if (infoKey === "email") contactInfo.email = infoValue || contactInfo.email;
        if (infoKey === "linkedin") contactInfo.linkedin = infoValue || contactInfo.linkedin;
        if (infoKey === "phone") contactInfo.phone = infoValue || contactInfo.phone;
      }
      continue;
    }

    if (section === "context" && line) {
      context = context ? `${context}\n${line}` : line;
      continue;
    }

    if (section === "history") {
      if (line.startsWith("### ")) {
        flushInteraction();
        const heading = line.replace(/^###\s+/, "").trim();
        const parts = heading.split(" - ").map((part) => part.trim());
        const date = parts[0] ?? "";
        const typeValue = parts[1] ?? "other";
        currentInteraction = {
          date,
          type: parseInteractionType(typeValue),
          summary: "",
        };
        continue;
      }

      if (line.startsWith("- ") && currentInteraction) {
        const detailMatch = line.match(/^-\s+([^:]+):\s*(.*)$/);
        if (!detailMatch) continue;
        const detailKey = detailMatch[1].trim().toLowerCase();
        const detailValue = detailMatch[2].trim();
        if (detailKey === "summary") currentInteraction.summary = detailValue;
        if (detailKey === "key points") currentInteraction.keyPoints = parseKeyPoints(detailValue);
        if (detailKey === "follow-up needed") currentInteraction.followUpNeeded = detailValue;
      }
      continue;
    }

    if (section === "notes" && line) {
      notes = notes ? `${notes}\n${line}` : line;
    }
  }

  flushInteraction();

  return {
    name,
    company,
    role,
    type,
    attioId,
    contactInfo,
    context,
    relationshipStatus,
    lastContact,
    nextFollowUp,
    history,
    notes,
    filePath,
  };
}

export function serializeContact(contact: Contact): string {
  const lines: string[] = [];
  lines.push(`# ${contact.name}`);
  if (contact.company) lines.push(`\n**Company**: ${contact.company}`);
  if (contact.role) lines.push(`**Role**: ${contact.role}`);
  lines.push(`**Type**: ${contact.type}`);
  lines.push(`**Attio ID**: ${contact.attioId ?? ""}`);

  lines.push("\n## Contact Info");
  lines.push(`- Email: ${contact.contactInfo?.email ?? ""}`);
  lines.push(`- LinkedIn: ${contact.contactInfo?.linkedin ?? ""}`);
  lines.push(`- Phone: ${contact.contactInfo?.phone ?? ""}`);

  lines.push("\n## Context");
  if (contact.context) {
    lines.push(contact.context);
  }

  lines.push("\n## Relationship");
  lines.push(`**Status**: ${contact.relationshipStatus}`);
  if (contact.lastContact) lines.push(`**Last Contact**: ${contact.lastContact}`);
  if (contact.nextFollowUp) lines.push(`**Next Follow-up**: ${contact.nextFollowUp}`);

  lines.push("\n## Interaction History");
  if (contact.history.length === 0) {
    lines.push("");
  } else {
    for (const interaction of contact.history) {
      lines.push(`### ${interaction.date} - ${interaction.type}`);
      lines.push(`- Summary: ${interaction.summary}`);
      if (interaction.keyPoints && interaction.keyPoints.length > 0) {
        lines.push(`- Key points: ${interaction.keyPoints.join("; ")}`);
      }
      if (interaction.followUpNeeded) {
        lines.push(`- Follow-up needed: ${interaction.followUpNeeded}`);
      }
      lines.push("");
    }
  }

  if (contact.notes) {
    lines.push("\n## Notes");
    lines.push(contact.notes);
  }

  lines.push("\n---\n");
  lines.push("*Update after every interaction. Sync important updates to Attio.*");

  return lines.join("\n").trimEnd() + "\n";
}
