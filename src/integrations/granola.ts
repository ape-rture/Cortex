/**
 * Granola URL Scraper
 *
 * Fetches a Granola shareable link and extracts the meeting transcript content.
 * Returns structured text suitable for the content seed extractor.
 */

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
 * Fetch and extract transcript text from a Granola shareable URL.
 * Performs a simple HTML scrape — extracts text content from the page.
 */
export async function fetchGranolaTranscript(url: string): Promise<GranolaTranscript> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Cortex/0.1 (personal-assistant)",
      "Accept": "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Granola URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Extract title from <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim();

  // Strip HTML tags and extract text content
  // Focus on main content area if identifiable
  const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const rawHtml = mainContentMatch?.[1] ?? html;

  // Strip HTML tags
  const text = rawHtml
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

  if (!text) {
    throw new Error("No text content extracted from Granola URL");
  }

  return { text, url, title };
}
