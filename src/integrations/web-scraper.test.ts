import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebScraper } from "./web-scraper.js";

const HAS_BROWSER = process.env.TEST_BROWSER === "1";

function mockFetch(handler: (url: string) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return await handler(url);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("fetchPage tier1 extracts readability text", async () => {
  const restore = mockFetch((url) => new Response(
    "<html><head><title>Test</title></head><body><article><p>Readable text here.</p></article></body></html>",
    { status: 200 },
  ));
  try {
    const scraper = createWebScraper({ defaultTimeoutMs: 5000 });
    const result = await scraper.fetchPage("https://example.com/article");
    assert.equal(result.tier, "simple");
    assert.ok(result.text.includes("Readable text here."));
    assert.equal(result.title, "Test");
  } finally {
    restore();
  }
});

test("fetchPage selector option extracts specific node", async () => {
  const restore = mockFetch(() => new Response(
    "<html><body><div id=\"content\">Selector text</div><div>Other</div></body></html>",
    { status: 200 },
  ));
  try {
    const scraper = createWebScraper();
    const result = await scraper.fetchPage("https://example.com", { selector: "#content" });
    assert.equal(result.text, "Selector text");
  } finally {
    restore();
  }
});

test("fetchPage extractLinks resolves absolute URLs", async () => {
  const restore = mockFetch(() => new Response(
    "<html><body><a href=\"/a\">Link A</a><a href=\"https://example.com/b\">Link B</a></body></html>",
    { status: 200 },
  ));
  try {
    const scraper = createWebScraper();
    const result = await scraper.fetchPage("https://example.com", { extractLinks: true });
    assert.ok(result.links);
    assert.ok(result.links?.some((link) => link.href === "https://example.com/a"));
    assert.ok(result.links?.some((link) => link.href === "https://example.com/b"));
  } finally {
    restore();
  }
});

test("isCdpAvailable returns false when endpoint unreachable", async () => {
  const scraper = createWebScraper({ cdpEndpoint: "http://127.0.0.1:1" });
  const result = await scraper.isCdpAvailable();
  assert.equal(result, false);
});

test("crawl respects maxPages and delay", async () => {
  const pages = new Map<string, string>([
    ["https://example.com", "<html><body><a href=\"/a\">A</a><a href=\"/b\">B</a></body></html>"],
    ["https://example.com/a", "<html><body>Page A</body></html>"],
    ["https://example.com/b", "<html><body>Page B</body></html>"],
  ]);
  const restore = mockFetch((url) => {
    const html = pages.get(url) ?? "<html></html>";
    return new Response(html, { status: 200 });
  });
  try {
    const scraper = createWebScraper();
    const start = Date.now();
    const result = await scraper.crawl("https://example.com", {
      maxPages: 2,
      delayMs: 10,
      respectRobotsTxt: false,
    });
    const duration = Date.now() - start;
    assert.equal(result.pages.length, 2);
    assert.ok(duration >= 10);
  } finally {
    restore();
  }
});

test("auto-escalation triggers browser tier for short text with framework indicators", { skip: !HAS_BROWSER }, async () => {
  const restore = mockFetch(() => new Response(
    "<html><head><script src=\"react\"></script></head><body><div>Hi</div></body></html>",
    { status: 200 },
  ));
  try {
    const scraper = createWebScraper();
    const result = await scraper.fetchPage("https://example.com");
    assert.equal(result.tier, "browser");
  } finally {
    restore();
  }
});
