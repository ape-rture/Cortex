import { test } from "node:test";
import assert from "node:assert/strict";
import { SimpleAliasPatternDetector } from "./alias-detector.js";

test("SimpleAliasPatternDetector suggests alias after threshold", () => {
  const detector = new SimpleAliasPatternDetector();
  detector.recordPhrase("work in progress", "status update");
  detector.recordPhrase("work in progress", "status update");
  detector.recordPhrase("work in progress", "status update");

  const suggestions = detector.analyze({ minPhraseWords: 3, minOccurrences: 3, windowDays: 7, maxSuggestions: 5 });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].suggestedAlias, "wip");
});
