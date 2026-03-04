import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PostToolHookProcessor, SessionMetadataStore, parsePatch } from "./post-tool-hooks.js";

test("parsePatch extracts PR URL, branch, and CI signals from codex event", () => {
  const patch = parsePatch("codex_cli", {
    type: "tool_output",
    text: "Switched to branch 'codex/orchestration-phase11'\nOpened PR https://github.com/acme/cortex/pull/42\nCI failed",
  });

  assert.ok(patch);
  assert.equal(patch?.branch, "codex/orchestration-phase11");
  assert.equal(patch?.prUrl, "https://github.com/acme/cortex/pull/42");
  assert.equal(patch?.ciStatus, "failed");
});

test("PostToolHookProcessor writes merged session metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-post-tool-hooks-"));
  const filePath = path.join(root, "session-metadata.json");

  try {
    const store = new SessionMetadataStore(filePath);
    const processor = new PostToolHookProcessor(store);

    await processor.processClaudeEvent("session-1", {
      message: "Opened pull request: https://github.com/acme/cortex/pull/12",
    });

    await processor.processCodexEvent("session-1", {
      branch: "codex/test-branch",
      ci_status: "success",
    });

    const snapshot = await store.load();
    const session = snapshot.sessions["session-1"];

    assert.ok(session);
    assert.equal(session?.prUrl, "https://github.com/acme/cortex/pull/12");
    assert.equal(session?.branch, "codex/test-branch");
    assert.equal(session?.ciStatus, "passed");
    assert.equal((session?.history.length ?? 0) >= 2, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("PostToolHookProcessor ignores malformed events", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-post-tool-hooks-malformed-"));
  const filePath = path.join(root, "session-metadata.json");

  try {
    const store = new SessionMetadataStore(filePath);
    const processor = new PostToolHookProcessor(store);

    const result = await processor.processCodexEvent("session-2", {
      unrelated: { value: 1 },
    });

    assert.equal(result, null);

    const snapshot = await store.load();
    assert.deepEqual(snapshot.sessions, {});
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("SessionMetadataStore performs atomic writes via temp file rename", async () => {
  const writes: string[] = [];
  const renames: Array<{ from: string; to: string }> = [];
  const inMemory = new Map<string, string>();

  const filePath = "D:/tmp/session-metadata.json";
  const store = new SessionMetadataStore(filePath, {
    readFileImpl: async (target) => {
      const value = inMemory.get(target);
      if (typeof value !== "string") {
        throw new Error("missing");
      }
      return value;
    },
    writeFileImpl: async (target, content) => {
      writes.push(target);
      inMemory.set(target, content);
    },
    renameImpl: async (from, to) => {
      renames.push({ from, to });
      const value = inMemory.get(from);
      if (typeof value === "string") {
        inMemory.set(to, value);
      }
      inMemory.delete(from);
    },
    mkdirImpl: async () => undefined,
  });

  await store.update("session-atomic", {
    branch: "codex/atomic",
    history: ["codex_cli:branch:codex/atomic"],
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.includes(".tmp-"), true);
  assert.equal(renames.length, 1);
  assert.equal(renames[0]?.to, filePath);

  const snapshot = await store.load();
  assert.equal(snapshot.sessions["session-atomic"]?.branch, "codex/atomic");
});
