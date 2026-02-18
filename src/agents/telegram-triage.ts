/**
 * Telegram Triage Agent
 *
 * Automatically classifies queued Telegram captures and routes them to
 * the right destination: content ideas, project tasks, action items,
 * or flags them for manual review.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentFunction } from "../core/agent-runner.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { MarkdownContentStore } from "../core/content-store.js";
import { MarkdownResearchStore } from "../core/research-store.js";
import { MarkdownFeatureStore } from "../core/feature-store.js";
import { MarkdownIdeaStore } from "../core/idea-store.js";
import { ConfigRouter } from "../core/routing.js";
import type { CaptureType } from "../core/types/capture.js";
import type { AgentOutput, Finding } from "../core/types/agent-output.js";
import type { Task } from "../core/types/task-queue.js";

const PROMPT_PATH = path.resolve("src", "agents", "prompts", "telegram-triage.md");
const PENDING_PATH = path.resolve("actions", "pending.md");
const CORTEX_TASKS_PATH = path.resolve(".cortex", "tasks.md");

type Category =
  | "research"
  | "content_idea"
  | "project_task"
  | "cortex_feature"
  | "project_seed"
  | "action_item"
  | "needs_review";

interface Classification {
  readonly category: Category;
  readonly confidence: number;
}

const CATEGORY_FROM_CAPTURE_TYPE: Partial<Record<CaptureType, Category>> = {
  research: "research",
  content_idea: "content_idea",
  project_task: "project_task",
  cortex_feature: "cortex_feature",
  project_seed: "project_seed",
  action_item: "action_item",
};

async function loadPrompt(): Promise<string> {
  return await fs.readFile(PROMPT_PATH, "utf8");
}

function parseClassification(raw: string): Classification {
  // Extract JSON from response (may have markdown fencing)
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    return { category: "needs_review", confidence: 0 };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const category = parsed.category as string;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const validCategories: Category[] = [
      "research",
      "content_idea",
      "project_task",
      "cortex_feature",
      "project_seed",
      "action_item",
      "needs_review",
    ];
    if (!validCategories.includes(category as Category)) {
      return { category: "needs_review", confidence: 0 };
    }
    // Low confidence → needs_review
    if (confidence < 0.6) {
      return { category: "needs_review", confidence };
    }
    return { category: category as Category, confidence };
  } catch {
    return { category: "needs_review", confidence: 0 };
  }
}

function captureTypeFromTags(task: Task): CaptureType | undefined {
  for (const tag of task.tags ?? []) {
    if (!tag.startsWith("capture_type:")) continue;
    const value = tag.slice("capture_type:".length).trim() as CaptureType;
    return value;
  }
  return undefined;
}

function classificationFromCaptureTag(task: Task): Classification | undefined {
  const captureType = captureTypeFromTags(task);
  if (!captureType) return undefined;
  const category = CATEGORY_FROM_CAPTURE_TYPE[captureType];
  if (!category) return undefined;
  return {
    category,
    confidence: 0.95,
  };
}

async function routeToContentIdea(task: Task, store: MarkdownContentStore): Promise<string> {
  const id = await store.addIdea({
    date: new Date().toISOString().slice(0, 10),
    topic: task.title,
    format: "post",
    platform: "multi",
    status: "idea",
    source: `telegram:${task.id}`,
    notes: task.description,
  });
  return id;
}

async function routeToResearch(task: Task, store: MarkdownResearchStore): Promise<string> {
  return await store.add({
    title: task.title,
    description: task.description,
    sourceUrl: undefined,
    sourceRef: task.context_refs?.[0],
    tags: task.tags,
    status: "captured",
    source: "telegram",
    result: undefined,
  });
}

async function routeToFeature(task: Task, store: MarkdownFeatureStore): Promise<string> {
  return await store.add({
    title: task.title,
    description: task.description,
    rationale: undefined,
    status: "proposed",
    assignedTo: undefined,
    source: "telegram",
  });
}

async function routeToProjectSeed(task: Task, store: MarkdownIdeaStore): Promise<string> {
  return await store.add({
    title: task.title,
    description: task.description,
    category: "uncategorized",
    status: "seed",
    tags: task.tags,
    source: "telegram",
  });
}

async function routeToActionItem(task: Task): Promise<void> {
  const content = await fs.readFile(PENDING_PATH, "utf8");
  const date = new Date().toISOString().slice(0, 10);
  const entry = `- [ ] **Dennis**: ${task.title}\n  - Due: (none)\n  - Context: Telegram capture (${task.id})\n  - Priority: medium\n`;

  // Insert under "## Later" section
  const laterIndex = content.indexOf("## Later");
  if (laterIndex === -1) {
    // Fallback: append to end
    await fs.writeFile(PENDING_PATH, content.trimEnd() + "\n\n" + entry, "utf8");
    return;
  }

  const afterLater = content.indexOf("\n", laterIndex);
  if (afterLater === -1) {
    await fs.writeFile(PENDING_PATH, content + "\n" + entry, "utf8");
    return;
  }

  // Find the next line after the "## Later" heading + any placeholder text
  let insertPos = afterLater + 1;
  // Skip placeholder line like "[Items with future due dates or no date]"
  const nextLine = content.indexOf("\n", insertPos);
  if (nextLine !== -1 && content.substring(insertPos, nextLine).startsWith("[")) {
    insertPos = nextLine + 1;
  }

  const updated = content.slice(0, insertPos) + entry + content.slice(insertPos);
  await fs.writeFile(PENDING_PATH, updated, "utf8");
}

async function routeToProjectTask(task: Task): Promise<void> {
  const content = await fs.readFile(CORTEX_TASKS_PATH, "utf8");
  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n- **${task.title}** -- Source: Telegram capture (${date}). Agent: TBD.\n`;

  // Insert under "## Queued" section, after the description line
  const queuedIndex = content.indexOf("## Queued");
  if (queuedIndex === -1) {
    await fs.writeFile(CORTEX_TASKS_PATH, content.trimEnd() + "\n" + entry, "utf8");
    return;
  }

  // Find end of the "## Queued" header area (after the italic description)
  let insertPos = content.indexOf("\n", queuedIndex) + 1;
  // Skip italic description line
  const descLine = content.indexOf("\n", insertPos);
  if (descLine !== -1 && content.substring(insertPos, descLine).startsWith("*")) {
    insertPos = descLine + 1;
  }
  // Skip blank line after description
  if (content[insertPos] === "\n") {
    insertPos += 1;
  }

  const updated = content.slice(0, insertPos) + entry + content.slice(insertPos);
  await fs.writeFile(CORTEX_TASKS_PATH, updated, "utf8");
}

export const telegramTriageAgent: AgentFunction = async (context) => {
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    const queue = new MarkdownTaskQueue();
    const contentStore = new MarkdownContentStore();
    const researchStore = new MarkdownResearchStore();
    const featureStore = new MarkdownFeatureStore();
    const ideaStore = new MarkdownIdeaStore();
    const router = new ConfigRouter();
    const systemPrompt = await loadPrompt();

    // Get queued Telegram captures
    const allTasks = await queue.list();
    const captures = allTasks.filter((t) => t.source === "telegram" && t.status === "queued");

    if (captures.length === 0) {
      return {
        agent: context.agent,
        timestamp: new Date().toISOString(),
        findings: [],
        memory_updates: [],
        errors: [],
      };
    }

    let contentCount = 0;
    let researchCount = 0;
    let projectCount = 0;
    let featureCount = 0;
    let seedCount = 0;
    let actionCount = 0;
    let reviewCount = 0;
    const details: string[] = [];

    for (const capture of captures) {
      try {
        let classification = classificationFromCaptureTag(capture);
        if (!classification) {
          const response = await router.route({
            task_type: "quick_capture",
            system_prompt: systemPrompt,
            prompt: capture.title + (capture.description ? `\n\n${capture.description}` : ""),
          });
          classification = parseClassification(response.content);
        }

        switch (classification.category) {
          case "research": {
            const itemId = await routeToResearch(capture, researchStore);
            await queue.update(capture.id, "done", `→ research-queue.md (${itemId})`);
            details.push(`${capture.title} → research ${itemId}`);
            researchCount++;
            break;
          }
          case "content_idea": {
            const ideaId = await routeToContentIdea(capture, contentStore);
            await queue.update(capture.id, "done", `\u2192 content-ideas.md (${ideaId})`);
            details.push(`${capture.title} \u2192 content idea ${ideaId}`);
            contentCount++;
            break;
          }
          case "project_task": {
            await routeToProjectTask(capture);
            await queue.update(capture.id, "done", "\u2192 .cortex/tasks.md");
            details.push(`${capture.title} \u2192 project task`);
            projectCount++;
            break;
          }
          case "cortex_feature": {
            const featureId = await routeToFeature(capture, featureStore);
            await queue.update(capture.id, "done", `→ feature-proposals.md (${featureId})`);
            details.push(`${capture.title} → feature ${featureId}`);
            featureCount++;
            break;
          }
          case "project_seed": {
            const seedId = await routeToProjectSeed(capture, ideaStore);
            await queue.update(capture.id, "done", `→ ideas.md (${seedId})`);
            details.push(`${capture.title} → project seed ${seedId}`);
            seedCount++;
            break;
          }
          case "action_item": {
            await routeToActionItem(capture);
            await queue.update(capture.id, "done", "\u2192 actions/pending.md");
            details.push(`${capture.title} \u2192 action item`);
            actionCount++;
            break;
          }
          case "needs_review": {
            await queue.update(capture.id, "blocked", "Needs manual review \u2014 ambiguous classification");
            details.push(`${capture.title} \u2192 needs review`);
            reviewCount++;
            break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${capture.id}: ${msg}`);
      }
    }

    const summary = [
      `Triaged ${captures.length} Telegram capture${captures.length === 1 ? "" : "s"}:`,
      researchCount > 0 ? `${researchCount} research item${researchCount === 1 ? "" : "s"}` : null,
      contentCount > 0 ? `${contentCount} content idea${contentCount === 1 ? "" : "s"}` : null,
      projectCount > 0 ? `${projectCount} project task${projectCount === 1 ? "" : "s"}` : null,
      featureCount > 0 ? `${featureCount} feature proposal${featureCount === 1 ? "" : "s"}` : null,
      seedCount > 0 ? `${seedCount} project seed${seedCount === 1 ? "" : "s"}` : null,
      actionCount > 0 ? `${actionCount} action item${actionCount === 1 ? "" : "s"}` : null,
      reviewCount > 0 ? `${reviewCount} need${reviewCount === 1 ? "s" : ""} review` : null,
    ].filter(Boolean).join(", ");

    findings.push({
      type: reviewCount > 0 ? "action_item" : "insight",
      summary,
      detail: details.join("\n"),
      urgency: reviewCount > 0 ? "medium" : "low",
      confidence: 0.9,
      context_refs: [
        "actions/queue.md",
        "actions/research-queue.md",
        "projects/content-ideas.md",
        "projects/feature-proposals.md",
        "projects/ideas.md",
      ],
      requires_human: reviewCount > 0,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  return {
    agent: context.agent,
    timestamp: new Date().toISOString(),
    findings,
    memory_updates: [],
    errors,
  };
};
