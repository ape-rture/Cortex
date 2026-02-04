import { promises as fs } from "node:fs";
import path from "node:path";
import { ConfigRouter } from "./routing.js";
import type {
  PodcastDistributionGenerator,
  PodcastDistributionPack,
  PodcastEpisode,
} from "./types/content.js";

const DEFAULT_PROMPT_PATH = path.resolve("src", "agents", "prompts", "podcast-distribution.md");

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

function buildEpisodePrompt(episode: PodcastEpisode): string {
  const lines: string[] = [];
  lines.push(`EPISODE TITLE: ${episode.title}`);
  lines.push("");
  lines.push("GUEST:");
  lines.push(`- Name: ${episode.guestName}`);
  if (episode.guestHandle) lines.push(`- X: ${episode.guestHandle}`);
  if (episode.guestCompany) lines.push(`- Company: ${episode.guestCompany}`);
  if (episode.guestCompanyHandle) lines.push(`- Company X: ${episode.guestCompanyHandle}`);
  if (episode.guestWebsite) lines.push(`- Website: ${episode.guestWebsite}`);
  lines.push("");
  lines.push("NOTES:");
  lines.push(episode.notes);
  lines.push("");
  if (episode.links.length > 0) {
    lines.push("LINKS:");
    for (const link of episode.links) {
      lines.push(`- ${link}`);
    }
  }
  return lines.join("\n");
}

export class LLMPodcastDistributionGenerator implements PodcastDistributionGenerator {
  private readonly router: ConfigRouter;
  private readonly promptPath: string;
  private promptCache?: string;

  constructor(router: ConfigRouter, promptPath: string = DEFAULT_PROMPT_PATH) {
    this.router = router;
    this.promptPath = promptPath;
  }

  async generatePack(episode: PodcastEpisode): Promise<PodcastDistributionPack> {
    const systemPrompt = await this.loadPrompt();
    const userPrompt = buildEpisodePrompt(episode);

    const response = await this.router.route({
      task_type: "content_drafting",
      system_prompt: systemPrompt,
      prompt: userPrompt,
    });

    const now = new Date().toISOString();
    const parsed = parseJsonPayload(response.content);

    const youtubeDescription = typeof parsed?.youtube_description === "string"
      ? parsed.youtube_description
      : response.content;

    const companyTweet = typeof parsed?.company_tweet === "string"
      ? parsed.company_tweet
      : "";

    const personalPost = typeof parsed?.personal_post === "string"
      ? parsed.personal_post
      : "";

    return {
      episodeId: `episode-${episode.episodeNumber}`,
      youtubeDescription,
      companyTweet,
      personalPost,
      generatedAt: now,
    };
  }

  private async loadPrompt(): Promise<string> {
    if (!this.promptCache) {
      this.promptCache = await fs.readFile(this.promptPath, "utf8");
    }
    return this.promptCache;
  }
}
