import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileResumeTokenStore } from "./resume-token-store.js";
import type { ResumeToken, SessionSnapshot } from "./types/session.js";

function makeSnapshot(endedAt: string): SessionSnapshot {
  return {
    agent: "codex",
    ended_at: endedAt,
    branch: "codex/auto-router",
    working_on: "phase 5",
    unfinished: ["task-a"],
    next_steps: ["task-b"],
    open_questions: [],
    key_files: ["src/core/orchestrator.ts"],
  };
}

function makeToken(token: string, createdAt: string): ResumeToken {
  return {
    token,
    agent: "codex",
    cycle_id: "cycle-1",
    created_at: createdAt,
    snapshot: makeSnapshot(createdAt),
    interface_origin: "cli",
    thread_id: "thread-1",
  };
}

test("FileResumeTokenStore save/load/listRecent roundtrip", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-resume-tokens-"));
  try {
    const storePath = path.join(tempDir, "resume-tokens.json");
    const store = new FileResumeTokenStore(storePath);
    const older = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const newer = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    await store.save(makeToken("token-a", older));
    await store.save(makeToken("token-b", newer));

    const loaded = await store.load("token-a");
    assert.equal(loaded?.token, "token-a");

    const recent = await store.listRecent(1);
    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.token, "token-b");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("FileResumeTokenStore prune removes old tokens", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-resume-tokens-"));
  try {
    const storePath = path.join(tempDir, "resume-tokens.json");
    const store = new FileResumeTokenStore(storePath, 36500);
    const now = Date.now();
    const oldDate = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const newDate = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const pruneBefore = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    await store.save(makeToken("token-old", oldDate));
    await store.save(makeToken("token-new", newDate));

    const removed = await store.prune(pruneBefore);
    assert.equal(removed, 1);

    const remaining = await store.listRecent(10);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.token, "token-new");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("FileResumeTokenStore auto-prunes older than retention window", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-resume-tokens-"));
  try {
    const storePath = path.join(tempDir, "resume-tokens.json");
    const store = new FileResumeTokenStore(storePath, 7);
    const veryOld = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    await fs.writeFile(
      storePath,
      JSON.stringify([makeToken("token-old", veryOld), makeToken("token-fresh", fresh)], null, 2),
      "utf8",
    );

    const recent = await store.listRecent(10);
    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.token, "token-fresh");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("FileResumeTokenStore generates token id when empty token is provided", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-resume-tokens-"));
  try {
    const storePath = path.join(tempDir, "resume-tokens.json");
    const store = new FileResumeTokenStore(storePath);
    await store.save(makeToken("", new Date().toISOString()));

    const recent = await store.listRecent(1);
    assert.equal(recent.length, 1);
    assert.ok(recent[0]?.token);
    assert.ok((recent[0]?.token.length ?? 0) >= 8);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
