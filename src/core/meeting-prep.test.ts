import { test } from "node:test";
import assert from "node:assert/strict";
import { LLMMeetingPrepGenerator } from "./meeting-prep.js";
import type { ConfigRouter } from "./routing.js";
import type {
  Contact,
  ContactStore,
  InteractionRecord,
} from "./types/crm.js";
import type { RouteRequest, RouteResponse } from "./types/routing.js";
import type { Task, TaskQueue, TaskPriority, TaskStatus } from "./types/task-queue.js";
import type { CrawlResult, PageResult, WebScraper } from "./types/web-scraper.js";

class FakeContactStore implements ContactStore {
  constructor(private readonly contacts: Contact[]) {}

  async loadAll(): Promise<readonly Contact[]> {
    return this.contacts;
  }

  async load(): Promise<Contact> {
    throw new Error("not implemented");
  }

  async save(): Promise<void> {
    throw new Error("not implemented");
  }

  async findByAttioId(): Promise<Contact | undefined> {
    return undefined;
  }

  async findByEmail(): Promise<Contact | undefined> {
    return undefined;
  }

  async search(query: string): Promise<readonly Contact[]> {
    const normalized = query.toLowerCase();
    return this.contacts.filter((contact) => {
      return contact.name.toLowerCase().includes(normalized)
        || (contact.company?.toLowerCase().includes(normalized) ?? false);
    });
  }

  async addInteraction(): Promise<void> {
    throw new Error("not implemented");
  }
}

class FakeTaskQueue implements TaskQueue {
  constructor(private readonly tasks: Task[]) {}

  async list(filter?: { status?: TaskStatus; priority?: TaskPriority }): Promise<readonly Task[]> {
    return this.tasks.filter((task) => {
      if (filter?.status && task.status !== filter.status) return false;
      if (filter?.priority && task.priority !== filter.priority) return false;
      return true;
    });
  }

  async add(): Promise<string> {
    throw new Error("not implemented");
  }

  async listByType(_captureType: Task["capture_type"]): Promise<readonly Task[]> {
    return this.tasks;
  }

  async update(): Promise<void> {
    throw new Error("not implemented");
  }

  async next(): Promise<Task | undefined> {
    return this.tasks[0];
  }

  parseFromMarkdown(): Task[] {
    return [];
  }

  toMarkdown(): string {
    return "";
  }
}

class FakeRouter {
  public calls: RouteRequest[] = [];

  constructor(private readonly responseFactory: (request: RouteRequest) => Promise<RouteResponse>) {}

  async route(request: RouteRequest): Promise<RouteResponse> {
    this.calls.push(request);
    return await this.responseFactory(request);
  }
}

class FakeScraper implements WebScraper {
  constructor(private readonly pages: Map<string, PageResult>) {}

  async fetchPage(url: string): Promise<PageResult> {
    const page = this.pages.get(url);
    if (!page) {
      throw new Error(`No mock page for ${url}`);
    }
    return page;
  }

  async crawl(): Promise<CrawlResult> {
    return { pages: [], errors: [], durationMs: 0 };
  }

  async isCdpAvailable(): Promise<boolean> {
    return false;
  }
}

function makeInteraction(index: number): InteractionRecord {
  return {
    date: `2026-01-0${index}`,
    type: "meeting",
    summary: `Interaction ${index}`,
  };
}

function makeContact(): Contact {
  return {
    name: "Arjun Mukherjee",
    company: "MeshPay",
    role: "CTO",
    type: "customer",
    relationshipStatus: "active",
    contactInfo: {
      website: "https://meshpay.com",
    },
    history: [
      makeInteraction(6),
      makeInteraction(5),
      makeInteraction(4),
      makeInteraction(3),
      makeInteraction(2),
      makeInteraction(1),
    ],
    filePath: "contacts/arjun-mukherjee.md",
  };
}

function makeTask(id: string, title: string, status: TaskStatus): Task {
  return {
    id,
    title,
    status,
    priority: "p2",
    capture_type: "task",
    source: "cli",
    created_at: "2026-02-03T10:00:00Z",
    updated_at: "2026-02-03T10:00:00Z",
  };
}

test("LLMMeetingPrepGenerator builds meeting brief with LLM talking points", async () => {
  const contact = makeContact();
  const tasks: Task[] = [
    makeTask("1", "Send SOC2 docs to Arjun Mukherjee", "queued"),
    makeTask("2", "General backlog cleanup", "queued"),
    makeTask("3", "Follow up with MeshPay contract team", "in_progress"),
    makeTask("4", "Closed item for Arjun Mukherjee", "done"),
  ];
  const pages = new Map<string, PageResult>([
    ["https://meshpay.com/", {
      url: "https://meshpay.com/",
      title: "MeshPay",
      text: "Welcome to MeshPay",
      links: [{ href: "https://meshpay.com/news", text: "News" }],
      tier: "simple",
      durationMs: 5,
    }],
    ["https://meshpay.com/news", {
      url: "https://meshpay.com/news",
      title: "MeshPay News",
      text: "Latest updates",
      links: [{ href: "https://meshpay.com/news/2026-launch", text: "Launch 2026" }],
      tier: "simple",
      durationMs: 5,
    }],
    ["https://meshpay.com/news/2026-launch", {
      url: "https://meshpay.com/news/2026-launch",
      title: "MeshPay Launches 2026",
      text: "MeshPay announced its 2026 launch schedule.",
      links: [],
      tier: "simple",
      durationMs: 5,
    }],
  ]);
  const router = new FakeRouter(async () => ({
    model_used: "openai:codex",
    used_fallback: false,
    content: `\`\`\`json
{
  "talking_points": ["Confirm SOC2 docs", "Validate launch timeline"],
  "context_summary": "Relationship is active and focused on launch readiness."
}
\`\`\``,
    usage: { input_tokens: 100, output_tokens: 40 },
    latency_ms: 123,
  }));

  const generator = new LLMMeetingPrepGenerator(
    new FakeContactStore([contact]),
    new FakeTaskQueue(tasks),
    router as unknown as ConfigRouter,
    { scraper: new FakeScraper(pages) },
  );

  const brief = await generator.generateBrief("Arjun");

  assert.equal(brief.contact.name, "Arjun Mukherjee");
  assert.equal(brief.recentInteractions.length, 5);
  assert.deepEqual(brief.openActionItems, [
    "Send SOC2 docs to Arjun Mukherjee",
    "Follow up with MeshPay contract team",
  ]);
  assert.equal(brief.companyNews.length, 1);
  assert.equal(brief.companyNews[0]?.title, "MeshPay Launches 2026");
  assert.equal(brief.companyNews[0]?.url, "https://meshpay.com/news/2026-launch");
  assert.deepEqual(brief.suggestedTalkingPoints, [
    "Confirm SOC2 docs",
    "Validate launch timeline",
  ]);
  assert.equal(brief.contextSummary, "Relationship is active and focused on launch readiness.");
  assert.equal(router.calls.length, 1);
  assert.ok(router.calls[0].system_prompt?.includes("Meeting Prep Agent"));
  assert.ok(router.calls[0].prompt.includes("Arjun Mukherjee"));
  assert.ok(router.calls[0].prompt.includes("MeshPay Launches 2026"));
});

test("LLMMeetingPrepGenerator falls back when LLM call fails", async () => {
  const contact = makeContact();
  const router = new FakeRouter(async () => {
    throw new Error("LLM unavailable");
  });
  const generator = new LLMMeetingPrepGenerator(
    new FakeContactStore([contact]),
    new FakeTaskQueue([]),
    router as unknown as ConfigRouter,
    { scraper: new FakeScraper(new Map()) },
  );

  const brief = await generator.generateBrief("Arjun");
  assert.equal(brief.suggestedTalkingPoints.length, 0);
  assert.equal(brief.companyNews.length, 0);
  assert.ok(brief.contextSummary.includes("Arjun Mukherjee"));
});

test("LLMMeetingPrepGenerator throws when contact is missing", async () => {
  const router = new FakeRouter(async () => ({
    model_used: "openai:codex",
    used_fallback: false,
    content: "{}",
    usage: { input_tokens: 0, output_tokens: 0 },
    latency_ms: 0,
  }));
  const generator = new LLMMeetingPrepGenerator(
    new FakeContactStore([]),
    new FakeTaskQueue([]),
    router as unknown as ConfigRouter,
    { scraper: new FakeScraper(new Map()) },
  );

  await assert.rejects(() => generator.generateBrief("missing"), /Contact not found/);
});
