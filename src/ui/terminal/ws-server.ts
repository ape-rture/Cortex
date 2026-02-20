import { WebSocketServer, WebSocket } from "ws";
import type { TerminalSessionManager } from "./terminal-session-manager.js";
import type { WsClientMessage, WsServerMessage } from "./types.js";

interface UpgradeableServer {
  on(event: "upgrade", listener: (request: any, socket: any, head: Buffer) => void): this;
}

function sendJson(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createTerminalWsServer(
  httpServer: UpgradeableServer,
  sessionManager: TerminalSessionManager,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);
    if (url.pathname === "/ws/terminal") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
    // Ignore non-terminal upgrade requests (let other handlers deal with them)
  });

  wss.on("connection", (ws) => {
    let attachedSessionId: string | null = null;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

    function detach(): void {
      unsubData?.();
      unsubExit?.();
      unsubData = null;
      unsubExit = null;
      attachedSessionId = null;
    }

    function attachSession(sessionId: string): boolean {
      if (attachedSessionId === sessionId) {
        return true;
      }

      detach();

      const session = sessionManager.get(sessionId);
      if (!session) {
        sendJson(ws, { type: "error", message: `Session ${sessionId} not found` });
        return false;
      }

      attachedSessionId = sessionId;

      // Send existing scrollback
      const scrollback = sessionManager.getScrollback(sessionId);
      if (scrollback) {
        sendJson(ws, { type: "scrollback", sessionId, data: scrollback });
      }

      // Stream live output
      unsubData = sessionManager.onData(sessionId, (data) => {
        sendJson(ws, { type: "output", sessionId, data });
      });

      // Notify on exit
      unsubExit = sessionManager.onExit(sessionId, (exitCode) => {
        sendJson(ws, { type: "session_ended", sessionId, exitCode });
      });

      return true;
    }

    ws.on("message", (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendJson(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      switch (msg.type) {
        case "attach": {
          attachSession(msg.sessionId);
          break;
        }

        case "input": {
          // If attach raced or was dropped during reconnect, recover by attaching
          // lazily on first input.
          if (attachSession(msg.sessionId)) {
            sessionManager.write(msg.sessionId, msg.data);
          }
          break;
        }

        case "resize": {
          // Same recovery path as input to avoid dropping resize events.
          if (attachSession(msg.sessionId)) {
            sessionManager.resize(msg.sessionId, msg.cols, msg.rows);
          }
          break;
        }

        case "detach": {
          detach();
          break;
        }
      }
    });

    ws.on("close", () => {
      detach();
    });
  });

  return wss;
}
