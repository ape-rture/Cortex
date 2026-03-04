import { promises as fs } from "node:fs";
import path from "node:path";
import { executeClaudeCodeAgent } from "./claude-code-process.js";
import { executeCodexCliAgent, type CodexJsonlEvent, type CodexExecResult } from "./codex-process.js";
import { QualityGateRunner, type QualityGateReport } from "./quality-gates.js";
import { PostToolHookProcessor, SessionMetadataStore } from "./post-tool-hooks.js";
import {
  SessionLifecyclePoller,
  determineStatus,
  type SessionSignals,
  type SessionStatus,
} from "./session-lifecycle.js";
import { WorkspaceManager, type WorkspaceInfo } from "./workspace-manager.js";
import type { AgentOutput } from "./types/agent-output.js";
import type { AgentSpawnConfig, Trigger } from "./types/orchestrator.js";
import type { ModelRef } from "./types/routing.js";
import {
  findTaskByTitle,
  moveTaskOnBoard,
  parseFullBoard,
  type BoardTask,
  type ParsedBoard,
} from "../ui/handlers/tasks.js";

export interface RalphConfig {
  readonly taskBoardPath: string;
  readonly logPath: string;
  readonly activePath: string;
  readonly basePath: string;
  readonly maxIterations: number;
  readonly maxStuckCount: number;
  readonly pollIntervalMs?: number;
  readonly sessionMaxPolls?: number;
  readonly worktreeRoot?: string;
  readonly filter?: {
    readonly group?: string;
    readonly agent?: "claude" | "codex";
    readonly taskTitle?: string;
  };
  readonly claude?: {
    readonly model?: string;
    readonly maxTurns?: number;
    readonly maxBudgetUsd?: number;
    readonly timeoutMs?: number;
  };
  readonly codex?: {
    readonly model?: string;
    readonly sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
    readonly timeoutMs?: number;
  };
}

export type RalphExitReason = "all_done" | "max_iterations" | "stuck" | "aborted" | "error";

export interface RalphResult {
  readonly iterations: number;
  readonly tasksCompleted: readonly string[];
  readonly tasksFailed: readonly string[];
  readonly exitReason: RalphExitReason;
}

type RalphEventType =
  | "loop_started"
  | "task_picked"
  | "session_status"
  | "agent_started"
  | "agent_progress"
  | "agent_completed"
  | "task_verified"
  | "task_stuck"
  | "loop_completed"
  | "loop_error";

export interface RalphEvent {
  readonly type: RalphEventType;
  readonly iteration: number;
  readonly timestamp: string;
  readonly message: string;
  readonly agent?: "claude" | "codex";
  readonly detail?: string;
  readonly task?: BoardTask;
  readonly sessionStatus?: SessionStatus;
}

interface RalphLoopDeps {
  readonly readFileImpl?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  readonly writeFileImpl?: (filePath: string, content: string, encoding: BufferEncoding) => Promise<void>;
  readonly executeClaudeImpl?: (input: {
    prompt: string;
    task: BoardTask;
    iteration: number;
    workingDir: string;
  }) => Promise<AgentOutput>;
  readonly executeCodexImpl?: (
    input: {
      prompt: string;
      task: BoardTask;
      iteration: number;
      model?: string;
      sandboxMode?: "read-only" | "workspace-write" | "danger-full-access";
      timeoutMs?: number;
      workingDir: string;
    },
    onEvent?: (event: CodexJsonlEvent) => void,
  ) => Promise<CodexExecResult>;
  readonly workspaceManager?: WorkspaceManager;
  readonly qualityGateRunner?: QualityGateRunner;
  readonly metadataStore?: SessionMetadataStore;
  readonly postToolHookProcessor?: PostToolHookProcessor;
  readonly sessionPoller?: SessionLifecyclePoller;
}

interface DispatchResult {
  readonly success: boolean;
  readonly detail: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeAgent(agent?: string): "claude" | "codex" | undefined {
  if (!agent) return undefined;
  const cleaned = normalize(agent);
  if (cleaned === "claude" || cleaned === "codex") return cleaned;
  return undefined;
}

function buildBoardSummary(board: ParsedBoard, group?: string): string {
  const scoped = group
    ? board.tasks.filter((task) => task.group === group)
    : board.tasks;
  const queued = scoped.filter((task) => task.status === "queued").length;
  const inProgress = scoped.filter((task) => task.status === "in_progress").length;
  const done = scoped.filter((task) => task.status === "done").length;
  const scopeLabel = group ? `group "${group}"` : "all tasks";
  return `Board summary (${scopeLabel}): queued=${queued}, in_progress=${inProgress}, done=${done}`;
}

function buildTaskContext(task: BoardTask, boardSummary: string, retryNotes: readonly string[] = []): string {
  const lines: string[] = [
    "Assigned task from `.cortex/tasks.md`:",
    `Title: ${task.title}`,
    `Status section: ${task.status}`,
    task.group ? `Group: ${task.group}` : "Group: (none)",
    task.branch ? `Branch: ${task.branch}` : "Branch: (none)",
    task.description ? `Description: ${task.description}` : "Description: (none)",
    `Original line: ${task.rawLine}`,
    boardSummary,
    "",
    "Required coordination steps:",
    "1. Update `.cortex/active.md` before edits and clear it when done.",
    "2. Implement and test the task completely.",
    "3. Update `.cortex/tasks.md` to move this task from In Progress to Done when complete.",
    "4. Append completion details to `.cortex/log.md`.",
  ];

  if (retryNotes.length > 0) {
    lines.push("", "Previous verification feedback:");
    for (const note of retryNotes.slice(-3)) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

export function buildClaudeTaskPrompt(
  task: BoardTask,
  board: ParsedBoard,
  retryNotes: readonly string[] = [],
): string {
  return buildTaskContext(task, buildBoardSummary(board, task.group), retryNotes);
}

export function buildCodexTaskPrompt(
  task: BoardTask,
  board: ParsedBoard,
  retryNotes: readonly string[] = [],
): string {
  return buildTaskContext(task, buildBoardSummary(board, task.group), retryNotes);
}

function annotateTaskLine(markdown: string, title: string, status: BoardTask["status"], annotation: string): string {
  const board = parseFullBoard(markdown);
  const task = findTaskByTitle(board, title, status);
  if (!task) return markdown;

  const lines = markdown.split(/\r?\n/);
  const index = task.lineNumber - 1;
  if (index < 0 || index >= lines.length) return markdown;
  if ((lines[index] ?? "").includes(annotation)) return markdown;
  lines[index] = `${lines[index]} ${annotation}`;
  return lines.join("\n");
}

function taskKey(title: string): string {
  return normalize(title);
}

function sanitizeSessionId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "session";
}

export class RalphLoop {
  private readonly readFileImpl: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  private readonly writeFileImpl: (filePath: string, content: string, encoding: BufferEncoding) => Promise<void>;
  private readonly deps: RalphLoopDeps;
  private readonly onEvent?: (event: RalphEvent) => void;
  private readonly stuckCounts = new Map<string, number>();
  private readonly retryFeedback = new Map<string, string[]>();
  private readonly workspaceManager: WorkspaceManager;
  private readonly qualityGateRunner: QualityGateRunner;
  private readonly metadataStore: SessionMetadataStore;
  private readonly postToolHookProcessor: PostToolHookProcessor;
  private readonly sessionPoller: SessionLifecyclePoller;
  private readonly pollIntervalMs: number;
  private readonly sessionMaxPolls: number;
  private aborted = false;

  constructor(
    private readonly config: RalphConfig,
    onEvent?: (event: RalphEvent) => void,
    deps: RalphLoopDeps = {},
  ) {
    this.onEvent = onEvent;
    this.deps = deps;
    this.readFileImpl = deps.readFileImpl ?? fs.readFile;
    this.writeFileImpl = deps.writeFileImpl ?? fs.writeFile;

    this.pollIntervalMs = config.pollIntervalMs ?? 30_000;
    this.sessionMaxPolls = config.sessionMaxPolls ?? 20;

    this.workspaceManager = deps.workspaceManager
      ?? new WorkspaceManager(
        config.basePath,
        config.worktreeRoot ?? path.join(config.basePath, ".cortex", "worktrees"),
      );
    this.qualityGateRunner = deps.qualityGateRunner ?? new QualityGateRunner();
    this.metadataStore = deps.metadataStore
      ?? new SessionMetadataStore(path.join(config.basePath, ".cortex", "session-metadata.json"));
    this.postToolHookProcessor = deps.postToolHookProcessor
      ?? new PostToolHookProcessor(this.metadataStore);
    this.sessionPoller = deps.sessionPoller ?? new SessionLifecyclePoller(this.pollIntervalMs);
  }

  abort(): void {
    this.aborted = true;
  }

  async run(): Promise<RalphResult> {
    const completed = new Set<string>();
    const failed = new Set<string>();
    let attempts = 0;

    this.emit({
      type: "loop_started",
      iteration: 0,
      message: "Starting Ralph loop",
    });

    try {
      for (let iteration = 1; iteration <= this.config.maxIterations; iteration += 1) {
        if (this.aborted) {
          return this.finish("aborted", attempts, completed, failed, "Loop aborted by signal");
        }

        const board = await this.loadBoard();
        const queuedTasks = this.filterQueuedTasks(board);
        if (queuedTasks.length === 0) {
          return this.finish("all_done", attempts, completed, failed, "No queued tasks remain");
        }

        const runnable = queuedTasks.filter(
          (task) => this.getStuckCount(task.title) < this.config.maxStuckCount,
        );

        if (runnable.length === 0) {
          for (const task of queuedTasks) {
            failed.add(task.title);
          }
          return this.finish(
            "stuck",
            attempts,
            completed,
            failed,
            "All matching queued tasks exceeded stuck threshold",
          );
        }

        const task = runnable[0];
        const agent = normalizeAgent(task.agent);
        if (!agent) {
          failed.add(task.title);
          this.bumpStuck(task.title);
          this.emit({
            type: "task_stuck",
            iteration,
            task,
            message: `Task "${task.title}" has no supported Agent value`,
          });
          continue;
        }

        this.emit({
          type: "task_picked",
          iteration,
          task,
          agent,
          message: `Picked task "${task.title}"`,
        });

        const moved = moveTaskOnBoard(board.raw, task.title, "queued", "in_progress");
        if (moved === board.raw) {
          failed.add(task.title);
          this.bumpStuck(task.title);
          this.emit({
            type: "loop_error",
            iteration,
            task,
            agent,
            message: `Failed to move task "${task.title}" to In Progress`,
          });
          continue;
        }

        await this.writeBoard(moved);
        attempts += 1;

        let workspace: WorkspaceInfo | null = null;
        const sessionId = `ralph-${iteration}-${sanitizeSessionId(task.title)}`;

        try {
          workspace = await this.workspaceManager.create({
            taskTitle: task.title,
            branch: task.branch,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const detail = `Workspace creation failed: ${message}`;
          await this.handleTaskFailure(task, iteration, failed, detail);
          this.emit({
            type: "loop_error",
            iteration,
            task,
            agent,
            message: detail,
          });
          continue;
        }

        this.emitSessionStatus(iteration, task, "spawning", "Spawned isolated workspace");

        let dispatch: DispatchResult = {
          success: false,
          detail: "Dispatch did not run",
        };

        try {
          this.emit({
            type: "agent_started",
            iteration,
            task,
            agent,
            message: `Dispatching ${agent} worker`,
          });

          this.emitSessionStatus(iteration, task, "working", `Executing task in ${workspace.path}`);

          dispatch = await this.dispatchTask({
            task,
            agent,
            board,
            iteration,
            workingDir: workspace.path,
            sessionId,
          });

          this.emit({
            type: "agent_completed",
            iteration,
            task,
            agent,
            message: dispatch.success
              ? `Agent ${agent} completed`
              : `Agent ${agent} reported failure`,
            detail: dispatch.detail,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          dispatch = { success: false, detail: message };
          this.emit({
            type: "loop_error",
            iteration,
            task,
            agent,
            message,
          });
        }

        let qualityReport: QualityGateReport | null = null;
        if (dispatch.success) {
          qualityReport = await this.qualityGateRunner.run(task, workspace.path);

          if (!qualityReport.passed) {
            this.addRetryFeedback(task.title, qualityReport.feedbackMessage);
            dispatch = {
              success: false,
              detail: qualityReport.feedbackMessage,
            };
          }
        }

        if (!dispatch.success) {
          await this.pollLifecycle(iteration, task, sessionId, {
            fatalError: dispatch.detail || "agent dispatch failed",
          });
          await this.handleTaskFailure(task, iteration, failed, dispatch.detail);
        }

        if (dispatch.success) {
          const latest = await this.loadBoard();
          let updatedBoard = latest.raw;

          if (findTaskByTitle(latest, task.title, "in_progress")) {
            updatedBoard = moveTaskOnBoard(updatedBoard, task.title, "in_progress", "done");
          } else if (findTaskByTitle(latest, task.title, "queued")) {
            updatedBoard = moveTaskOnBoard(updatedBoard, task.title, "queued", "done");
          }

          if (updatedBoard !== latest.raw) {
            await this.writeBoard(updatedBoard);
          }

          await this.pollLifecycle(iteration, task, sessionId, {
            qualityGateStatus: "passed",
            taskDone: true,
          });

          completed.add(task.title);
          this.stuckCounts.delete(taskKey(task.title));
          this.retryFeedback.delete(taskKey(task.title));
          this.emit({
            type: "task_verified",
            iteration,
            task,
            agent,
            message: `Task "${task.title}" is done`,
            detail: qualityReport?.feedbackMessage ?? dispatch.detail,
          });
        }

        if (workspace) {
          await this.workspaceManager.destroy(workspace.path).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            this.emit({
              type: "loop_error",
              iteration,
              task,
              agent,
              message: `Workspace cleanup failed: ${message}`,
            });
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "loop_error",
        iteration: attempts,
        message,
      });
      return this.finish("error", attempts, completed, failed, message);
    }

    return this.finish(
      "max_iterations",
      attempts,
      completed,
      failed,
      `Reached max iterations (${this.config.maxIterations})`,
    );
  }

  private async handleTaskFailure(
    task: BoardTask,
    iteration: number,
    failed: Set<string>,
    detail: string,
  ): Promise<void> {
    const stuckCount = this.bumpStuck(task.title);
    const blocked = stuckCount >= this.config.maxStuckCount;
    if (blocked) failed.add(task.title);

    const note = blocked
      ? `(ralph blocked after ${stuckCount} attempts)`
      : `(ralph retry ${stuckCount}/${this.config.maxStuckCount})`;

    const latest = await this.loadBoard();
    let updatedBoard = latest.raw;
    if (findTaskByTitle(latest, task.title, "in_progress")) {
      updatedBoard = moveTaskOnBoard(updatedBoard, task.title, "in_progress", "queued", note);
    } else if (findTaskByTitle(latest, task.title, "queued")) {
      updatedBoard = annotateTaskLine(updatedBoard, task.title, "queued", note);
    }

    if (updatedBoard !== latest.raw) {
      await this.writeBoard(updatedBoard);
    }

    this.emit({
      type: "task_stuck",
      iteration,
      task,
      agent: normalizeAgent(task.agent),
      message: blocked
        ? `Task "${task.title}" reached max stuck count`
        : `Task "${task.title}" not completed; queued for retry`,
      detail,
    });
  }

  private async dispatchTask(input: {
    task: BoardTask;
    agent: "claude" | "codex";
    board: ParsedBoard;
    iteration: number;
    workingDir: string;
    sessionId: string;
  }): Promise<DispatchResult> {
    if (input.agent === "claude") {
      const prompt = buildClaudeTaskPrompt(input.task, input.board, this.getRetryFeedback(input.task.title));

      const output = this.deps.executeClaudeImpl
        ? await this.deps.executeClaudeImpl({
          prompt,
          task: input.task,
          iteration: input.iteration,
          workingDir: input.workingDir,
        })
        : await this.dispatchClaudeDefault(
          prompt,
          input.iteration,
          input.task,
          input.workingDir,
          input.sessionId,
        );

      const success = output.errors.length === 0;
      const detail = success
        ? `Claude output with ${output.findings.length} findings`
        : output.errors.join("; ");

      return { success, detail };
    }

    const templatePath = path.resolve(this.config.basePath, "src/agents/prompts/ralph-codex-worker.md");
    const template = await this.readFileImpl(templatePath, "utf8").catch(() => "");
    const taskPrompt = buildCodexTaskPrompt(input.task, input.board, this.getRetryFeedback(input.task.title));
    const prompt = [template.trim(), "", taskPrompt].filter(Boolean).join("\n");

    const exec = this.deps.executeCodexImpl
      ? this.deps.executeCodexImpl(
        {
          prompt,
          task: input.task,
          iteration: input.iteration,
          model: this.config.codex?.model,
          sandboxMode: this.config.codex?.sandboxMode,
          timeoutMs: this.config.codex?.timeoutMs,
          workingDir: input.workingDir,
        },
        (event) => {
          this.emitCodexProgress(input, event);
          void this.postToolHookProcessor.processCodexEvent(input.sessionId, event);
        },
      )
      : executeCodexCliAgent(
        {
          prompt,
          workingDir: input.workingDir,
          model: this.config.codex?.model,
          sandboxMode: this.config.codex?.sandboxMode,
          timeoutMs: this.config.codex?.timeoutMs,
        },
        (event) => {
          this.emitCodexProgress(input, event);
          void this.postToolHookProcessor.processCodexEvent(input.sessionId, event);
        },
      );

    const result = await exec;
    return {
      success: result.exitCode === 0,
      detail: result.lastMessage || `codex exit code ${result.exitCode}`,
    };
  }

  private emitCodexProgress(
    input: { iteration: number; task: BoardTask },
    event: CodexJsonlEvent,
  ): void {
    this.emit({
      type: "agent_progress",
      iteration: input.iteration,
      task: input.task,
      agent: "codex",
      message: typeof event.type === "string" ? `codex:${event.type}` : "codex:event",
      detail: JSON.stringify(event).slice(0, 400),
    });
  }

  private async dispatchClaudeDefault(
    prompt: string,
    iteration: number,
    task: BoardTask,
    workingDir: string,
    sessionId: string,
  ): Promise<AgentOutput> {
    const model: ModelRef = this.config.claude?.model
      ? (this.config.claude.model.includes(":")
        ? (this.config.claude.model as ModelRef)
        : (`anthropic:${this.config.claude.model}` as ModelRef))
      : "anthropic:sonnet";

    const trigger: Trigger = {
      type: "cli",
      payload: {
        source: "ralph",
        task_title: task.title,
        task_group: task.group ?? "",
      },
    };

    const spawnConfig: AgentSpawnConfig = {
      agent: "ralph-claude-worker",
      prompt_path: "src/agents/prompts/ralph-claude-worker.md",
      execution_type: "claude_code",
      model,
      max_turns: this.config.claude?.maxTurns ?? 50,
      max_budget_usd: this.config.claude?.maxBudgetUsd ?? 10,
      allowed_tools: ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Bash"],
      permissions: {
        agent: "ralph-claude-worker",
        can_read: ["**"],
        can_write: ["**"],
        can_call_apis: [],
        can_send_messages: false,
        requires_human_approval: [],
        max_tokens: 200_000,
        model,
        timeout_ms: this.config.claude?.timeoutMs ?? 600_000,
      },
    };

    return await executeClaudeCodeAgent(
      spawnConfig,
      {
        cycle_id: `ralph-${iteration}`,
        trigger,
        basePath: workingDir,
        task_prompt: prompt,
      },
      {
        onEvent: (event) => {
          void this.postToolHookProcessor.processClaudeEvent(sessionId, event);
        },
      },
    );
  }

  private async pollLifecycle(
    iteration: number,
    task: BoardTask,
    sessionId: string,
    overrides: SessionSignals,
  ): Promise<SessionStatus> {
    let polls = 0;

    const final = await this.sessionPoller.pollUntilTerminal(
      "working",
      async () => {
        polls += 1;
        const signals = await this.collectSessionSignals(task.title, sessionId, overrides);
        const predicted = determineStatus("working", signals);

        if (polls >= this.sessionMaxPolls && predicted !== "done" && predicted !== "failed") {
          return {
            ...signals,
            fatalError: `Session lifecycle polling exceeded ${this.sessionMaxPolls} checks`,
          };
        }

        return signals;
      },
      (transition) => {
        this.emitSessionStatus(
          iteration,
          task,
          transition.to,
          `Session status ${transition.from} -> ${transition.to}`,
        );
      },
    );

    return final;
  }

  private async collectSessionSignals(
    taskTitle: string,
    sessionId: string,
    overrides: SessionSignals,
  ): Promise<SessionSignals> {
    const snapshot = await this.metadataStore.load();
    const session = snapshot.sessions[sessionId];
    const board = await this.loadBoard();

    const taskDone =
      overrides.taskDone
      || Boolean(findTaskByTitle(board, taskTitle, "done"));

    return {
      spawned: true,
      hasAgentOutput: true,
      ...(session?.prUrl ? { prUrl: session.prUrl } : {}),
      ...(session?.ciStatus ? { ciStatus: session.ciStatus } : {}),
      ...(session?.reviewStatus ? { reviewStatus: session.reviewStatus } : {}),
      ...(typeof session?.mergeable === "boolean" ? { mergeable: session.mergeable } : {}),
      ...(typeof session?.merged === "boolean" ? { merged: session.merged } : {}),
      ...(taskDone ? { taskDone: true } : {}),
      ...overrides,
    };
  }

  private filterQueuedTasks(board: ParsedBoard): BoardTask[] {
    return board.tasks
      .filter((task) => task.status === "queued")
      .filter((task) => {
        if (this.config.filter?.group && task.group !== this.config.filter.group) return false;
        if (this.config.filter?.agent && normalizeAgent(task.agent) !== this.config.filter.agent) return false;
        if (this.config.filter?.taskTitle) {
          const needle = normalize(this.config.filter.taskTitle);
          if (!normalize(task.title).includes(needle)) return false;
        }
        return true;
      });
  }

  private addRetryFeedback(title: string, feedback: string): void {
    const key = taskKey(title);
    const current = this.retryFeedback.get(key) ?? [];
    this.retryFeedback.set(key, [...current, feedback]);
  }

  private getRetryFeedback(title: string): readonly string[] {
    return this.retryFeedback.get(taskKey(title)) ?? [];
  }

  private async loadBoard(): Promise<ParsedBoard> {
    const raw = await this.readFileImpl(this.config.taskBoardPath, "utf8");
    return parseFullBoard(raw);
  }

  private async writeBoard(content: string): Promise<void> {
    await this.writeFileImpl(this.config.taskBoardPath, content, "utf8");
  }

  private getStuckCount(title: string): number {
    return this.stuckCounts.get(taskKey(title)) ?? 0;
  }

  private bumpStuck(title: string): number {
    const key = taskKey(title);
    const next = (this.stuckCounts.get(key) ?? 0) + 1;
    this.stuckCounts.set(key, next);
    return next;
  }

  private finish(
    reason: RalphExitReason,
    iterations: number,
    completed: Set<string>,
    failed: Set<string>,
    message: string,
  ): RalphResult {
    this.emit({
      type: "loop_completed",
      iteration: iterations,
      message,
    });
    return {
      iterations,
      tasksCompleted: [...completed],
      tasksFailed: [...failed],
      exitReason: reason,
    };
  }

  private emitSessionStatus(
    iteration: number,
    task: BoardTask,
    sessionStatus: SessionStatus,
    message: string,
  ): void {
    this.emit({
      type: "session_status",
      iteration,
      task,
      agent: normalizeAgent(task.agent),
      sessionStatus,
      message,
    });
  }

  private emit(event: Omit<RalphEvent, "timestamp">): void {
    if (!this.onEvent) return;
    this.onEvent({
      ...event,
      timestamp: nowIso(),
    });
  }
}
