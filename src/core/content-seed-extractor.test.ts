import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMContentSeedExtractor } from "./content-seed-extractor.js";
import type { ConfigRouter } from "./routing.js";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-seed-prompt-"));
  const promptPath = path.join(dir, "content-extractor.md");
  await fs.writeFile(promptPath, "You extract content seeds from text.", "utf8");
  return { dir, promptPath };
}

test("LLMContentSeedExtractor filters by confidence and assigns IDs", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: `\`\`\`json
{
  "seeds": [
    { "insight": "High confidence one", "confidence": 0.9, "suggested_angles": ["thread"] },
    { "insight": "Low confidence", "confidence": 0.2, "suggested_angles": ["post"] },
    { "insight": "High confidence two", "confidence": 0.8, "suggested_angles": ["linkedin"] }
  ]
}
\`\`\``,
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));

    const extractor = new LLMContentSeedExtractor(router as unknown as ConfigRouter, fixture.promptPath);
    const seeds = await extractor.extractSeeds(
      {
        text: "Meeting transcript text",
        source: "meeting",
        sourceRef: "meetings/2026-02/test.md",
      },
      { minConfidence: 0.5, maxSeeds: 5 },
    );

    assert.equal(seeds.length, 2);
    assert.ok(/^seed-\d{4}-\d{2}-\d{2}-001$/.test(seeds[0].id));
    assert.ok(/^seed-\d{4}-\d{2}-\d{2}-002$/.test(seeds[1].id));
    assert.equal(seeds[0].insight, "High confidence one");
    assert.deepEqual(seeds[0].suggestedAngles, ["thread"]);
    assert.equal(seeds[1].insight, "High confidence two");
    assert.equal(router.calls.length, 1);
    assert.equal(router.calls[0].task_type, "content_drafting");
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});

test("LLMContentSeedExtractor returns empty array when response has no seeds", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: "{}",
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));

    const extractor = new LLMContentSeedExtractor(router as unknown as ConfigRouter, fixture.promptPath);
    const seeds = await extractor.extractSeeds({
      text: "Any text",
      source: "manual",
    });

    assert.deepEqual(seeds, []);
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});
