import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchGranolaTranscript, isGranolaUrl } from "./granola.js";
import type { CrawlResult, PageResult, WebScraper } from "../core/types/web-scraper.js";

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

test("isGranolaUrl detects granola links", () => {
  assert.equal(isGranolaUrl("https://app.granola.ai/share/abc"), true);
  assert.equal(isGranolaUrl("https://example.com"), false);
  assert.equal(isGranolaUrl("not-a-url"), false);
});

test("fetchGranolaTranscript extracts text and title", async () => {
  const pages = new Map<string, PageResult>([
    ["https://app.granola.ai/share/meeting-1", {
      url: "https://app.granola.ai/share/meeting-1",
      title: "Granola Meeting",
      text: "We discussed launch timeline.",
      html: "<html><head><title>Granola Meeting</title></head><body><main><p>We discussed launch timeline.</p></main></body></html>",
      links: [],
      tier: "simple",
      durationMs: 5,
    }],
  ]);

  const result = await fetchGranolaTranscript("https://app.granola.ai/share/meeting-1", new FakeScraper(pages));
  assert.equal(result.title, "Granola Meeting");
  assert.ok(result.text.includes("We discussed launch timeline."));
});

test("fetchGranolaTranscript throws on HTTP failure", async () => {
  await assert.rejects(
    () => fetchGranolaTranscript("https://app.granola.ai/share/missing", new FakeScraper(new Map())),
    /Failed to fetch Granola URL/,
  );
});

test("fetchGranolaTranscript throws when no text content extracted", async () => {
  const pages = new Map<string, PageResult>([
    ["https://app.granola.ai/share/empty", {
      url: "https://app.granola.ai/share/empty",
      title: "Empty",
      text: "",
      html: "<html><body><script>ignore</script><style>ignore</style></body></html>",
      links: [],
      tier: "simple",
      durationMs: 5,
    }],
  ]);

  await assert.rejects(
    () => fetchGranolaTranscript("https://app.granola.ai/share/empty", new FakeScraper(pages)),
    /No text content extracted/,
  );
});

test("fetchGranolaTranscript falls back to HTML extraction", async () => {
  const pages = new Map<string, PageResult>([
    ["https://app.granola.ai/share/fallback", {
      url: "https://app.granola.ai/share/fallback",
      title: "Fallback",
      text: "",
      html: "<html><body><main><p>Fallback extracted text.</p></main></body></html>",
      links: [],
      tier: "simple",
      durationMs: 5,
    }],
  ]);

  const result = await fetchGranolaTranscript("https://app.granola.ai/share/fallback", new FakeScraper(pages));
  assert.ok(result.text.includes("Fallback extracted text."));
});
