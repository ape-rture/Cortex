import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { CortexOrchestrator } from "../core/orchestrator.js";
import { CronScheduler } from "../core/cron-scheduler.js";
import { runMorningBriefing } from "./gm.js";
import { salesWatcherAgent } from "../agents/sales-watcher.js";
import { contentScannerAgent } from "../agents/content-scanner.js";
import { codeWatcherAgent } from "../agents/code-watcher.js";
import { projectHeartbeatAgent } from "../agents/project-heartbeat.js";
import { factExtractorAgent } from "../agents/fact-extractor.js";
import { memorySynthesizerAgent } from "../agents/memory-synthesizer.js";

const DEFAULT_CONFIG_PATH = "context/orchestrator.json";
const DAILY_DIR = "daily";
const GM_CRON_SCHEDULE = "30 7 * * 1-5"; // 7:30 AM weekdays

function registerDefaultAgents(orchestrator: CortexOrchestrator): void {
  orchestrator.runner.registerLocal("sales-watcher", salesWatcherAgent);
  orchestrator.runner.registerLocal("content-scanner", contentScannerAgent);
  orchestrator.runner.registerLocal("code-watcher", codeWatcherAgent);
  orchestrator.runner.registerLocal("project-heartbeat", projectHeartbeatAgent);
  orchestrator.runner.registerLocal("fact-extractor", factExtractorAgent);
  orchestrator.runner.registerLocal("memory-synthesizer", memorySynthesizerAgent);
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

  // /gm morning briefing cron — runs independently of orchestrator
  const gmTask = cron.schedule(GM_CRON_SCHEDULE, () => {
    void runGmBriefing();
  });

  const totalJobs = scheduled + 1;
  console.log(`[daemon] started with ${totalJobs} cron job(s) (${scheduled} orchestrator + /gm briefing)`);

  // Attach gmTask cleanup to scheduler stop
  const originalStop = scheduler.stop.bind(scheduler);
  scheduler.stop = () => {
    gmTask.stop();
    originalStop();
  };

  return scheduler;
}

async function runGmBriefing(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.resolve(DAILY_DIR, `${date}-briefing.md`);
  try {
    const briefing = await runMorningBriefing();
    await fs.mkdir(DAILY_DIR, { recursive: true });
    await fs.writeFile(outPath, briefing, "utf8");
    console.log(`[daemon] /gm briefing saved to ${outPath}`);
  } catch (err) {
    console.error(`[daemon] /gm briefing failed: ${err instanceof Error ? err.message : String(err)}`);
  }
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
