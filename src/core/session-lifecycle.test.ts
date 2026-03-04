import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SessionLifecyclePoller,
  determineStatus,
  isTerminalStatus,
  type SessionSignals,
  type SessionStatus,
} from "./session-lifecycle.js";

test("determineStatus resolves every lifecycle state", () => {
  const cases: Array<{ expected: SessionStatus; signals: SessionSignals }> = [
    { expected: "queued", signals: {} },
    { expected: "spawning", signals: { spawned: true } },
    { expected: "working", signals: { agentAlive: true } },
    { expected: "pr_open", signals: { prUrl: "https://github.com/a/b/pull/1" } },
    { expected: "ci_running", signals: { ciStatus: "running" } },
    { expected: "ci_failed", signals: { ciStatus: "failed" } },
    { expected: "review_pending", signals: { reviewStatus: "pending" } },
    { expected: "changes_requested", signals: { reviewStatus: "changes_requested" } },
    { expected: "approved", signals: { reviewStatus: "approved" } },
    { expected: "mergeable", signals: { reviewStatus: "approved", mergeable: true } },
    { expected: "merging", signals: { mergeInProgress: true } },
    { expected: "merged", signals: { merged: true } },
    { expected: "quality_gates", signals: { qualityGateStatus: "pending" } },
    { expected: "done", signals: { qualityGateStatus: "passed" } },
    { expected: "failed", signals: { fatalError: "boom" } },
  ];

  for (const entry of cases) {
    const status = determineStatus("queued", entry.signals);
    assert.equal(status, entry.expected);
  }
});

test("isTerminalStatus detects done and failed", () => {
  assert.equal(isTerminalStatus("done"), true);
  assert.equal(isTerminalStatus("failed"), true);
  assert.equal(isTerminalStatus("working"), false);
});

test("SessionLifecyclePoller enforces re-entrancy guard", async () => {
  const poller = new SessionLifecyclePoller(0, {
    waitImpl: async () => undefined,
  });

  let calls = 0;
  const first = poller.pollUntilTerminal("queued", async () => {
    calls += 1;
    if (calls === 1) {
      return { spawned: true };
    }
    if (calls === 2) {
      return { qualityGateStatus: "passed" };
    }
    return { taskDone: true };
  });

  await assert.rejects(
    () => poller.pollUntilTerminal("queued", async () => ({ taskDone: true })),
    /already active/,
  );

  const final = await first;
  assert.equal(final, "done");
});

test("SessionLifecyclePoller emits transitions until terminal state", async () => {
  const transitions: Array<{ from: SessionStatus; to: SessionStatus }> = [];
  const signals: SessionSignals[] = [
    { spawned: true },
    { agentAlive: true },
    { prUrl: "https://github.com/example/repo/pull/42" },
    { ciStatus: "failed" },
    { reviewStatus: "pending" },
    { reviewStatus: "changes_requested" },
    { reviewStatus: "approved" },
    { reviewStatus: "approved", mergeable: true },
    { mergeInProgress: true },
    { merged: true },
    { qualityGateStatus: "pending" },
    { qualityGateStatus: "passed" },
  ];

  let index = 0;
  const poller = new SessionLifecyclePoller(0, {
    waitImpl: async () => undefined,
  });

  const final = await poller.pollUntilTerminal(
    "queued",
    async () => {
      const value = signals[index] ?? { taskDone: true };
      index += 1;
      return value;
    },
    (transition) => {
      transitions.push({ from: transition.from, to: transition.to });
    },
  );

  assert.equal(final, "done");
  assert.equal(transitions.length > 3, true);
  assert.deepEqual(transitions[0], { from: "queued", to: "spawning" });
  assert.deepEqual(transitions.at(-1), { from: "quality_gates", to: "done" });
});
