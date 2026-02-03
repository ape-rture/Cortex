import { test } from "node:test";
import assert from "node:assert/strict";
import { SimpleDecayDetector } from "./decay-detector.js";
import type { Contact, ContactStore } from "./types/crm.js";

class FakeContactStore implements ContactStore {
  constructor(private readonly contacts: Contact[]) {}
  async loadAll(): Promise<readonly Contact[]> {
    return this.contacts;
  }
  async load(): Promise<Contact> {
    throw new Error("not implemented");
  }
  async save(): Promise<void> {
    throw new Error("not implemented");
  }
  async findByAttioId(): Promise<Contact | undefined> {
    return undefined;
  }
  async findByEmail(): Promise<Contact | undefined> {
    return undefined;
  }
  async search(): Promise<readonly Contact[]> {
    return [];
  }
  async addInteraction(): Promise<void> {
    throw new Error("not implemented");
  }
}

test("SimpleDecayDetector returns alerts for stale contacts", async () => {
  const contacts: Contact[] = [
    {
      name: "Arjun",
      company: "MeshPay",
      role: "CTO",
      type: "customer",
      relationshipStatus: "active",
      lastContact: "2025-12-15",
      history: [{ date: "2025-12-15", type: "call", summary: "Call" }],
      filePath: "contacts/arjun.md",
    },
    {
      name: "Recent",
      company: "FreshCo",
      role: "CEO",
      type: "lead",
      relationshipStatus: "active",
      lastContact: new Date().toISOString().slice(0, 10),
      history: [{ date: new Date().toISOString().slice(0, 10), type: "meeting", summary: "Met" }],
      filePath: "contacts/recent.md",
    },
  ];

  const detector = new SimpleDecayDetector(new FakeContactStore(contacts));
  const alerts = await detector.detectDecay({ thresholdDays: 30 });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].contact.name, "Arjun");
});
