import { useState, useEffect, useRef, useCallback } from "preact/hooks";

export interface UseWebSocketResult {
  connected: boolean;
  send: (msg: unknown) => void;
}

export function useWebSocket(
  path: string | null,
  onMessage: (data: unknown) => void,
  deps: unknown[] = [],
): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!path) return;

    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}${path}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryDelay = 1000; // reset backoff
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          onMessageRef.current(data);
        } catch {
          // ignore unparseable messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!disposed) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000);
            connect();
          }, retryDelay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [path, ...deps]);

  return { connected, send };
}
