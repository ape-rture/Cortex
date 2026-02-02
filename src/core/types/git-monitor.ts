/**
 * Git Push Reminder types.
 *
 * Detects unpushed commits across tracked repos and surfaces
 * them in the /gm briefing. Prevents the "forgot to push" problem.
 */

export interface UnpushedReport {
  /** Absolute path to the repo root. */
  readonly repo_path: string;
  /** Repo display name (folder name or config override). */
  readonly repo_name: string;
  /** Branch with unpushed commits. */
  readonly branch: string;
  /** Number of unpushed commits. */
  readonly count: number;
  /** Age of the oldest unpushed commit in hours. */
  readonly oldest_hours: number;
  /** One-line summaries of unpushed commits (newest first, max 5). */
  readonly commit_summaries: readonly string[];
}

export interface GitMonitor {
  /** Check a single repo for unpushed commits. */
  checkRepo(repoPath: string): Promise<UnpushedReport | undefined>;
  /** Check all tracked repos. Returns only repos with unpushed commits. */
  checkAll(): Promise<readonly UnpushedReport[]>;
}

/**
 * Config for which repos to monitor.
 * Stored in context/git-repos.md or as a simple list.
 * Starts with just the Cortex repo itself.
 */
export interface GitMonitorConfig {
  /** Repo paths to check. */
  readonly repos: readonly string[];
}
