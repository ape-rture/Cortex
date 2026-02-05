import "dotenv/config";
import { createWebScraper } from "../integrations/web-scraper.js";
import type { CrawlOptions, FetchPageOptions, FetchTier, PageResult } from "../core/types/web-scraper.js";

type ScrapeFlags = {
  tier?: FetchTier;
  selector?: string;
  waitForSelector?: string;
  extractLinks?: boolean;
  includeHtml?: boolean;
  timeoutMs?: number;
  crawl?: boolean;
  maxPages?: number;
  delayMs?: number;
  strategy?: CrawlOptions["strategy"];
  urlPattern?: string;
};

function parseFlags(argv: readonly string[]): { url?: string; flags: ScrapeFlags } {
  const flags: ScrapeFlags = {};
  let url: string | undefined;

  for (const token of argv) {
    if (!token.startsWith("--")) {
      if (!url) url = token;
      continue;
    }
    if (token === "--links") flags.extractLinks = true;
    if (token === "--html") flags.includeHtml = true;
    if (token === "--crawl") flags.crawl = true;
    if (token === "--no-links") flags.extractLinks = false;
    if (token === "--no-html") flags.includeHtml = false;

    const [key, rawValue] = token.slice(2).split("=", 2);
    const value = rawValue?.trim();
    if (!value) continue;

    if (key === "tier" && (value === "simple" || value === "browser" || value === "authenticated")) {
      flags.tier = value as FetchTier;
    }
    if (key === "selector") flags.selector = value;
    if (key === "wait") flags.waitForSelector = value;
    if (key === "timeout") flags.timeoutMs = Number(value);
    if (key === "max-pages") flags.maxPages = Number(value);
    if (key === "delay") flags.delayMs = Number(value);
    if (key === "strategy" && (value === "same-origin" || value === "same-domain" || value === "all")) {
      flags.strategy = value as CrawlOptions["strategy"];
    }
    if (key === "pattern") flags.urlPattern = value;
  }

  return { url, flags };
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  npm run scrape <url> [--tier=simple|browser|authenticated] [--selector=...] [--wait=...] [--links] [--html]");
  console.log("  npm run scrape <url> --crawl [--max-pages=10] [--delay=1000] [--strategy=same-origin|same-domain|all] [--pattern=...]");
}

function formatPage(result: PageResult): string {
  const lines: string[] = [];
  lines.push("# Page");
  lines.push(`URL: ${result.url}`);
  lines.push(`Title: ${result.title ?? "(none)"}`);
  lines.push(`Tier: ${result.tier}`);
  lines.push(`Duration: ${result.durationMs}ms`);
  if (result.warnings?.length) {
    lines.push("Warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  lines.push("");
  lines.push("Text:");
  lines.push(result.text || "(empty)");

  if (result.links) {
    lines.push("", `Links (${result.links.length}):`);
    for (const link of result.links) {
      const label = link.text ? ` — ${link.text}` : "";
      lines.push(`- ${link.href}${label}`);
    }
  }

  if (result.html) {
    lines.push("", "HTML:");
    lines.push(result.html);
  }

  return lines.join("\n");
}

export async function runScrape(argv: string[]): Promise<string> {
  const { url, flags } = parseFlags(argv);
  if (!url) {
    printUsage();
    return "";
  }

  const scraper = createWebScraper();
  const fetchOptions: FetchPageOptions = {
    tier: flags.tier,
    selector: flags.selector,
    waitForSelector: flags.waitForSelector,
    extractLinks: flags.extractLinks,
    includeHtml: flags.includeHtml,
    timeoutMs: flags.timeoutMs,
  };

  if (flags.crawl) {
    const crawlResult = await scraper.crawl(url, {
      maxPages: flags.maxPages,
      delayMs: flags.delayMs,
      strategy: flags.strategy,
      urlPattern: flags.urlPattern,
      fetchOptions,
    });
    const lines: string[] = [];
    lines.push("# Crawl Result");
    lines.push(`Start URL: ${url}`);
    lines.push(`Pages: ${crawlResult.pages.length}`);
    lines.push(`Errors: ${crawlResult.errors.length}`);
    lines.push(`Duration: ${crawlResult.durationMs}ms`);
    if (crawlResult.errors.length > 0) {
      lines.push("", "Errors:");
      for (const err of crawlResult.errors) {
        lines.push(`- ${err.url}: ${err.error}`);
      }
    }
    if (crawlResult.pages.length > 0) {
      lines.push("", "Pages:");
      for (const page of crawlResult.pages) {
        lines.push(`- ${page.url} (${page.tier}, ${page.durationMs}ms)`);
      }
    }
    return lines.join("\n");
  }

  const result = await scraper.fetchPage(url, fetchOptions);
  return formatPage(result);
}

import { fileURLToPath } from "node:url";

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runScrape(process.argv.slice(2))
    .then((output) => {
      if (output) console.log(output);
    })
    .catch((err) => {
      console.error(`Scrape failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
