import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export interface WorkspaceInfo {
  readonly path: string;
  readonly branch?: string;
  readonly detached: boolean;
}

export interface CreateWorkspaceInput {
  readonly taskTitle: string;
  readonly branch?: string;
  readonly baseRef?: string;
}

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

type RunCommand = (
  executable: string,
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

interface WorkspaceManagerDeps {
  readonly runCommandImpl?: RunCommand;
  readonly mkdirImpl?: (dirPath: string, options?: { recursive?: boolean }) => Promise<unknown>;
}

function slugifyTask(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "task";
}

function parseWorktreeList(stdout: string): WorkspaceInfo[] {
  const lines = stdout.split(/\r?\n/);
  const items: WorkspaceInfo[] = [];

  let currentPath = "";
  let currentBranch: string | undefined;
  let detached = false;

  const flush = (): void => {
    if (!currentPath) return;
    items.push({
      path: currentPath,
      detached,
      ...(currentBranch ? { branch: currentBranch } : {}),
    });
    currentPath = "";
    currentBranch = undefined;
    detached = false;
  };

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      flush();
      currentPath = line.slice("worktree ".length).trim();
      continue;
    }

    if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      if (ref.startsWith("refs/heads/")) {
        currentBranch = ref.slice("refs/heads/".length);
      }
      continue;
    }

    if (line.trim() === "detached") {
      detached = true;
      continue;
    }

    if (line.trim() === "") {
      flush();
    }
  }

  flush();
  return items;
}

async function runCommandDefault(
  executable: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, [...args], {
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
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export class WorkspaceManager {
  private readonly runCommandImpl: RunCommand;
  private readonly mkdirImpl: (dirPath: string, options?: { recursive?: boolean }) => Promise<unknown>;

  constructor(
    private readonly repoPath: string,
    private readonly workspaceRoot: string = path.join(repoPath, ".cortex", "worktrees"),
    deps: WorkspaceManagerDeps = {},
  ) {
    this.runCommandImpl = deps.runCommandImpl ?? runCommandDefault;
    this.mkdirImpl = deps.mkdirImpl ?? fs.mkdir;
  }

  async create(input: CreateWorkspaceInput): Promise<WorkspaceInfo> {
    await this.mkdirImpl(this.workspaceRoot, { recursive: true });

    const timestamp = Date.now().toString(36);
    const workspacePath = path.join(this.workspaceRoot, `${slugifyTask(input.taskTitle)}-${timestamp}`);

    const baseRef = input.baseRef?.trim() || "HEAD";
    const branch = input.branch?.trim();

    if (branch) {
      const branchExists = await this.localBranchExists(branch);
      const addArgs = branchExists
        ? ["worktree", "add", workspacePath, branch]
        : ["worktree", "add", "-b", branch, workspacePath, baseRef];

      await this.runGit(addArgs);
      return {
        path: workspacePath,
        branch,
        detached: false,
      };
    }

    await this.runGit(["worktree", "add", "--detach", workspacePath, baseRef]);
    return {
      path: workspacePath,
      detached: true,
    };
  }

  async destroy(workspacePath: string): Promise<void> {
    await this.runGit(["worktree", "remove", "--force", workspacePath]);
    await this.runGit(["worktree", "prune"]);
  }

  async list(): Promise<WorkspaceInfo[]> {
    const result = await this.runGit(["worktree", "list", "--porcelain"]);
    const all = parseWorktreeList(result.stdout);
    const normalizedRoot = path.resolve(this.workspaceRoot).toLowerCase();

    return all.filter((item) => {
      const resolved = path.resolve(item.path).toLowerCase();
      return resolved.startsWith(normalizedRoot);
    });
  }

  private async localBranchExists(branch: string): Promise<boolean> {
    const result = await this.runGit(["show-ref", "--verify", `refs/heads/${branch}`], false);
    return result.code === 0;
  }

  private async runGit(args: readonly string[], throwOnError = true): Promise<CommandResult> {
    const result = await this.runCommandImpl("git", args, this.repoPath);
    if (throwOnError && result.code !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`.trim());
    }
    return result;
  }
}

export { parseWorktreeList };
