import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Project } from "./types/project.js";
import { SimpleProjectGit } from "./project-git.js";

const execFileAsync = promisify(execFile);

async function git(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd });
  return stdout.trim();
}

async function createGitFixture(): Promise<{
  root: string;
  remotePath: string;
  repoPath: string;
  project: Project;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-project-git-"));
  const remotePath = path.join(root, "remote.git");
  const repoPath = path.join(root, "repo");
  await fs.mkdir(repoPath, { recursive: true });

  await git(["init", "--bare", remotePath], root);
  await git(["init"], repoPath);
  await git(["config", "user.name", "Cortex Test"], repoPath);
  await git(["config", "user.email", "cortex@example.com"], repoPath);

  await fs.writeFile(path.join(repoPath, "README.md"), "# test\n", "utf8");
  await git(["add", "README.md"], repoPath);
  await git(["commit", "-m", "initial"], repoPath);
  await git(["branch", "-M", "main"], repoPath);
  await git(["remote", "add", "origin", remotePath], repoPath);
  await git(["push", "-u", "origin", "main"], repoPath);

  const project: Project = {
    id: "proj-1",
    name: "Fixture Project",
    path: repoPath,
    gitRemote: remotePath,
    status: "active",
    techStack: ["typescript"],
    lastActivity: "2026-02-09",
    notes: undefined,
    addedAt: "2026-02-09T00:00:00Z",
  };

  return { root, remotePath, repoPath, project };
}

test("SimpleProjectGit reports ahead commits and enforces protected-branch push guard", async () => {
  const fixture = await createGitFixture();
  const projectGit = new SimpleProjectGit();

  try {
    await fs.appendFile(path.join(fixture.repoPath, "README.md"), "local change\n", "utf8");
    await git(["add", "README.md"], fixture.repoPath);
    await git(["commit", "-m", "local"], fixture.repoPath);

    const status = await projectGit.getStatus(fixture.project);
    assert.equal(status.directoryExists, true);
    assert.equal(status.branch, "main");
    assert.equal(status.hasUncommittedChanges, false);
    assert.equal(status.commitsAhead, 1);
    assert.equal(status.commitsBehind, 0);
    assert.ok(status.unpushedSummaries.length >= 1);

    const blockedPush = await projectGit.push(fixture.project);
    assert.equal(blockedPush.success, false);
    assert.match(blockedPush.message, /Refusing to push protected branch 'main'/);

    const allowedPush = await projectGit.push(fixture.project, { allowMain: true });
    assert.equal(allowedPush.success, true);

    const afterPush = await projectGit.getStatus(fixture.project);
    assert.equal(afterPush.commitsAhead, 0);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("SimpleProjectGit handles missing directories and supports fetch/pull", async () => {
  const fixture = await createGitFixture();
  const projectGit = new SimpleProjectGit();

  try {
    const fetchResult = await projectGit.fetch(fixture.project);
    assert.equal(fetchResult.success, true);

    const pullResult = await projectGit.pull(fixture.project);
    assert.equal(pullResult.success, true);

    const missingStatus = await projectGit.getStatus({
      ...fixture.project,
      id: "missing",
      path: path.join(fixture.root, "does-not-exist"),
    });
    assert.equal(missingStatus.directoryExists, false);
    assert.match(missingStatus.error ?? "", /Project directory not found/);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
