export type InstanceType = "claude" | "codex" | "shell";

export interface TerminalSessionInfo {
  sessionId: string;
  projectId: string;
  instanceType: InstanceType;
  pid: number;
  createdAt: string;
  alive: boolean;
  lastOutputAt: number; // Date.now() timestamp
}

export interface CreateSessionRequest {
  projectId: string;
  instanceType: InstanceType;
  cols?: number;
  rows?: number;
}

export interface WorkspaceConfig {
  version: 1;
  projects: WorkspaceProjectConfig[];
}

export interface WorkspaceProjectConfig {
  projectId: string;
  instances: WorkspaceInstanceConfig[];
}

export interface WorkspaceInstanceConfig {
  instanceType: InstanceType;
  label?: string;
  claudeSessionId?: string;
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  relativeDate: string;
}

// WebSocket protocol — client → server
export type WsClientMessage =
  | { type: "attach"; sessionId: string }
  | { type: "input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "detach" };

// WebSocket protocol — server → client
export type WsServerMessage =
  | { type: "output"; sessionId: string; data: string }
  | { type: "scrollback"; sessionId: string; data: string }
  | { type: "session_ended"; sessionId: string; exitCode: number }
  | { type: "error"; message: string };
