import type { Hono } from "hono";
import { ProjectHeartbeatMonitor } from "../../core/project-heartbeat.js";
import { MarkdownProjectStore } from "../../core/project-store.js";
import { jsonError } from "../utils.js";

export function registerProjectHandlers(app: Hono, projectRegistryPath: string): void {
  const monitor = new ProjectHeartbeatMonitor({
    projectStore: new MarkdownProjectStore({ registryPath: projectRegistryPath }),
  });

  app.get("/api/projects/health", async (c) => {
    try {
      const reports = await monitor.checkAll();
      return c.json(reports);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load project health";
      return jsonError(c, message, 500);
    }
  });
}
