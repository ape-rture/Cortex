import { MarkdownTaskQueue } from "./task-queue.js";
import type {
  Task,
  TaskPriority,
  TaskQueue,
  TaskStatus,
  ThreadKey,
  ThreadScheduler,
  ThreadSchedulerConfig,
  ThreadStatus,
} from "./types/task-queue.js";

const DEFAULT_THREAD_KEY = "default";

const DEFAULT_CONFIG: ThreadSchedulerConfig = {
  max_parallel_threads: 4,
  max_queue_depth_per_thread: 100,
  stale_thread_timeout_ms: 30 * 60 * 1000,
};

interface ThreadState {
  queue: string[];
  inProgress?: string;
  last_activity?: string;
  last_touched_ms: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isTerminalStatus(status: TaskStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled" || status === "blocked";
}

function priorityRank(priority: TaskPriority): number {
  switch (priority) {
    case "p0":
      return 0;
    case "p1":
      return 1;
    case "p2":
      return 2;
    case "p3":
      return 3;
    default:
      return 9;
  }
}

export class InMemoryThreadScheduler implements ThreadScheduler {
  private readonly queue: TaskQueue;
  private readonly config: ThreadSchedulerConfig;
  private readonly threads = new Map<ThreadKey, ThreadState>();
  private readonly taskToThread = new Map<string, ThreadKey>();

  constructor(
    queue: TaskQueue = new MarkdownTaskQueue(),
    config: Partial<ThreadSchedulerConfig> = {},
  ) {
    this.queue = queue;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  async list(filter?: { status?: TaskStatus; priority?: TaskPriority }): Promise<readonly Task[]> {
    return await this.queue.list(filter);
  }

  async add(task: Omit<Task, "id" | "status" | "created_at" | "updated_at">): Promise<string> {
    return await this.enqueue(DEFAULT_THREAD_KEY, task);
  }

  async enqueue(
    thread: ThreadKey,
    task: Omit<Task, "id" | "status" | "created_at" | "updated_at">,
  ): Promise<string> {
    await this.syncQueuedTasksToDefaultThread();
    this.cleanupStaleThreads();

    const state = this.getOrCreateThread(thread);
    if (state.queue.length >= this.config.max_queue_depth_per_thread) {
      throw new Error(`Thread queue depth exceeded for "${thread}"`);
    }

    const id = await this.queue.add(task);
    state.queue.push(id);
    state.last_touched_ms = Date.now();
    this.taskToThread.set(id, thread);
    return id;
  }

  async update(id: string, status: TaskStatus, result?: string): Promise<void> {
    await this.queue.update(id, status, result);
    await this.syncQueuedTasksToDefaultThread();
    this.cleanupStaleThreads();

    const thread = this.taskToThread.get(id);
    if (!thread) return;
    const state = this.threads.get(thread);
    if (!state) return;

    if (status === "in_progress") {
      state.inProgress = id;
      state.queue = state.queue.filter((taskId) => taskId !== id);
    } else {
      state.queue = state.queue.filter((taskId) => taskId !== id);
      if (state.inProgress === id && status !== "queued") {
        state.inProgress = undefined;
      }
      if (status === "queued") {
        state.queue.push(id);
      }
      if (isTerminalStatus(status)) {
        this.taskToThread.delete(id);
      }
    }

    state.last_activity = nowIso();
    state.last_touched_ms = Date.now();
  }

  async next(): Promise<Task | undefined> {
    await this.syncQueuedTasksToDefaultThread();
    this.cleanupStaleThreads();

    const activeInProgress = this.countInProgressThreads();
    if (activeInProgress >= this.config.max_parallel_threads) {
      return undefined;
    }

    const queuedMap = await this.loadQueuedMap();
    const candidates: Array<{ thread: ThreadKey; task: Task }> = [];

    for (const [thread, state] of this.threads.entries()) {
      if (state.inProgress) continue;
      const task = this.peekHeadTask(state, queuedMap);
      if (task) {
        candidates.push({ thread, task });
      }
    }

    if (candidates.length === 0) {
      return undefined;
    }

    candidates.sort((a, b) => {
      const byPriority = priorityRank(a.task.priority) - priorityRank(b.task.priority);
      if (byPriority !== 0) return byPriority;
      return a.task.created_at.localeCompare(b.task.created_at);
    });

    const selected = candidates[0];
    const selectedState = this.threads.get(selected.thread);
    if (!selectedState) return undefined;

    selectedState.inProgress = selected.task.id;
    selectedState.last_touched_ms = Date.now();
    selectedState.last_activity = nowIso();
    selectedState.queue = selectedState.queue.filter((id) => id !== selected.task.id);
    return selected.task;
  }

  async nextForThread(thread: ThreadKey): Promise<Task | undefined> {
    await this.syncQueuedTasksToDefaultThread();
    this.cleanupStaleThreads();

    const state = this.threads.get(thread);
    if (!state) return undefined;
    if (state.inProgress) return undefined;

    const activeInProgress = this.countInProgressThreads();
    if (activeInProgress >= this.config.max_parallel_threads) {
      return undefined;
    }

    const queuedMap = await this.loadQueuedMap();
    const task = this.peekHeadTask(state, queuedMap);
    if (!task) return undefined;

    state.inProgress = task.id;
    state.last_touched_ms = Date.now();
    state.last_activity = nowIso();
    state.queue = state.queue.filter((id) => id !== task.id);
    return task;
  }

  async activeThreads(): Promise<readonly ThreadKey[]> {
    await this.syncQueuedTasksToDefaultThread();
    this.cleanupStaleThreads();
    return Array.from(this.threads.entries())
      .filter(([, state]) => state.queue.length > 0 || Boolean(state.inProgress))
      .map(([thread]) => thread);
  }

  async threadStatus(thread: ThreadKey): Promise<ThreadStatus> {
    await this.syncQueuedTasksToDefaultThread();
    this.cleanupStaleThreads();
    const state = this.threads.get(thread);
    return {
      thread,
      queued: state?.queue.length ?? 0,
      in_progress: state?.inProgress ? 1 : 0,
      last_activity: state?.last_activity,
    };
  }

  parseFromMarkdown(content: string): Task[] {
    return this.queue.parseFromMarkdown(content);
  }

  toMarkdown(tasks: readonly Task[]): string {
    return this.queue.toMarkdown(tasks);
  }

  private getOrCreateThread(thread: ThreadKey): ThreadState {
    let state = this.threads.get(thread);
    if (!state) {
      state = {
        queue: [],
        inProgress: undefined,
        last_activity: undefined,
        last_touched_ms: Date.now(),
      };
      this.threads.set(thread, state);
    }
    return state;
  }

  private async syncQueuedTasksToDefaultThread(): Promise<void> {
    const queued = await this.queue.list({ status: "queued" });
    const queuedIds = new Set(queued.map((task) => task.id));

    for (const [thread, state] of this.threads.entries()) {
      state.queue = state.queue.filter((id) => queuedIds.has(id));
      for (const id of state.queue) {
        this.taskToThread.set(id, thread);
      }
    }

    for (const task of queued) {
      if (this.taskToThread.has(task.id)) continue;
      const state = this.getOrCreateThread(DEFAULT_THREAD_KEY);
      state.queue.push(task.id);
      state.last_touched_ms = Date.now();
      this.taskToThread.set(task.id, DEFAULT_THREAD_KEY);
    }
  }

  private cleanupStaleThreads(): void {
    const timeoutMs = this.config.stale_thread_timeout_ms;
    if (timeoutMs <= 0) return;
    const now = Date.now();
    for (const [thread, state] of this.threads.entries()) {
      const idleMs = now - state.last_touched_ms;
      if (state.queue.length === 0 && !state.inProgress && idleMs >= timeoutMs) {
        this.threads.delete(thread);
      }
    }
  }

  private countInProgressThreads(): number {
    let count = 0;
    for (const state of this.threads.values()) {
      if (state.inProgress) {
        count += 1;
      }
    }
    return count;
  }

  private async loadQueuedMap(): Promise<Map<string, Task>> {
    const queued = await this.queue.list({ status: "queued" });
    return new Map(queued.map((task) => [task.id, task]));
  }

  private peekHeadTask(state: ThreadState, queuedMap: Map<string, Task>): Task | undefined {
    while (state.queue.length > 0) {
      const id = state.queue[0];
      const task = queuedMap.get(id);
      if (task) {
        return task;
      }
      state.queue.shift();
      this.taskToThread.delete(id);
    }
    return undefined;
  }
}
