export type MonitorEventType =
  | "agent_started"
  | "agent_action"
  | "agent_completed"
  | "cycle_complete"
  | "heartbeat";

export interface MonitorEvent {
  readonly type: MonitorEventType;
  readonly data: unknown;
  readonly timestamp: string;
}

export type MonitorListener = (event: MonitorEvent) => void;

function nowIso(): string {
  return new Date().toISOString();
}

export class MonitorBroker {
  private readonly listeners = new Set<MonitorListener>();

  publish(type: MonitorEventType, data: unknown): void {
    const event: MonitorEvent = {
      type,
      data,
      timestamp: nowIso(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors.
      }
    }
  }

  subscribe(listener: MonitorListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}
