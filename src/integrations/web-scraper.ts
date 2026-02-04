import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";
import robotsParser from "robots-parser";
import { chromium, type Browser } from "playwright-core";
import type { Element } from "domhandler";
import type {
  CrawlOptions,
  CrawlResult,
  FetchPageOptions,
  FetchTier,
  PageLink,
  PageResult,
  WebScraper,
  WebScraperConfig,
} from "../core/types/web-scraper.js";

const DEFAULT_USER_AGENT = process.env.WEB_SCRAPER_USER_AGENT ?? "Cortex/0.1 (personal-assistant)";
const DEFAULT_CDP_ENDPOINT = process.env.WEB_SCRAPER_CDP_ENDPOINT ?? "http://localhost:9222";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.WEB_SCRAPER_TIMEOUT_MS ?? "30000", 10);

let browserInstance: Browser | null = null;
const robotsParserFn = robotsParser as unknown as (url: string, content: string) => {
  isAllowed: (url: string, userAgent?: string) => boolean;
};

type HtmlExtraction = {
  text: string;
  title?: string;
  links?: PageLink[];
  warnings: string[];
};

function nowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAbsoluteUrl(href: string, baseUrl: string): string | undefined {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function hasFrameworkIndicators(html: string): boolean {
  return /__NEXT_DATA__|data-reactroot|ng-version|<script[^>]+(react|vue|angular|next|nuxt|svelte)/i.test(html);
}

function extractFromHtml(
  html: string,
  baseUrl: string,
  options: { selector?: string; extractLinks?: boolean },
): HtmlExtraction {
  const warnings: string[] = [];
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || undefined;

  let text = "";
  if (options.selector) {
    text = $(options.selector).text().trim();
    if (!text) warnings.push(`selector "${options.selector}" produced empty text`);
  } else {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const reader = new Readability(doc);
      const article = reader.parse();
      text = article?.textContent?.trim() ?? "";
      if (!text) {
        text = $("body").text().trim();
        warnings.push("readability extraction returned empty text; fell back to body text");
      }
    } catch {
      text = $("body").text().trim();
      warnings.push("readability failed; fell back to body text");
    }
  }

  let links: PageLink[] | undefined;
  if (options.extractLinks) {
    links = [];
    $("a[href]").each((_idx: number, element: Element) => {
      const href = $(element).attr("href");
      if (!href) return;
      const resolved = resolveAbsoluteUrl(href, baseUrl);
      if (!resolved) return;
      const linkText = $(element).text().trim();
      links?.push({ href: resolved, text: linkText });
    });
  }

  return { text, title, links, warnings };
}

async function fetchHtml(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs: number },
): Promise<{ html: string; finalUrl: string }> {
  const response = await fetch(url, {
    headers: options.headers,
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const finalUrl = response.url || url;
  return { html, finalUrl };
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

async function fetchWithBrowser(
  url: string,
  options: { timeoutMs: number; waitForSelector?: string; userAgent: string },
): Promise<{ html: string; finalUrl: string }> {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: options.userAgent });
  const page = await context.newPage();

  try {
    await page.goto(url, { timeout: options.timeoutMs, waitUntil: "domcontentloaded" });
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: options.timeoutMs });
    }
    const html = await page.content();
    const finalUrl = page.url();
    return { html, finalUrl };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function fetchWithCdp(
  url: string,
  options: { timeoutMs: number; waitForSelector?: string; userAgent: string; cdpEndpoint: string },
): Promise<{ html: string; finalUrl: string }> {
  const browser = await chromium.connectOverCDP(options.cdpEndpoint);
  const context = browser.contexts()[0] ?? await browser.newContext({ userAgent: options.userAgent });
  const page = await context.newPage();

  try {
    await page.goto(url, { timeout: options.timeoutMs, waitUntil: "domcontentloaded" });
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: options.timeoutMs });
    }
    const html = await page.content();
    const finalUrl = page.url();
    return { html, finalUrl };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

function shouldAutoEscalate(text: string, html: string): boolean {
  return text.trim().length < 100 && hasFrameworkIndicators(html);
}

function resolveTimeout(options?: FetchPageOptions, config?: WebScraperConfig): number {
  return options?.timeoutMs ?? config?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
}

function resolveHeaders(options?: FetchPageOptions, userAgent?: string): Record<string, string> {
  return {
    "User-Agent": userAgent ?? DEFAULT_USER_AGENT,
    "Accept": "text/html",
    ...(options?.headers ?? {}),
  };
}

function withTier(
  result: HtmlExtraction,
  baseUrl: string,
  html: string | undefined,
  tier: FetchTier,
  durationMs: number,
  options?: FetchPageOptions,
): PageResult {
  const warnings = result.warnings.length > 0 ? result.warnings : undefined;
  return {
    url: baseUrl,
    title: result.title,
    text: result.text,
    html: options?.includeHtml ? html : undefined,
    links: options?.extractLinks ? result.links : undefined,
    tier,
    durationMs,
    warnings,
  };
}

export function createWebScraper(config: WebScraperConfig = {}): WebScraper {
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
  const cdpEndpoint = config.cdpEndpoint ?? DEFAULT_CDP_ENDPOINT;

  async function fetchSimple(url: string, options?: FetchPageOptions): Promise<PageResult> {
    const timeoutMs = resolveTimeout(options, config);
    const start = nowMs();
    const { html, finalUrl } = await fetchHtml(url, {
      headers: resolveHeaders(options, userAgent),
      timeoutMs,
    });
    const extraction = extractFromHtml(html, finalUrl, {
      selector: options?.selector,
      extractLinks: options?.extractLinks,
    });
    const durationMs = nowMs() - start;
    return withTier(extraction, finalUrl, html, "simple", durationMs, options);
  }

  async function fetchBrowser(url: string, options?: FetchPageOptions): Promise<PageResult> {
    const timeoutMs = resolveTimeout(options, config);
    const start = nowMs();
    const { html, finalUrl } = await fetchWithBrowser(url, {
      timeoutMs,
      waitForSelector: options?.waitForSelector,
      userAgent,
    });
    const extraction = extractFromHtml(html, finalUrl, {
      selector: options?.selector,
      extractLinks: options?.extractLinks,
    });
    const durationMs = nowMs() - start;
    return withTier(extraction, finalUrl, html, "browser", durationMs, options);
  }

  async function fetchAuthenticated(url: string, options?: FetchPageOptions): Promise<PageResult> {
    const timeoutMs = resolveTimeout(options, config);
    const start = nowMs();
    const { html, finalUrl } = await fetchWithCdp(url, {
      timeoutMs,
      waitForSelector: options?.waitForSelector,
      userAgent,
      cdpEndpoint,
    });
    const extraction = extractFromHtml(html, finalUrl, {
      selector: options?.selector,
      extractLinks: options?.extractLinks,
    });
    const durationMs = nowMs() - start;
    return withTier(extraction, finalUrl, html, "authenticated", durationMs, options);
  }

  async function fetchPage(url: string, options?: FetchPageOptions): Promise<PageResult> {
    const tier = options?.tier;
    if (tier === "browser") return await fetchBrowser(url, options);
    if (tier === "authenticated") return await fetchAuthenticated(url, options);
    if (tier === "simple") return await fetchSimple(url, options);

    const simple = await fetchSimple(url, options);
    if (simple.html && shouldAutoEscalate(simple.text, simple.html)) {
      try {
        const browser = await fetchBrowser(url, options);
        return {
          ...browser,
          warnings: [...(browser.warnings ?? []), "auto-escalated from tier 1"],
        };
      } catch (err) {
        return {
          ...simple,
          warnings: [
            ...(simple.warnings ?? []),
            `auto-escalation failed: ${err instanceof Error ? err.message : "unknown error"}`,
          ],
        };
      }
    }

    return simple;
  }

  async function isCdpAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${cdpEndpoint}/json/version`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function crawl(startUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const start = nowMs();
    const maxPages = options.maxPages ?? 10;
    const delayMs = options.delayMs ?? 1000;
    const strategy = options.strategy ?? "same-origin";
    const urlPattern = options.urlPattern ? new RegExp(options.urlPattern) : undefined;
    const respectRobots = options.respectRobotsTxt ?? true;

    const queue: string[] = [startUrl];
    const visited = new Set<string>();
    const pages: PageResult[] = [];
    const errors: Array<{ url: string; error: string }> = [];
    const robotsCache = new Map<string, ReturnType<typeof robotsParserFn>>();

    const startOrigin = new URL(startUrl).origin;
    const startHostname = new URL(startUrl).hostname;

    async function allowedByRobots(targetUrl: string): Promise<boolean> {
      if (!respectRobots) return true;
      try {
        const origin = new URL(targetUrl).origin;
        if (!robotsCache.has(origin)) {
          const robotsUrl = `${origin}/robots.txt`;
          const response = await fetch(robotsUrl, {
            headers: { "User-Agent": userAgent },
            signal: AbortSignal.timeout(2000),
          });
          const body = response.ok ? await response.text() : "";
          robotsCache.set(origin, robotsParserFn(robotsUrl, body));
        }
        const parser = robotsCache.get(origin);
        return parser ? parser.isAllowed(targetUrl, userAgent) : true;
      } catch {
        return true;
      }
    }

    function shouldFollow(url: string): boolean {
      const parsed = new URL(url);
      if (strategy === "same-origin" && parsed.origin !== startOrigin) return false;
      if (strategy === "same-domain" && parsed.hostname !== startHostname && !parsed.hostname.endsWith(`.${startHostname}`)) {
        return false;
      }
      if (urlPattern && !urlPattern.test(url)) return false;
      return true;
    }

    while (queue.length > 0 && pages.length < maxPages) {
      const nextUrl = queue.shift();
      if (!nextUrl || visited.has(nextUrl)) continue;
      visited.add(nextUrl);

      if (!(await allowedByRobots(nextUrl))) {
        errors.push({ url: nextUrl, error: "Blocked by robots.txt" });
        continue;
      }

      try {
        const result = await fetchPage(nextUrl, {
          ...options.fetchOptions,
          extractLinks: true,
        });
        pages.push(result);
        const links = result.links ?? [];
        for (const link of links) {
          if (pages.length + queue.length >= maxPages) break;
          if (!shouldFollow(link.href)) continue;
          if (!visited.has(link.href)) queue.push(link.href);
        }
      } catch (err) {
        errors.push({ url: nextUrl, error: err instanceof Error ? err.message : "unknown error" });
      }

      if (queue.length > 0 && pages.length < maxPages) {
        await sleep(delayMs);
      }
    }

    return {
      pages,
      errors,
      durationMs: nowMs() - start,
    };
  }

  return {
    fetchPage,
    crawl,
    isCdpAvailable,
  };
}
