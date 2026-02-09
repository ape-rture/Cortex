import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleBasedSalienceScorer } from "./salience.js";

test("RuleBasedSalienceScorer ranks higher-urgency findings first", () => {
  const scorer = new RuleBasedSalienceScorer();
  const scored = scorer.score([
    {
      agent: "a",
      finding: {
        type: "insight",
        summary: "Low urgency note",
        urgency: "low",
        confidence: 1,
        context_refs: [],
        requires_human: false,
      },
    },
    {
      agent: "a",
      finding: {
        type: "alert",
        summary: "High urgency alert",
        urgency: "high",
        confidence: 1,
        context_refs: [],
        requires_human: false,
      },
    },
  ]);

  assert.equal(scored.length, 2);
  assert.equal(scored[0]?.finding.summary, "High urgency alert");
  assert.ok(scored[0]!.salience > scored[1]!.salience);
});

test("RuleBasedSalienceScorer reduces novelty for repeated findings", () => {
  const scorer = new RuleBasedSalienceScorer();

  const first = scorer.score([
    {
      agent: "sales",
      finding: {
        type: "alert",
        summary: "Follow up with ACME",
        urgency: "medium",
        confidence: 1,
        context_refs: [],
        requires_human: false,
      },
    },
  ])[0];

  const second = scorer.score([
    {
      agent: "sales",
      finding: {
        type: "alert",
        summary: "Follow up with ACME",
        urgency: "medium",
        confidence: 1,
        context_refs: [],
        requires_human: false,
      },
    },
  ])[0];

  assert.ok(first.salience > second.salience);
});
