import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Project, ProjectStatus } from "../core/types/project.js";
import { MarkdownProjectStore } from "../core/project-store.js";
import { SimpleProjectGit } from "../core/project-git.js";
import { TemplateScaffolder } from "../core/project-scaffolder.js";

const VALID_STATUSES: readonly ProjectStatus[] = ["active", "paused", "archived"];

type FlagMap = Record<string, string | boolean>;
type ProjectUpdates = {
  name?: string;
  path?: string;
  gitRemote?: string;
  status?: ProjectStatus;
  techStack?: readonly string[];
  lastActivity?: string;
  notes?: string;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run project list [--status=active]",
    "  npm run project add \"Project Name\" <path> [--remote=<url>] [--status=active] [--tech=ts,node] [--notes=\"...\"]",
    "  npm run project update <id> [--name=...] [--path=...] [--remote=...] [--clear-remote] [--status=...] [--tech=...] [--last-activity=YYYY-MM-DD] [--notes=...]",
    "  npm run project remove <id>",
    "  npm run project status [id]",
    "  npm run project push <id> [--force] [--force-main]",
    "  npm run project pull <id>",
    "  npm run project scaffold \"Project Name\" <target-path> [--owner=...] [--tech=...] [--overwrite] [--init-git] [--no-registry]",
  ].join("\n");
}

function parseFlags(argv: readonly string[]): FlagMap {
  const flags: FlagMap = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const body = token.slice(2);
    const separator = body.indexOf("=");
    if (separator === -1) {
      flags[body] = true;
      continue;
    }
    const key = body.slice(0, separator).trim();
    const value = body.slice(separator + 1).trim();
    flags[key] = value;
  }
  return flags;
}

function getPositionalArgs(argv: readonly string[]): string[] {
  return argv.filter((token) => !token.startsWith("--"));
}

function getStringFlag(flags: FlagMap, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function hasBooleanFlag(flags: FlagMap, key: string): boolean {
  return flags[key] === true;
}

function parseStatus(value: string | undefined): ProjectStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (VALID_STATUSES.includes(normalized as ProjectStatus)) {
    return normalized as ProjectStatus;
  }
  return undefined;
}

function parseTechStack(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatProjectTable(projects: readonly Project[]): string {
  if (projects.length === 0) return "(no projects)";

  const lines: string[] = [];
  lines.push("| ID | Name | Status | Path | Remote | Last Activity |");
  lines.push("|---|---|---|---|---|---|");
  for (const project of projects) {
    lines.push(
      `| ${project.id} | ${project.name} | ${project.status} | ${project.path} | ${project.gitRemote ?? "-"} | ${project.lastActivity ?? "-"} |`,
    );
  }
  return lines.join("\n");
}

async function resolveProjectById(store: MarkdownProjectStore, id: string): Promise<Project> {
  const project = await store.findById(id);
  if (!project) throw new Error(`Project not found: ${id}`);
  return project;
}

export async function runProject(args: readonly string[]): Promise<string> {
  const [command, ...rest] = args;
  if (!command) return usage();

  const flags = parseFlags(rest);
  const positional = getPositionalArgs(rest);

  const store = new MarkdownProjectStore();
  const git = new SimpleProjectGit();

  switch (command) {
    case "list": {
      const status = parseStatus(getStringFlag(flags, "status"));
      if (getStringFlag(flags, "status") && !status) {
        return `Invalid status. Use one of: ${VALID_STATUSES.join(", ")}`;
      }
      const projects = status
        ? await store.filterByStatus(status)
        : await store.loadProjects();
      return formatProjectTable(projects);
    }

    case "add": {
      const name = positional[0];
      const projectPath = positional[1];
      if (!name || !projectPath) {
        return "Usage: project add \"Project Name\" <path> [--remote=...] [--status=...] [--tech=...] [--notes=...]";
      }

      const status = parseStatus(getStringFlag(flags, "status")) ?? "active";
      const techStack = parseTechStack(getStringFlag(flags, "tech") ?? getStringFlag(flags, "tech-stack"));
      const today = new Date().toISOString().slice(0, 10);
      const remote = getStringFlag(flags, "remote");

      const id = await store.addProject({
        name,
        path: path.resolve(projectPath),
        gitRemote: remote && remote !== "-" ? remote : undefined,
        status,
        techStack,
        lastActivity: getStringFlag(flags, "last-activity") ?? today,
        notes: getStringFlag(flags, "notes"),
      });
      return `Added project ${id}: ${name}`;
    }

    case "update": {
      const id = positional[0];
      if (!id) return "Usage: project update <id> [--name=...] [--path=...] [--remote=...] [--clear-remote] [--status=...] [--tech=...] [--last-activity=YYYY-MM-DD] [--notes=...]";

      const statusValue = getStringFlag(flags, "status");
      const status = parseStatus(statusValue);
      if (statusValue && !status) {
        return `Invalid status. Use one of: ${VALID_STATUSES.join(", ")}`;
      }

      const updates: ProjectUpdates = {};
      const name = getStringFlag(flags, "name");
      const nextPath = getStringFlag(flags, "path");
      const remote = getStringFlag(flags, "remote");
      const notes = getStringFlag(flags, "notes");
      const lastActivity = getStringFlag(flags, "last-activity");
      const tech = getStringFlag(flags, "tech") ?? getStringFlag(flags, "tech-stack");

      if (name) updates.name = name;
      if (nextPath) updates.path = path.resolve(nextPath);
      if (status) updates.status = status;
      if (lastActivity) updates.lastActivity = lastActivity;
      if (notes !== undefined) updates.notes = notes || undefined;
      if (tech) updates.techStack = parseTechStack(tech);
      if (remote !== undefined) updates.gitRemote = remote && remote !== "-" ? remote : undefined;
      if (hasBooleanFlag(flags, "clear-remote")) updates.gitRemote = undefined;

      if (Object.keys(updates).length === 0) {
        return "No updates provided.";
      }

      await store.updateProject(id, updates);
      return `Updated project ${id}`;
    }

    case "remove": {
      const id = positional[0];
      if (!id) return "Usage: project remove <id>";
      await store.removeProject(id);
      return `Removed project ${id}`;
    }

    case "status": {
      const id = positional[0];
      if (id) {
        const project = await resolveProjectById(store, id);
        const status = await git.getStatus(project);
        const lines = [
          `# ${project.name} (${project.id})`,
          `Path: ${project.path}`,
          `Branch: ${status.branch}`,
          `Directory Exists: ${status.directoryExists ? "yes" : "no"}`,
          `Dirty: ${status.hasUncommittedChanges ? "yes" : "no"}`,
          `Ahead: ${status.commitsAhead}`,
          `Behind: ${status.commitsBehind}`,
        ];
        if (status.unpushedSummaries.length > 0) {
          lines.push("Unpushed:");
          lines.push(...status.unpushedSummaries.map((summary) => `- ${summary}`));
        }
        if (status.error) lines.push(`Error: ${status.error}`);
        return lines.join("\n");
      }

      const projects = await store.loadProjects();
      if (projects.length === 0) return "(no projects)";

      const statuses = await git.getStatusAll(projects);
      const lines: string[] = [];
      lines.push("| ID | Branch | Dirty | Ahead | Behind | Directory | Error |");
      lines.push("|---|---|---|---|---|---|---|");
      for (const report of statuses) {
        lines.push(
          `| ${report.projectId} | ${report.branch} | ${report.hasUncommittedChanges ? "yes" : "no"} | ${report.commitsAhead} | ${report.commitsBehind} | ${report.directoryExists ? "yes" : "no"} | ${report.error ?? ""} |`,
        );
      }
      return lines.join("\n");
    }

    case "push": {
      const id = positional[0];
      if (!id) return "Usage: project push <id> [--force] [--force-main]";
      const project = await resolveProjectById(store, id);
      const result = await git.push(project, {
        force: hasBooleanFlag(flags, "force"),
        allowMain: hasBooleanFlag(flags, "force-main"),
      });
      return result.success ? result.message : `Push failed: ${result.message}`;
    }

    case "pull": {
      const id = positional[0];
      if (!id) return "Usage: project pull <id>";
      const project = await resolveProjectById(store, id);
      const result = await git.pull(project);
      return result.success ? result.message : `Pull failed: ${result.message}`;
    }

    case "scaffold": {
      const projectName = positional[0];
      const targetPath = positional[1];
      if (!projectName || !targetPath) {
        return "Usage: project scaffold \"Project Name\" <target-path> [--owner=...] [--tech=...] [--overwrite] [--init-git] [--no-registry]";
      }

      const scaffolder = new TemplateScaffolder({ projectStore: store });
      const result = await scaffolder.scaffold({
        projectName,
        ownerName: getStringFlag(flags, "owner"),
        targetPath,
        overwrite: hasBooleanFlag(flags, "overwrite"),
        initGit: hasBooleanFlag(flags, "init-git"),
        addToRegistry: !hasBooleanFlag(flags, "no-registry"),
        techStack: parseTechStack(getStringFlag(flags, "tech") ?? getStringFlag(flags, "tech-stack")),
      });

      if (!result.success) {
        return `Scaffold failed: ${result.error ?? "unknown error"}`;
      }

      return [
        `Scaffolded project at ${result.targetPath}`,
        `Files created: ${result.filesCreated.length}`,
        `Files skipped: ${result.filesSkipped.length}`,
        result.projectId ? `Registry ID: ${result.projectId}` : "Registry: skipped",
      ].join("\n");
    }

    default:
      return usage();
  }
}

async function run(): Promise<void> {
  const output = await runProject(process.argv.slice(2));
  console.log(output);
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  run().catch((error) => {
    console.error(`Project CLI failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
