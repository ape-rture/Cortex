import { test } from "node:test";
import assert from "node:assert/strict";
import { MarkdownDigestGenerator } from "./daily-digest.js";

test("MarkdownDigestGenerator toMarkdown renders sections", () => {
  const generator = new MarkdownDigestGenerator();
  const markdown = generator.toMarkdown({
    date: "2026-02-02",
    generated_at: "2026-02-02T23:59:00Z",
    accomplished: [{ summary: "Shipped routing layer", source: "log" }],
    still_open: [{ summary: "Pending task", source: "queue" }],
    shifted: [],
    tomorrow: ["Finalize calendar OAuth"],
  });

  assert.ok(markdown.includes("# Daily Digest: 2026-02-02"));
  assert.ok(markdown.includes("## Accomplished"));
  assert.ok(markdown.includes("## Still Open"));
  assert.ok(markdown.includes("## Tomorrow"));
});
