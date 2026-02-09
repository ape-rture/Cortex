import { promises as fs } from "node:fs";
import cron from "node-cron";
import type { OrchestratorConfig, Trigger } from "./types/orchestrator.js";

const DEFAULT_CONFIG_PATH = "context/orchestrator.json";

interface ScheduledTaskLike {
  stop(): void;
  destroy?(): void;
}

interface CronApi {
  validate(expression: string): boolean;
  schedule(expression: string, handler: () => void): ScheduledTaskLike;
}

interface OrchestratorLike {
  reloadConfig(): Promise<void>;
  runCycle(trigger: Trigger): Promise<unknown>;
}

export interface CronSchedulerOptions {
  readonly cronApi?: CronApi;
  readonly onError?: (error: Error, trigger: Trigger) => void;
}

export class CronScheduler {
  private readonly orchestrator: OrchestratorLike;
  private readonly configPath: string;
  private readonly cronApi: CronApi;
  private readonly onError?: (error: Error, trigger: Trigger) => void;
  private readonly tasks: ScheduledTaskLike[] = [];
  private started = false;

  constructor(
    orchestrator: OrchestratorLike,
    configPath: string = DEFAULT_CONFIG_PATH,
    options: CronSchedulerOptions = {},
  ) {
    this.orchestrator = orchestrator;
    this.configPath = configPath;
    this.cronApi = options.cronApi ?? cron;
    this.onError = options.onError;
  }

  async start(): Promise<number> {
    if (this.started) return this.tasks.length;

    await this.orchestrator.reloadConfig();
    const config = await this.loadConfig();
    const triggers = config.triggers.filter(
      (trigger): trigger is Trigger & { type: "cron"; schedule: string } =>
        trigger.type === "cron" &&
        typeof trigger.schedule === "string" &&
        trigger.schedule.trim().length > 0,
    );

    for (const trigger of triggers) {
      const expression = trigger.schedule.trim();
      if (!this.cronApi.validate(expression)) {
        continue;
      }

      const task = this.cronApi.schedule(expression, () => {
        void this.runTrigger(trigger);
      });
      this.tasks.push(task);
    }

    this.started = true;
    return this.tasks.length;
  }

  stop(): void {
    for (const task of this.tasks) {
      task.stop();
      if (typeof task.destroy === "function") {
        task.destroy();
      }
    }
    this.tasks.length = 0;
    this.started = false;
  }

  async restart(): Promise<number> {
    this.stop();
    return this.start();
  }

  scheduledCount(): number {
    return this.tasks.length;
  }

  private async loadConfig(): Promise<OrchestratorConfig> {
    const raw = await fs.readFile(this.configPath, "utf8");
    return JSON.parse(raw) as OrchestratorConfig;
  }

  private async runTrigger(trigger: Trigger): Promise<void> {
    try {
      await this.orchestrator.runCycle(trigger);
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "Unknown cron cycle error");
      this.onError?.(error, trigger);
    }
  }
}
