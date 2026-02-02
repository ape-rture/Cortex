import { promises as fs } from "node:fs";
import path from "node:path";
import { Anthropic } from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  DataClassConfig,
  ModelRef,
  Provider,
  RouteRequest,
  RouteResponse,
  Router,
  RoutingConfig,
  TaskType,
} from "./types/routing.js";
import { appendToFile } from "../utils/markdown.js";

const DEFAULT_CONFIG_PATH = path.resolve("context", "model-routing.json");
const DEFAULT_LOG_PATH = path.resolve("context", "model-performance.md");

type ProviderClients = {
  anthropic?: Anthropic;
  openai?: OpenAI;
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseModelRef(modelRef: ModelRef): { provider: Provider; modelKey: string } {
  const [provider, modelKey] = modelRef.split(":") as [Provider, string];
  return { provider, modelKey };
}

function toRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = "^" + escaped.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$";
  return new RegExp(regex, "i");
}

function matchesAnyPattern(pathValue: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => toRegex(pattern).test(pathValue));
}

function detectDataClasses(
  touches: readonly string[] | undefined,
  dataClasses: Record<string, DataClassConfig>,
): string[] {
  if (!touches || touches.length === 0) return [];
  const matched: string[] = [];
  for (const [name, config] of Object.entries(dataClasses)) {
    const examples = config.examples ?? [];
    if (touches.some((item) => matchesAnyPattern(item, examples))) {
      matched.push(name);
    }
  }
  return matched;
}

function buildSystemPrompt(systemPrompt?: string): string | undefined {
  if (!systemPrompt) return undefined;
  return systemPrompt.trim().length > 0 ? systemPrompt : undefined;
}

function basicClassifier(prompt: string): { task_type: TaskType; confidence: number } {
  const text = prompt.toLowerCase();
  const rules: Array<{ match: RegExp; type: TaskType }> = [
    { match: /\b(meeting|minutes|summary|transcript|granola)\b/, type: "meeting_summary" },
    { match: /\b(code|bug|error|stacktrace|refactor|typescript|node)\b/, type: "code_generation" },
    { match: /\b(review|critique|audit|security)\b/, type: "code_review" },
    { match: /\b(thread|post|draft|content|tweet|linkedin)\b/, type: "content_drafting" },
    { match: /\b(classify|route|routing|triage)\b/, type: "classification" },
  ];

  for (const rule of rules) {
    if (rule.match.test(text)) {
      return { task_type: rule.type, confidence: 0.6 };
    }
  }

  return { task_type: "complex_reasoning", confidence: 0.3 };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractAnthropicText(response: any): string {
  if (!response) return "";
  if (Array.isArray(response.content)) {
    return response.content
      .map((item: any) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function extractOpenAiText(response: any): string {
  if (!response) return "";
  if (typeof response.output_text === "string") return response.output_text.trim();
  const output = response.output;
  if (Array.isArray(output)) {
    const chunks = output
      .map((item: any) => item?.content)
      .flat()
      .filter((entry: any) => entry?.type === "output_text")
      .map((entry: any) => entry?.text ?? "")
      .join("");
    if (chunks) return chunks.trim();
  }
  return "";
}

function usageFromOpenAi(response: any): { input_tokens: number; output_tokens: number } {
  const usage = response?.usage ?? {};
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  };
}

function usageFromAnthropic(response: any): { input_tokens: number; output_tokens: number } {
  const usage = response?.usage ?? {};
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  };
}

async function appendPerformanceLog(
  logPath: string,
  params: {
    taskType: TaskType;
    provider: Provider;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    success: boolean;
    notes?: string;
  },
): Promise<void> {
  const row = `| ${nowIso()} | ${params.taskType} | ${params.provider} | ${params.model} | ${params.inputTokens} | ${params.outputTokens} | ${params.latencyMs} | ${params.success ? "yes" : "no"} |  | ${params.notes ?? ""} |`;
  await appendToFile(logPath, `${row}\n`);
}

export class ConfigRouter implements Router {
  private readonly configPath: string;
  private config: RoutingConfig | null = null;
  private readonly clients: ProviderClients;

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
    this.clients = {
      anthropic: process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : undefined,
      openai: process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : undefined,
    };
  }

  async reloadConfig(): Promise<void> {
    const raw = await fs.readFile(this.configPath, "utf8");
    this.config = JSON.parse(raw) as RoutingConfig;
  }

  async classify(prompt: string): Promise<{ task_type: TaskType; confidence: number }> {
    if (!this.config) await this.reloadConfig();
    const classifier = (this.config as unknown as { classifier?: { enabled: boolean; model: string } })?.classifier;
    if (!classifier || !classifier.enabled) {
      return basicClassifier(prompt);
    }

    const modelKey = classifier.model;
    const provider = this.resolveProviderForModel(modelKey);
    if (!provider) {
      return basicClassifier(prompt);
    }

    // For now, use basic heuristic even when classifier is enabled.
    // Replace with model-based classification when local provider is available.
    return basicClassifier(prompt);
  }

  async route(request: RouteRequest): Promise<RouteResponse> {
    if (!this.config) await this.reloadConfig();
    if (!this.config) throw new Error("Routing config not loaded");

    const taskType = request.task_type
      ? request.task_type
      : (await this.classify(request.prompt)).task_type;

    const route = this.config.routes[taskType];
    if (!route) throw new Error(`No route for task type: ${taskType}`);

    const primary = request.user_override ?? route.primary;
    const fallback = request.user_override ? [] : route.fallback;
    const touches = request.touches_files ?? [];
    const matchedClasses = detectDataClasses(touches, this.config.data_classes);
    const policyViolation = this.checkPolicyRules(matchedClasses, primary);
    if (policyViolation) {
      throw new Error(policyViolation);
    }

    const { content, modelUsed, usedFallback, usage, latencyMs } = await this.executeWithFallback({
      taskType,
      systemPrompt: buildSystemPrompt(request.system_prompt),
      prompt: request.prompt,
      maxTokens: request.max_tokens,
      primary,
      fallback,
    });

    await appendPerformanceLog(DEFAULT_LOG_PATH, {
      taskType,
      provider: modelUsed.provider,
      model: modelUsed.apiModelId,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      latencyMs,
      success: true,
    });

    return {
      model_used: modelUsed.ref,
      used_fallback: usedFallback,
      content,
      usage,
      latency_ms: latencyMs,
    };
  }

  private resolveProviderForModel(modelKey: string): Provider | null {
    if (!this.config) return null;
    for (const provider of Object.keys(this.config.providers) as Provider[]) {
      const providerConfig = this.config.providers[provider];
      if (providerConfig?.models && providerConfig.models[modelKey]) return provider;
    }
    return null;
  }

  private checkPolicyRules(matchedClasses: readonly string[], modelRef: ModelRef): string | undefined {
    if (!this.config || matchedClasses.length === 0) return undefined;
    for (const rule of this.config.policy_rules) {
      const intersects = rule.match.data_classes.some((item) => matchedClasses.includes(item));
      if (!intersects) continue;
      const { provider } = parseModelRef(modelRef);
      if (!rule.allowed_providers.includes(provider)) {
        return `Policy violation: ${rule.id} requires local-only routing`;
      }
    }
    return undefined;
  }

  private async executeWithFallback(params: {
    taskType: TaskType;
    systemPrompt?: string;
    prompt: string;
    maxTokens?: number;
    primary: ModelRef;
    fallback: readonly ModelRef[];
  }): Promise<{
    content: string;
    modelUsed: { ref: ModelRef; provider: Provider; apiModelId: string };
    usedFallback: boolean;
    usage: { input_tokens: number; output_tokens: number };
    latencyMs: number;
  }> {
    const candidates: ModelRef[] = [params.primary, ...params.fallback];
    let lastError: unknown;

    for (let i = 0; i < candidates.length; i += 1) {
      const modelRef = candidates[i];
      const { provider, modelKey } = parseModelRef(modelRef);
      const providerConfig = this.config?.providers[provider];
      if (!providerConfig?.enabled) {
        lastError = new Error(`Provider disabled: ${provider}`);
        continue;
      }
      const modelConfig = providerConfig.models[modelKey];
      if (!modelConfig?.api_model_id) {
        lastError = new Error(`Missing model id for ${modelRef}`);
        continue;
      }

      try {
        const start = Date.now();
        const result = await withTimeout(
          this.callProvider({
            provider,
            apiModelId: modelConfig.api_model_id,
            prompt: params.prompt,
            systemPrompt: params.systemPrompt,
            maxTokens: params.maxTokens,
          }),
          this.config?.fallback_rules.on_timeout_ms ?? 45000,
        );
        const latencyMs = Date.now() - start;

        return {
          content: result.content,
          modelUsed: { ref: modelRef, provider, apiModelId: modelConfig.api_model_id },
          usedFallback: i > 0,
          usage: result.usage,
          latencyMs,
        };
      } catch (err) {
        lastError = err;
        await appendPerformanceLog(DEFAULT_LOG_PATH, {
          taskType: params.taskType,
          provider,
          model: modelConfig?.api_model_id ?? modelRef,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          success: false,
          notes: err instanceof Error ? err.message : "error",
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error("All routing attempts failed");
  }

  private async callProvider(params: {
    provider: Provider;
    apiModelId: string;
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
  }): Promise<{ content: string; usage: { input_tokens: number; output_tokens: number } }> {
    if (params.provider === "anthropic") {
      if (!this.clients.anthropic) throw new Error("Missing ANTHROPIC_API_KEY");
      const response = await this.clients.anthropic.messages.create({
        model: params.apiModelId,
        max_tokens: params.maxTokens ?? 1024,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.prompt }],
      });
      return {
        content: extractAnthropicText(response),
        usage: usageFromAnthropic(response),
      };
    }

    if (params.provider === "openai") {
      if (!this.clients.openai) throw new Error("Missing OPENAI_API_KEY");
      const input = params.systemPrompt
        ? [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.prompt },
          ]
        : params.prompt;
      const response = await this.clients.openai.responses.create({
        model: params.apiModelId,
        input,
        max_output_tokens: params.maxTokens ?? 1024,
      });
      return {
        content: extractOpenAiText(response),
        usage: usageFromOpenAi(response),
      };
    }

    throw new Error(`Provider not supported: ${params.provider}`);
  }
}
