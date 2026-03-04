import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { RalphLoop, type RalphEvent } from "./ralph-loop.js";
import { QualityGateRunner } from "./quality-gates.js";
import { WorkspaceManager } from "./workspace-manager.js";

const BOARD = `# Task Board

## Queued

### Orchestration Upgrade (Phase 11)
- **Integration task** -- Agent: codex -- Branch: \`codex/integration-task\`. Exercise full pipeline.

## In Progress

*No tasks currently in progress.*

## Done

*Nothing done yet.*
`;

async function run(command: string, args: readonly string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runGit(cwd: string, ...args: string[]): Promise<string> {
  const result = await run("git", args, cwd);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout;
}

async function createRepo(): Promise<{ root: string; boardPath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-orchestration-e2e-"));
  await runGit(root, "init");
  await runGit(root, "config", "user.email", "codex@example.com");
  await runGit(root, "config", "user.name", "Codex");

  await fs.mkdir(path.join(root, ".cortex"), { recursive: true });
  const boardPath = path.join(root, ".cortex", "tasks.md");
  await fs.writeFile(boardPath, BOARD, "utf8");
  await fs.writeFile(path.join(root, "README.md"), "# temp repo\n", "utf8");

  await runGit(root, "add", ".");
  await runGit(root, "commit", "-m", "init");

  return { root, boardPath };
}

test("orchestration e2e: worktree isolation -> dispatch -> quality gates pass -> task done", async () => {
  const { root, boardPath } = await createRepo();

  try {
    const quality = new QualityGateRunner({
      runCommandImpl: async () => ({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      }),
    });

    let seenWorkspace = "";
    const loop = new RalphLoop(
      {
        taskBoardPath: boardPath,
        logPath: path.join(root, ".cortex", "log.md"),
        activePath: path.join(root, ".cortex", "active.md"),
        basePath: root,
        maxIterations: 3,
        maxStuckCount: 2,
        pollIntervalMs: 1,
        sessionMaxPolls: 2,
      },
      undefined,
      {
        executeCodexImpl: async ({ workingDir }) => {
          seenWorkspace = workingDir;
          const isRepo = (await runGit(workingDir, "rev-parse", "--is-inside-work-tree")).trim();
          assert.equal(isRepo, "true");
          return {
            exitCode: 0,
            lastMessage: "task complete",
            events: [],
            durationMs: 5,
          };
        },
        qualityGateRunner: quality,
      },
    );

    const result = await loop.run();
    assert.equal(result.exitReason, "all_done");
    assert.deepEqual(result.tasksCompleted, ["Integration task"]);
    assert.equal(seenWorkspace.includes(path.join(".cortex", "worktrees")), true);

    const manager = new WorkspaceManager(root);
    const activeWorktrees = await manager.list();
    assert.equal(activeWorktrees.length, 0);

    const finalBoard = await fs.readFile(boardPath, "utf8");
    assert.ok(finalBoard.includes("## Done"));
    assert.ok(finalBoard.includes("**Integration task**"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("orchestration e2e: first attempt fails quality gates, retry prompt includes feedback, second attempt succeeds", async () => {
  const { root, boardPath } = await createRepo();

  try {
    let attempt = 0;
    let secondPrompt = "";

    const loop = new RalphLoop(
      {
        taskBoardPath: boardPath,
        logPath: path.join(root, ".cortex", "log.md"),
        activePath: path.join(root, ".cortex", "active.md"),
        basePath: root,
        maxIterations: 5,
        maxStuckCount: 3,
        pollIntervalMs: 1,
        sessionMaxPolls: 3,
      },
      undefined,
      {
        executeCodexImpl: async ({ prompt }) => {
          attempt += 1;
          if (attempt === 2) {
            secondPrompt = prompt;
          }
          return {
            exitCode: 0,
            lastMessage: `attempt ${attempt}`,
            events: [],
            durationMs: 5,
          };
        },
        qualityGateRunner: {
          run: async () => {
            if (attempt === 1) {
              return {
                passed: false,
                bypassed: false,
                gates: [],
                feedbackMessage: "Quality gate results:\n- FAIL unit-tests (test failure)",
              };
            }

            return {
              passed: true,
              bypassed: false,
              gates: [],
              feedbackMessage: "Quality gate results:\n- PASS all",
            };
          },
        } as any,
      },
    );

    const result = await loop.run();
    assert.equal(result.exitReason, "all_done");
    assert.equal(result.iterations, 2);
    assert.deepEqual(result.tasksCompleted, ["Integration task"]);
    assert.ok(secondPrompt.includes("Previous verification feedback"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("orchestration e2e: repeated failures escalate to terminal stuck state and emit notification event", async () => {
  const { root, boardPath } = await createRepo();

  try {
    const events: RalphEvent[] = [];

    const loop = new RalphLoop(
      {
        taskBoardPath: boardPath,
        logPath: path.join(root, ".cortex", "log.md"),
        activePath: path.join(root, ".cortex", "active.md"),
        basePath: root,
        maxIterations: 5,
        maxStuckCount: 2,
        pollIntervalMs: 1,
        sessionMaxPolls: 2,
      },
      (event) => {
        events.push(event);
      },
      {
        executeCodexImpl: async () => ({
          exitCode: 1,
          lastMessage: "agent failed",
          events: [],
          durationMs: 5,
        }),
      },
    );

    const result = await loop.run();
    assert.equal(result.exitReason, "stuck");
    assert.deepEqual(result.tasksFailed, ["Integration task"]);

    const terminalNotification = events.find((event) =>
      event.type === "task_stuck" &&
      event.message.includes("reached max stuck count"),
    );

    assert.ok(terminalNotification);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
