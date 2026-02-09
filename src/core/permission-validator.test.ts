import { test } from "node:test";
import assert from "node:assert/strict";
import { PermissionValidator } from "./permission-validator.js";

test("PermissionValidator approves allowed writes and flags, rejects disallowed writes", () => {
  const validator = new PermissionValidator();

  const output = {
    agent: "content-scanner",
    timestamp: "2026-02-09T00:00:00Z",
    findings: [],
    memory_updates: [
      {
        operation: "append" as const,
        file: "actions/queue.md",
        content: "- [ ] Test",
      },
      {
        operation: "flag" as const,
        file: "contacts/acme.md",
        content: "Needs review",
      },
      {
        operation: "update" as const,
        file: "contacts/acme.md",
        content: "blocked",
      },
    ],
    errors: [],
  };

  const permissions = {
    agent: "content-scanner",
    can_read: ["projects/**"],
    can_write: ["actions/**"],
    can_call_apis: [],
    can_send_messages: false,
    requires_human_approval: [],
    max_tokens: 0,
    model: "local:script",
    timeout_ms: 1000,
  };

  const result = validator.validate(output, permissions);
  assert.equal(result.approved.length, 2);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0]!.reason, /Permission denied/);
});
