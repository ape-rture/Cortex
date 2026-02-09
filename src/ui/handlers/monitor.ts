import type { Hono } from "hono";
import type { MonitorBroker, MonitorEvent } from "../monitor-broker.js";

function encode(event: MonitorEvent): Uint8Array {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export function registerMonitorHandlers(app: Hono, broker: MonitorBroker): void {
  app.get("/api/monitor/stream", (c) => {
    const once = c.req.query("once") === "1";

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendHeartbeat = () => {
          controller.enqueue(
            encode({ type: "heartbeat", data: { ok: true }, timestamp: new Date().toISOString() }),
          );
        };

        sendHeartbeat();
        if (once) {
          controller.close();
          return;
        }

        const unsubscribe = broker.subscribe((event) => {
          controller.enqueue(encode(event));
        });

        const heartbeat = setInterval(() => {
          sendHeartbeat();
        }, 15_000);

        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });
}
