import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RalphLoop } from "./ralph-loop.js";
import { moveTaskOnBoard, parseFullBoard } from "../ui/handlers/tasks.js";

const BOARD_TEMPLATE = `# Task Board

## Queued

### Ralph Loop — Autonomous Dual-Agent Supervisor (Phase 10)
- **Codex CLI subprocess wrapper** -- Agent: codex -- Branch: \`codex/ralph-codex-process\`. Create wrapper.

## In Progress

*No tasks currently in progress.*

## Done

*Nothing done yet.*
`;

test("RalphLoop completes a queued codex task when board moves to done", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-ralph-loop-"));
  try {
    const boardPath = path.join(root, "tasks.md");
    await fs.writeFile(boardPath, BOARD_TEMPLATE, "utf8");

    const loop = new RalphLoop(
      {
        taskBoardPath: boardPath,
        logPath: path.join(root, "log.md"),
        activePath: path.join(root, "active.md"),
        basePath: root,
        maxIterations: 3,
        maxStuckCount: 3,
      },
      undefined,
      {
        executeCodexImpl: async ({ prompt }) => {
          assert.ok(prompt.includes("Codex CLI subprocess wrapper"));
          const raw = await fs.readFile(boardPath, "utf8");
          const done = moveTaskOnBoard(
            raw,
            "Codex CLI subprocess wrapper",
            "in_progress",
            "done",
          );
          await fs.writeFile(boardPath, done, "utf8");
          return {
            exitCode: 0,
            lastMessage: "done",
            events: [],
            durationMs: 10,
          };
        },
      },
    );

    const result = await loop.run();
    assert.equal(result.exitReason, "all_done");
    assert.equal(result.iterations, 1);
    assert.deepEqual(result.tasksCompleted, ["Codex CLI subprocess wrapper"]);
    assert.deepEqual(result.tasksFailed, []);

    const finalBoard = parseFullBoard(await fs.readFile(boardPath, "utf8"));
    assert.ok(finalBoard.tasks.find((task) => task.title === "Codex CLI subprocess wrapper" && task.status === "done"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("RalphLoop marks task stuck after repeated unsuccessful attempts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-ralph-loop-stuck-"));
  try {
    const boardPath = path.join(root, "tasks.md");
    await fs.writeFile(boardPath, BOARD_TEMPLATE, "utf8");

    const loop = new RalphLoop(
      {
        taskBoardPath: boardPath,
        logPath: path.join(root, "log.md"),
        activePath: path.join(root, "active.md"),
        basePath: root,
        maxIterations: 5,
        maxStuckCount: 2,
      },
      undefined,
      {
        executeCodexImpl: async () => ({
          exitCode: 1,
          lastMessage: "failed",
          events: [],
          durationMs: 10,
        }),
      },
    );

    const result = await loop.run();
    assert.equal(result.exitReason, "stuck");
    assert.equal(result.iterations, 2);
    assert.deepEqual(result.tasksCompleted, []);
    assert.deepEqual(result.tasksFailed, ["Codex CLI subprocess wrapper"]);

    const finalRaw = await fs.readFile(boardPath, "utf8");
    assert.ok(finalRaw.includes("ralph blocked after 2 attempts"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
