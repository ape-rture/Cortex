import * as pty from "node-pty";
import { execFile, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ScrollbackBuffer } from "./scrollback-buffer.js";
import type { InstanceType, TerminalSessionInfo } from "./types.js";

const SCROLLBACK_DIR = path.resolve("context", "workspaces-scrollback");
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

export interface SessionConfig {
  projectId: string;
  projectPath: string;
  instanceType: InstanceType;
  cols?: number;
  rows?: number;
}

interface ManagedSession {
  sessionId: string;
  projectId: string;
  instanceType: InstanceType;
  pty: pty.IPty;
  scrollback: ScrollbackBuffer;
  dataListeners: Set<(data: string) => void>;
  exitListeners: Set<(code: number) => void>;
  createdAt: string;
  alive: boolean;
  lastOutputAt: number; // Date.now() timestamp
}

function resolveCommand(instanceType: InstanceType): { command: string; args: string[] } {
  switch (instanceType) {
    case "claude":
      return { command: "cmd.exe", args: ["/c", "npx", "@anthropic-ai/claude-code"] };
    case "codex":
      return { command: "cmd.exe", args: ["/c", "npx", "codex"] };
    case "shell":
      return { command: "cmd.exe", args: [] };
  }
}

export class TerminalSessionManager {
  private sessions = new Map<string, ManagedSession>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodically flush scrollback to disk
    this.flushTimer = setInterval(() => this.flushAllScrollback(), FLUSH_INTERVAL_MS);
  }

  create(config: SessionConfig): TerminalSessionInfo {
    const sessionId = randomUUID();
    const { command, args } = resolveCommand(config.instanceType);
    const cols = config.cols ?? 120;
    const rows = config.rows ?? 30;

    const ptyProcess = pty.spawn(command, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: config.projectPath,
      env: { ...process.env, FORCE_COLOR: "1" } as Record<string, string>,
      useConpty: true,
    });

    const scrollback = new ScrollbackBuffer();
    const dataListeners = new Set<(data: string) => void>();
    const exitListeners = new Set<(code: number) => void>();

    const session: ManagedSession = {
      sessionId,
      projectId: config.projectId,
      instanceType: config.instanceType,
      pty: ptyProcess,
      scrollback,
      dataListeners,
      exitListeners,
      createdAt: new Date().toISOString(),
      alive: true,
      lastOutputAt: Date.now(),
    };

    ptyProcess.onData((data) => {
      scrollback.append(data);
      session.lastOutputAt = Date.now();
      for (const listener of dataListeners) {
        listener(data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      session.alive = false;
      for (const listener of exitListeners) {
        listener(exitCode);
      }
    });

    this.sessions.set(sessionId, session);
    return this.toInfo(session);
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.alive) {
      session.pty.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session?.alive) {
      session.pty.resize(cols, rows);
    }
  }

  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Save scrollback before killing
    await this.flushScrollback(session);

    if (session.alive) {
      const pid = session.pty.pid;
      // Windows: kill entire process tree
      await new Promise<void>((resolve) => {
        execFile("taskkill", ["/pid", String(pid), "/T", "/F"], () => resolve());
      });
      session.alive = false;
    }

    session.dataListeners.clear();
    session.exitListeners.clear();
    this.sessions.delete(sessionId);
  }

  getScrollback(sessionId: string): string {
    return this.sessions.get(sessionId)?.scrollback.getContents() ?? "";
  }

  onData(sessionId: string, cb: (data: string) => void): () => void {
    const session = this.sessions.get(sessionId);
    if (!session) return () => {};
    session.dataListeners.add(cb);
    return () => session.dataListeners.delete(cb);
  }

  onExit(sessionId: string, cb: (code: number) => void): () => void {
    const session = this.sessions.get(sessionId);
    if (!session) return () => {};
    session.exitListeners.add(cb);
    return () => session.exitListeners.delete(cb);
  }

  get(sessionId: string): TerminalSessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toInfo(session) : undefined;
  }

  list(): TerminalSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => this.toInfo(s));
  }

  listForProject(projectId: string): TerminalSessionInfo[] {
    return Array.from(this.sessions.values())
      .filter((s) => s.projectId === projectId)
      .map((s) => this.toInfo(s));
  }

  async dispose(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    const ids = Array.from(this.sessions.keys());
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  private async flushScrollback(session: ManagedSession): Promise<void> {
    const contents = session.scrollback.getContents();
    if (!contents) return;
    try {
      await fs.mkdir(SCROLLBACK_DIR, { recursive: true });
      await fs.writeFile(
        path.join(SCROLLBACK_DIR, `${session.sessionId}.txt`),
        contents,
        "utf8",
      );
    } catch {
      // Non-critical — silently ignore write failures
    }
  }

  private async flushAllScrollback(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.scrollback.getByteSize() > 0) {
        await this.flushScrollback(session);
      }
    }
  }

  getRssKb(sessionId: string): number | null {
    const session = this.sessions.get(sessionId);
    if (!session?.alive) return null;
    try {
      const raw = execSync(
        `tasklist /fi "PID eq ${session.pty.pid}" /fo csv /nh`,
        { encoding: "utf8", timeout: 3000 },
      );
      // Parse CSV: "name","pid","session","sessionname","mem usage"
      // e.g. "cmd.exe","1234","Console","1","12,345 K"
      const match = raw.match(/"([0-9,]+)\s*K"/);
      if (match) {
        return parseInt(match[1].replace(/,/g, ""), 10);
      }
      return null;
    } catch {
      return null;
    }
  }

  private toInfo(s: ManagedSession): TerminalSessionInfo {
    return {
      sessionId: s.sessionId,
      projectId: s.projectId,
      instanceType: s.instanceType,
      pid: s.pty.pid,
      createdAt: s.createdAt,
      alive: s.alive,
      lastOutputAt: s.lastOutputAt,
    };
  }
}
