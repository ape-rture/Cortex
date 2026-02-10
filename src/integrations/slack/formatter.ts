/**
 * Slack Message Formatter
 *
 * Converts standard markdown (as returned by CLI functions) to Slack mrkdwn.
 * Key differences from standard markdown:
 * - No heading syntax -- use bold instead
 * - Links: [text](url) -> <url|text>
 * - Bold: **text** -> *text* (Slack uses single asterisks)
 * - Code blocks and lists work the same
 */

/**
 * Convert markdown output to Slack mrkdwn format.
 */
export function formatForSlack(markdown: string): string {
  let inCodeBlock = false;
  const lines = markdown.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Toggle code block state
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    // Don't transform content inside code blocks
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    let transformed = line;

    // Convert headings to bold
    transformed = transformed.replace(/^(#{1,6})\s+(.+)$/, (_match, _hashes, text) => `*${text}*`);

    // Convert markdown links [text](url) to Slack links <url|text>
    transformed = transformed.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_match, text, url) => `<${url}|${text}>`,
    );

    // Convert **bold** to *bold* (Slack style)
    // Be careful not to convert already-single-asterisk bold
    transformed = transformed.replace(/\*\*([^*]+)\*\*/g, "*$1*");

    result.push(transformed);
  }

  return result.join("\n");
}

/**
 * Format orchestrator progress lines for a Slack message update.
 * Adds a header and wraps in a code-like format for readability.
 */
export function formatProgressUpdate(lines: readonly string[], done: boolean): string {
  const status = done ? "Cycle complete" : "Running...";
  const header = `*Orchestrator* (${status})`;
  if (lines.length === 0) return header;
  return `${header}\n${lines.join("\n")}`;
}
