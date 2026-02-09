import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTaskQueue,
  serializeTaskQueue,
  parseContactFile,
  parseContentIdeas,
  serializeContentIdeas,
  parseContentDraft,
  serializeContentDraft,
  parseContentSeeds,
  serializeContentSeeds,
  parseProjects,
  serializeProjects,
} from "./markdown.js";

test("parseTaskQueue extracts tasks and metadata", () => {
  const content = `# Task Queue\n\n## Queued\n- [ ] **Dennis**: Ship core tests\n  - ID: task-1\n  - Status: queued\n  - Priority: p1\n  - Added: 2026-02-02T10:00:00Z\n  - Updated: 2026-02-02T10:00:00Z\n  - Source: cli\n  - Tags: testing, core\n\n## Completed\n- [x] **Cleanup**\n  - ID: task-2\n  - Status: done\n  - Priority: p3\n  - Added: 2026-02-01T10:00:00Z\n  - Updated: 2026-02-01T10:00:00Z\n  - Source: cli\n`;

  const tasks = parseTaskQueue(content);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].title, "Ship core tests");
  assert.equal(tasks[0].assigned_to, "Dennis");
  assert.equal(tasks[0].priority, "p1");
  assert.equal(tasks[0].status, "queued");
  assert.deepEqual(tasks[0].tags, ["testing", "core"]);
  assert.equal(tasks[1].status, "done");
});

test("serializeTaskQueue groups by status", () => {
  const tasks = parseTaskQueue(`## Queued\n- [ ] **A**\n  - ID: task-a\n  - Status: queued\n  - Priority: p2\n  - Added: 2026-02-02T00:00:00Z\n  - Updated: 2026-02-02T00:00:00Z\n  - Source: cli\n`);
  const output = serializeTaskQueue(tasks);
  assert.ok(output.includes("## Queued"));
  assert.ok(output.includes("task-a"));
});

test("parseContactFile extracts sections", () => {
  const content = `# Jane Doe
**Company**: Example Inc
**Role**: CTO
**Type**: partner
**Attio ID**: abc123

## Contact Info
- Email: jane@example.com
- LinkedIn: linkedin.com/in/janedoe
- Phone:

## Context
Met at the summit.

## Relationship
**Status**: active
**Last Contact**: 2026-02-01
**Next Follow-up**: 2026-02-10

## Interaction History
### 2026-02-01 - Call
- Summary: Intro call
- Key points: Interested in platform; Wants pricing
- Follow-up needed: Send proposal

## Notes
Follow up next week.
`;
  const contact = parseContactFile(content);
  assert.equal(contact.name, "Jane Doe");
  assert.equal(contact.company, "Example Inc");
  assert.equal(contact.role, "CTO");
  assert.equal(contact.attioId, "abc123");
  assert.equal(contact.contactInfo?.email, "jane@example.com");
  assert.equal(contact.relationshipStatus, "active");
  assert.equal(contact.lastContact, "2026-02-01");
  assert.equal(contact.history.length, 1);
  assert.equal(contact.history[0].type, "call");
});

test("parseContentIdeas extracts idea rows from table", () => {
  const content = `# Content Ideas

| ID | Date | Topic | Format | Platform | Status | Source | Notes |
|---|---|---|---|---|---|---|---|
| content-001 | 2026-02-04 | Why agents fail in handoff | thread | x | idea | manual | draft soon |
| content-002 | 2026-02-04 | Weekly founder ops note | post | linkedin | review | seed-1 | in edits |
`;

  const ideas = parseContentIdeas(content);
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].id, "content-001");
  assert.equal(ideas[0].format, "thread");
  assert.equal(ideas[1].status, "review");
});

test("serializeContentIdeas renders markdown table", () => {
  const output = serializeContentIdeas([
    {
      id: "content-001",
      date: "2026-02-04",
      topic: "Agent orchestration lessons",
      format: "post",
      platform: "linkedin",
      status: "draft",
      source: "manual",
      notes: "first pass",
      tags: [],
    },
  ]);
  assert.ok(output.includes("| content-001 |"));
  assert.ok(output.includes("| ID | Date | Topic |"));
});

test("parseContentDraft and serializeContentDraft roundtrip", () => {
  const markdown = serializeContentDraft({
    ideaId: "content-001",
    format: "thread",
    platform: "x",
    currentText: "Post one",
    revisions: [
      {
        version: 1,
        timestamp: "2026-02-04T10:00:00Z",
        text: "Post one",
        changeNote: "initial",
        author: "llm",
      },
    ],
    threadPosts: ["Post one", "Post two"],
    updatedAt: "2026-02-04T10:00:00Z",
    reviewNotes: ["Tighten hook"],
  });

  const draft = parseContentDraft(markdown);
  assert.equal(draft.ideaId, "content-001");
  assert.equal(draft.format, "thread");
  assert.equal(draft.threadPosts?.length, 2);
  assert.equal(draft.revisions.length, 1);
});

test("parseContentSeeds extracts unprocessed and promoted seeds", () => {
  const content = `# Content Seeds

## Unprocessed

- [ ] **seed-2026-02-04-001**: Angle about agent handoff quality
  - Source: meeting
  - Captured: 2026-02-04T08:00:00Z
  - Suggested Angles: thread; short post

## Promoted

- [x] **seed-2026-02-04-002**: Founder workflow insight
  - Source: manual
  - Captured: 2026-02-04T09:00:00Z
  - Promoted To: content-002
`;

  const seeds = parseContentSeeds(content);
  assert.equal(seeds.length, 2);
  assert.equal(seeds[0].promoted, false);
  assert.equal(seeds[1].promoted, true);
  assert.equal(seeds[1].promotedToId, "content-002");
});

test("serializeContentSeeds renders both sections", () => {
  const markdown = serializeContentSeeds([
    {
      id: "seed-1",
      insight: "Unprocessed seed",
      source: "manual",
      capturedAt: "2026-02-04T08:00:00Z",
      promoted: false,
    },
    {
      id: "seed-2",
      insight: "Promoted seed",
      source: "manual",
      capturedAt: "2026-02-04T09:00:00Z",
      promoted: true,
      promotedToId: "content-002",
    },
  ]);
  assert.ok(markdown.includes("## Unprocessed"));
  assert.ok(markdown.includes("## Promoted"));
  assert.ok(markdown.includes("seed-2"));
});

test("parseProjects extracts rows from project registry table", () => {
  const content = `# Project Registry

| ID | Name | Path | Remote | Status | Tech Stack | Last Activity | Notes |
|---|---|---|---|---|---|---|---|
| cortex | Cortex | D:\\Documenten\\Programmeren\\Personal Assistant | - | active | typescript,node | 2026-02-05 | Main assistant system |
| sidecar | Sidecar API | C:\\Repos\\sidecar | git@github.com:org/sidecar.git | paused | go,postgres | 2026-02-04 | waiting on infra |
`;

  const projects = parseProjects(content);
  assert.equal(projects.length, 2);
  assert.equal(projects[0].id, "cortex");
  assert.equal(projects[0].status, "active");
  assert.deepEqual(projects[0].techStack, ["typescript", "node"]);
  assert.equal(projects[1].gitRemote, "git@github.com:org/sidecar.git");
  assert.equal(projects[1].status, "paused");
});

test("serializeProjects renders project registry table", () => {
  const output = serializeProjects([
    {
      id: "proj-1",
      name: "Project One",
      path: "C:\\Repos\\project-one",
      gitRemote: "https://example.com/project-one.git",
      status: "active",
      techStack: ["typescript", "node"],
      lastActivity: "2026-02-09",
      notes: "Primary workspace",
      addedAt: "2026-02-09T10:00:00Z",
    },
  ]);

  assert.ok(output.includes("| ID | Name | Path | Remote | Status | Tech Stack | Last Activity | Notes |"));
  assert.ok(output.includes("| proj-1 | Project One | C:\\Repos\\project-one | https://example.com/project-one.git | active | typescript,node | 2026-02-09 | Primary workspace |"));
});
