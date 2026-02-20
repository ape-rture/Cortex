/**
 * Telegram Triage Agent
 *
 * Classifies queued Telegram captures and routes them into the unified queue.
 * All categories stay in actions/queue.md with the appropriate capture_type.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentFunction } from "../core/agent-runner.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { ConfigRouter } from "../core/routing.js";
import type { CaptureType } from "../core/types/capture.js";
import type { AgentOutput, Finding } from "../core/types/agent-output.js";
import type { CaptureType as QueueCaptureType, Task } from "../core/types/task-queue.js";

const PROMPT_PATH = path.resolve("src", "agents", "prompts", "telegram-triage.md");

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

function toQueueCaptureType(category: Exclude<Category, "needs_review">): QueueCaptureType {
  switch (category) {
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
      return "task";
  }
}

function buildQueueTags(task: Task, category: Category): string[] {
  const tags = new Set((task.tags ?? []).filter((tag) => !tag.startsWith("capture_type:")));
  tags.add(`capture_type:${category}`);
  return [...tags];
}

async function routeToUnifiedQueue(
  task: Task,
  category: Exclude<Category, "needs_review">,
  queue: MarkdownTaskQueue,
): Promise<string> {
  const queueCaptureType = toQueueCaptureType(category);
  return await queue.add({
    title: task.title,
    description: task.description,
    priority: task.priority,
    source: "telegram",
    assigned_to: task.assigned_to,
    context_refs: task.context_refs,
    tags: buildQueueTags(task, category),
    capture_type: queueCaptureType,
    ...(category === "research" ? { source_ref: task.context_refs?.[0] } : {}),
    ...(category === "project_seed" ? { category: "uncategorized" } : {}),
    ...(category === "content_idea" ? { format: "post", platform: "multi" } : {}),
  });
}

export const telegramTriageAgent: AgentFunction = async (context): Promise<AgentOutput> => {
  const findings: Finding[] = [];
  const errors: string[] = [];

  try {
    const queue = new MarkdownTaskQueue();
    const router = new ConfigRouter();
    const systemPrompt = await loadPrompt();

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
            const routedId = await routeToUnifiedQueue(capture, "research", queue);
            await queue.update(capture.id, "done", `\u2192 actions/queue.md (${routedId})`);
            details.push(`${capture.title} \u2192 research ${routedId}`);
            researchCount++;
            break;
          }
          case "content_idea": {
            const routedId = await routeToUnifiedQueue(capture, "content_idea", queue);
            await queue.update(capture.id, "done", `\u2192 actions/queue.md (${routedId})`);
            details.push(`${capture.title} \u2192 content ${routedId}`);
            contentCount++;
            break;
          }
          case "project_task": {
            const routedId = await routeToUnifiedQueue(capture, "project_task", queue);
            await queue.update(capture.id, "done", `\u2192 actions/queue.md (${routedId})`);
            details.push(`${capture.title} \u2192 project task ${routedId}`);
            projectCount++;
            break;
          }
          case "cortex_feature": {
            const routedId = await routeToUnifiedQueue(capture, "cortex_feature", queue);
            await queue.update(capture.id, "done", `\u2192 actions/queue.md (${routedId})`);
            details.push(`${capture.title} \u2192 feature ${routedId}`);
            featureCount++;
            break;
          }
          case "project_seed": {
            const routedId = await routeToUnifiedQueue(capture, "project_seed", queue);
            await queue.update(capture.id, "done", `\u2192 actions/queue.md (${routedId})`);
            details.push(`${capture.title} \u2192 seed ${routedId}`);
            seedCount++;
            break;
          }
          case "action_item": {
            const routedId = await routeToUnifiedQueue(capture, "action_item", queue);
            await queue.update(capture.id, "done", `\u2192 actions/queue.md (${routedId})`);
            details.push(`${capture.title} \u2192 action item ${routedId}`);
            actionCount++;
            break;
          }
          case "needs_review": {
            await queue.update(capture.id, "blocked", "Needs manual review - ambiguous classification");
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
      contentCount > 0 ? `${contentCount} content item${contentCount === 1 ? "" : "s"}` : null,
      projectCount > 0 ? `${projectCount} project task${projectCount === 1 ? "" : "s"}` : null,
      featureCount > 0 ? `${featureCount} feature item${featureCount === 1 ? "" : "s"}` : null,
      seedCount > 0 ? `${seedCount} seed item${seedCount === 1 ? "" : "s"}` : null,
      actionCount > 0 ? `${actionCount} action item${actionCount === 1 ? "" : "s"}` : null,
      reviewCount > 0 ? `${reviewCount} need${reviewCount === 1 ? "s" : ""} review` : null,
    ].filter(Boolean).join(", ");

    findings.push({
      type: reviewCount > 0 ? "action_item" : "insight",
      summary,
      detail: details.join("\n"),
      urgency: reviewCount > 0 ? "medium" : "low",
      confidence: 0.9,
      context_refs: ["actions/queue.md"],
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
