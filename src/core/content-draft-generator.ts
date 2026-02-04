import { promises as fs } from "node:fs";
import path from "node:path";
import { ConfigRouter } from "./routing.js";
import type {
  ContentDraft,
  ContentDraftGenerator,
  DraftGeneratorConfig,
  DraftGeneratorInput,
  DraftRevision,
} from "./types/content.js";
import { DEFAULT_DRAFT_CONFIG } from "./types/content.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "thread-builder.md");

function parseJsonPayload(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return undefined;

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

function buildUserPrompt(input: DraftGeneratorInput, config: DraftGeneratorConfig): string {
  const lines: string[] = [];
  lines.push(`Topic: ${input.topic}`);
  lines.push(`Format: ${input.format}`);
  lines.push(`Platform: ${input.platform}`);

  if (input.context) lines.push(`\nContext:\n${input.context}`);
  if (input.seed) {
    lines.push(`\nSeed insight: ${input.seed.insight}`);
    if (input.seed.suggestedAngles?.length) {
      lines.push(`Suggested angles: ${input.seed.suggestedAngles.join("; ")}`);
    }
  }
  if (input.previousDraft) lines.push(`\nPrevious draft:\n${input.previousDraft}`);
  if (input.feedback) lines.push(`\nFeedback to incorporate:\n${input.feedback}`);

  lines.push(`\nConstraints:`);
  if (input.format === "thread") {
    lines.push(`- Maximum ${config.maxThreadLength} posts per thread`);
  }
  if (config.maxLength) lines.push(`- Maximum length: ${config.maxLength}`);
  lines.push(`- Include hashtags: ${config.includeHashtags ? "yes" : "no"}`);

  return lines.join("\n");
}

export class LLMContentDraftGenerator implements ContentDraftGenerator {
  private readonly router: ConfigRouter;
  private readonly promptPath: string;
  private promptCache?: string;

  constructor(router: ConfigRouter, promptPath: string = DEFAULT_PROMPT_PATH) {
    this.router = router;
    this.promptPath = promptPath;
  }

  async generateDraft(
    input: DraftGeneratorInput,
    config?: Partial<DraftGeneratorConfig>,
  ): Promise<ContentDraft> {
    const cfg: DraftGeneratorConfig = { ...DEFAULT_DRAFT_CONFIG, ...config };
    const systemPrompt = await this.loadPrompt();
    const userPrompt = buildUserPrompt(input, cfg);

    const response = await this.router.route({
      task_type: "content_drafting",
      system_prompt: systemPrompt,
      prompt: userPrompt,
    });

    const now = new Date().toISOString();
    const parsed = parseJsonPayload(response.content);

    let currentText = "";
    let threadPosts: string[] | undefined;

    if (parsed) {
      if (Array.isArray(parsed.posts)) {
        threadPosts = parsed.posts.filter((p): p is string => typeof p === "string");
        currentText = threadPosts.join("\n\n");
      } else if (typeof parsed.full_text === "string") {
        currentText = parsed.full_text;
      }
    }

    if (!currentText) {
      currentText = response.content;
    }

    const revision: DraftRevision = {
      version: 1,
      timestamp: now,
      text: currentText,
      changeNote: "Initial draft",
      author: "llm",
    };

    return {
      ideaId: "pending",
      format: input.format,
      platform: input.platform,
      currentText,
      revisions: [revision],
      threadPosts: threadPosts?.length ? threadPosts : undefined,
      updatedAt: now,
    };
  }

  async reviseDraft(
    draft: ContentDraft,
    feedback: string,
    config?: Partial<DraftGeneratorConfig>,
  ): Promise<ContentDraft> {
    const cfg: DraftGeneratorConfig = { ...DEFAULT_DRAFT_CONFIG, ...config };
    const systemPrompt = await this.loadPrompt();

    const input: DraftGeneratorInput = {
      topic: draft.currentText.slice(0, 200),
      format: draft.format,
      platform: draft.platform,
      previousDraft: draft.currentText,
      feedback,
    };

    const userPrompt = buildUserPrompt(input, cfg);

    const response = await this.router.route({
      task_type: "content_drafting",
      system_prompt: systemPrompt,
      prompt: userPrompt,
    });

    const now = new Date().toISOString();
    const parsed = parseJsonPayload(response.content);

    let currentText = "";
    let threadPosts: string[] | undefined;
    let revisionNote: string | undefined;

    if (parsed) {
      if (Array.isArray(parsed.posts)) {
        threadPosts = parsed.posts.filter((p): p is string => typeof p === "string");
        currentText = threadPosts.join("\n\n");
      } else if (typeof parsed.full_text === "string") {
        currentText = parsed.full_text;
      }
      if (typeof parsed.revision_note === "string") {
        revisionNote = parsed.revision_note;
      }
    }

    if (!currentText) {
      currentText = response.content;
    }

    const newVersion = draft.revisions.length + 1;
    const revision: DraftRevision = {
      version: newVersion,
      timestamp: now,
      text: currentText,
      changeNote: revisionNote ?? `Revision based on feedback: ${feedback.slice(0, 100)}`,
      author: "llm",
    };

    return {
      ideaId: draft.ideaId,
      format: draft.format,
      platform: draft.platform,
      currentText,
      revisions: [revision, ...draft.revisions],
      threadPosts: threadPosts?.length ? threadPosts : draft.threadPosts,
      updatedAt: now,
      reviewNotes: draft.reviewNotes,
    };
  }

  private async loadPrompt(): Promise<string> {
    if (!this.promptCache) {
      this.promptCache = await fs.readFile(this.promptPath, "utf8");
    }
    return this.promptCache;
  }
}
