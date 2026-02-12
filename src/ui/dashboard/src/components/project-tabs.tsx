import type { InstanceType } from "../types";

type ActivityState = "active" | "idle" | "exited";

const ACTIVITY_THRESHOLD_MS = 30_000; // 30 seconds without output = idle

interface InstanceStatus {
  instanceType: InstanceType;
  alive: boolean;
  lastOutputAt: number;
}

interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  gitCommit?: string | null;
  instances?: InstanceStatus[];
}

interface ProjectTabsProps {
  projects: ProjectInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

const TYPE_SHORT: Record<InstanceType, string> = {
  claude: "C",
  codex: "X",
  shell: "S",
};

const TYPE_LABEL: Record<InstanceType, string> = {
  claude: "Claude",
  codex: "Codex",
  shell: "Shell",
};

const STATE_LABEL: Record<ActivityState, string> = {
  active: "working",
  idle: "idle",
  exited: "done",
};

function getActivity(inst: InstanceStatus): ActivityState {
  if (!inst.alive) return "exited";
  if (Date.now() - inst.lastOutputAt < ACTIVITY_THRESHOLD_MS) return "active";
  return "idle";
}

export function ProjectTabs({ projects, activeId, onSelect }: ProjectTabsProps) {
  if (projects.length === 0) {
    return (
      <div class="workspace-project-tabs">
        <div style={{ padding: "8px 16px", color: "var(--text-secondary)", fontSize: "13px" }}>
          No active projects found. Add projects to the registry first.
        </div>
      </div>
    );
  }

  return (
    <div class="workspace-project-tabs">
      {projects.map((p) => {
        const instances = p.instances ?? [];
        const states = instances.map(getActivity);
        const anyActive = states.includes("active");
        const allExited = instances.length > 0 && states.every((s) => s === "exited");
        const allIdle = instances.length > 0 && states.every((s) => s === "idle");

        let badgeClass = "";
        let badgeText = "";
        if (anyActive) { badgeClass = "active"; badgeText = "working"; }
        else if (allIdle) { badgeClass = "idle"; badgeText = "idle"; }
        else if (allExited) { badgeClass = "done"; badgeText = "done"; }

        return (
          <button
            key={p.id}
            class={`project-tab${activeId === p.id ? " active" : ""}`}
            onClick={() => onSelect(p.id)}
            title={p.path}
          >
            <div class="project-tab-top">
              <span class="project-tab-name">{p.name}</span>
              {instances.length > 0 && (
                <span class="project-tab-instances">
                  {instances.map((inst, i) => {
                    const state = states[i];
                    return (
                      <span
                        key={i}
                        class={`project-tab-dot ${state}`}
                        title={`${TYPE_LABEL[inst.instanceType]}: ${STATE_LABEL[state]}`}
                      >
                        {TYPE_SHORT[inst.instanceType]}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
            {p.gitCommit && <span class="project-tab-commit">{p.gitCommit}</span>}
            {badgeText && <span class={`project-tab-badge ${badgeClass}`}>{badgeText}</span>}
          </button>
        );
      })}
    </div>
  );
}
