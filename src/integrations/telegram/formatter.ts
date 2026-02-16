/**
 * Telegram Message Formatter
 *
 * Converts standard markdown (as returned by CLI functions) to Telegram HTML.
 * Supported tags: <b>, <i>, <code>, <pre>, <a>
 */

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInlineMarkdown(value: string): string {
  let formatted = escapeHtml(value);

  formatted = formatted.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_match, text, url) => `<a href="${url}">${text}</a>`,
  );

  formatted = formatted.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  formatted = formatted.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  formatted = formatted.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1<i>$2</i>");
  formatted = formatted.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, "$1<i>$2</i>");

  return formatted;
}

function formatMarkdownLine(line: string): string {
  const heading = line.match(/^#{1,6}\s+(.+)$/);
  if (heading) {
    return `<b>${formatInlineMarkdown(heading[1])}</b>`;
  }

  return formatInlineMarkdown(line);
}

/**
 * Convert markdown output to Telegram HTML format.
 */
export function formatForTelegram(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        output.push(`<pre><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    output.push(formatMarkdownLine(line));
  }

  if (inCodeBlock) {
    output.push(`<pre><code>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`);
  }

  return output.join("\n");
}

/**
 * Trim a Telegram message to Telegram's max message length.
 * If truncation is required, falls back to plain escaped text to avoid broken HTML tags.
 */
export function trimTelegramMessage(message: string, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH): string {
  const normalized = message.trim();
  if (normalized.length <= maxLength) return normalized;

  const textOnly = normalized.replace(/<[^>]+>/g, "");
  if (textOnly.length <= maxLength) return textOnly;

  if (maxLength <= 3) return ".".repeat(Math.max(maxLength, 0));
  return `${textOnly.slice(0, maxLength - 3)}...`;
}
