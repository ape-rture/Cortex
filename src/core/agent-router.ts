import { promises as fs } from "node:fs";
import type { OrchestratorConfig } from "./types/orchestrator.js";
import type {
  AgentAffinity,
  AgentRouteConfig,
  AgentRouteRequest,
  AgentRouteResult,
  AgentRouter,
  TaskType,
} from "./types/routing.js";

const DEFAULT_CONFIG_PATH = "context/orchestrator.json";

const TASK_TYPES: readonly TaskType[] = [
  "quick_capture",
  "meeting_summary",
  "complex_reasoning",
  "code_generation",
  "code_review",
  "content_drafting",
  "research_analysis",
  "classification",
  "bulk_ops",
  "security_audit",
  "vibe_coding",
];

function toRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = "^" + escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$";
  return new RegExp(regex, "i");
}

function matchesPattern(value: string, pattern: string): boolean {
  return toRegex(pattern).test(value);
}

function priorityOf(affinity: AgentAffinity): number {
  return Number.isFinite(affinity.priority) ? affinity.priority : 0;
}

function pickHighestPriority(affinities: readonly AgentAffinity[]): AgentAffinity | undefined {
  let best: AgentAffinity | undefined;
  for (const affinity of affinities) {
    if (!best) {
      best = affinity;
      continue;
    }
    if (priorityOf(affinity) > priorityOf(best)) {
      best = affinity;
    }
  }
  return best;
}

function classifyTaskType(prompt: string): TaskType {
  const text = prompt.toLowerCase();
  const rules: Array<{ match: RegExp; type: TaskType }> = [
    { match: /\b(meeting|minutes|summary|transcript|granola)\b/, type: "meeting_summary" },
    { match: /\b(code|bug|error|stacktrace|refactor|typescript|node)\b/, type: "code_generation" },
    { match: /\b(review|critique|audit|security)\b/, type: "code_review" },
    { match: /\b(thread|post|draft|content|tweet|linkedin)\b/, type: "content_drafting" },
    { match: /\b(classify|route|routing|triage)\b/, type: "classification" },
    { match: /\b(research|analysis|analyze)\b/, type: "research_analysis" },
  ];

  for (const rule of rules) {
    if (rule.match.test(text)) {
      return rule.type;
    }
  }

  return "complex_reasoning";
}

function normalizeConfig(config: AgentRouteConfig): AgentRouteConfig {
  return {
    affinities: config.affinities ?? [],
    default_agent: config.default_agent,
    user_directives: config.user_directives ?? {},
  };
}

export class ConfigAgentRouter implements AgentRouter {
  private readonly configPath: string;
  private config: AgentRouteConfig | null = null;

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
  }

  async reloadConfig(): Promise<void> {
    const raw = await fs.readFile(this.configPath, "utf8");
    const parsed = JSON.parse(raw) as OrchestratorConfig;
    if (!parsed.agent_routing) {
      throw new Error(`Missing "agent_routing" in ${this.configPath}`);
    }
    this.config = normalizeConfig(parsed.agent_routing);
  }

  async resolve(request: AgentRouteRequest): Promise<AgentRouteResult> {
    if (!this.config) {
      await this.reloadConfig();
    }
    if (!this.config) {
      throw new Error("Agent routing config not loaded");
    }

    const directiveMatch = this.resolveDirective(request.user_directive);
    if (directiveMatch) {
      return {
        agent: directiveMatch,
        reason: "user_directive",
      };
    }

    const contextMatch = this.resolveContextMatch(request);
    if (contextMatch) {
      return {
        agent: contextMatch.agent,
        reason: "context_match",
        matched_affinity: contextMatch,
      };
    }

    const taskType = request.task_type ?? classifyTaskType(request.prompt);
    const affinityMatch = this.resolveTaskAffinity(taskType);
    if (affinityMatch) {
      return {
        agent: affinityMatch.agent,
        reason: "task_affinity",
        matched_affinity: affinityMatch,
      };
    }

    return {
      agent: this.config.default_agent,
      reason: "default",
    };
  }

  private resolveDirective(userDirective: string | undefined): string | undefined {
    if (!this.config || !userDirective) return undefined;
    const directives = this.config.user_directives ?? {};
    const normalizedInput = userDirective.trim().toLowerCase();
    if (!normalizedInput) return undefined;

    let matchedAgent: string | undefined;
    let longestPrefix = -1;

    for (const [prefix, agent] of Object.entries(directives)) {
      const normalizedPrefix = prefix.trim().toLowerCase();
      if (!normalizedPrefix) continue;
      const startsWithPrefix = normalizedInput === normalizedPrefix
        || normalizedInput.startsWith(`${normalizedPrefix} `);
      if (!startsWithPrefix) continue;
      if (normalizedPrefix.length > longestPrefix) {
        matchedAgent = agent;
        longestPrefix = normalizedPrefix.length;
      }
    }

    return matchedAgent;
  }

  private resolveContextMatch(request: AgentRouteRequest): AgentAffinity | undefined {
    if (!this.config) return undefined;
    const contextValues = [
      ...(request.touches_files ?? []),
      ...(request.context_key ? [request.context_key] : []),
    ];
    if (contextValues.length === 0) return undefined;

    const candidates = this.config.affinities.filter((affinity) => {
      if (!affinity.context_match) return false;
      return contextValues.some((value) => matchesPattern(value, affinity.context_match!));
    });

    return pickHighestPriority(candidates);
  }

  private resolveTaskAffinity(taskType: TaskType): AgentAffinity | undefined {
    if (!this.config) return undefined;
    const candidates = this.config.affinities.filter((affinity) => affinity.task_types.includes(taskType));
    return pickHighestPriority(candidates);
  }
}

export function isTaskType(value: string): value is TaskType {
  return TASK_TYPES.includes(value as TaskType);
}
