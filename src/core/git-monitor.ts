import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { GitMonitor, GitMonitorConfig, UnpushedReport } from "./types/git-monitor.js";

const execAsync = promisify(exec);

const DEFAULT_CONFIG: GitMonitorConfig = {
  repos: [process.cwd()],
};

function hoursSince(dateIso: string): number {
  const then = new Date(dateIso).getTime();
  const now = Date.now();
  return Math.max(0, (now - then) / (1000 * 60 * 60));
}

async function gitCmd(repoPath: string, cmd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd: repoPath });
  return stdout.trim();
}

async function getBranch(repoPath: string): Promise<string> {
  return await gitCmd(repoPath, "git rev-parse --abbrev-ref HEAD");
}

async function getUnpushedCommits(repoPath: string): Promise<string[]> {
  try {
    const output = await gitCmd(repoPath, "git log @{push}.. --oneline");
    if (!output) return [];
    return output.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

async function getOldestCommitDate(repoPath: string): Promise<string | undefined> {
  try {
    const output = await gitCmd(repoPath, "git log @{push}.. --format=%cI");
    if (!output) return undefined;
    const lines = output.split(/\r?\n/).filter(Boolean);
    return lines[lines.length - 1];
  } catch {
    return undefined;
  }
}

export class SimpleGitMonitor implements GitMonitor {
  private readonly config: GitMonitorConfig;

  constructor(config: GitMonitorConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  async checkRepo(repoPath: string): Promise<UnpushedReport | undefined> {
    const commits = await getUnpushedCommits(repoPath);
    if (commits.length === 0) return undefined;

    const branch = await getBranch(repoPath);
    const repoName = path.basename(repoPath);
    const oldest = await getOldestCommitDate(repoPath);
    const oldestHours = oldest ? hoursSince(oldest) : 0;

    return {
      repo_path: repoPath,
      repo_name: repoName,
      branch,
      count: commits.length,
      oldest_hours: Number(oldestHours.toFixed(2)),
      commit_summaries: commits.slice(0, 5),
    };
  }

  async checkAll(): Promise<readonly UnpushedReport[]> {
    const results: UnpushedReport[] = [];
    for (const repo of this.config.repos) {
      const report = await this.checkRepo(repo);
      if (report) results.push(report);
    }
    return results;
  }
}
