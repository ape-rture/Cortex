import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MarkdownContactStore } from "./contact-store.js";
import type { InteractionRecord } from "../core/types/crm.js";

const CONTACTS_DIR = path.resolve("contacts");

test("MarkdownContactStore loads, searches, and updates contacts", async () => {
  const store = new MarkdownContactStore();
  const filePath = path.join(CONTACTS_DIR, "test-contact.md");
  const content = `# Test Contact
**Company**: Example Co
**Role**: CTO
**Type**: customer
**Attio ID**: test-123

## Contact Info
- Email: test@example.com
- LinkedIn:
- Phone:

## Context
Testing contact store.

## Relationship
**Status**: active
**Last Contact**: 2026-01-01
**Next Follow-up**: 2026-02-01

## Interaction History
### 2026-01-01 - Call
- Summary: Intro call
- Key points: Alignment
- Follow-up needed: Send deck

---

*Update after every interaction. Sync important updates to Attio.*
`;

  await fs.writeFile(filePath, content, "utf8");
  try {
    const loaded = await store.load(filePath);
    assert.equal(loaded.name, "Test Contact");
    assert.equal(loaded.contactInfo?.email, "test@example.com");

    const byEmail = await store.findByEmail("test@example.com");
    assert.ok(byEmail);

    const results = await store.search("Example");
    assert.ok(results.some((contact) => contact.name === "Test Contact"));

    const interaction: InteractionRecord = {
      date: "2026-02-02",
      type: "email",
      summary: "Follow-up",
      keyPoints: ["Sent deck"],
      followUpNeeded: "Await response",
    };
    await store.addInteraction(filePath, interaction);

    const updated = await store.load(filePath);
    assert.equal(updated.history[0].date, "2026-02-02");
    assert.equal(updated.lastContact, "2026-02-02");
  } finally {
    await fs.unlink(filePath).catch(() => undefined);
  }
});
