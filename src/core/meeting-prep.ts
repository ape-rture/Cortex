import { promises as fs } from "node:fs";
import path from "node:path";
import { ConfigRouter } from "./routing.js";
import {
  DEFAULT_MEETING_PREP_CONFIG,
  type Contact,
  type ContactStore,
  type InteractionRecord,
  type MeetingPrepBrief,
  type MeetingPrepConfig,
  type MeetingPrepGenerator,
} from "./types/crm.js";
import type { Task, TaskQueue } from "./types/task-queue.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "meeting-prep.md");
const OPEN_STATUSES = new Set<Task["status"]>(["queued", "in_progress", "blocked"]);

function pickBestContact(matches: readonly Contact[], query: string): Contact {
  const normalized = query.trim().toLowerCase();
  const exactName = matches.find((contact) => contact.name.toLowerCase() === normalized);
  if (exactName) return exactName;
  const exactCompany = matches.find((contact) => (contact.company?.toLowerCase() ?? "") === normalized);
  if (exactCompany) return exactCompany;
  return matches[0];
}

function buildTaskSearchText(task: Task): string {
  const chunks: string[] = [task.title];
  if (task.description) chunks.push(task.description);
  if (task.assigned_to) chunks.push(task.assigned_to);
  if (task.result) chunks.push(task.result);
  if (task.context_refs) chunks.push(...task.context_refs);
  if (task.tags) chunks.push(...task.tags);
  return chunks.join(" ").toLowerCase();
}

function extractOpenActionItems(tasks: readonly Task[], contact: Contact): string[] {
  const terms = [contact.name, contact.company].filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  if (terms.length === 0) return [];

  return tasks
    .filter((task) => OPEN_STATUSES.has(task.status))
    .filter((task) => {
      const text = buildTaskSearchText(task);
      return terms.some((term) => text.includes(term));
    })
    .map((task) => task.title)
    .slice(0, 10);
}

function summarizeInteraction(interaction: InteractionRecord): string {
  const detailParts: string[] = [`Summary: ${interaction.summary}`];
  if (interaction.keyPoints?.length) detailParts.push(`Key points: ${interaction.keyPoints.join(", ")}`);
  if (interaction.followUpNeeded) detailParts.push(`Follow-up: ${interaction.followUpNeeded}`);
  return `- ${interaction.date} (${interaction.type}): ${detailParts.join(" | ")}`;
}

function buildMeetingPrepInput(
  contact: Contact,
  recentInteractions: readonly InteractionRecord[],
  openActionItems: readonly string[],
): string {
  const context = contact.context?.trim() || "(none)";
  const interactionLines = recentInteractions.length > 0
    ? recentInteractions.map((item) => summarizeInteraction(item)).join("\n")
    : "(none)";
  const taskLines = openActionItems.length > 0
    ? openActionItems.map((item) => `- ${item}`).join("\n")
    : "(none)";

  return [
    `Contact: ${contact.name}`,
    `Company: ${contact.company ?? "(unknown)"}`,
    `Role: ${contact.role ?? "(unknown)"}`,
    `Type: ${contact.type}`,
    `Status: ${contact.relationshipStatus}`,
    "",
    `Context: ${context}`,
    "",
    "Recent Interactions:",
    interactionLines,
    "",
    "Open Action Items:",
    taskLines,
  ].join("\n");
}

function fallbackContextSummary(contact: Contact, recentInteractions: readonly InteractionRecord[]): string {
  const last = recentInteractions[0];
  if (!last) {
    return `${contact.name} is a ${contact.type}${contact.company ? ` at ${contact.company}` : ""}.`;
  }
  return `${contact.name} is a ${contact.type}${contact.company ? ` at ${contact.company}` : ""}. Most recent interaction: ${last.summary}.`;
}

function parseJsonPayload(raw: string): { talking_points?: unknown; context_summary?: unknown } | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return undefined;

  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonSlice) as { talking_points?: unknown; context_summary?: unknown };
}

function parseTalkingPoints(content: string): { talkingPoints: string[]; contextSummary?: string } {
  try {
    const parsed = parseJsonPayload(content);
    if (!parsed) return { talkingPoints: [] };

    const talkingPoints = Array.isArray(parsed.talking_points)
      ? parsed.talking_points.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [];
    const contextSummary = typeof parsed.context_summary === "string" ? parsed.context_summary.trim() : undefined;
    return { talkingPoints, contextSummary };
  } catch {
    return { talkingPoints: [] };
  }
}

export class LLMMeetingPrepGenerator implements MeetingPrepGenerator {
  private readonly store: ContactStore;
  private readonly taskQueue: TaskQueue;
  private readonly router: ConfigRouter;
  private readonly promptPath: string;
  private promptCache?: string;

  constructor(store: ContactStore, taskQueue: TaskQueue, router: ConfigRouter, promptPath: string = DEFAULT_PROMPT_PATH) {
    this.store = store;
    this.taskQueue = taskQueue;
    this.router = router;
    this.promptPath = promptPath;
  }

  async generateBrief(query: string, config: Partial<MeetingPrepConfig> = {}): Promise<MeetingPrepBrief> {
    const cfg: MeetingPrepConfig = { ...DEFAULT_MEETING_PREP_CONFIG, ...config };
    const matches = await this.store.search(query);
    if (matches.length === 0) {
      throw new Error(`Contact not found for query: ${query}`);
    }

    const contact = pickBestContact(matches, query);
    const recentInteractions = contact.history.slice(0, cfg.maxInteractions);
    const allTasks = await this.taskQueue.list();
    const openActionItems = extractOpenActionItems(allTasks, contact);

    let suggestedTalkingPoints: string[] = [];
    let contextSummary = fallbackContextSummary(contact, recentInteractions);

    if (cfg.generateTalkingPoints) {
      try {
        const systemPrompt = await this.loadPrompt();
        const llmInput = buildMeetingPrepInput(contact, recentInteractions, openActionItems);
        const llmResponse = await this.router.route({
          task_type: "complex_reasoning",
          system_prompt: systemPrompt,
          prompt: llmInput,
        });
        const parsed = parseTalkingPoints(llmResponse.content);
        if (parsed.talkingPoints.length > 0) suggestedTalkingPoints = parsed.talkingPoints.slice(0, 5);
        if (parsed.contextSummary) contextSummary = parsed.contextSummary;
      } catch {
        // Keep local fallback so meeting prep still works without LLM output.
      }
    }

    return {
      contact,
      recentInteractions,
      openActionItems,
      suggestedTalkingPoints,
      contextSummary,
      generatedAt: new Date().toISOString(),
    };
  }

  private async loadPrompt(): Promise<string> {
    if (!this.promptCache) {
      this.promptCache = await fs.readFile(this.promptPath, "utf8");
    }
    return this.promptCache;
  }
}
