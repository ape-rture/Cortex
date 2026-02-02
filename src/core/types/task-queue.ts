/**
 * Task Queue Types
 *
 * The task queue bridges async work between sessions. Tasks come from:
 * - Slack #cortex channel (Phase 2+)
 * - CLI commands
 * - Agent outputs (suggested_action -> queued task)
 * - Cron triggers
 *
 * Storage: /actions/queue.md (markdown, human-readable)
 * The queue processor reads this file, executes tasks, and updates status.
 *
 * Design source: projects/feature-roadmap.md (Phase 1)
 */

// ---------------------------------------------------------------------
// Task status lifecycle
// ---------------------------------------------------------------------

export type TaskStatus =
  | "queued"      // Waiting to be picked up
  | "in_progress" // Currently being executed
  | "blocked"     // Waiting on external input or dependency
  | "done"        // Successfully completed
  | "failed"      // Execution failed
  | "cancelled";  // Manually cancelled by user

export type TaskPriority = "p0" | "p1" | "p2" | "p3";

// ---------------------------------------------------------------------
// Task source — where the task originated
// ---------------------------------------------------------------------

export type TaskSource =
  | "cli"          // User typed a command
  | "slack"        // Message in #cortex channel
  | "agent"        // Runtime agent suggested an action
  | "cron"         // Scheduled trigger
  | "webhook";     // External webhook (GitHub, Attio, etc.)

// ---------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------

export interface Task {
  /** Unique identifier (e.g. "task-2026-02-02-001") */
  readonly id: string;

  /** Human-readable title */
  readonly title: string;

  /** Extended description / instructions */
  readonly description?: string;

  /** Current lifecycle state */
  status: TaskStatus;

  /** Urgency level */
  readonly priority: TaskPriority;

  /** Where this task came from */
  readonly source: TaskSource;

  /** Which agent or model should handle this (optional) */
  readonly assigned_to?: string;

  /** ISO-8601 timestamp — when the task was created */
  readonly created_at: string;

  /** ISO-8601 timestamp — last status change */
  updated_at: string;

  /** ISO-8601 timestamp — when the task should be done by (optional) */
  readonly due_by?: string;

  /** Related file paths for context */
  readonly context_refs?: readonly string[];

  /** Free-form tags for filtering */
  readonly tags?: readonly string[];

  /** Result summary after completion / failure */
  result?: string;
}

// ---------------------------------------------------------------------
// Queue operations — what the queue processor exposes
// ---------------------------------------------------------------------

export interface TaskQueue {
  /** List all tasks, optionally filtered by status */
  list(filter?: { status?: TaskStatus; priority?: TaskPriority }): Promise<readonly Task[]>;

  /** Add a new task to the queue. Returns the assigned ID. */
  add(task: Omit<Task, "id" | "status" | "created_at" | "updated_at">): Promise<string>;

  /** Update task status and optionally set a result message */
  update(id: string, status: TaskStatus, result?: string): Promise<void>;

  /** Get the next task to work on (highest priority queued task) */
  next(): Promise<Task | undefined>;

  /** Parse /actions/queue.md into structured Task[] */
  parseFromMarkdown(content: string): Task[];

  /** Serialize Task[] back to markdown for /actions/queue.md */
  toMarkdown(tasks: readonly Task[]): string;
}
