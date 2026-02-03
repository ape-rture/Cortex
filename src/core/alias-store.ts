import { promises as fs } from "node:fs";
import path from "node:path";
import type { Alias, AliasCategory, AliasStore, AliasSuggestion } from "./types/alias.js";

const DEFAULT_ALIAS_PATH = path.resolve("context", "aliases.md");

type ParsedAliases = {
  active: Alias[];
  suggested: AliasSuggestion[];
  rejected: AliasSuggestion[];
  raw: string;
};

function stripTicks(value: string): string {
  return value.replace(/`/g, "").trim();
}

function splitTableRow(line: string): string[] {
  return line
    .split("|")
    .map((part) => part.trim())
    .filter((part, index, arr) => !(index === 0 || index === arr.length - 1));
}

function findSection(lines: string[], header: string): number {
  return lines.findIndex((line) => line.trim() === header);
}

function parseActiveTable(lines: string[], startIndex: number): Alias[] {
  const results: Alias[] = [];
  let i = startIndex;
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    if (lines[i].trim().startsWith("## ") || lines[i].trim().startsWith("---")) return results;
    i += 1;
  }
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (trimmed === "" || trimmed.startsWith("<!--")) {
        i += 1;
        continue;
      }
      if (trimmed.startsWith("## ") || trimmed.startsWith("---")) break;
      break;
    }
    if (line.includes("---")) {
      i += 1;
      continue;
    }
    const cells = splitTableRow(line);
    if (cells.length < 5) {
      i += 1;
      continue;
    }
    const [aliasRaw, expansionRaw, categoryRaw, addedRaw, usageRaw] = cells;
    if (!aliasRaw || aliasRaw.toLowerCase() === "alias") {
      i += 1;
      continue;
    }
    const usageCount = Number.parseInt(usageRaw, 10);
    results.push({
      alias: stripTicks(aliasRaw),
      expansion: expansionRaw.trim(),
      category: categoryRaw.trim() as AliasCategory,
      status: "active",
      addedAt: addedRaw.trim(),
      usageCount: Number.isNaN(usageCount) ? 0 : usageCount,
      notes: Number.isNaN(usageCount) ? usageRaw.trim() : undefined,
    });
    i += 1;
  }
  return results;
}

function parseSuggestedTable(lines: string[], startIndex: number): AliasSuggestion[] {
  const results: AliasSuggestion[] = [];
  let i = startIndex;
  while (i < lines.length && !lines[i].trim().startsWith("|")) {
    if (lines[i].trim().startsWith("## ") || lines[i].trim().startsWith("---")) return results;
    i += 1;
  }
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (trimmed === "" || trimmed.startsWith("<!--")) {
        i += 1;
        continue;
      }
      if (trimmed.startsWith("## ") || trimmed.startsWith("---")) break;
      break;
    }
    if (line.includes("---")) {
      i += 1;
      continue;
    }
    const cells = splitTableRow(line);
    if (cells.length < 5) {
      i += 1;
      continue;
    }
    const [aliasRaw, expansionRaw, timesRaw, firstSeenRaw, approveRaw] = cells;
    if (!aliasRaw || aliasRaw.toLowerCase() === "suggested") {
      i += 1;
      continue;
    }
    if (approveRaw.toLowerCase().includes("rejected")) {
      i += 1;
      continue;
    }
    const occurrences = Number.parseInt(timesRaw, 10);
    const firstSeen = firstSeenRaw.trim();
    results.push({
      suggestedAlias: stripTicks(aliasRaw),
      expansion: expansionRaw.trim(),
      category: "phrase",
      occurrences: Number.isNaN(occurrences) ? 0 : occurrences,
      firstSeen,
      lastSeen: firstSeen,
      contexts: [],
    });
    i += 1;
  }
  return results;
}

function parseRejectedComments(lines: string[]): AliasSuggestion[] {
  const results: AliasSuggestion[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("<!-- Rejected:")) continue;
    const payload = trimmed.replace("<!-- Rejected:", "").replace("-->", "").trim();
    const parts = payload.split("|").map((part) => part.trim());
    if (parts.length < 3) continue;
    const [alias, expansion, firstSeen, lastSeen, occurrences, category] = parts;
    results.push({
      suggestedAlias: stripTicks(alias),
      expansion: expansion ?? "",
      category: (category as AliasCategory) ?? "phrase",
      occurrences: Number.parseInt(occurrences ?? "0", 10) || 0,
      firstSeen: firstSeen ?? "",
      lastSeen: lastSeen ?? firstSeen ?? "",
      contexts: [],
    });
  }
  return results;
}

function replaceTable(lines: string[], header: string, newTable: string[]): string[] {
  const headerIndex = findSection(lines, header);
  if (headerIndex === -1) return lines;
  let tableStart = -1;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith("|")) {
      tableStart = i;
      break;
    }
  }
  if (tableStart === -1) return lines;
  let tableEnd = tableStart;
  while (tableEnd < lines.length && lines[tableEnd].trim().startsWith("|")) {
    tableEnd += 1;
  }
  const updated = [...lines.slice(0, tableStart), ...newTable, ...lines.slice(tableEnd)];
  return updated;
}

function buildActiveTable(aliases: readonly Alias[]): string[] {
  const rows = aliases.map((alias) => {
    const usage = alias.usageCount > 0 ? String(alias.usageCount) : (alias.notes ?? "0");
    return `| \`${alias.alias}\` | ${alias.expansion} | ${alias.category} | ${alias.addedAt} | ${usage} |`;
  });
  return [
    "| Alias | Expands To | Category | Added | Usage |",
    "|-------|-----------|----------|-------|-------|",
    ...rows,
  ];
}

function buildSuggestedTable(suggestions: readonly AliasSuggestion[]): string[] {
  const rows = suggestions.map((suggestion) => {
    return `| \`${suggestion.suggestedAlias}\` | ${suggestion.expansion} | ${suggestion.occurrences} | ${suggestion.firstSeen} | [ ] |`;
  });
  return [
    "| Suggested | Expands To | Times Seen | First Seen | Approve? |",
    "|-----------|-----------|------------|------------|----------|",
    ...rows,
  ];
}

function parseAliases(content: string): ParsedAliases {
  const lines = content.split(/\r?\n/);
  const activeIndex = findSection(lines, "## Active Aliases");
  const suggestedIndex = findSection(lines, "## Suggested Aliases");
  const active = activeIndex === -1 ? [] : parseActiveTable(lines, activeIndex + 1);
  const suggested = suggestedIndex === -1 ? [] : parseSuggestedTable(lines, suggestedIndex + 1);
  const rejected = parseRejectedComments(lines);
  return { active, suggested, rejected, raw: content };
}

export class MarkdownAliasStore implements AliasStore {
  private readonly filePath: string;
  private aliases: Alias[] = [];
  private suggestions: AliasSuggestion[] = [];
  private rejected: AliasSuggestion[] = [];
  private rawContent = "";
  private dirty = false;

  constructor(filePath: string = DEFAULT_ALIAS_PATH) {
    this.filePath = filePath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.rawContent) return;
    const content = await fs.readFile(this.filePath, "utf8");
    const parsed = parseAliases(content);
    this.aliases = parsed.active;
    this.suggestions = parsed.suggested;
    this.rejected = parsed.rejected;
    this.rawContent = parsed.raw;
  }

  async load(): Promise<readonly Alias[]> {
    await this.ensureLoaded();
    return this.aliases;
  }

  async getActive(): Promise<readonly Alias[]> {
    await this.ensureLoaded();
    return this.aliases;
  }

  async getSuggested(): Promise<readonly AliasSuggestion[]> {
    await this.ensureLoaded();
    return this.suggestions;
  }

  async add(alias: Alias): Promise<void> {
    await this.ensureLoaded();
    if (alias.status === "active") {
      this.aliases.push(alias);
    } else {
      this.suggestions.push({
        suggestedAlias: alias.alias,
        expansion: alias.expansion,
        category: alias.category,
        occurrences: alias.usageCount,
        firstSeen: alias.addedAt,
        lastSeen: alias.addedAt,
        contexts: [],
      });
    }
    this.dirty = true;
  }

  async approve(aliasText: string): Promise<void> {
    await this.ensureLoaded();
    const index = this.suggestions.findIndex((item) => item.suggestedAlias.toLowerCase() === aliasText.toLowerCase());
    if (index === -1) return;
    const approved = this.suggestions.splice(index, 1)[0];
    const now = new Date().toISOString().slice(0, 10);
    this.aliases.push({
      alias: approved.suggestedAlias,
      expansion: approved.expansion,
      category: approved.category,
      status: "active",
      addedAt: now,
      usageCount: 0,
    });
    this.dirty = true;
  }

  async reject(aliasText: string): Promise<void> {
    await this.ensureLoaded();
    const index = this.suggestions.findIndex((item) => item.suggestedAlias.toLowerCase() === aliasText.toLowerCase());
    if (index === -1) return;
    const rejected = this.suggestions.splice(index, 1)[0];
    this.rejected.push(rejected);
    this.dirty = true;
  }

  async recordUsage(aliasText: string): Promise<void> {
    await this.ensureLoaded();
    const alias = this.aliases.find((item) => item.alias.toLowerCase() === aliasText.toLowerCase());
    if (!alias) return;
    const updated: Alias = { ...alias, usageCount: alias.usageCount + 1 };
    this.aliases = this.aliases.map((item) => (item.alias === alias.alias ? updated : item));
    this.dirty = true;
  }

  async expand(text: string): Promise<string> {
    await this.ensureLoaded();
    let result = text;
    for (const alias of this.aliases) {
      if (alias.status !== "active") continue;
      const pattern = new RegExp(`\\b${alias.alias}\\b`, "gi");
      result = result.replace(pattern, alias.expansion);
    }
    return result;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await this.ensureLoaded();
    const lines = this.rawContent.split(/\r?\n/);
    const updatedActive = replaceTable(lines, "## Active Aliases", buildActiveTable(this.aliases));
    const updatedSuggested = replaceTable(updatedActive, "## Suggested Aliases", buildSuggestedTable(this.suggestions));
    const rejectedComments = this.rejected
      .map((item) => `<!-- Rejected: ${item.suggestedAlias} | ${item.expansion} | ${item.firstSeen} | ${item.lastSeen} | ${item.occurrences} | ${item.category} -->`);
    const finalLines = [...updatedSuggested, ...rejectedComments];
    await fs.writeFile(this.filePath, finalLines.join("\n").trimEnd() + "\n", "utf8");
    this.dirty = false;
  }
}
