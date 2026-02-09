import { promises as fs } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  ProjectScaffolder,
  ProjectStore,
  ScaffoldConfig,
  ScaffoldResult,
} from "./types/project.js";
import { MarkdownProjectStore } from "./project-store.js";

const execAsync = promisify(exec);
const DEFAULT_TEMPLATE_ROOT = path.resolve("exports", "llm-collab-playbook", "template-root");

type ScaffolderOptions = {
  templateRoot?: string;
  projectStore?: ProjectStore;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function applyTemplateValues(
  content: string,
  values: { projectName: string; ownerName: string; date: string },
): string {
  return content
    .replaceAll("[PROJECT_NAME]", values.projectName)
    .replaceAll("[OWNER_NAME]", values.ownerName)
    .replaceAll("[DATE]", values.date);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(root: string, current = root): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(root, fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    files.push(path.relative(root, fullPath));
  }

  return files;
}

export class TemplateScaffolder implements ProjectScaffolder {
  private readonly templateRoot: string;
  private readonly projectStore: ProjectStore;

  constructor(options: ScaffolderOptions = {}) {
    this.templateRoot = options.templateRoot ?? DEFAULT_TEMPLATE_ROOT;
    this.projectStore = options.projectStore ?? new MarkdownProjectStore();
  }

  async listTemplateFiles(): Promise<readonly string[]> {
    if (!await pathExists(this.templateRoot)) return [];
    const files = await listFilesRecursively(this.templateRoot);
    return files.sort();
  }

  async scaffold(config: ScaffoldConfig): Promise<ScaffoldResult> {
    const filesCreated: string[] = [];
    const filesSkipped: string[] = [];

    try {
      const templateFiles = await this.listTemplateFiles();
      if (templateFiles.length === 0) {
        return {
          success: false,
          targetPath: config.targetPath,
          filesCreated,
          filesSkipped,
          error: `Template root not found or empty: ${this.templateRoot}`,
        };
      }

      const targetPath = path.resolve(config.targetPath);
      await fs.mkdir(targetPath, { recursive: true });

      const replacements = {
        projectName: config.projectName,
        ownerName: config.ownerName?.trim() || "User",
        date: todayIsoDate(),
      };

      for (const relativePath of templateFiles) {
        const sourcePath = path.join(this.templateRoot, relativePath);
        const destinationPath = path.join(targetPath, relativePath);
        const destinationExists = await pathExists(destinationPath);

        if (destinationExists && !config.overwrite) {
          filesSkipped.push(relativePath);
          continue;
        }

        const raw = await fs.readFile(sourcePath, "utf8");
        const rendered = applyTemplateValues(raw, replacements);
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.writeFile(destinationPath, rendered, "utf8");
        filesCreated.push(relativePath);
      }

      if (config.initGit) {
        const gitDir = path.join(targetPath, ".git");
        if (!await pathExists(gitDir)) {
          await execAsync("git init", { cwd: targetPath });
        }
      }

      let projectId: string | undefined;
      if (config.addToRegistry !== false) {
        projectId = await this.projectStore.addProject({
          name: config.projectName,
          path: targetPath,
          status: "active",
          gitRemote: undefined,
          techStack: [...(config.techStack ?? [])],
          lastActivity: replacements.date,
          notes: "Scaffolded from collaboration template",
        });
      }

      return {
        success: true,
        targetPath,
        filesCreated,
        filesSkipped,
        projectId,
      };
    } catch (error) {
      return {
        success: false,
        targetPath: config.targetPath,
        filesCreated,
        filesSkipped,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
