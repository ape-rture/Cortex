export type SessionStatus =
  | "queued"
  | "spawning"
  | "working"
  | "pr_open"
  | "ci_running"
  | "ci_failed"
  | "review_pending"
  | "changes_requested"
  | "approved"
  | "mergeable"
  | "merging"
  | "merged"
  | "quality_gates"
  | "done"
  | "failed";

export interface SessionSignals {
  readonly spawned?: boolean;
  readonly agentAlive?: boolean;
  readonly hasAgentOutput?: boolean;
  readonly prUrl?: string;
  readonly ciStatus?: "unknown" | "pending" | "running" | "failed" | "passed";
  readonly reviewStatus?: "none" | "pending" | "changes_requested" | "approved";
  readonly mergeable?: boolean;
  readonly mergeInProgress?: boolean;
  readonly merged?: boolean;
  readonly qualityGateStatus?: "pending" | "passed" | "failed";
  readonly taskDone?: boolean;
  readonly fatalError?: string;
}

export interface SessionTransition {
  readonly from: SessionStatus;
  readonly to: SessionStatus;
  readonly signals: SessionSignals;
}

function waitDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTerminalStatus(status: SessionStatus): boolean {
  return status === "done" || status === "failed";
}

export function determineStatus(previous: SessionStatus, signals: SessionSignals): SessionStatus {
  if (signals.fatalError) return "failed";

  if (signals.taskDone) return "done";

  if (signals.qualityGateStatus === "failed") return "failed";
  if (signals.qualityGateStatus === "passed") return "done";
  if (signals.qualityGateStatus === "pending") return "quality_gates";

  if (signals.merged) return "merged";
  if (signals.mergeInProgress) return "merging";

  if (signals.mergeable && signals.reviewStatus === "approved") return "mergeable";
  if (signals.reviewStatus === "approved") return "approved";
  if (signals.reviewStatus === "changes_requested") return "changes_requested";
  if (signals.reviewStatus === "pending") return "review_pending";

  if (signals.ciStatus === "failed") return "ci_failed";
  if (signals.ciStatus === "pending" || signals.ciStatus === "running") return "ci_running";

  if (signals.prUrl && signals.prUrl.trim().length > 0) return "pr_open";

  if (signals.agentAlive || signals.hasAgentOutput) return "working";
  if (signals.spawned) return "spawning";

  return previous;
}

interface SessionLifecyclePollerDeps {
  readonly waitImpl?: (ms: number) => Promise<void>;
}

export class SessionLifecyclePoller {
  private polling = false;
  private readonly waitImpl: (ms: number) => Promise<void>;

  constructor(
    private readonly intervalMs = 30_000,
    deps: SessionLifecyclePollerDeps = {},
  ) {
    this.waitImpl = deps.waitImpl ?? waitDefault;
  }

  get isPolling(): boolean {
    return this.polling;
  }

  async pollUntilTerminal(
    initial: SessionStatus,
    probe: () => Promise<SessionSignals>,
    onTransition?: (transition: SessionTransition) => void,
  ): Promise<SessionStatus> {
    if (this.polling) {
      throw new Error("Session lifecycle polling already active");
    }

    this.polling = true;
    let current = initial;

    try {
      while (!isTerminalStatus(current)) {
        const signals = await probe();
        const next = determineStatus(current, signals);

        if (next !== current && onTransition) {
          onTransition({ from: current, to: next, signals });
        }

        current = next;
        if (isTerminalStatus(current)) return current;

        await this.waitImpl(this.intervalMs);
      }

      return current;
    } finally {
      this.polling = false;
    }
  }
}
