/**
 * Project Management Types
 *
 * Types for tracking external projects, cross-folder git operations,
 * and collaboration template scaffolding.
 */

// ---------------------------------------------------------------------------
// Project Registry
// ---------------------------------------------------------------------------

/** Project lifecycle status. */
export type ProjectStatus = "active" | "paused" | "archived";

/**
 * A tracked external project.
 */
export interface Project {
  /** Unique identifier (slug format: lowercase, hyphens). */
  readonly id: string;
  /** Human-readable project name. */
  readonly name: string;
  /** Absolute path to project root directory. */
  readonly path: string;
  /** Git remote URL (SSH or HTTPS). Optional for non-git projects. */
  readonly gitRemote?: string;
  /** Current project status. */
  readonly status: ProjectStatus;
  /** Tech stack tags (e.g., "typescript", "react", "node"). */
  readonly techStack: readonly string[];
  /** ISO timestamp of last known activity. */
  readonly lastActivity?: string;
  /** Free-form notes about the project. */
  readonly notes?: string;
  /** ISO date when project was added to registry. */
  readonly addedAt: string;
}

/**
 * Store interface for project registry.
 */
export interface ProjectStore {
  /** Load all projects from registry. */
  loadProjects(): Promise<readonly Project[]>;
  /** Save all projects (overwrites registry). */
  saveProjects(projects: readonly Project[]): Promise<void>;
  /** Add a new project. Returns the assigned ID. */
  addProject(project: Omit<Project, "id" | "addedAt">): Promise<string>;
  /** Update an existing project's metadata. */
  updateProject(
    id: string,
    updates: Partial<Omit<Project, "id" | "addedAt">>
  ): Promise<void>;
  /** Remove a project from registry (does not delete files). */
  removeProject(id: string): Promise<void>;
  /** Find project by ID. */
  findById(id: string): Promise<Project | undefined>;
  /** Find project by path. */
  findByPath(path: string): Promise<Project | undefined>;
  /** Filter projects by status. */
  filterByStatus(status: ProjectStatus): Promise<readonly Project[]>;
}

// ---------------------------------------------------------------------------
// Git Operations
// ---------------------------------------------------------------------------

/**
 * Git status summary for a project.
 */
export interface ProjectGitStatus {
  /** Project ID. */
  readonly projectId: string;
  /** Current branch name. */
  readonly branch: string;
  /** Whether there are uncommitted changes. */
  readonly hasUncommittedChanges: boolean;
  /** Number of commits ahead of remote. */
  readonly commitsAhead: number;
  /** Number of commits behind remote. */
  readonly commitsBehind: number;
  /** One-line summaries of unpushed commits (max 5). */
  readonly unpushedSummaries: readonly string[];
  /** Whether the project directory exists. */
  readonly directoryExists: boolean;
  /** Error message if git operations failed. */
  readonly error?: string;
}

/**
 * Result of a git operation on a project.
 */
export interface ProjectGitResult {
  readonly projectId: string;
  readonly operation: "push" | "pull" | "fetch" | "status";
  readonly success: boolean;
  readonly message: string;
  readonly details?: string;
}

/** Options for git push operation. */
export interface ProjectPushOptions {
  /** Force push (use with caution). */
  readonly force?: boolean;
  /** Allow push to main/master branch. */
  readonly allowMain?: boolean;
}

/**
 * Git operations for projects in external directories.
 */
export interface ProjectGitOperations {
  /** Get git status for a project. */
  getStatus(project: Project): Promise<ProjectGitStatus>;
  /** Get status for all projects. */
  getStatusAll(projects: readonly Project[]): Promise<readonly ProjectGitStatus[]>;
  /** Push commits for a project. */
  push(project: Project, options?: ProjectPushOptions): Promise<ProjectGitResult>;
  /** Pull changes for a project. */
  pull(project: Project): Promise<ProjectGitResult>;
  /** Fetch remote for a project (no merge). */
  fetch(project: Project): Promise<ProjectGitResult>;
}

// ---------------------------------------------------------------------------
// Template Scaffolding
// ---------------------------------------------------------------------------

/**
 * Configuration for scaffolding a new project with collaboration template.
 */
export interface ScaffoldConfig {
  /** Project name (required). Replaces [PROJECT_NAME] placeholder. */
  readonly projectName: string;
  /** Owner name. Replaces [OWNER_NAME] placeholder. Defaults to "User". */
  readonly ownerName?: string;
  /** Target directory (required). Where to copy template files. */
  readonly targetPath: string;
  /** Whether to overwrite existing files. Default: false. */
  readonly overwrite?: boolean;
  /** Whether to initialize git repo if not present. Default: false. */
  readonly initGit?: boolean;
  /** Whether to add to project registry after scaffold. Default: true. */
  readonly addToRegistry?: boolean;
  /** Tech stack tags for the project. */
  readonly techStack?: readonly string[];
}

/**
 * Result of a scaffold operation.
 */
export interface ScaffoldResult {
  readonly success: boolean;
  readonly targetPath: string;
  /** Files that were created. */
  readonly filesCreated: readonly string[];
  /** Files that were skipped (already existed). */
  readonly filesSkipped: readonly string[];
  /** Project ID if added to registry. */
  readonly projectId?: string;
  /** Error message if operation failed. */
  readonly error?: string;
}

/**
 * Template scaffolding service.
 */
export interface ProjectScaffolder {
  /** Scaffold collaboration template into target directory. */
  scaffold(config: ScaffoldConfig): Promise<ScaffoldResult>;
  /** List available template files (relative paths). */
  listTemplateFiles(): Promise<readonly string[]>;
}
