import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMContentDraftGenerator } from "./content-draft-generator.js";
import type { ConfigRouter } from "./routing.js";
import type { ContentDraft } from "./types/content.js";
import type { RouteRequest, RouteResponse } from "./types/routing.js";

class FakeRouter {
  public calls: RouteRequest[] = [];

  constructor(private readonly responseFactory: () => Promise<RouteResponse>) {}

  async route(request: RouteRequest): Promise<RouteResponse> {
    this.calls.push(request);
    return await this.responseFactory();
  }
}

async function createPromptFile(): Promise<{ dir: string; promptPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-draft-prompt-"));
  const promptPath = path.join(dir, "thread-builder.md");
  await fs.writeFile(promptPath, "You are a content drafting assistant.", "utf8");
  return { dir, promptPath };
}

test("LLMContentDraftGenerator generateDraft parses thread posts", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: `\`\`\`json
{
  "posts": ["Post one", "Post two"]
}
\`\`\``,
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));

    const generator = new LLMContentDraftGenerator(router as unknown as ConfigRouter, fixture.promptPath);
    const draft = await generator.generateDraft({
      topic: "Agent handoff lessons",
      format: "thread",
      platform: "x",
    });

    assert.equal(draft.format, "thread");
    assert.deepEqual(draft.threadPosts, ["Post one", "Post two"]);
    assert.equal(draft.currentText, "Post one\n\nPost two");
    assert.equal(draft.revisions.length, 1);
    assert.equal(draft.revisions[0].version, 1);
    assert.equal(router.calls.length, 1);
    assert.equal(router.calls[0].task_type, "content_drafting");
    assert.ok(router.calls[0].prompt.includes("Agent handoff lessons"));
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});

test("LLMContentDraftGenerator reviseDraft adds revision and keeps metadata", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: `\`\`\`json
{
  "full_text": "Revised draft text",
  "revision_note": "Shortened opening paragraph"
}
\`\`\``,
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));
    const generator = new LLMContentDraftGenerator(router as unknown as ConfigRouter, fixture.promptPath);

    const existing: ContentDraft = {
      ideaId: "content-007",
      format: "post",
      platform: "linkedin",
      currentText: "Old draft text",
      revisions: [
        {
          version: 1,
          timestamp: "2026-02-04T10:00:00Z",
          text: "Old draft text",
          author: "llm",
          changeNote: "Initial draft",
        },
      ],
      updatedAt: "2026-02-04T10:00:00Z",
    };

    const revised = await generator.reviseDraft(existing, "Make it more concise");

    assert.equal(revised.ideaId, "content-007");
    assert.equal(revised.currentText, "Revised draft text");
    assert.equal(revised.revisions.length, 2);
    assert.equal(revised.revisions[0].version, 2);
    assert.equal(revised.revisions[0].changeNote, "Shortened opening paragraph");
    assert.equal(revised.revisions[1].version, 1);
    assert.ok(router.calls[0].prompt.includes("Make it more concise"));
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});

test("LLMContentDraftGenerator falls back to raw content when JSON parsing fails", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: "Plain text fallback output",
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));
    const generator = new LLMContentDraftGenerator(router as unknown as ConfigRouter, fixture.promptPath);
    const draft = await generator.generateDraft({
      topic: "Fallback case",
      format: "post",
      platform: "linkedin",
    });

    assert.equal(draft.currentText, "Plain text fallback output");
    assert.equal(draft.threadPosts, undefined);
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});
