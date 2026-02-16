import { test } from "node:test";
import assert from "node:assert/strict";
import { formatForTelegram, trimTelegramMessage } from "./formatter.js";

test("formatForTelegram converts supported markdown to Telegram HTML", () => {
  const input = [
    "# Title",
    "Normal **bold** and *italic* and `code`.",
    "Link: [OpenAI](https://openai.com)",
    "```ts",
    "const a = 1 < 2;",
    "```",
  ].join("\n");

  const output = formatForTelegram(input);

  assert.match(output, /<b>Title<\/b>/);
  assert.match(output, /<b>bold<\/b>/);
  assert.match(output, /<i>italic<\/i>/);
  assert.match(output, /<code>code<\/code>/);
  assert.match(output, /<a href="https:\/\/openai\.com">OpenAI<\/a>/);
  assert.match(output, /<pre><code>const a = 1 &lt; 2;<\/code><\/pre>/);
});

test("formatForTelegram escapes HTML entities in user text", () => {
  const output = formatForTelegram(
    'Use <script>alert("x")</script> and [site](https://example.com?a=1&b=2)',
  );

  assert.match(output, /&lt;script&gt;alert\("x"\)&lt;\/script&gt;/);
  assert.match(output, /href="https:\/\/example\.com\?a=1&amp;b=2"/);
});

test("trimTelegramMessage truncates long content", () => {
  const formatted = formatForTelegram("**Hello** " + "x".repeat(200));
  const trimmed = trimTelegramMessage(formatted, 50);

  assert.equal(trimmed.length, 50);
  assert.match(trimmed, /\.\.\.$/);
  assert.doesNotMatch(trimmed, /<[^>]+>/);
});
