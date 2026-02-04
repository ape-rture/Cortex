import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMPodcastDistributionGenerator } from "./podcast-distribution.js";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-podcast-prompt-"));
  const promptPath = path.join(dir, "podcast-distribution.md");
  await fs.writeFile(promptPath, "You are a podcast distribution assistant.", "utf8");
  return { dir, promptPath };
}

test("LLMPodcastDistributionGenerator parses structured JSON output", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: `\`\`\`json
{
  "youtube_description": "YT description",
  "company_tweet": "Company tweet",
  "personal_post": "Personal post"
}
\`\`\``,
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));

    const generator = new LLMPodcastDistributionGenerator(router as unknown as ConfigRouter, fixture.promptPath);
    const pack = await generator.generatePack({
      episodeNumber: 5,
      title: "Block by Block Ep. 5",
      guestName: "Jane Doe",
      notes: "We discussed indexing strategy",
      links: ["https://example.com"],
    });

    assert.equal(pack.episodeId, "episode-5");
    assert.equal(pack.youtubeDescription, "YT description");
    assert.equal(pack.companyTweet, "Company tweet");
    assert.equal(pack.personalPost, "Personal post");
    assert.equal(router.calls.length, 1);
    assert.equal(router.calls[0].task_type, "content_drafting");
    assert.ok(router.calls[0].prompt.includes("EPISODE TITLE"));
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});

test("LLMPodcastDistributionGenerator falls back to raw output when JSON missing", async () => {
  const fixture = await createPromptFile();
  try {
    const router = new FakeRouter(async () => ({
      model_used: "openai:codex",
      used_fallback: false,
      content: "Only one block of text",
      usage: { input_tokens: 1, output_tokens: 1 },
      latency_ms: 1,
    }));

    const generator = new LLMPodcastDistributionGenerator(router as unknown as ConfigRouter, fixture.promptPath);
    const pack = await generator.generatePack({
      episodeNumber: 6,
      title: "Block by Block Ep. 6",
      guestName: "John Doe",
      notes: "Episode notes",
      links: [],
    });

    assert.equal(pack.youtubeDescription, "Only one block of text");
    assert.equal(pack.companyTweet, "");
    assert.equal(pack.personalPost, "");
  } finally {
    await fs.rm(fixture.dir, { recursive: true, force: true });
  }
});
