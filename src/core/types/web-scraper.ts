/**
 * Web Scraper Types
 *
 * Tiered web scraper for Cortex. Consumers call fetchPage() and the
 * implementation picks the cheapest strategy that works:
 *
 *   Tier 1 — fetch + cheerio + readability  (fast, no browser)
 *   Tier 2 — playwright-core headless       (JS-rendered pages)
 *   Tier 3 — playwright CDP connect         (authenticated / logged-in pages)
 *
 * Deep crawling (Tier 4 / crawlee) is out of scope for v1.
 */

// ---------------------------------------------------------------------------
// Page result
// ---------------------------------------------------------------------------

/** The extracted content from a single page fetch. */
export interface PageResult {
  /** The URL that was actually fetched (may differ from input after redirects). */
  readonly url: string;

  /** Page title, if extractable. */
  readonly title?: string;

  /**
   * Clean article/body text extracted via readability or fallback.
   * This is the primary output most consumers want.
   */
  readonly text: string;

  /** Raw HTML of the page (only included when `includeHtml` option is set). */
  readonly html?: string;

  /** Links found on the page (only included when `extractLinks` option is set). */
  readonly links?: PageLink[];

  /** Which strategy tier was actually used to fetch the page. */
  readonly tier: FetchTier;

  /** Fetch duration in milliseconds. */
  readonly durationMs: number;

  /** Non-fatal warnings (e.g. "fell back to tier 2", "readability extraction failed"). */
  readonly warnings?: string[];
}

/** A link found on the page. */
export interface PageLink {
  /** Resolved absolute URL. */
  readonly href: string;
  /** Link text content. */
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Fetch options
// ---------------------------------------------------------------------------

export type FetchTier = "simple" | "browser" | "authenticated";

export interface FetchPageOptions {
  /**
   * Force a specific tier instead of auto-escalating.
   * - `"simple"` — HTTP fetch + cheerio + readability (default start)
   * - `"browser"` — headless Playwright
   * - `"authenticated"` — connect to Chrome debug profile via CDP
   */
  readonly tier?: FetchTier;

  /**
   * Include raw HTML in the result.
   * @default false
   */
  readonly includeHtml?: boolean;

  /**
   * Extract links from the page.
   * @default false
   */
  readonly extractLinks?: boolean;

  /**
   * Custom headers to send with the request (tier 1 only).
   */
  readonly headers?: Readonly<Record<string, string>>;

  /**
   * Timeout in milliseconds. Applies to all tiers.
   * @default 30_000
   */
  readonly timeoutMs?: number;

  /**
   * CSS selector to extract content from instead of using readability.
   * Useful when you know exactly where the content lives.
   */
  readonly selector?: string;

  /**
   * Wait for this CSS selector to appear before extracting content.
   * Only applies to tier 2 and 3 (browser-based).
   */
  readonly waitForSelector?: string;
}

// ---------------------------------------------------------------------------
// Crawl (multi-page)
// ---------------------------------------------------------------------------

/** Options for crawling multiple pages starting from a root URL. */
export interface CrawlOptions {
  /** Maximum number of pages to visit. @default 10 */
  readonly maxPages?: number;

  /**
   * Link-following strategy.
   * - `"same-origin"` — only follow links on the same origin
   * - `"same-domain"` — follow links on the same domain (includes subdomains)
   * - `"all"` — follow all links (use with caution)
   * @default "same-origin"
   */
  readonly strategy?: "same-origin" | "same-domain" | "all";

  /**
   * URL pattern filter. Only follow links matching this regex.
   * Applied after strategy filter.
   */
  readonly urlPattern?: string;

  /** Minimum delay between requests in milliseconds. @default 1000 */
  readonly delayMs?: number;

  /** Options passed through to each individual page fetch. */
  readonly fetchOptions?: FetchPageOptions;

  /** Respect robots.txt. @default true */
  readonly respectRobotsTxt?: boolean;
}

/** Result from a multi-page crawl. */
export interface CrawlResult {
  /** All successfully fetched pages. */
  readonly pages: PageResult[];
  /** URLs that failed with their error messages. */
  readonly errors: ReadonlyArray<{ url: string; error: string }>;
  /** Total crawl duration in milliseconds. */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Scraper configuration
// ---------------------------------------------------------------------------

/** Global configuration for the web scraper module. */
export interface WebScraperConfig {
  /** User-Agent header for HTTP requests. @default "Cortex/0.1 (personal-assistant)" */
  readonly userAgent?: string;

  /**
   * CDP endpoint for authenticated tier (tier 3).
   * @default "http://localhost:9222"
   */
  readonly cdpEndpoint?: string;

  /** Default timeout in milliseconds. @default 30_000 */
  readonly defaultTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Module interface
// ---------------------------------------------------------------------------

/** The web scraper module's public API. */
export interface WebScraper {
  /**
   * Fetch a single page and extract its content.
   * Auto-escalates through tiers if lower tiers fail, unless a tier is forced.
   */
  fetchPage(url: string, options?: FetchPageOptions): Promise<PageResult>;

  /**
   * Crawl multiple pages starting from a root URL, following links.
   * Uses tier 1 (simple) by default for speed. Override via crawlOptions.fetchOptions.
   */
  crawl(startUrl: string, options?: CrawlOptions): Promise<CrawlResult>;

  /**
   * Check whether a Chrome debug instance is reachable at the CDP endpoint.
   * Useful for UI to show connection status.
   */
  isCdpAvailable(): Promise<boolean>;
}
