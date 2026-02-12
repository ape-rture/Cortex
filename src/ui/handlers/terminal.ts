import type { Hono } from "hono";
import { execSync } from "node:child_process";
import { MarkdownProjectStore } from "../../core/project-store.js";
import type { TerminalSessionManager } from "../terminal/terminal-session-manager.js";
import { WorkspaceConfigStore } from "../terminal/workspace-config-store.js";
import type { CreateSessionRequest, GitCommitInfo, WorkspaceConfig } from "../terminal/types.js";
import { jsonError } from "../utils.js";

export function registerTerminalHandlers(
  app: Hono,
  sessionManager: TerminalSessionManager,
  projectRegistryPath: string,
): void {
  const projectStore = new MarkdownProjectStore({ registryPath: projectRegistryPath });
  const configStore = new WorkspaceConfigStore();

  // List all terminal sessions
  app.get("/api/terminal/sessions", (c) => {
    return c.json({ sessions: sessionManager.list() });
  });

  // Create a new terminal session
  app.post("/api/terminal/sessions", async (c) => {
    try {
      const body = (await c.req.json()) as CreateSessionRequest;
      if (!body.projectId || !body.instanceType) {
        return jsonError(c, "projectId and instanceType are required");
      }

      // Look up project path from registry
      const projects = await projectStore.loadProjects();
      const project = projects.find((p) => p.id === body.projectId);
      if (!project) {
        return jsonError(c, `Project '${body.projectId}' not found`, 404);
      }

      // Enforce max 4 instances per project
      const existing = sessionManager.listForProject(body.projectId);
      if (existing.length >= 4) {
        return jsonError(c, "Maximum 4 instances per project");
      }

      const session = sessionManager.create({
        projectId: body.projectId,
        projectPath: project.path,
        instanceType: body.instanceType,
        cols: body.cols,
        rows: body.rows,
      });

      return c.json(session, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      return jsonError(c, message, 500);
    }
  });

  // Get session info
  app.get("/api/terminal/sessions/:id", (c) => {
    const session = sessionManager.get(c.req.param("id"));
    if (!session) return jsonError(c, "Session not found", 404);
    return c.json(session);
  });

  // Kill a session
  app.delete("/api/terminal/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const session = sessionManager.get(id);
    if (!session) return jsonError(c, "Session not found", 404);
    await sessionManager.kill(id);
    return c.json({ ok: true });
  });

  // Restart a session (kill + respawn with same config)
  app.post("/api/terminal/sessions/:id/restart", async (c) => {
    const id = c.req.param("id");
    const old = sessionManager.get(id);
    if (!old) return jsonError(c, "Session not found", 404);

    const projects = await projectStore.loadProjects();
    const project = projects.find((p) => p.id === old.projectId);
    if (!project) return jsonError(c, "Project no longer exists", 404);

    await sessionManager.kill(id);

    const newSession = sessionManager.create({
      projectId: old.projectId,
      projectPath: project.path,
      instanceType: old.instanceType,
    });

    return c.json(newSession, 201);
  });

  // Load workspace config
  app.get("/api/terminal/config", async (c) => {
    const config = await configStore.load();
    return c.json(config);
  });

  // Save workspace config
  app.put("/api/terminal/config", async (c) => {
    try {
      const config = (await c.req.json()) as WorkspaceConfig;
      await configStore.save(config);
      return c.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save config";
      return jsonError(c, message, 500);
    }
  });

  // List projects available for terminals
  app.get("/api/terminal/projects", async (c) => {
    try {
      const projects = await projectStore.loadProjects();
      const active = projects
        .filter((p) => p.status === "active")
        .map((p) => ({ id: p.id, name: p.name, path: p.path }));
      return c.json({ projects: active });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load projects";
      return jsonError(c, message, 500);
    }
  });

  // Get RSS memory for a session
  app.get("/api/terminal/sessions/:id/rss", (c) => {
    const id = c.req.param("id");
    const session = sessionManager.get(id);
    if (!session) return jsonError(c, "Session not found", 404);
    const rssKb = sessionManager.getRssKb(id);
    return c.json({ sessionId: id, rssKb });
  });

  // Get git info for a project
  app.get("/api/terminal/projects/:id/git-info", async (c) => {
    try {
      const projects = await projectStore.loadProjects();
      const project = projects.find((p) => p.id === c.req.param("id"));
      if (!project) return jsonError(c, "Project not found", 404);

      const gitInfo = getGitInfo(project.path);
      return c.json({ lastCommit: gitInfo });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get git info";
      return jsonError(c, message, 500);
    }
  });
}

function getGitInfo(cwd: string): GitCommitInfo | null {
  try {
    const hash = execSync("git log -1 --format=%h", { cwd, encoding: "utf8" }).trim();
    const message = execSync("git log -1 --format=%s", { cwd, encoding: "utf8" }).trim();
    const author = execSync("git log -1 --format=%an", { cwd, encoding: "utf8" }).trim();
    const relativeDate = execSync("git log -1 --format=%cr", { cwd, encoding: "utf8" }).trim();
    return { hash, message, author, relativeDate };
  } catch {
    return null;
  }
}
