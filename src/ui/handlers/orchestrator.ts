import type { Hono } from "hono";
import type { Orchestrator, Trigger } from "../../core/types/orchestrator.js";
import type { AgentEvent } from "../../core/types/events.js";
import type { CycleStore } from "../cycle-store.js";
import { summarizeCycle } from "../cycle-store.js";
import type { MonitorBroker } from "../monitor-broker.js";
import { jsonError } from "../utils.js";

interface TriggerRequest {
  readonly agents?: string[];
}

function mapEventType(event: AgentEvent): "agent_started" | "agent_action" | "agent_completed" {
  if (event.type === "started") return "agent_started";
  if (event.type === "action") return "agent_action";
  return "agent_completed";
}

export function registerOrchestratorHandlers(
  app: Hono,
  orchestrator: Orchestrator,
  cycleStore: CycleStore,
  monitorBroker: MonitorBroker,
): void {
  orchestrator.onEvent((event) => {
    monitorBroker.publish(mapEventType(event), event);
  });

  app.post("/api/orchestrate/trigger", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as TriggerRequest;
    const agents = body.agents?.filter(Boolean) ?? [];

    const trigger: Trigger = {
      type: "cli",
      agents: agents.length > 0
        ? agents
        : ["sales-watcher", "content-scanner", "code-watcher"],
    };

    try {
      const cycle = await orchestrator.runCycle(trigger);
      cycleStore.add(cycle);
      monitorBroker.publish("cycle_complete", summarizeCycle(cycle));
      return c.json({ cycle_id: cycle.cycle_id, status: "completed" });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown orchestrator error";
      return jsonError(c, error, 500);
    }
  });
}
