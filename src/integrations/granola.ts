/**
 * Granola URL Scraper
 *
 * Fetches a Granola shareable link and extracts the meeting transcript content.
 * Returns structured text suitable for the content seed extractor.
 */

import type { WebScraper } from "../core/types/web-scraper.js";
import { createWebScraper } from "./web-scraper.js";

export interface GranolaTranscript {
  /** The extracted transcript text */
  readonly text: string;
  /** Original URL */
  readonly url: string;
  /** Title if extractable */
  readonly title?: string;
}

/**
 * Check if a URL looks like a Granola shareable link.
 */
export function isGranolaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("granola");
  } catch {
    return false;
  }
}

/**
 * HTML fallback extraction for Granola pages.
 */
function extractTextFromHtml(html: string): string {
  const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const rawHtml = mainContentMatch?.[1] ?? html;

  return rawHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Fetch and extract transcript text from a Granola shareable URL.
 * Uses the web scraper for tiered fetch + readability, with HTML fallback.
 */
export async function fetchGranolaTranscript(
  url: string,
  scraper: WebScraper = createWebScraper(),
): Promise<GranolaTranscript> {
  let page;
  try {
    page = await scraper.fetchPage(url, { selector: "main", waitForSelector: "main", includeHtml: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch Granola URL: ${message}`);
  }

  const title = page.title;
  let text = page.text?.trim();
  if (!text && page.html) {
    text = extractTextFromHtml(page.html);
  }

  if (!text) {
    throw new Error("No text content extracted from Granola URL");
  }

  return { text, url: page.url ?? url, title };
}
