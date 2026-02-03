import type {
  AliasDetectionConfig,
  AliasPatternDetector,
  AliasSuggestion,
  PhraseOccurrence,
} from "./types/alias.js";
import { DEFAULT_ALIAS_DETECTION_CONFIG } from "./types/alias.js";

type MutableOccurrence = {
  phrase: string;
  count: number;
  dates: string[];
  contexts: Set<string>;
};

function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

function countWords(phrase: string): number {
  return phrase.split(/\s+/).filter(Boolean).length;
}

function generateAlias(phrase: string): string {
  const letters = phrase
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0] ?? "")
    .join("");
  if (letters.length <= 4) return letters;
  return letters.slice(0, 4);
}

function withinWindow(dateIso: string, windowDays: number): boolean {
  const now = Date.now();
  const then = new Date(dateIso).getTime();
  if (Number.isNaN(then)) return false;
  const deltaDays = (now - then) / (1000 * 60 * 60 * 24);
  return deltaDays <= windowDays;
}

export class SimpleAliasPatternDetector implements AliasPatternDetector {
  private readonly occurrences = new Map<string, MutableOccurrence>();

  recordPhrase(phrase: string, context: string): void {
    const normalized = normalizePhrase(phrase);
    if (!normalized) return;
    const now = new Date().toISOString().slice(0, 10);
    const existing = this.occurrences.get(normalized);
    if (existing) {
      existing.count += 1;
      existing.dates.push(now);
      existing.contexts.add(context);
    } else {
      this.occurrences.set(normalized, {
        phrase: normalized,
        count: 1,
        dates: [now],
        contexts: new Set([context]),
      });
    }
  }

  analyze(config: AliasDetectionConfig = DEFAULT_ALIAS_DETECTION_CONFIG): AliasSuggestion[] {
    const suggestions: AliasSuggestion[] = [];
    for (const occurrence of this.occurrences.values()) {
      if (countWords(occurrence.phrase) < config.minPhraseWords) continue;
      const recentDates = occurrence.dates.filter((date) => withinWindow(date, config.windowDays));
      if (recentDates.length < config.minOccurrences) continue;
      const firstSeen = recentDates[0];
      const lastSeen = recentDates[recentDates.length - 1];
      suggestions.push({
        suggestedAlias: generateAlias(occurrence.phrase),
        expansion: occurrence.phrase,
        category: "phrase",
        occurrences: recentDates.length,
        firstSeen,
        lastSeen,
        contexts: Array.from(occurrence.contexts),
      });
      if (suggestions.length >= config.maxSuggestions) break;
    }
    return suggestions;
  }

  clear(): void {
    this.occurrences.clear();
  }

  getOccurrences(): readonly PhraseOccurrence[] {
    return Array.from(this.occurrences.values()).map((occurrence) => ({
      phrase: occurrence.phrase,
      count: occurrence.count,
      dates: occurrence.dates,
      contexts: Array.from(occurrence.contexts),
    }));
  }
}
