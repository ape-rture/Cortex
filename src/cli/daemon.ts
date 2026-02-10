import { fileURLToPath } from "node:url";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { CronScheduler } from "../core/cron-scheduler.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import { projectHeartbeatAgent } from "../agents/project-heartbeat.js";

const DEFAULT_CONFIG_PATH = "context/orchestrator.json";

function registerDefaultAgents(orchestrator: CortexOrchestrator): void {
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
  orchestrator.runner.registerLocal("project-heartbeat", projectHeartbeatAgent);
}

interface RunDaemonOptions {
  configPath?: string;
}

export async function runDaemon(options: RunDaemonOptions = {}): Promise<CronScheduler> {
  const configPath =
    options.configPath ??
    process.env.ORCHESTRATOR_CONFIG_PATH ??
    DEFAULT_CONFIG_PATH;

  const orchestrator = new CortexOrchestrator(configPath);
  registerDefaultAgents(orchestrator);

  const scheduler = new CronScheduler(orchestrator, configPath, {
    onError: (error, trigger) => {
      const schedule = trigger.schedule ? ` (${trigger.schedule})` : "";
      console.error(`[daemon] trigger ${trigger.type}${schedule} failed: ${error.message}`);
    },
  });

  const scheduled = await scheduler.start();
  if (scheduled === 0) {
    throw new Error("No valid cron triggers configured. Add type=\"cron\" triggers in context/orchestrator.json.");
  }

  console.log(`[daemon] started with ${scheduled} cron trigger(s)`);
  return scheduler;
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runDaemon()
    .then((scheduler) => {
      const shutdown = () => {
        scheduler.stop();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      console.error("[daemon] failed to start:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
