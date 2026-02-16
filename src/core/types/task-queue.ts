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
  | "telegram"     // Telegram DM capture
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

// ---------------------------------------------------------------------
// Thread Scheduler (Takopi-inspired)
//
// Groups tasks by thread/context key. Tasks within a thread execute
// serially (FIFO); different threads execute in parallel. This prevents
// race conditions on shared files within a project while allowing
// independent workstreams to run concurrently.
//
// Composes around TaskQueue — adds thread isolation on top.
//
// Design source: research/12-takopi-telegram-bridge.md
// Related: decisions/2026-02-04-takopi-patterns.md
// ---------------------------------------------------------------------

/**
 * Thread key — identifies a serialization boundary.
 * Format: "project:<name>" | "slack:<thread-id>" | "telegram:<chat-id>"
 */
export type ThreadKey = string;

export interface ThreadSchedulerConfig {
  /** Max threads that can execute in parallel */
  readonly max_parallel_threads: number;

  /** Max queued tasks per thread before rejecting new ones */
  readonly max_queue_depth_per_thread: number;

  /** Kill idle threads after this many ms with no new tasks */
  readonly stale_thread_timeout_ms: number;
}

export interface ThreadStatus {
  /** Thread identifier */
  readonly thread: ThreadKey;

  /** Number of tasks waiting to execute */
  readonly queued: number;

  /** Number of tasks currently executing (0 or 1) */
  readonly in_progress: number;

  /** ISO-8601 timestamp of the last task completion in this thread */
  readonly last_activity?: string;
}

/**
 * Thread-aware task scheduler.
 *
 * Extends TaskQueue with thread isolation:
 * - enqueue() assigns a task to a thread
 * - nextForThread() returns the next task for a specific thread
 * - Different threads run in parallel; same-thread tasks are serial
 */
export interface ThreadScheduler extends TaskQueue {
  /** Add a task to a specific thread's queue. Returns the task ID. */
  enqueue(
    thread: ThreadKey,
    task: Omit<Task, "id" | "status" | "created_at" | "updated_at">,
  ): Promise<string>;

  /** Get the next queued task for a specific thread. */
  nextForThread(thread: ThreadKey): Promise<Task | undefined>;

  /** List all threads that have queued or in-progress tasks. */
  activeThreads(): Promise<readonly ThreadKey[]>;

  /** Get the status of a specific thread. */
  threadStatus(thread: ThreadKey): Promise<ThreadStatus>;
}
