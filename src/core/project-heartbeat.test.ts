import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Project, ProjectStore } from "./types/project.js";
import { ProjectHeartbeatMonitor } from "./project-heartbeat.js";

const execFileAsync = promisify(execFile);

async function git(
  args: readonly string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
  });
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

class StubProjectStore implements ProjectStore {
  constructor(private readonly projects: readonly Project[]) {}

  async loadProjects(): Promise<readonly Project[]> {
    return this.projects;
  }

  async saveProjects(_projects: readonly Project[]): Promise<void> {
    // No-op for tests.
  }

  async addProject(_project: Omit<Project, "id" | "addedAt">): Promise<string> {
    throw new Error("Not used in tests");
  }

  async updateProject(
    _id: string,
    _updates: Partial<Omit<Project, "id" | "addedAt">>,
  ): Promise<void> {
    throw new Error("Not used in tests");
  }

  async removeProject(_id: string): Promise<void> {
    throw new Error("Not used in tests");
  }

  async findById(id: string): Promise<Project | undefined> {
    return this.projects.find((project) => project.id === id);
  }

  async findByPath(projectPath: string): Promise<Project | undefined> {
    const resolved = path.resolve(projectPath);
    return this.projects.find((project) => path.resolve(project.path) === resolved);
  }

  async filterByStatus(status: Project["status"]): Promise<readonly Project[]> {
    return this.projects.filter((project) => project.status === status);
  }
}

async function createGitFixture(): Promise<{
  root: string;
  repoPath: string;
  activeProject: Project;
  pausedProject: Project;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-project-heartbeat-"));
  const remotePath = path.join(root, "remote.git");
  const repoPath = path.join(root, "repo");
  const pausedPath = path.join(root, "paused");

  await fs.mkdir(repoPath, { recursive: true });
  await fs.mkdir(pausedPath, { recursive: true });

  await git(["init", "--bare", remotePath], root);
  await git(["init"], repoPath);
  await git(["config", "user.name", "Cortex Test"], repoPath);
  await git(["config", "user.email", "cortex@example.com"], repoPath);

  await fs.writeFile(path.join(repoPath, "README.md"), "# heartbeat\n", "utf8");
  await git(["add", "README.md"], repoPath);
  await git(["commit", "-m", "initial"], repoPath);
  await git(["branch", "-M", "main"], repoPath);
  await git(["remote", "add", "origin", remotePath], repoPath);
  await git(["push", "-u", "origin", "main"], repoPath);

  const staleIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  await git(["checkout", "-b", "stale-branch"], repoPath);
  await fs.writeFile(path.join(repoPath, "stale.txt"), "stale\n", "utf8");
  await git(["add", "stale.txt"], repoPath);
  await git(["commit", "-m", "stale"], repoPath, {
    GIT_AUTHOR_DATE: staleIso,
    GIT_COMMITTER_DATE: staleIso,
  });
  await git(["checkout", "main"], repoPath);

  await fs.appendFile(path.join(repoPath, "README.md"), "unpushed\n", "utf8");
  await git(["add", "README.md"], repoPath);
  await git(["commit", "-m", "unpushed"], repoPath);

  const activeProject: Project = {
    id: "active-proj",
    name: "Active Project",
    path: repoPath,
    gitRemote: remotePath,
    status: "active",
    techStack: ["typescript"],
    lastActivity: "2026-02-10",
    notes: undefined,
    addedAt: "2026-02-10T00:00:00Z",
  };

  const pausedProject: Project = {
    id: "paused-proj",
    name: "Paused Project",
    path: pausedPath,
    gitRemote: undefined,
    status: "paused",
    techStack: ["typescript"],
    lastActivity: "2026-02-10",
    notes: undefined,
    addedAt: "2026-02-10T00:00:00Z",
  };

  return { root, repoPath, activeProject, pausedProject };
}

test("ProjectHeartbeatMonitor reports active project git health metrics", async () => {
  const fixture = await createGitFixture();
  const store = new StubProjectStore([fixture.activeProject, fixture.pausedProject]);
  const monitor = new ProjectHeartbeatMonitor({ projectStore: store, staleBranchDays: 30 });

  try {
    const reports = await monitor.checkAll();
    assert.equal(reports.length, 1);

    const report = reports[0];
    assert.equal(report.projectId, "active-proj");
    assert.equal(report.projectName, "Active Project");
    assert.equal(report.currentBranch, "main");
    assert.equal(report.unpushedCommitCount, 1);
    assert.equal(report.staleBranchCount, 1);
    assert.ok(report.daysSinceLastCommit >= 0);
    assert.equal(report.error, undefined);
  } finally {
    await cleanupDir(fixture.root);
  }
});

test("ProjectHeartbeatMonitor returns error report for unreadable repository path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-project-heartbeat-missing-"));
  const missingPath = path.join(root, "missing-repo");

  const store = new StubProjectStore([
    {
      id: "missing",
      name: "Missing Repo",
      path: missingPath,
      gitRemote: undefined,
      status: "active",
      techStack: ["typescript"],
      lastActivity: "2026-02-10",
      notes: undefined,
      addedAt: "2026-02-10T00:00:00Z",
    },
  ]);
  const monitor = new ProjectHeartbeatMonitor({ projectStore: store });

  try {
    const reports = await monitor.checkAll();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].projectId, "missing");
    assert.equal(reports[0].currentBranch, "unknown");
    assert.equal(reports[0].daysSinceLastCommit, 9999);
    assert.match(reports[0].error ?? "", /Unable to read git state/);
  } finally {
    await cleanupDir(root);
  }
});
