import "dotenv/config";
import { ConfigRouter } from "../core/routing.js";
import { LLMMeetingPrepGenerator } from "../core/meeting-prep.js";
import { MarkdownTaskQueue } from "../core/task-queue.js";
import { MarkdownContactStore } from "../utils/contact-store.js";

function formatSection(title: string, body: string): string {
  return `## ${title}\n${body.trim()}\n`;
}

function formatInteractions(interactions: readonly { date: string; type: string; summary: string }[]): string {
  if (interactions.length === 0) return "(no recent interactions)";
  return interactions
    .map((item) => `- ${item.date} (${item.type}): ${item.summary}`)
    .join("\n");
}

function formatList(items: readonly string[], empty = "(none)"): string {
  if (items.length === 0) return empty;
  return items.map((item) => `- ${item}`).join("\n");
}

export async function runMeetingPrep(query: string): Promise<string> {
  const generator = new LLMMeetingPrepGenerator(
    new MarkdownContactStore(),
    new MarkdownTaskQueue(),
    new ConfigRouter(),
  );

  const brief = await generator.generateBrief(query);
  const output: string[] = [];
  output.push(`# Meeting Prep: ${brief.contact.name}`);
  output.push("");
  output.push(formatSection("Contact", [
    `Company: ${brief.contact.company ?? "(unknown)"}`,
    `Role: ${brief.contact.role ?? "(unknown)"}`,
    `Type: ${brief.contact.type}`,
    `Status: ${brief.contact.relationshipStatus}`,
  ].join("\n")));
  output.push(formatSection("Context Summary", brief.contextSummary));
  output.push(formatSection("Recent Interactions", formatInteractions(brief.recentInteractions)));
  output.push(formatSection("Open Action Items", formatList(brief.openActionItems)));
  output.push(formatSection("Suggested Talking Points", formatList(brief.suggestedTalkingPoints, "(no LLM suggestions)")));
  output.push(`Generated: ${brief.generatedAt}`);

  return output.join("\n").trimEnd() + "\n";
}

import { fileURLToPath } from "node:url";

const isMain = fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run prep "Contact Name"');
    process.exit(1);
  }

  runMeetingPrep(query)
    .then((output) => {
      console.log(output);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("contact not found")) {
        console.error(`No contact found for "${query}".`);
        process.exit(1);
      }
      console.error(`Failed to generate meeting prep: ${message}`);
      process.exit(1);
    });
}
