import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MarkdownReviewStore } from "./review-store.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-review-store-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("MarkdownReviewStore parses flagged items and pending count", async () => {
  await withTempDir(async (dir) => {
    const queuePath = path.join(dir, "review-queue.md");
    const statePath = path.join(dir, "review-state.json");
    await fs.writeFile(
      queuePath,
      [
        "- [ ] **Flagged**: Follow up with ACME (file: contacts/acme.md)",
        "- [ ] **Flagged**: Investigate stale task",
      ].join("\n"),
      "utf8",
    );

    const store = new MarkdownReviewStore(queuePath, statePath);
    const items = await store.list();

    assert.equal(items.length, 2);
    assert.equal(await store.pendingCount(), 2);
    assert.equal(items[0]?.status, "pending");
  });
});

test("MarkdownReviewStore supports approve, dismiss, and snooze transitions", async () => {
  await withTempDir(async (dir) => {
    const queuePath = path.join(dir, "review-queue.md");
    const statePath = path.join(dir, "review-state.json");
    await fs.writeFile(
      queuePath,
      "- [ ] **Flagged**: Item A\n- [ ] **Flagged**: Item B\n- [ ] **Flagged**: Item C\n",
      "utf8",
    );

    const store = new MarkdownReviewStore(queuePath, statePath);
    const [a, b, c] = await store.list();
    assert.ok(a && b && c);

    const approved = await store.approve(a.id);
    assert.equal(approved?.status, "approved");

    const dismissed = await store.dismiss(b.id);
    assert.equal(dismissed?.status, "dismissed");

    const snoozed = await store.snooze(c.id, "1h");
    assert.equal(snoozed?.status, "snoozed");

    const visible = await store.list();
    assert.equal(visible.length, 1);
    assert.equal(visible[0]?.id, c.id);
    assert.equal(visible[0]?.status, "snoozed");
  });
});
