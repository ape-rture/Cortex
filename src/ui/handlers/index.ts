import type { Hono } from "hono";
import { InMemorySessionStore } from "../store.js";
import { ConfigRouter } from "../../core/routing.js";
import { registerSessionHandlers } from "./sessions.js";
import { registerChatHandlers } from "./chat.js";
import type { Orchestrator } from "../../core/types/orchestrator.js";
import type { CycleStore } from "../cycle-store.js";
import type { ReviewStore } from "../review-store.js";
import type { MonitorBroker } from "../monitor-broker.js";
import { registerDashboardHandlers } from "./dashboard.js";
import { registerReviewHandlers } from "./review.js";
import { registerTaskHandlers } from "./tasks.js";
import { registerMonitorHandlers } from "./monitor.js";
import { registerOrchestratorHandlers } from "./orchestrator.js";
import { registerProjectHandlers } from "./projects.js";

export interface ApiRuntimeServices {
  readonly orchestrator: Orchestrator;
  readonly cycleStore: CycleStore;
  readonly reviewStore: ReviewStore;
  readonly monitorBroker: MonitorBroker;
  readonly taskBoardPath: string;
  readonly projectRegistryPath: string;
}

export function registerHandlers(
  app: Hono,
  store: InMemorySessionStore,
  router: ConfigRouter,
  systemPrompt: string,
  services: ApiRuntimeServices,
): void {
  registerSessionHandlers(app, store);
  registerChatHandlers(app, store, router, systemPrompt);
  registerDashboardHandlers(app, services.cycleStore, services.reviewStore, services.taskBoardPath);
  registerReviewHandlers(app, services.reviewStore);
  registerTaskHandlers(app, services.taskBoardPath);
  registerProjectHandlers(app, services.projectRegistryPath);
  registerMonitorHandlers(app, services.monitorBroker);
  registerOrchestratorHandlers(
    app,
    services.orchestrator,
    services.cycleStore,
    services.monitorBroker,
  );
}
