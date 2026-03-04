import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { RalphLoop } from "./ralph-loop.js";
import type { QualityGateReport } from "./quality-gates.js";
import { parseFullBoard } from "../ui/handlers/tasks.js";

const BOARD_TEMPLATE = `# Task Board

## Queued

### Ralph Loop - Autonomous Dual-Agent Supervisor (Phase 10)
- **Codex CLI subprocess wrapper** -- Agent: codex -- Branch: \`codex/ralph-codex-process\`. Create wrapper.

## In Progress

*No tasks currently in progress.*

## Done

*Nothing done yet.*
`;

function passingQualityReport(): QualityGateReport {
  return {
    passed: true,
    bypassed: false,
    gates: [],
    feedbackMessage: "all good",
  };
}

test("RalphLoop completes a queued codex task when dispatch and quality gates pass", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-ralph-loop-"));
  try {
    const boardPath = path.join(root, "tasks.md");
    await fs.writeFile(boardPath, BOARD_TEMPLATE, "utf8");

    const workspaces: string[] = [];
    let destroyed = 0;

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
        executeCodexImpl: async ({ prompt, workingDir }) => {
          assert.ok(prompt.includes("Codex CLI subprocess wrapper"));
          assert.equal(workingDir.includes("workspace"), true);
          return {
            exitCode: 0,
            lastMessage: "done",
            events: [],
            durationMs: 10,
          };
        },
        workspaceManager: {
          create: async () => {
            const workspacePath = path.join(root, `workspace-${workspaces.length + 1}`);
            workspaces.push(workspacePath);
            await fs.mkdir(workspacePath, { recursive: true });
            return {
              path: workspacePath,
              branch: "codex/ralph-codex-process",
              detached: false,
            };
          },
          destroy: async () => {
            destroyed += 1;
          },
          list: async () => [],
        } as any,
        qualityGateRunner: {
          run: async () => passingQualityReport(),
        } as any,
        metadataStore: {
          load: async () => ({ sessions: {} }),
        } as any,
        postToolHookProcessor: {
          processCodexEvent: async () => null,
          processClaudeEvent: async () => null,
        } as any,
        sessionPoller: {
          isPolling: false,
          pollUntilTerminal: async (_initial: string, _probe: () => Promise<unknown>, onTransition?: (transition: any) => void) => {
            onTransition?.({ from: "working", to: "done", signals: {} });
            return "done";
          },
        } as any,
      },
    );

    const result = await loop.run();
    assert.equal(result.exitReason, "all_done");
    assert.equal(result.iterations, 1);
    assert.deepEqual(result.tasksCompleted, ["Codex CLI subprocess wrapper"]);
    assert.deepEqual(result.tasksFailed, []);
    assert.equal(destroyed, 1);

    const finalBoard = parseFullBoard(await fs.readFile(boardPath, "utf8"));
    assert.ok(finalBoard.tasks.find((task) => task.title === "Codex CLI subprocess wrapper" && task.status === "done"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("RalphLoop marks task stuck after repeated quality-gate failures", async () => {
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
          exitCode: 0,
          lastMessage: "finished but failing checks",
          events: [],
          durationMs: 10,
        }),
        workspaceManager: {
          create: async () => ({ path: path.join(root, "workspace"), detached: false }),
          destroy: async () => undefined,
          list: async () => [],
        } as any,
        qualityGateRunner: {
          run: async () => ({
            passed: false,
            bypassed: false,
            gates: [],
            feedbackMessage: "Quality gate results:\n- FAIL unit-tests",
          }),
        } as any,
        metadataStore: {
          load: async () => ({ sessions: {} }),
        } as any,
        postToolHookProcessor: {
          processCodexEvent: async () => null,
          processClaudeEvent: async () => null,
        } as any,
        sessionPoller: {
          isPolling: false,
          pollUntilTerminal: async () => "failed",
        } as any,
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
