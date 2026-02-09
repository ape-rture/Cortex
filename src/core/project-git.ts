import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  Project,
  ProjectGitOperations,
  ProjectGitResult,
  ProjectGitStatus,
  ProjectPushOptions,
} from "./types/project.js";

const execAsync = promisify(exec);

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function directoryExists(projectPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(projectPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function gitCmd(projectPath: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd: projectPath });
  return stdout.trim();
}

function parseAheadBehind(raw: string): { ahead: number; behind: number } {
  const [aheadRaw, behindRaw] = raw.split(/\s+/);
  const ahead = Number.parseInt(aheadRaw ?? "0", 10);
  const behind = Number.parseInt(behindRaw ?? "0", 10);
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

function isProtectedBranch(branch: string): boolean {
  return branch === "main" || branch === "master";
}

async function runOperation(
  project: Project,
  operation: ProjectGitResult["operation"],
  cmd: string,
): Promise<ProjectGitResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: project.path });
    const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    return {
      projectId: project.id,
      operation,
      success: true,
      message: `${operation} completed for ${project.id}`,
      details: details || undefined,
    };
  } catch (error) {
    return {
      projectId: project.id,
      operation,
      success: false,
      message: `${operation} failed for ${project.id}: ${toErrorMessage(error)}`,
    };
  }
}

export class SimpleProjectGit implements ProjectGitOperations {
  async getStatus(project: Project): Promise<ProjectGitStatus> {
    const exists = await directoryExists(project.path);
    if (!exists) {
      return {
        projectId: project.id,
        branch: "unknown",
        hasUncommittedChanges: false,
        commitsAhead: 0,
        commitsBehind: 0,
        unpushedSummaries: [],
        directoryExists: false,
        error: `Project directory not found: ${project.path}`,
      };
    }

    try {
      const branch = await gitCmd(project.path, "git rev-parse --abbrev-ref HEAD");
      const porcelain = await gitCmd(project.path, "git status --porcelain");
      const hasUncommittedChanges = porcelain.length > 0;

      let commitsAhead = 0;
      let commitsBehind = 0;
      try {
        const aheadBehindRaw = await gitCmd(project.path, "git rev-list --left-right --count HEAD...@{upstream}");
        const parsed = parseAheadBehind(aheadBehindRaw);
        commitsAhead = parsed.ahead;
        commitsBehind = parsed.behind;
      } catch {
        commitsAhead = 0;
        commitsBehind = 0;
      }

      let unpushedSummaries: string[] = [];
      try {
        const log = await gitCmd(project.path, "git log @{upstream}..HEAD --oneline -n 5");
        unpushedSummaries = log ? log.split(/\r?\n/).filter(Boolean) : [];
      } catch {
        unpushedSummaries = [];
      }

      return {
        projectId: project.id,
        branch,
        hasUncommittedChanges,
        commitsAhead,
        commitsBehind,
        unpushedSummaries,
        directoryExists: true,
      };
    } catch (error) {
      return {
        projectId: project.id,
        branch: "unknown",
        hasUncommittedChanges: false,
        commitsAhead: 0,
        commitsBehind: 0,
        unpushedSummaries: [],
        directoryExists: true,
        error: `Git status failed: ${toErrorMessage(error)}`,
      };
    }
  }

  async getStatusAll(projects: readonly Project[]): Promise<readonly ProjectGitStatus[]> {
    return await Promise.all(projects.map(async (project) => await this.getStatus(project)));
  }

  async push(project: Project, options?: ProjectPushOptions): Promise<ProjectGitResult> {
    const exists = await directoryExists(project.path);
    if (!exists) {
      return {
        projectId: project.id,
        operation: "push",
        success: false,
        message: `Project directory not found: ${project.path}`,
      };
    }

    let branch = "";
    try {
      branch = await gitCmd(project.path, "git rev-parse --abbrev-ref HEAD");
    } catch (error) {
      return {
        projectId: project.id,
        operation: "push",
        success: false,
        message: `Unable to determine branch for ${project.id}: ${toErrorMessage(error)}`,
      };
    }

    if (isProtectedBranch(branch) && !options?.allowMain) {
      return {
        projectId: project.id,
        operation: "push",
        success: false,
        message: `Refusing to push protected branch '${branch}'. Re-run with --force-main to allow this.`,
      };
    }

    const cmd = options?.force ? "git push --force-with-lease" : "git push";
    return await runOperation(project, "push", cmd);
  }

  async pull(project: Project): Promise<ProjectGitResult> {
    return await runOperation(project, "pull", "git pull --ff-only");
  }

  async fetch(project: Project): Promise<ProjectGitResult> {
    return await runOperation(project, "fetch", "git fetch --all --prune");
  }
}
