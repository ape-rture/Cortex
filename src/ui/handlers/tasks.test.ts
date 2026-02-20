import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findTaskByTitle,
  moveTaskOnBoard,
  parseFullBoard,
  parseTaskBoard,
} from "./tasks.js";

const SAMPLE_BOARD = `# Task Board

## Queued

### Unified Capture Store (Phase 9)
- **Phase 1: Extend Task type and parser** -- Agent: codex -- Branch: \`codex/unified-captures\`. Add parser fields.

## In Progress

- **Core Ralph loop** -- Agent: codex -- Branch: \`codex/ralph-loop\`. Build supervisor.

## Done

- **Ralph agent prompts** -- Agent: claude -- Branch: \`main\`. Completed.
`;

test("parseFullBoard extracts group, branch, description, and line numbers", () => {
  const parsed = parseFullBoard(SAMPLE_BOARD);

  assert.equal(parsed.tasks.length, 3);

  const queued = findTaskByTitle(parsed, "Phase 1: Extend Task type and parser", "queued");
  assert.ok(queued);
  assert.equal(queued.group, "Unified Capture Store (Phase 9)");
  assert.equal(queued.branch, "codex/unified-captures");
  assert.equal(queued.description, "Add parser fields.");
  assert.equal(queued.lineNumber > 0, true);
  assert.equal(queued.rawLine.includes("**Phase 1: Extend Task type and parser**"), true);
});

test("parseTaskBoard keeps legacy summary behavior", () => {
  const summary = parseTaskBoard(SAMPLE_BOARD);
  assert.equal(summary.queued, 1);
  assert.equal(summary.in_progress, 1);
  assert.equal(summary.done, 1);
  assert.equal(summary.items.length, 3);
});

test("moveTaskOnBoard moves a task between sections and appends annotation", () => {
  const moved = moveTaskOnBoard(
    SAMPLE_BOARD,
    "Phase 1: Extend Task type and parser",
    "queued",
    "in_progress",
    "(ralph retry 1/3)",
  );

  const parsed = parseFullBoard(moved);
  const inProgressTask = findTaskByTitle(parsed, "Phase 1: Extend Task type and parser", "in_progress");
  const queuedTask = findTaskByTitle(parsed, "Phase 1: Extend Task type and parser", "queued");

  assert.ok(inProgressTask);
  assert.equal(queuedTask, undefined);
  assert.equal(inProgressTask.rawLine.includes("(ralph retry 1/3)"), true);
});

test("findTaskByTitle is case-insensitive exact title matching", () => {
  const parsed = parseFullBoard(SAMPLE_BOARD);
  const found = findTaskByTitle(parsed, "core ralph loop");
  assert.ok(found);
  assert.equal(found?.status, "in_progress");
});
