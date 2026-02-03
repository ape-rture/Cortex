import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarkdownAliasStore } from "./alias-store.js";

const SAMPLE = `# Aliases

Personal shorthand that reduces typing AND tokens. Cortex understands these aliases in all interactions.

---

## Active Aliases

| Alias | Expands To | Category | Added | Usage |
|-------|-----------|----------|-------|-------|
| \`gm\` | good morning / run morning briefing | command | 2026-02-02 | core |

---

## Suggested Aliases

*Cortex adds suggestions here when it detects repeated patterns. Move to Active after approval.*

| Suggested | Expands To | Times Seen | First Seen | Approve? |
|-----------|-----------|------------|------------|----------|
<!-- Example: | \`ixco\` | Indexing Co | 5 | 2026-02-03 | [ ] -->
`;

test("MarkdownAliasStore loads active aliases and expands text", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "aliases-"));
  const filePath = path.join(dir, "aliases.md");
  await fs.writeFile(filePath, SAMPLE, "utf8");

  const store = new MarkdownAliasStore(filePath);
  const active = await store.getActive();

  assert.equal(active.length, 1);
  assert.equal(active[0].alias, "gm");

  const expanded = await store.expand("gm");
  assert.match(expanded, /good morning/);
});

test("MarkdownAliasStore approves suggested alias and saves", async () => {
  const dir = await fs.mkdtemp(path.join(tmpdir(), "aliases-"));
  const filePath = path.join(dir, "aliases.md");
  const content = `${SAMPLE}\n| \`ixco\` | Indexing Co | 4 | 2026-02-03 | [ ] |\n`;
  await fs.writeFile(filePath, content, "utf8");

  const store = new MarkdownAliasStore(filePath);
  await store.approve("ixco");
  await store.save();

  const reloaded = new MarkdownAliasStore(filePath);
  const active = await reloaded.getActive();
  assert.ok(active.some((alias) => alias.alias === "ixco"));
});
