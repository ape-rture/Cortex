import { promises as fs } from "node:fs";
import path from "node:path";
import { ConfigRouter } from "./routing.js";
import type {
  ContentSeed,
  ContentSeedExtractor,
  SeedExtractorConfig,
  SeedExtractorInput,
} from "./types/content.js";
import { DEFAULT_SEED_EXTRACTOR_CONFIG } from "./types/content.js";
import { nextSeedId } from "../utils/markdown.js";
import { wrapUntrusted } from "./security/untrusted-content.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "content-extractor.md");

interface RawSeed {
  insight: string;
  confidence: number;
  suggested_angles?: string[];
  suggested_format?: string;
  reasoning?: string;
}

function parseJsonPayload(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return undefined;

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

function buildExtractionPrompt(input: SeedExtractorInput, config: SeedExtractorConfig): string {
  const lines: string[] = [];
  lines.push(`Source type: ${input.source}`);
  if (input.sourceRef) lines.push(`Source reference: ${input.sourceRef}`);
  if (input.contactRef) lines.push(`Contact: ${input.contactRef}`);
  lines.push(`Max seeds: ${config.maxSeeds}`);
  lines.push(`Min confidence: ${config.minConfidence}`);
  lines.push("");
  lines.push("Text to extract from:");
  lines.push(wrapUntrusted(input.text, input.source));
  return lines.join("\n");
}

export class LLMContentSeedExtractor implements ContentSeedExtractor {
  private readonly router: ConfigRouter;
  private readonly promptPath: string;
  private promptCache?: string;

  constructor(router: ConfigRouter, promptPath: string = DEFAULT_PROMPT_PATH) {
    this.router = router;
    this.promptPath = promptPath;
  }

  async extractSeeds(
    input: SeedExtractorInput,
    config?: Partial<SeedExtractorConfig>,
  ): Promise<readonly ContentSeed[]> {
    const cfg: SeedExtractorConfig = { ...DEFAULT_SEED_EXTRACTOR_CONFIG, ...config };
    const systemPrompt = await this.loadPrompt();
    const userPrompt = buildExtractionPrompt(input, cfg);

    const response = await this.router.route({
      task_type: "content_drafting",
      system_prompt: systemPrompt,
      prompt: userPrompt,
    });

    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const parsed = parseJsonPayload(response.content);
    if (!parsed || !Array.isArray(parsed.seeds)) return [];

    const rawSeeds = parsed.seeds as RawSeed[];
    const existingSeeds: ContentSeed[] = [];

    return rawSeeds
      .filter((raw) => raw.confidence >= cfg.minConfidence)
      .slice(0, cfg.maxSeeds)
      .map((raw) => {
        const id = nextSeedId(existingSeeds, date);
        const seed: ContentSeed = {
          id,
          insight: raw.insight,
          source: input.source,
          sourceRef: input.sourceRef,
          contactRef: input.contactRef,
          suggestedAngles: raw.suggested_angles,
          capturedAt: now,
          promoted: false,
        };
        existingSeeds.push(seed);
        return seed;
      });
  }

  private async loadPrompt(): Promise<string> {
    if (!this.promptCache) {
      this.promptCache = await fs.readFile(this.promptPath, "utf8");
    }
    return this.promptCache;
  }
}
