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
          // Detach from previous session if any
          detach();

          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            sendJson(ws, { type: "error", message: `Session ${msg.sessionId} not found` });
            return;
          }

          attachedSessionId = msg.sessionId;

          // Send existing scrollback
          const scrollback = sessionManager.getScrollback(msg.sessionId);
          if (scrollback) {
            sendJson(ws, { type: "scrollback", sessionId: msg.sessionId, data: scrollback });
          }

          // Stream live output
          unsubData = sessionManager.onData(msg.sessionId, (data) => {
            sendJson(ws, { type: "output", sessionId: msg.sessionId, data });
          });

          // Notify on exit
          unsubExit = sessionManager.onExit(msg.sessionId, (exitCode) => {
            sendJson(ws, { type: "session_ended", sessionId: msg.sessionId, exitCode });
          });
          break;
        }

        case "input": {
          if (attachedSessionId && attachedSessionId === msg.sessionId) {
            sessionManager.write(msg.sessionId, msg.data);
          }
          break;
        }

        case "resize": {
          if (attachedSessionId && attachedSessionId === msg.sessionId) {
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
