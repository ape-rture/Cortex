import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTaskQueue,
  serializeTaskQueue,
  parseContactFile,
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
