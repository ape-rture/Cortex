import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { useApi } from "../hooks/use-api";
import { api } from "../api";
import { ProjectTabs } from "../components/project-tabs";
import { TerminalPane } from "../components/terminal-pane";
import { AddInstanceCell } from "../components/add-instance-cell";
import type { InstanceType, WorkspaceConfig } from "../types";

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  gitCommit?: string | null;
}

interface SessionInfo {
  sessionId: string;
  projectId: string;
  instanceType: InstanceType;
  pid: number;
  createdAt: string;
  alive: boolean;
  lastOutputAt: number;
}

export function WorkspacesView() {
  const projectsApi = useApi(() => api.getTerminalProjects(), []);
  const sessionsApi = useApi(() => api.getTerminalSessions(), []);

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [rssMap, setRssMap] = useState<Record<string, number | null>>({});
  const spawningRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync API data into state
  useEffect(() => {
    if (projectsApi.data) {
      setProjects(projectsApi.data.map((p) => ({ ...p, gitCommit: null })));
      if (!activeProjectId && projectsApi.data.length > 0) {
        setActiveProjectId(projectsApi.data[0].id);
      }
    }
  }, [projectsApi.data]);

  // Sync sessions from API (initial load)
  useEffect(() => {
    if (sessionsApi.data) {
      setSessions(sessionsApi.data.sessions);
    }
  }, [sessionsApi.data]);

  // Poll session status every 10s to catch exits across all projects
  // (WS exit events only arrive for the active project's mounted panes)
  useEffect(() => {
    if (sessions.length === 0) return;
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const data = await api.getTerminalSessions();
        if (cancelled) return;
        const serverMap = new Map(data.sessions.map((s) => [s.sessionId, s]));
        setSessions((prev) => {
          let changed = false;
          const next = prev.map((s) => {
            const server = serverMap.get(s.sessionId);
            if (!server) return s;
            if (server.alive !== s.alive || server.lastOutputAt !== s.lastOutputAt) {
              changed = true;
              return { ...s, alive: server.alive, lastOutputAt: server.lastOutputAt };
            }
            return s;
          });
          return changed ? next : prev;
        });
      } catch {
        // ignore polling errors
      }
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessions.length > 0]);

  // Fetch git info for all projects
  useEffect(() => {
    if (!projectsApi.data) return;
    for (const p of projectsApi.data) {
      api.getProjectGitInfo(p.id).then((info) => {
        if (info?.lastCommit) {
          setProjects((prev) =>
            prev.map((proj) =>
              proj.id === p.id
                ? { ...proj, gitCommit: `${info.lastCommit!.relativeDate}: ${info.lastCommit!.message}` }
                : proj,
            ),
          );
        }
      }).catch(() => {});
    }
  }, [projectsApi.data]);

  // Auto-save workspace config when sessions change (debounced)
  useEffect(() => {
    if (sessions.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const projectMap = new Map<string, { instanceType: InstanceType }[]>();
      for (const s of sessions) {
        if (!projectMap.has(s.projectId)) projectMap.set(s.projectId, []);
        projectMap.get(s.projectId)!.push({ instanceType: s.instanceType as InstanceType });
      }

      const config: WorkspaceConfig = {
        version: 1,
        projects: Array.from(projectMap.entries()).map(([projectId, instances]) => ({
          projectId,
          instances: instances.map((i) => ({ instanceType: i.instanceType })),
        })),
      };

      api.saveWorkspaceConfig(config).catch(() => {});
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sessions]);

  // Poll RSS for alive sessions (every 15s)
  useEffect(() => {
    if (sessions.length === 0) return;
    let cancelled = false;

    async function poll() {
      const alive = sessions.filter((s) => s.alive);
      const results = await Promise.allSettled(
        alive.map((s) => api.getSessionRss(s.sessionId)),
      );
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      for (let i = 0; i < alive.length; i++) {
        const r = results[i];
        next[alive[i].sessionId] = r.status === "fulfilled" ? r.value.rssKb : null;
      }
      setRssMap(next);
    }

    poll();
    const timer = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessions]);

  // Auto-spawn Claude + Codex when selecting a project with no instances
  useEffect(() => {
    if (!activeProjectId) return;
    const projectSessions = sessions.filter((s) => s.projectId === activeProjectId);
    if (projectSessions.length > 0) return;
    if (!projectsApi.data?.find((p) => p.id === activeProjectId)) return;
    if (spawningRef.current.has(activeProjectId)) return;
    spawningRef.current.add(activeProjectId);

    (async () => {
      try {
        const claude = await api.createTerminalSession({
          projectId: activeProjectId,
          instanceType: "claude",
        });
        const codex = await api.createTerminalSession({
          projectId: activeProjectId,
          instanceType: "codex",
        });
        setSessions((prev) => [...prev, claude, codex]);
      } catch (err) {
        console.error("Failed to auto-spawn instances:", err);
      } finally {
        spawningRef.current.delete(activeProjectId);
      }
    })();
  }, [activeProjectId, sessions, projectsApi.data]);

  // Sort sessions into grid order: left column = Claude/Shell, right column = Codex
  // This gives a 2x2 layout with Claude on the left and Codex on the right
  const projectSessions = (() => {
    const all = sessions.filter((s) => s.projectId === activeProjectId);
    const left: typeof all = [];  // Claude, Shell
    const right: typeof all = []; // Codex
    for (const s of all) {
      if (s.instanceType === "codex") right.push(s);
      else left.push(s);
    }
    const result: typeof all = [];
    const maxLen = Math.max(left.length, right.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < left.length) result.push(left[i]);
      if (i < right.length) result.push(right[i]);
    }
    return result;
  })();
  const canAdd = activeProjectId != null && projectSessions.length < 4;

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, []);

  const handleAddInstance = useCallback(async (type: InstanceType) => {
    if (!activeProjectId) return;
    try {
      const session = await api.createTerminalSession({
        projectId: activeProjectId,
        instanceType: type,
      });
      setSessions((prev) => [...prev, session]);
    } catch (err) {
      console.error("Failed to add instance:", err);
    }
  }, [activeProjectId]);

  const handleCloseInstance = useCallback(async (sessionId: string) => {
    try {
      await api.killTerminalSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    } catch (err) {
      console.error("Failed to close instance:", err);
    }
  }, []);

  const handleRestartInstance = useCallback(async (sessionId: string) => {
    try {
      const newSession = await api.restartTerminalSession(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? newSession : s)),
      );
    } catch (err) {
      console.error("Failed to restart instance:", err);
    }
  }, []);

  const handleInstanceExit = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === sessionId ? { ...s, alive: false } : s)),
    );
  }, []);

  if (projectsApi.loading) {
    return (
      <div class="view-container">
        <div style={{ padding: "24px", color: "var(--text-secondary)" }}>Loading projects...</div>
      </div>
    );
  }

  // Grid rows: 1 row for 1-2 cells, 2 rows for 3-4 cells
  const totalCells = projectSessions.length + (canAdd ? 1 : 0);
  const gridClass = `terminal-grid${totalCells > 2 ? " rows-2" : ""}`;

  return (
    <div class="view-container workspaces-view">
      <ProjectTabs
        projects={projects.map((p) => ({
          ...p,
          instances: sessions
            .filter((s) => s.projectId === p.id)
            .map((s) => ({ instanceType: s.instanceType as InstanceType, alive: s.alive, lastOutputAt: s.lastOutputAt ?? 0 })),
        }))}
        activeId={activeProjectId}
        onSelect={handleSelectProject}
      />

      {activeProjectId && projectSessions.length === 0 && (
        <div class="terminal-grid-empty">
          Starting CLI instances...
        </div>
      )}

      {activeProjectId && projectSessions.length > 0 && (
        <div class={gridClass}>
          {projectSessions.map((s) => (
            <TerminalPane
              key={s.sessionId}
              sessionId={s.sessionId}
              instanceType={s.instanceType as InstanceType}
              alive={s.alive}
              rssKb={rssMap[s.sessionId] ?? null}
              onClose={handleCloseInstance}
              onRestart={handleRestartInstance}
              onExit={handleInstanceExit}
            />
          ))}

          {canAdd && (
            <AddInstanceCell onAdd={handleAddInstance} />
          )}
        </div>
      )}

      {!activeProjectId && (
        <div class="terminal-grid-empty">
          Select a project to begin
        </div>
      )}
    </div>
  );
}
