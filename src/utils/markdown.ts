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
import type {
  ContentChain,
  ContentChainNode,
  ContentDraft,
  ContentFormat,
  ContentIdea,
  ContentPlatform,
  ContentSeed,
  ContentStatus,
  DraftRevision,
  SeedSource,
} from "../core/types/content.js";
import type { Project, ProjectStatus } from "../core/types/project.js";
import type {
  CaptureSource,
  FeatureProposal,
  FeatureStatus,
  ProjectSeed,
  ResearchItem,
  ResearchStatus,
  SeedStatus,
} from "../core/types/capture.js";

const SECTION_HEADERS = ["queued", "in progress", "completed", "blocked", "failed", "cancelled"] as const;
type MutableTask = { -readonly [K in keyof Task]: Task[K] };
type MutableContactInfo = { -readonly [K in keyof ContactInfo]: ContactInfo[K] };
type MutableInteractionRecord = { -readonly [K in keyof InteractionRecord]: InteractionRecord[K] };
type MutableContentIdea = { -readonly [K in keyof ContentIdea]: ContentIdea[K] };
type MutableContentSeed = { -readonly [K in keyof ContentSeed]: ContentSeed[K] };
type MutableContentDraft = { -readonly [K in keyof ContentDraft]: ContentDraft[K] };
type MutableDraftRevision = { -readonly [K in keyof DraftRevision]: DraftRevision[K] };
type MutableProject = { -readonly [K in keyof Project]: Project[K] };
type MutableResearchItem = { -readonly [K in keyof ResearchItem]: ResearchItem[K] };
type MutableFeatureProposal = { -readonly [K in keyof FeatureProposal]: FeatureProposal[K] };
type MutableProjectSeed = { -readonly [K in keyof ProjectSeed]: ProjectSeed[K] };

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
  if (v === "cli" || v === "slack" || v === "telegram" || v === "agent" || v === "cron" || v === "webhook") return v as TaskSource;
  return "cli";
}

function parseCaptureSource(value: string | undefined): CaptureSource {
  if (!value) return "cli";
  const v = value.toLowerCase();
  if (v === "cli" || v === "slack" || v === "telegram" || v === "agent" || v === "web") return v as CaptureSource;
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

function extractChecklistTitle(line: string): { checked: boolean; title: string } | undefined {
  const match = line.match(/^[-*]\s+\[([ xX])\]\s+\*\*(.+?)\*\*(?::\s*(.+))?$/);
  if (match) {
    const title = (match[3] ?? match[2]).trim();
    return {
      checked: match[1].toLowerCase() === "x",
      title,
    };
  }

  const plainMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (!plainMatch) return undefined;
  return {
    checked: plainMatch[1].toLowerCase() === "x",
    title: plainMatch[2].trim(),
  };
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

function parseResearchStatus(value: string | undefined): ResearchStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "captured":
    case "researching":
    case "done":
    case "archived":
      return normalized;
    default:
      return "captured";
  }
}

function parseFeatureStatus(value: string | undefined): FeatureStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "proposed":
    case "planned":
    case "assigned":
    case "done":
    case "rejected":
      return normalized;
    default:
      return "proposed";
  }
}

function parseSeedStatus(value: string | undefined): SeedStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "seed":
    case "evaluating":
    case "accepted":
    case "parked":
    case "rejected":
      return normalized;
    default:
      return "seed";
  }
}

function parseCaptureStatusFromSection(
  section: string | undefined,
  fallback: "research" | "feature" | "seed",
): ResearchStatus | FeatureStatus | SeedStatus {
  if (!section) {
    if (fallback === "research") return "captured";
    if (fallback === "feature") return "proposed";
    return "seed";
  }

  const normalized = section.trim().toLowerCase();
  if (fallback === "research") return parseResearchStatus(normalized);
  if (fallback === "feature") return parseFeatureStatus(normalized);
  return parseSeedStatus(normalized);
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
  const tasks: MutableTask[] = [];
  let current: MutableTask | null = null;
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
      case "description":
        current.description = kv.value || undefined;
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
    if (task.description) {
      lines.push(`  - Description: ${task.description.replace(/\s+/g, " ").trim()}`);
    }
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
  let contactInfo: MutableContactInfo | undefined;
  let relationshipStatus: RelationshipStatus = "active";
  let lastContact: string | undefined;
  let nextFollowUp: string | undefined;
  const history: MutableInteractionRecord[] = [];

  let section: "contactInfo" | "context" | "relationship" | "history" | "notes" | undefined;
  let currentInteraction: MutableInteractionRecord | undefined;

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
        if (infoKey === "website") contactInfo.website = infoValue || contactInfo.website;
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
  lines.push(`- Website: ${contact.contactInfo?.website ?? ""}`);

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

function parseContentFormat(value: string | undefined): ContentFormat {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "thread":
    case "post":
    case "article":
    case "newsletter":
    case "video_script":
    case "podcast_episode":
    case "other":
      return normalized;
    default:
      return "other";
  }
}

function parseContentPlatform(value: string | undefined): ContentPlatform {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "x":
    case "linkedin":
    case "youtube":
    case "spotify":
    case "newsletter":
    case "blog":
    case "internal":
    case "multi":
      return normalized;
    default:
      return "internal";
  }
}

function parseContentStatus(value: string | undefined): ContentStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "idea":
    case "outline":
    case "draft":
    case "review":
    case "approved":
    case "published":
    case "killed":
      return normalized;
    default:
      return "idea";
  }
}

function parseSeedSource(value: string | undefined): SeedSource {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "meeting":
    case "conversation":
    case "reading":
    case "observation":
    case "existing":
    case "granola":
    case "manual":
      return normalized;
    default:
      return "manual";
  }
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseProjectStatus(value: string | undefined): ProjectStatus {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "active":
    case "paused":
    case "archived":
      return normalized;
    default:
      return "active";
  }
}

function parseTechStack(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim();
  if (!normalized || normalized === "-" || normalized === "—" || normalized === "â€”") return [];
  return normalized
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseOptionalCell(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === "-" || normalized === "—" || normalized === "â€”") return undefined;
  return normalized;
}

function normalizeAddedAt(lastActivity: string | undefined): string {
  if (!lastActivity) return nowIso();
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastActivity)) {
    return `${lastActivity}T00:00:00.000Z`;
  }
  return lastActivity;
}

export function parseProjects(content: string): Project[] {
  const projects: MutableProject[] = [];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const cells = parseTableCells(rawLine);
    if (cells.length < 8) continue;
    if (cells[0].toLowerCase() === "id") continue;
    if (isSeparatorRow(cells)) continue;

    const id = cells[0];
    const name = cells[1];
    const projectPath = cells[2];
    if (!id || !name || !projectPath) continue;

    const lastActivity = parseOptionalCell(cells[6]);
    projects.push({
      id,
      name,
      path: projectPath,
      gitRemote: parseOptionalCell(cells[3]),
      status: parseProjectStatus(cells[4]),
      techStack: parseTechStack(cells[5]),
      lastActivity,
      notes: parseOptionalCell(cells[7]),
      addedAt: normalizeAddedAt(lastActivity),
    });
  }

  return projects;
}

export function serializeProjects(projects: readonly Project[]): string {
  const lines: string[] = [];
  lines.push("# Project Registry");
  lines.push("");
  lines.push("External projects tracked by Cortex for cross-folder git monitoring and management.");
  lines.push("");
  lines.push("| ID | Name | Path | Remote | Status | Tech Stack | Last Activity | Notes |");
  lines.push("|---|---|---|---|---|---|---|---|");

  for (const project of projects) {
    lines.push(
      `| ${escapeTableCell(project.id)} | ${escapeTableCell(project.name)} | ${escapeTableCell(project.path)} | ${escapeTableCell(project.gitRemote ?? "-")} | ${project.status} | ${escapeTableCell(project.techStack.join(","))} | ${escapeTableCell(project.lastActivity ?? "")} | ${escapeTableCell(project.notes ?? "")} |`,
    );
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function parseResearchQueue(content: string): ResearchItem[] {
  const lines = content.split(/\r?\n/);
  const items: MutableResearchItem[] = [];
  let section: string | undefined;
  let current: MutableResearchItem | undefined;
  let index = 0;

  const flush = () => {
    if (!current) return;
    items.push(current);
    current = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      flush();
      section = headerMatch[1];
      continue;
    }

    const checklist = extractChecklistTitle(line);
    if (checklist) {
      flush();
      const defaultStatus = parseCaptureStatusFromSection(section, "research") as ResearchStatus;
      const now = nowIso();
      current = {
        id: `research-item-${index + 1}`,
        title: checklist.title,
        description: undefined,
        sourceUrl: undefined,
        sourceRef: undefined,
        tags: undefined,
        status: checklist.checked ? "done" : defaultStatus,
        capturedAt: now,
        updatedAt: now,
        source: "cli",
        result: undefined,
      };
      index += 1;
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
        current.status = parseResearchStatus(kv.value);
        break;
      case "captured":
      case "captured at":
      case "added":
        current.capturedAt = kv.value || current.capturedAt;
        break;
      case "updated":
      case "updated at":
        current.updatedAt = kv.value || current.updatedAt;
        break;
      case "source":
        current.source = parseCaptureSource(kv.value);
        break;
      case "description":
        current.description = kv.value || undefined;
        break;
      case "url":
      case "source url":
        current.sourceUrl = kv.value || undefined;
        break;
      case "source ref":
        current.sourceRef = kv.value || undefined;
        break;
      case "tags":
        current.tags = splitList(kv.value);
        break;
      case "result":
        current.result = kv.value || undefined;
        break;
      default:
        break;
    }
  }

  flush();
  return items;
}

export function serializeResearchQueue(items: readonly ResearchItem[]): string {
  const groups: Record<ResearchStatus, ResearchItem[]> = {
    captured: [],
    researching: [],
    done: [],
    archived: [],
  };

  for (const item of items) {
    groups[item.status]?.push(item);
  }

  const renderItem = (item: ResearchItem): string[] => {
    const lines: string[] = [];
    const checked = item.status === "done" || item.status === "archived" ? "x" : " ";
    lines.push(`- [${checked}] **${item.title}**`);
    lines.push(`  - ID: ${item.id}`);
    lines.push(`  - Status: ${item.status}`);
    lines.push(`  - Captured: ${item.capturedAt}`);
    lines.push(`  - Updated: ${item.updatedAt}`);
    lines.push(`  - Source: ${item.source}`);
    if (item.description) lines.push(`  - Description: ${item.description.replace(/\s+/g, " ").trim()}`);
    if (item.sourceUrl) lines.push(`  - URL: ${item.sourceUrl}`);
    if (item.sourceRef) lines.push(`  - Source Ref: ${item.sourceRef}`);
    if (item.tags && item.tags.length > 0) lines.push(`  - Tags: ${item.tags.join(", ")}`);
    if (item.result) lines.push(`  - Result: ${item.result.replace(/\s+/g, " ").trim()}`);
    return lines;
  };

  const lines: string[] = [];
  lines.push("# Research Queue");
  lines.push("");
  lines.push("Things to investigate further - concepts, tools, articles, tweets, references.");
  lines.push("");
  lines.push("## Captured");
  lines.push("");
  for (const item of groups.captured) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Researching");
  lines.push("");
  for (const item of groups.researching) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Done");
  lines.push("");
  for (const item of groups.done) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Archived");
  lines.push("");
  for (const item of groups.archived) {
    lines.push(...renderItem(item));
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function parseFeatureProposals(content: string): FeatureProposal[] {
  const lines = content.split(/\r?\n/);
  const proposals: MutableFeatureProposal[] = [];
  let section: string | undefined;
  let current: MutableFeatureProposal | undefined;
  let index = 0;

  const flush = () => {
    if (!current) return;
    proposals.push(current);
    current = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      flush();
      section = headerMatch[1];
      continue;
    }

    const checklist = extractChecklistTitle(line);
    if (checklist) {
      flush();
      const defaultStatus = parseCaptureStatusFromSection(section, "feature") as FeatureStatus;
      const now = nowIso();
      current = {
        id: `feature-item-${index + 1}`,
        title: checklist.title,
        description: undefined,
        rationale: undefined,
        status: checklist.checked ? "done" : defaultStatus,
        assignedTo: undefined,
        capturedAt: now,
        updatedAt: now,
        source: "cli",
      };
      index += 1;
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
        current.status = parseFeatureStatus(kv.value);
        break;
      case "captured":
      case "captured at":
      case "added":
        current.capturedAt = kv.value || current.capturedAt;
        break;
      case "updated":
      case "updated at":
        current.updatedAt = kv.value || current.updatedAt;
        break;
      case "source":
        current.source = parseCaptureSource(kv.value);
        break;
      case "description":
        current.description = kv.value || undefined;
        break;
      case "rationale":
        current.rationale = kv.value || undefined;
        break;
      case "assigned":
      case "assigned to":
        current.assignedTo = kv.value || undefined;
        break;
      default:
        break;
    }
  }

  flush();
  return proposals;
}

export function serializeFeatureProposals(items: readonly FeatureProposal[]): string {
  const groups: Record<FeatureStatus, FeatureProposal[]> = {
    proposed: [],
    planned: [],
    assigned: [],
    done: [],
    rejected: [],
  };

  for (const item of items) {
    groups[item.status]?.push(item);
  }

  const renderItem = (item: FeatureProposal): string[] => {
    const lines: string[] = [];
    const checked = item.status === "done" || item.status === "rejected" ? "x" : " ";
    lines.push(`- [${checked}] **${item.title}**`);
    lines.push(`  - ID: ${item.id}`);
    lines.push(`  - Status: ${item.status}`);
    lines.push(`  - Captured: ${item.capturedAt}`);
    lines.push(`  - Updated: ${item.updatedAt}`);
    lines.push(`  - Source: ${item.source}`);
    if (item.description) lines.push(`  - Description: ${item.description.replace(/\s+/g, " ").trim()}`);
    if (item.rationale) lines.push(`  - Rationale: ${item.rationale.replace(/\s+/g, " ").trim()}`);
    if (item.assignedTo) lines.push(`  - Assigned: ${item.assignedTo}`);
    return lines;
  };

  const lines: string[] = [];
  lines.push("# Feature Proposals");
  lines.push("");
  lines.push("Ideas and proposals for improving Cortex - new agents, commands, integrations, capabilities.");
  lines.push("");
  lines.push("## Proposed");
  lines.push("");
  for (const item of groups.proposed) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Planned");
  lines.push("");
  for (const item of groups.planned) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Assigned");
  lines.push("");
  for (const item of groups.assigned) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Done");
  lines.push("");
  for (const item of groups.done) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Rejected");
  lines.push("");
  for (const item of groups.rejected) {
    lines.push(...renderItem(item));
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function parseProjectSeeds(content: string): ProjectSeed[] {
  const lines = content.split(/\r?\n/);
  const seeds: MutableProjectSeed[] = [];
  let section: string | undefined;
  let current: MutableProjectSeed | undefined;
  let index = 0;

  const flush = () => {
    if (!current) return;
    seeds.push(current);
    current = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      flush();
      section = headerMatch[1];
      continue;
    }

    const checklist = extractChecklistTitle(line);
    if (checklist) {
      flush();
      const defaultStatus = parseCaptureStatusFromSection(section, "seed") as SeedStatus;
      const now = nowIso();
      current = {
        id: `seed-item-${index + 1}`,
        title: checklist.title,
        description: undefined,
        category: undefined,
        status: checklist.checked ? "accepted" : defaultStatus,
        tags: undefined,
        capturedAt: now,
        updatedAt: now,
        source: "cli",
      };
      index += 1;
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
        current.status = parseSeedStatus(kv.value);
        break;
      case "captured":
      case "captured at":
      case "added":
        current.capturedAt = kv.value || current.capturedAt;
        break;
      case "updated":
      case "updated at":
        current.updatedAt = kv.value || current.updatedAt;
        break;
      case "source":
        current.source = parseCaptureSource(kv.value);
        break;
      case "description":
        current.description = kv.value || undefined;
        break;
      case "category":
        current.category = kv.value || undefined;
        break;
      case "tags":
        current.tags = splitList(kv.value);
        break;
      default:
        break;
    }
  }

  flush();
  return seeds;
}

export function serializeProjectSeeds(items: readonly ProjectSeed[]): string {
  const groups: Record<SeedStatus, ProjectSeed[]> = {
    seed: [],
    evaluating: [],
    accepted: [],
    parked: [],
    rejected: [],
  };

  for (const item of items) {
    groups[item.status]?.push(item);
  }

  const renderItem = (item: ProjectSeed): string[] => {
    const lines: string[] = [];
    const checked = item.status === "accepted" || item.status === "rejected" ? "x" : " ";
    lines.push(`- [${checked}] **${item.title}**`);
    lines.push(`  - ID: ${item.id}`);
    lines.push(`  - Status: ${item.status}`);
    lines.push(`  - Captured: ${item.capturedAt}`);
    lines.push(`  - Updated: ${item.updatedAt}`);
    lines.push(`  - Source: ${item.source}`);
    if (item.description) lines.push(`  - Description: ${item.description.replace(/\s+/g, " ").trim()}`);
    if (item.category) lines.push(`  - Category: ${item.category}`);
    if (item.tags && item.tags.length > 0) lines.push(`  - Tags: ${item.tags.join(", ")}`);
    return lines;
  };

  const lines: string[] = [];
  lines.push("# Ideas Backlog");
  lines.push("");
  lines.push("Potential new projects, tools, and things to build. Not tied to any existing project yet.");
  lines.push("");
  lines.push("## Seed");
  lines.push("");
  for (const item of groups.seed) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Evaluating");
  lines.push("");
  for (const item of groups.evaluating) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Accepted");
  lines.push("");
  for (const item of groups.accepted) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Parked");
  lines.push("");
  for (const item of groups.parked) {
    lines.push(...renderItem(item));
    lines.push("");
  }
  lines.push("## Rejected");
  lines.push("");
  for (const item of groups.rejected) {
    lines.push(...renderItem(item));
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function parseContentIdeas(content: string): ContentIdea[] {
  const ideas: MutableContentIdea[] = [];
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const cells = parseTableCells(rawLine);
    if (cells.length < 8) continue;
    if (cells[0].toLowerCase() === "id") continue;
    if (isSeparatorRow(cells)) continue;

    const id = cells[0];
    const date = cells[1];
    const topic = cells[2];
    if (!id || !date || !topic) continue;

    ideas.push({
      id,
      date,
      topic,
      format: parseContentFormat(cells[3]),
      platform: parseContentPlatform(cells[4]),
      status: parseContentStatus(cells[5]),
      source: cells[6] || undefined,
      notes: cells[7] || undefined,
      tags: undefined,
    });
  }

  return ideas;
}

export function serializeContentIdeas(ideas: readonly ContentIdea[]): string {
  const lines: string[] = [];
  lines.push("# Content Ideas");
  lines.push("");
  lines.push("Track content ideas through the pipeline: idea -> outline -> draft -> review -> approved -> published.");
  lines.push("");
  lines.push("| ID | Date | Topic | Format | Platform | Status | Source | Notes |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const idea of ideas) {
    lines.push(
      `| ${escapeTableCell(idea.id)} | ${escapeTableCell(idea.date)} | ${escapeTableCell(idea.topic)} | ${idea.format} | ${idea.platform} | ${idea.status} | ${escapeTableCell(idea.source ?? "")} | ${escapeTableCell(idea.notes ?? "")} |`,
    );
  }
  return lines.join("\n").trimEnd() + "\n";
}

function parseFencedJson(content: string): unknown {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (!fenced) return undefined;
  return JSON.parse(fenced[1]);
}

export function parseContentDraft(content: string): ContentDraft {
  const parsed = parseFencedJson(content);
  if (!parsed || typeof parsed !== "object") {
    const fallback: MutableContentDraft = {
      ideaId: "unknown",
      format: "post",
      platform: "internal",
      currentText: content.trim(),
      revisions: [],
      threadPosts: undefined,
      updatedAt: nowIso(),
      reviewNotes: undefined,
    };
    return fallback;
  }

  const data = parsed as Record<string, unknown>;
  const revisionsRaw = Array.isArray(data.revisions) ? data.revisions : [];
  const revisions: MutableDraftRevision[] = revisionsRaw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, idx) => {
      const author = item.author === "llm" || item.author === "manual" || item.author === "edit"
        ? item.author
        : "manual";
      return {
        version: typeof item.version === "number" ? item.version : idx + 1,
        timestamp: typeof item.timestamp === "string" ? item.timestamp : nowIso(),
        text: typeof item.text === "string" ? item.text : "",
        changeNote: typeof item.changeNote === "string" ? item.changeNote : undefined,
        author,
      };
    });

  const draft: MutableContentDraft = {
    ideaId: typeof data.ideaId === "string" ? data.ideaId : "unknown",
    format: parseContentFormat(typeof data.format === "string" ? data.format : undefined),
    platform: parseContentPlatform(typeof data.platform === "string" ? data.platform : undefined),
    currentText: typeof data.currentText === "string" ? data.currentText : "",
    revisions,
    threadPosts: Array.isArray(data.threadPosts)
      ? data.threadPosts.filter((item): item is string => typeof item === "string")
      : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso(),
    reviewNotes: Array.isArray(data.reviewNotes)
      ? data.reviewNotes.filter((item): item is string => typeof item === "string")
      : undefined,
  };

  return draft;
}

export function serializeContentDraft(draft: ContentDraft): string {
  const payload = {
    ideaId: draft.ideaId,
    format: draft.format,
    platform: draft.platform,
    currentText: draft.currentText,
    revisions: draft.revisions,
    threadPosts: draft.threadPosts ?? [],
    updatedAt: draft.updatedAt,
    reviewNotes: draft.reviewNotes ?? [],
  };
  return `# Content Draft: ${draft.ideaId}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
}

export function parseContentSeeds(content: string): ContentSeed[] {
  const lines = content.split(/\r?\n/);
  const seeds: MutableContentSeed[] = [];
  let section: "unprocessed" | "promoted" | undefined;
  let current: MutableContentSeed | undefined;

  const flush = () => {
    if (!current) return;
    if (section === "promoted") current.promoted = true;
    if (current.promotedToId) current.promoted = true;
    seeds.push(current);
    current = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.toLowerCase() === "## unprocessed") {
      flush();
      section = "unprocessed";
      continue;
    }
    if (line.toLowerCase() === "## promoted") {
      flush();
      section = "promoted";
      continue;
    }

    const itemMatch = line.match(/^-\s+\[([ xX])\]\s+\*\*(.+?)\*\*:\s*(.+)$/);
    if (itemMatch) {
      flush();
      const promoted = itemMatch[1].toLowerCase() === "x";
      current = {
        id: itemMatch[2].trim(),
        insight: itemMatch[3].trim(),
        source: "manual",
        sourceRef: undefined,
        contactRef: undefined,
        suggestedAngles: undefined,
        capturedAt: nowIso(),
        promoted,
        promotedToId: undefined,
      };
      continue;
    }

    if (!current) continue;
    const kv = parseKeyValue(line);
    if (!kv) continue;

    switch (kv.key) {
      case "source":
        current.source = parseSeedSource(kv.value);
        break;
      case "source ref":
        current.sourceRef = kv.value || undefined;
        break;
      case "contact ref":
        current.contactRef = kv.value || undefined;
        break;
      case "captured":
      case "captured at":
        current.capturedAt = kv.value || current.capturedAt;
        break;
      case "suggested angles":
        current.suggestedAngles = splitList(kv.value);
        break;
      case "promoted to":
        current.promotedToId = kv.value || undefined;
        if (current.promotedToId) current.promoted = true;
        break;
      default:
        break;
    }
  }

  flush();
  return seeds;
}

export function serializeContentSeeds(seeds: readonly ContentSeed[]): string {
  const unprocessed = seeds.filter((seed) => !seed.promoted);
  const promoted = seeds.filter((seed) => seed.promoted);

  const renderSeed = (seed: ContentSeed): string[] => {
    const lines: string[] = [];
    const checked = seed.promoted ? "x" : " ";
    lines.push(`- [${checked}] **${seed.id}**: ${seed.insight}`);
    lines.push(`  - Source: ${seed.source}`);
    lines.push(`  - Captured: ${seed.capturedAt}`);
    if (seed.sourceRef) lines.push(`  - Source Ref: ${seed.sourceRef}`);
    if (seed.contactRef) lines.push(`  - Contact Ref: ${seed.contactRef}`);
    if (seed.suggestedAngles && seed.suggestedAngles.length > 0) {
      lines.push(`  - Suggested Angles: ${seed.suggestedAngles.join("; ")}`);
    }
    if (seed.promotedToId) lines.push(`  - Promoted To: ${seed.promotedToId}`);
    return lines;
  };

  const lines: string[] = [];
  lines.push("# Content Seeds");
  lines.push("");
  lines.push("Extracted insights and observations that could become content. Seeds are promoted to content ideas when ready.");
  lines.push("");
  lines.push("## Unprocessed");
  lines.push("");
  if (unprocessed.length === 0) {
    lines.push("_No seeds yet. Use `content extract <file-or-url>` to extract seeds from meeting notes, Granola transcripts, or articles._");
  } else {
    for (const seed of unprocessed) {
      lines.push(...renderSeed(seed));
      lines.push("");
    }
  }
  lines.push("");
  lines.push("## Promoted");
  lines.push("");
  if (promoted.length === 0) {
    lines.push("_Seeds that have been converted to content ideas appear here with their linked idea ID._");
  } else {
    for (const seed of promoted) {
      lines.push(...renderSeed(seed));
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------
// Content Chains — parsing/serialization
// ---------------------------------------------------------------------

/**
 * Parse content chains from markdown.
 * Each chain is a ### block with key-value metadata and derivative list items.
 */
export function parseContentChains(content: string): ContentChain[] {
  const lines = content.split(/\r?\n/);
  const chains: ContentChain[] = [];
  let currentChain: { chainId: string; root: ContentChainNode | null; derivatives: ContentChainNode[]; createdAt: string } | null = null;
  let inDerivatives = false;

  const flush = () => {
    if (currentChain && currentChain.root) {
      chains.push({
        chainId: currentChain.chainId,
        root: currentChain.root,
        derivatives: currentChain.derivatives,
        createdAt: currentChain.createdAt,
      });
      currentChain = null;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("### ") && !trimmed.toLowerCase().includes("derivatives")) {
      flush();
      const chainId = trimmed.replace(/^###\s+/, "").trim();
      currentChain = { chainId, root: null, derivatives: [], createdAt: nowIso() };
      inDerivatives = false;
      continue;
    }

    if (!currentChain) continue;

    if (trimmed.toLowerCase().includes("derivatives")) {
      inDerivatives = true;
      continue;
    }

    const kvMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().toLowerCase();
      const value = kvMatch[2].trim();
      if (key === "created") currentChain.createdAt = value;
      if (key === "root") {
        const parts = value.split("|").map((p) => p.trim());
        if (parts[0]) {
          currentChain.root = {
            ideaId: parts[0],
            platform: parseContentPlatform(parts[1]),
            format: parseContentFormat(parts[2]),
            publishedAt: parts[3] || undefined,
            url: parts[4] || undefined,
          };
        }
      }
      continue;
    }

    if (inDerivatives && trimmed.startsWith("-")) {
      const nodeText = trimmed.replace(/^-\s+/, "");
      const parts = nodeText.split("|").map((p) => p.trim());
      if (parts[0]) {
        currentChain.derivatives.push({
          ideaId: parts[0],
          platform: parseContentPlatform(parts[1]),
          format: parseContentFormat(parts[2]),
          publishedAt: parts[3] || undefined,
          url: parts[4] || undefined,
        });
      }
    }
  }

  flush();
  return chains;
}

/**
 * Serialize content chains to markdown.
 */
export function serializeContentChains(chains: readonly ContentChain[]): string {
  const lines: string[] = [];
  lines.push("# Content Chains");
  lines.push("");
  lines.push("Track cross-platform content recycling. A chain links original content to its derivatives.");
  lines.push("");

  if (chains.length === 0) {
    lines.push("_No chains yet. Chains are created when content is derived from existing content (e.g., podcast distribution packs)._");
  } else {
    for (const chain of chains) {
      lines.push(`### ${chain.chainId}`);
      lines.push(`- **Created**: ${chain.createdAt}`);
      const r = chain.root;
      lines.push(`- **Root**: ${r.ideaId} | ${r.platform} | ${r.format} | ${r.publishedAt ?? ""} | ${r.url ?? ""}`);
      if (chain.derivatives.length > 0) {
        lines.push("- **Derivatives**:");
        for (const d of chain.derivatives) {
          lines.push(`  - ${d.ideaId} | ${d.platform} | ${d.format} | ${d.publishedAt ?? ""} | ${d.url ?? ""}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------

/**
 * Generate the next content idea ID based on existing ideas.
 * Format: content-NNN (zero-padded to 3 digits).
 */
export function nextContentIdeaId(ideas: readonly ContentIdea[]): string {
  let max = 0;
  for (const idea of ideas) {
    const match = idea.id.match(/^content-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  return `content-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Generate the next seed ID for a given date.
 * Format: seed-YYYY-MM-DD-NNN.
 */
export function nextSeedId(seeds: readonly ContentSeed[], date: string): string {
  const prefix = `seed-${date}-`;
  let max = 0;
  for (const seed of seeds) {
    if (seed.id.startsWith(prefix)) {
      const match = seed.id.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
