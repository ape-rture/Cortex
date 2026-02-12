import { promises as fs } from "node:fs";
import path from "node:path";
import { ConfigRouter } from "./routing.js";
import {
  DEFAULT_MEETING_PREP_CONFIG,
  type CompanyNewsItem,
  type Contact,
  type ContactStore,
  type InteractionRecord,
  type MeetingPrepBrief,
  type MeetingPrepConfig,
  type MeetingPrepGenerator,
} from "./types/crm.js";
import type { Task, TaskQueue } from "./types/task-queue.js";
import type { PageLink, WebScraper } from "./types/web-scraper.js";
import { wrapUntrusted } from "./security/untrusted-content.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "meeting-prep.md");
const OPEN_STATUSES = new Set<Task["status"]>(["queued", "in_progress", "blocked"]);
const NEWS_HINTS = [
  "news",
  "press",
  "blog",
  "updates",
  "insights",
  "stories",
  "announcements",
  "release",
  "media",
] as const;

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

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return undefined;
    }
  }
}

function isSameDomain(base: URL, target: URL): boolean {
  if (target.hostname === base.hostname) return true;
  return target.hostname.endsWith(`.${base.hostname}`);
}

function scoreLinks(links: readonly PageLink[], baseUrl: string, hints: readonly string[]): PageLink[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const scored: Array<{ link: PageLink; score: number }> = [];

  for (const link of links) {
    if (!link.href) continue;
    if (link.href.startsWith("mailto:") || link.href.startsWith("javascript:")) continue;
    let resolved: URL;
    try {
      resolved = new URL(link.href);
    } catch {
      continue;
    }
    if (!isSameDomain(base, resolved)) continue;
    if (resolved.pathname.toLowerCase().endsWith(".pdf")) continue;

    const haystack = `${link.href} ${link.text}`.toLowerCase();
    let score = 0;
    for (const hint of hints) {
      if (haystack.includes(hint)) score += 1;
    }
    if (score === 0) continue;

    const normalized = resolved.toString().split("#")[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    scored.push({ link: { href: normalized, text: link.text }, score });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.link);
}

function looksLikeArticleLink(link: PageLink, baseUrl: string): boolean {
  let resolved: URL;
  try {
    resolved = new URL(link.href);
  } catch {
    return false;
  }
  if (!isSameDomain(new URL(baseUrl), resolved)) return false;
  const path = resolved.pathname.toLowerCase();
  if (!path || path === "/") return false;
  if (path.endsWith(".pdf")) return false;
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 2) return true;
  if (/20\d{2}/.test(path)) return true;
  return false;
}

function summarizeText(text: string, maxLength = 240): string | undefined {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}...`;
}

async function fetchCompanyNews(
  scraper: WebScraper,
  contact: Contact,
  config: MeetingPrepConfig,
): Promise<CompanyNewsItem[]> {
  if (!config.includeCompanyNews) return [];
  if (config.companyNewsMaxItems <= 0) return [];

  const baseCandidate = normalizeUrl(config.companyNewsUrl ?? contact.contactInfo?.website);
  if (!baseCandidate) return [];

  let homepage;
  try {
    homepage = await scraper.fetchPage(baseCandidate, { extractLinks: true });
  } catch {
    return [];
  }

  const baseUrl = homepage.url ?? baseCandidate;
  const listingLinks = scoreLinks(homepage.links ?? [], baseUrl, NEWS_HINTS).slice(0, 3);
  const articleLinks: PageLink[] = [];

  for (const listing of listingLinks.slice(0, 2)) {
    try {
      const listingPage = await scraper.fetchPage(listing.href, { extractLinks: true });
      const listingCandidates = (listingPage.links ?? []).filter((link) => looksLikeArticleLink(link, baseUrl));
      for (const candidate of listingCandidates) {
        if (articleLinks.length >= config.companyNewsMaxItems * 2) break;
        articleLinks.push(candidate);
      }
    } catch {
      // ignore listing failures
    }
  }

  const candidates = articleLinks.length > 0 ? articleLinks : listingLinks;
  const items: CompanyNewsItem[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (items.length >= config.companyNewsMaxItems) break;
    if (seen.has(candidate.href)) continue;
    seen.add(candidate.href);
    try {
      const page = await scraper.fetchPage(candidate.href);
      const title = page.title ?? candidate.text ?? "Company update";
      const summary = summarizeText(page.text);
      items.push({
        title,
        url: page.url ?? candidate.href,
        summary,
      });
    } catch {
      // ignore article failures
    }
  }

  return items;
}

function formatCompanyNews(items: readonly CompanyNewsItem[]): string {
  if (items.length === 0) return "(none)";
  return items
    .map((item) => {
      const summary = item.summary ? ` | ${item.summary}` : "";
      return `- ${item.title} (${item.url})${summary}`;
    })
    .join("\n");
}

function buildMeetingPrepInput(
  contact: Contact,
  recentInteractions: readonly InteractionRecord[],
  openActionItems: readonly string[],
  companyNews: readonly CompanyNewsItem[],
): string {
  const context = contact.context?.trim()
    ? wrapUntrusted(contact.context.trim(), "contact_context")
    : "(none)";
  const interactionLines = recentInteractions.length > 0
    ? wrapUntrusted(
        recentInteractions.map((item) => summarizeInteraction(item)).join("\n"),
        "interaction_history",
      )
    : "(none)";
  const taskLines = openActionItems.length > 0
    ? openActionItems.map((item) => `- ${item}`).join("\n")
    : "(none)";
  const newsLines = companyNews.length > 0
    ? wrapUntrusted(formatCompanyNews(companyNews), "web_scrape")
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
    "",
    "Company News:",
    newsLines,
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
  private readonly scraper?: WebScraper;
  private readonly promptPath: string;
  private promptCache?: string;

  constructor(
    store: ContactStore,
    taskQueue: TaskQueue,
    router: ConfigRouter,
    options: { promptPath?: string; scraper?: WebScraper } = {},
  ) {
    this.store = store;
    this.taskQueue = taskQueue;
    this.router = router;
    this.promptPath = options.promptPath ?? DEFAULT_PROMPT_PATH;
    this.scraper = options.scraper;
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
    let companyNews: CompanyNewsItem[] = [];

    if (cfg.includeCompanyNews && this.scraper) {
      try {
        companyNews = await fetchCompanyNews(this.scraper, contact, cfg);
      } catch {
        companyNews = [];
      }
    }

    let suggestedTalkingPoints: string[] = [];
    let contextSummary = fallbackContextSummary(contact, recentInteractions);

    if (cfg.generateTalkingPoints) {
      try {
        const systemPrompt = await this.loadPrompt();
        const llmInput = buildMeetingPrepInput(contact, recentInteractions, openActionItems, companyNews);
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
      companyNews,
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
