import { useEffect, useRef } from "preact/hooks";

/**
 * Connect to an SSE endpoint with typed event handlers.
 * Auto-reconnects via EventSource built-in behavior.
 */
export function useSSE(
  url: string | null,
  handlers: Record<string, (data: unknown) => void>,
  deps: unknown[] = [],
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;

    const es = new EventSource(url);

    for (const event of Object.keys(handlersRef.current)) {
      es.addEventListener(event, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handlersRef.current[event]?.(data);
        } catch {
          // Ignore parse errors
        }
      });
    }

    return () => {
      es.close();
    };
  }, [url, ...deps]);
}
