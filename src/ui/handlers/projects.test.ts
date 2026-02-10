import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Hono } from "hono";
import { MarkdownProjectStore } from "../../core/project-store.js";
import { registerProjectHandlers } from "./projects.js";

const execFileAsync = promisify(execFile);

async function git(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd });
  return stdout.trim();
}

async function cleanupDir(dir: string): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "ENOTEMPTY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  await fs.rm(dir, { recursive: true, force: true });
}

test("GET /api/projects/health returns active project health reports", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-projects-handler-"));
  const remotePath = path.join(root, "remote.git");
  const repoPath = path.join(root, "repo");
  const registryPath = path.join(root, "projects", "project-registry.md");
  const store = new MarkdownProjectStore({ registryPath });

  try {
    await fs.mkdir(repoPath, { recursive: true });

    await git(["init", "--bare", remotePath], root);
    await git(["init"], repoPath);
    await git(["config", "user.name", "Cortex Test"], repoPath);
    await git(["config", "user.email", "cortex@example.com"], repoPath);

    await fs.writeFile(path.join(repoPath, "README.md"), "# projects api\n", "utf8");
    await git(["add", "README.md"], repoPath);
    await git(["commit", "-m", "initial"], repoPath);
    await git(["branch", "-M", "main"], repoPath);
    await git(["remote", "add", "origin", remotePath], repoPath);
    await git(["push", "-u", "origin", "main"], repoPath);

    await fs.appendFile(path.join(repoPath, "README.md"), "local only\n", "utf8");
    await git(["add", "README.md"], repoPath);
    await git(["commit", "-m", "local"], repoPath);

    await store.addProject({
      name: "API Active",
      path: repoPath,
      gitRemote: remotePath,
      status: "active",
      techStack: ["typescript"],
      lastActivity: "2026-02-10",
      notes: undefined,
    });
    await store.addProject({
      name: "API Paused",
      path: path.join(root, "paused"),
      gitRemote: undefined,
      status: "paused",
      techStack: ["typescript"],
      lastActivity: "2026-02-10",
      notes: undefined,
    });

    const app = new Hono();
    registerProjectHandlers(app, registryPath);

    const response = await app.fetch(new Request("http://localhost/api/projects/health"));
    assert.equal(response.status, 200);

    const data = await response.json() as Array<{
      projectName: string;
      currentBranch: string;
      unpushedCommitCount: number;
    }>;

    assert.equal(data.length, 1);
    assert.equal(data[0]?.projectName, "API Active");
    assert.equal(data[0]?.currentBranch, "main");
    assert.equal(data[0]?.unpushedCommitCount, 1);
  } finally {
    await cleanupDir(root);
  }
});
