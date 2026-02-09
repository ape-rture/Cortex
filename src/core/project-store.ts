import { promises as fs } from "node:fs";
import path from "node:path";
import type { Project, ProjectStatus, ProjectStore } from "./types/project.js";
import { parseProjects, serializeProjects } from "../utils/markdown.js";

const DEFAULT_REGISTRY_PATH = path.resolve("projects", "project-registry.md");

type ProjectStorePaths = {
  registryPath: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function slugifyProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function nextProjectId(name: string, existing: readonly Project[]): string {
  const base = slugifyProjectName(name);
  let candidate = base;
  let suffix = 2;

  const existingIds = new Set(existing.map((project) => project.id));
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizePathForCompare(projectPath: string): string {
  const resolved = path.resolve(projectPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export class MarkdownProjectStore implements ProjectStore {
  private readonly paths: ProjectStorePaths;

  constructor(paths?: Partial<ProjectStorePaths>) {
    this.paths = {
      registryPath: paths?.registryPath ?? DEFAULT_REGISTRY_PATH,
    };
  }

  async loadProjects(): Promise<readonly Project[]> {
    try {
      const raw = await fs.readFile(this.paths.registryPath, "utf8");
      return parseProjects(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async saveProjects(projects: readonly Project[]): Promise<void> {
    await fs.mkdir(path.dirname(this.paths.registryPath), { recursive: true });
    await fs.writeFile(this.paths.registryPath, serializeProjects(projects), "utf8");
  }

  async addProject(project: Omit<Project, "id" | "addedAt">): Promise<string> {
    const projects = await this.loadProjects();
    const id = nextProjectId(project.name, projects);
    const next: Project = {
      ...project,
      id,
      path: path.resolve(project.path),
      techStack: [...project.techStack],
      addedAt: nowIso(),
    };
    await this.saveProjects([...projects, next]);
    return id;
  }

  async updateProject(
    id: string,
    updates: Partial<Omit<Project, "id" | "addedAt">>,
  ): Promise<void> {
    const projects = await this.loadProjects();
    const index = projects.findIndex((project) => project.id === id);
    if (index === -1) throw new Error(`Project not found: ${id}`);

    const current = projects[index];
    const updated: Project = {
      ...current,
      ...updates,
      path: updates.path ? path.resolve(updates.path) : current.path,
      techStack: updates.techStack ? [...updates.techStack] : current.techStack,
      id: current.id,
      addedAt: current.addedAt,
    };

    const next = [...projects];
    next[index] = updated;
    await this.saveProjects(next);
  }

  async removeProject(id: string): Promise<void> {
    const projects = await this.loadProjects();
    const filtered = projects.filter((project) => project.id !== id);
    if (filtered.length === projects.length) {
      throw new Error(`Project not found: ${id}`);
    }
    await this.saveProjects(filtered);
  }

  async findById(id: string): Promise<Project | undefined> {
    const projects = await this.loadProjects();
    return projects.find((project) => project.id === id);
  }

  async findByPath(projectPath: string): Promise<Project | undefined> {
    const projects = await this.loadProjects();
    const target = normalizePathForCompare(projectPath);
    return projects.find((project) => normalizePathForCompare(project.path) === target);
  }

  async filterByStatus(status: ProjectStatus): Promise<readonly Project[]> {
    const projects = await this.loadProjects();
    return projects.filter((project) => project.status === status);
  }
}
