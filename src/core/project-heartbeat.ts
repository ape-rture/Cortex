import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SimpleGitMonitor } from "./git-monitor.js";
import { MarkdownProjectStore } from "./project-store.js";
import type { Project, ProjectHealthReport, ProjectStore } from "./types/project.js";

const execFileAsync = promisify(execFile);
const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_STALE_BRANCH_DAYS = 30;

async function gitCmd(projectPath: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd: projectPath });
  return stdout.trim();
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / DAY_MS));
}

async function getCurrentBranch(projectPath: string): Promise<string> {
  return await gitCmd(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

async function getLastCommitAt(projectPath: string): Promise<string> {
  return await gitCmd(projectPath, ["log", "-1", "--format=%cI"]);
}

async function countStaleBranches(
  projectPath: string,
  currentBranch: string,
  staleAfterDays: number,
): Promise<number> {
  const output = await gitCmd(
    projectPath,
    ["for-each-ref", "--format=%(refname:short)|%(committerdate:iso-strict)", "refs/heads"],
  );
  if (!output) return 0;

  const lines = output.split(/\r?\n/).filter(Boolean);
  let stale = 0;

  for (const line of lines) {
    const [branch, commitDate] = line.split("|");
    if (!branch || !commitDate) continue;
    if (branch === currentBranch) continue;
    if (daysSince(commitDate) > staleAfterDays) stale += 1;
  }
  return stale;
}

export interface ProjectHeartbeatMonitorConfig {
  readonly projectStore?: ProjectStore;
  readonly gitMonitor?: SimpleGitMonitor;
  readonly staleBranchDays?: number;
}

export class ProjectHeartbeatMonitor {
  private readonly projectStore: ProjectStore;
  private readonly gitMonitor: SimpleGitMonitor;
  private readonly staleBranchDays: number;

  constructor(config: ProjectHeartbeatMonitorConfig = {}) {
    this.projectStore = config.projectStore ?? new MarkdownProjectStore();
    this.gitMonitor = config.gitMonitor ?? new SimpleGitMonitor();
    this.staleBranchDays = config.staleBranchDays ?? DEFAULT_STALE_BRANCH_DAYS;
  }

  async checkProject(project: Project): Promise<ProjectHealthReport> {
    try {
      const currentBranch = await getCurrentBranch(project.path);

      const [lastCommitAt, staleBranchCount, unpushed] = await Promise.all([
        getLastCommitAt(project.path),
        countStaleBranches(project.path, currentBranch, this.staleBranchDays),
        this.gitMonitor.checkRepo(project.path),
      ]);

      return {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        currentBranch,
        lastCommitAt,
        daysSinceLastCommit: daysSince(lastCommitAt),
        unpushedCommitCount: unpushed?.count ?? 0,
        staleBranchCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        currentBranch: "unknown",
        daysSinceLastCommit: 9999,
        unpushedCommitCount: 0,
        staleBranchCount: 0,
        error: `Unable to read git state: ${message}`,
      };
    }
  }

  async checkAll(): Promise<readonly ProjectHealthReport[]> {
    const activeProjects = await this.projectStore.filterByStatus("active");
    return await Promise.all(activeProjects.map(async (project) => await this.checkProject(project)));
  }
}
