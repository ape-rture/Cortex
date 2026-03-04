import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { WorkspaceManager, parseWorktreeList } from "./workspace-manager.js";

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

async function createRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-workspace-manager-"));
  await runGit(root, "init");
  await runGit(root, "config", "user.email", "codex@example.com");
  await runGit(root, "config", "user.name", "Codex");
  await fs.writeFile(path.join(root, "README.md"), "# test\n", "utf8");
  await runGit(root, "add", ".");
  await runGit(root, "commit", "-m", "init");
  return root;
}

test("parseWorktreeList parses branch and detached records", () => {
  const parsed = parseWorktreeList([
    "worktree /repo",
    "HEAD abcdef",
    "branch refs/heads/main",
    "",
    "worktree /repo/.cortex/worktrees/a",
    "HEAD 123456",
    "detached",
    "",
  ].join("\n"));

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.path, "/repo");
  assert.equal(parsed[0]?.branch, "main");
  assert.equal(parsed[0]?.detached, false);
  assert.equal(parsed[1]?.detached, true);
});

test("WorkspaceManager creates, lists, and destroys branch worktrees", async () => {
  const repo = await createRepo();
  const root = path.join(repo, ".tmp-worktrees");

  try {
    const manager = new WorkspaceManager(repo, root);
    const workspace = await manager.create({
      taskTitle: "Phase 11 workspace",
      branch: "codex/workspace-manager-test",
    });

    const stat = await fs.stat(workspace.path);
    assert.equal(stat.isDirectory(), true);
    assert.equal(workspace.branch, "codex/workspace-manager-test");

    const list = await manager.list();
    const workspacePathNormalized = path.resolve(workspace.path).toLowerCase();
    assert.equal(
      list.some((item) => path.resolve(item.path).toLowerCase() === workspacePathNormalized),
      true,
    );

    const branchName = (await runGit(workspace.path, "rev-parse", "--abbrev-ref", "HEAD")).trim();
    assert.equal(branchName, "codex/workspace-manager-test");

    await manager.destroy(workspace.path);
    const after = await manager.list();
    assert.equal(
      after.some((item) => path.resolve(item.path).toLowerCase() === workspacePathNormalized),
      false,
    );
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test("WorkspaceManager creates detached worktree when no branch provided", async () => {
  const repo = await createRepo();
  const root = path.join(repo, ".tmp-worktrees");

  try {
    const manager = new WorkspaceManager(repo, root);
    const workspace = await manager.create({
      taskTitle: "Detached",
    });

    assert.equal(workspace.detached, true);
    assert.equal(typeof workspace.branch, "undefined");

    const branchName = (await runGit(workspace.path, "rev-parse", "--abbrev-ref", "HEAD")).trim();
    assert.equal(branchName, "HEAD");

    await manager.destroy(workspace.path);
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});
